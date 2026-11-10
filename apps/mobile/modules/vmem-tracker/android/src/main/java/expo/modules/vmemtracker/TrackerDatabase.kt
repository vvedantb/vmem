package expo.modules.vmemtracker

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

/** One foreground session of one app, already filtered by the deny list. */
data class UsageSession(val packageName: String, val startMs: Long, val endMs: Long)

/** An approved item ready to post: `body` is the exact JSON for `POST /api/v1/memories`. */
data class UploadRow(val id: Long, val body: String)

/**
 * Local buffer, one database for the whole app.
 *
 * - `events`: raw captures from the collectors and the share target.
 * - `queue`: review items the app builds from events (`promote`). Only rows
 *   the user approved are uploaded.
 */
class TrackerDatabase private constructor(context: Context) :
  SQLiteOpenHelper(context.applicationContext, NAME, null, VERSION) {

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        package TEXT,
        label TEXT,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        text TEXT,
        subject TEXT
      )
      """.trimIndent(),
    )
    db.execSQL("CREATE INDEX events_kind_start ON events(kind, start_ms)")
    db.execSQL(
      """
      CREATE TABLE queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        external_id TEXT NOT NULL UNIQUE,
        body TEXT NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      )
      """.trimIndent(),
    )
    db.execSQL("CREATE INDEX queue_status ON queue(status)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    // Version 1 is the first schema. Add migrations here when it changes.
  }

  fun insertUsage(sessions: List<UsageSession>, labelOf: (String) -> String) {
    if (sessions.isEmpty()) return
    val labels = HashMap<String, String>()
    transaction { db ->
      for (session in sessions) {
        val label = labels.getOrPut(session.packageName) { labelOf(session.packageName) }
        db.insertOrThrow(
          "events",
          null,
          ContentValues().apply {
            put("kind", CaptureKind.APP_USAGE)
            put("package", session.packageName)
            put("label", label)
            put("start_ms", session.startMs)
            put("end_ms", session.endMs)
          },
        )
      }
    }
  }

  fun insertShare(text: String, subject: String?, sourcePackage: String?, sourceLabel: String?, at: Long) {
    writableDatabase.insertOrThrow(
      "events",
      null,
      ContentValues().apply {
        put("kind", CaptureKind.SHARE)
        put("package", sourcePackage)
        put("label", sourceLabel)
        put("start_ms", at)
        put("end_ms", at)
        put("text", text)
        put("subject", subject)
      },
    )
  }

  /** A note or clipboard capture the user started in the app. `kind` is `NOTE` or `CLIPBOARD`. */
  fun insertText(kind: String, text: String, at: Long) {
    writableDatabase.insertOrThrow(
      "events",
      null,
      ContentValues().apply {
        put("kind", kind)
        put("start_ms", at)
        put("end_ms", at)
        put("text", text)
      },
    )
  }

  /** Replaces the body of an item that is still waiting for review. */
  fun updateQueueBody(id: Long, body: String, now: Long) {
    writableDatabase.update(
      "queue",
      ContentValues().apply {
        put("body", body)
        put("updated_at", now)
      },
      "id = ? AND status = ?",
      arrayOf(id.toString(), QueueStatus.PENDING_REVIEW),
    )
  }

  fun eventsJson(): String {
    val out = JSONArray()
    readableDatabase.rawQuery(
      "SELECT id, kind, package, label, start_ms, end_ms, text, subject FROM events ORDER BY start_ms, id",
      null,
    ).use { c ->
      while (c.moveToNext()) {
        out.put(
          JSONObject()
            .put("id", c.getLong(0))
            .put("kind", c.getString(1))
            .put("package", c.stringOrNull(2) ?: JSONObject.NULL)
            .put("label", c.stringOrNull(3) ?: JSONObject.NULL)
            .put("startMs", c.getLong(4))
            .put("endMs", c.getLong(5))
            .put("text", c.stringOrNull(6) ?: JSONObject.NULL)
            .put("subject", c.stringOrNull(7) ?: JSONObject.NULL),
        )
      }
    }
    return out.toString()
  }

  /**
   * Applies a promotion built by the app in one transaction: inserts review
   * items (an existing `external_id` is kept as it is), deletes the events
   * they consumed and moves the start of events that still reach into an
   * open hour. Returns the number of new items.
   */
  fun promote(batch: JSONObject, now: Long): Int {
    val items = batch.getJSONArray("items")
    val deleteIds = batch.getJSONArray("deleteEventIds")
    val trims = batch.getJSONArray("trimEvents")
    var inserted = 0
    transaction { db ->
      for (i in 0 until items.length()) {
        val item = items.getJSONObject(i)
        val row = ContentValues().apply {
          put("kind", item.getString("kind"))
          put("status", QueueStatus.PENDING_REVIEW)
          put("external_id", item.getString("externalId"))
          put("body", item.getString("body"))
          put("start_ms", item.getLong("startMs"))
          put("end_ms", item.getLong("endMs"))
          put("created_at", now)
          put("updated_at", now)
        }
        if (db.insertWithOnConflict("queue", null, row, SQLiteDatabase.CONFLICT_IGNORE) != -1L) {
          inserted += 1
        }
      }
      for (i in 0 until deleteIds.length()) {
        db.delete("events", "id = ?", arrayOf(deleteIds.getLong(i).toString()))
      }
      for (i in 0 until trims.length()) {
        val trim = trims.getJSONObject(i)
        db.update(
          "events",
          ContentValues().apply { put("start_ms", trim.getLong("startMs")) },
          "id = ?",
          arrayOf(trim.getLong("id").toString()),
        )
      }
    }
    return inserted
  }

  /** Items not yet uploaded, newest first, then the last `uploadedLimit` uploads. */
  fun queueJson(uploadedLimit: Int): String {
    val out = JSONArray()
    val columns = "id, kind, status, external_id, body, start_ms, end_ms, created_at, updated_at, attempts, last_error"
    val db = readableDatabase
    db.rawQuery(
      "SELECT $columns FROM queue WHERE status != ? ORDER BY start_ms DESC, id DESC",
      arrayOf(QueueStatus.UPLOADED),
    ).use { c -> while (c.moveToNext()) out.put(queueRow(c)) }
    db.rawQuery(
      "SELECT $columns FROM queue WHERE status = ? ORDER BY updated_at DESC LIMIT ?",
      arrayOf(QueueStatus.UPLOADED, uploadedLimit.toString()),
    ).use { c -> while (c.moveToNext()) out.put(queueRow(c)) }
    return out.toString()
  }

  /** Approves the given pending items, or every pending item when `ids` is null. */
  fun approve(ids: List<Long>?, now: Long): Int {
    val values = ContentValues().apply {
      put("status", QueueStatus.APPROVED)
      put("updated_at", now)
      put("attempts", 0)
      putNull("last_error")
    }
    if (ids == null) {
      return writableDatabase.update("queue", values, "status = ?", arrayOf(QueueStatus.PENDING_REVIEW))
    }
    var changed = 0
    transaction { db ->
      for (id in ids) {
        changed += db.update(
          "queue",
          values,
          "id = ? AND status = ?",
          arrayOf(id.toString(), QueueStatus.PENDING_REVIEW),
        )
      }
    }
    return changed
  }

  /** Lets a failed approved item try again. */
  fun retry(ids: List<Long>, now: Long) {
    val values = ContentValues().apply {
      put("attempts", 0)
      putNull("last_error")
      put("updated_at", now)
    }
    transaction { db ->
      for (id in ids) {
        db.update("queue", values, "id = ? AND status = ?", arrayOf(id.toString(), QueueStatus.APPROVED))
      }
    }
  }

  /** Discard: deletes the rows. Uploaded rows are kept (they live in vmem now). */
  fun discard(ids: List<Long>) {
    transaction { db ->
      for (id in ids) {
        db.delete("queue", "id = ? AND status != ?", arrayOf(id.toString(), QueueStatus.UPLOADED))
      }
    }
  }

  fun markUploaded(id: Long, now: Long) {
    writableDatabase.update(
      "queue",
      ContentValues().apply {
        put("status", QueueStatus.UPLOADED)
        put("updated_at", now)
        putNull("last_error")
      },
      "id = ?",
      arrayOf(id.toString()),
    )
  }

  /** Records an upload error. `countAttempt` is false for errors worth retrying (offline, 5xx, 401). */
  fun markFailed(id: Long, error: String, countAttempt: Boolean, now: Long) {
    val increment = if (countAttempt) 1 else 0
    writableDatabase.execSQL(
      "UPDATE queue SET last_error = ?, attempts = attempts + ?, updated_at = ? WHERE id = ?",
      arrayOf<Any>(error.take(500), increment, now, id),
    )
  }

  fun approvedForUpload(maxAttempts: Int, limit: Int): List<UploadRow> {
    val rows = ArrayList<UploadRow>()
    readableDatabase.rawQuery(
      "SELECT id, body FROM queue WHERE status = ? AND attempts < ? ORDER BY start_ms, id LIMIT ?",
      arrayOf(QueueStatus.APPROVED, maxAttempts.toString(), limit.toString()),
    ).use { c -> while (c.moveToNext()) rows.add(UploadRow(c.getLong(0), c.getString(1))) }
    return rows
  }

  fun countsJson(): JSONObject {
    val db = readableDatabase
    val counts = JSONObject()
      .put("events", count(db, "SELECT COUNT(*) FROM events", emptyArray()))
    for ((key, status) in listOf(
      "pendingReview" to QueueStatus.PENDING_REVIEW,
      "approved" to QueueStatus.APPROVED,
      "uploaded" to QueueStatus.UPLOADED,
    )) {
      counts.put(key, count(db, "SELECT COUNT(*) FROM queue WHERE status = ?", arrayOf(status)))
    }
    return counts
  }

  fun approvedCount(): Long =
    count(readableDatabase, "SELECT COUNT(*) FROM queue WHERE status = ?", arrayOf(QueueStatus.APPROVED))

  /** Drops uploaded rows after a week and raw events nobody reviewed after a month. */
  fun prune(now: Long) {
    transaction { db ->
      db.delete(
        "queue",
        "status = ? AND updated_at < ?",
        arrayOf(QueueStatus.UPLOADED, (now - UPLOADED_KEEP_MS).toString()),
      )
      db.delete("events", "end_ms < ?", arrayOf((now - EVENTS_KEEP_MS).toString()))
    }
  }

  fun clearAll() {
    transaction { db ->
      db.delete("events", null, null)
      db.delete("queue", null, null)
    }
  }

  private fun queueRow(c: Cursor): JSONObject = JSONObject()
    .put("id", c.getLong(0))
    .put("kind", c.getString(1))
    .put("status", c.getString(2))
    .put("externalId", c.getString(3))
    .put("body", c.getString(4))
    .put("startMs", c.getLong(5))
    .put("endMs", c.getLong(6))
    .put("createdAt", c.getLong(7))
    .put("updatedAt", c.getLong(8))
    .put("attempts", c.getInt(9))
    .put("lastError", c.stringOrNull(10) ?: JSONObject.NULL)

  private fun count(db: SQLiteDatabase, sql: String, args: Array<String>): Long =
    db.rawQuery(sql, args).use { c -> if (c.moveToFirst()) c.getLong(0) else 0L }

  private inline fun transaction(block: (SQLiteDatabase) -> Unit) {
    val db = writableDatabase
    db.beginTransaction()
    try {
      block(db)
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  private fun Cursor.stringOrNull(index: Int): String? = if (isNull(index)) null else getString(index)

  companion object {
    private const val NAME = "vmem_tracker.db"
    private const val VERSION = 1
    private const val UPLOADED_KEEP_MS = 7L * 24 * 60 * 60 * 1000
    private const val EVENTS_KEEP_MS = 30L * 24 * 60 * 60 * 1000

    @Volatile
    private var instance: TrackerDatabase? = null

    fun get(context: Context): TrackerDatabase =
      instance ?: synchronized(this) {
        instance ?: TrackerDatabase(context).also { instance = it }
      }
  }
}
