package expo.modules.vmemtracker

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** One calendar event instance. `day` is the local date it starts on (UTC date for all-day events). */
data class CalendarEvent(
  val id: String,
  val day: String,
  val title: String,
  val startMs: Long,
  val endMs: Long,
  val allDay: Boolean,
  val attendees: List<String>,
  val calendarName: String?,
  val location: String?,
) {
  /** The `text` of a raw `calendar` event. The app parses it with zod (src/capture/calendar.ts). */
  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("day", day)
    .put("title", title)
    .put("startMs", startMs)
    .put("endMs", endMs)
    .put("allDay", allDay)
    .put("attendees", JSONArray(attendees))
    .put("calendarName", calendarName ?: JSONObject.NULL)
    .put("location", location ?: JSONObject.NULL)
}

/**
 * Reads calendar events (read-only) into raw `calendar` events. Past local
 * days are read once: a cursor moves to the start of today. Today is read
 * through its end on every collect, so a meeting added later the same day is
 * seen. `TrackerDatabase.insertCalendar` skips an instance that is already
 * stored. Runs only when the user turned Calendar on and READ_CALENDAR is
 * granted, and only from `collectNow` (app open): no listener, no background
 * work. Declined and cancelled events are skipped.
 */
object CalendarCollector {
  private const val FIRST_RUN_DAYS = 1
  private const val MAX_LOOKBACK_DAYS = 3
  private const val MAX_EVENTS = 200
  private const val MAX_ATTENDEES = 20

  fun hasAccess(context: Context): Boolean =
    context.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED

  /** Stores past days from the cursor, then all of today. Returns how many events were new. */
  @Synchronized
  fun collect(context: Context, now: Long = System.currentTimeMillis()): Int {
    val prefs = TrackerPrefs(context)
    if (!prefs.calendarEnabled || !hasAccess(context)) return 0
    val todayStart = startOfDay(now, 0)
    val todayEnd = startOfDay(now, -1)
    val cursor = prefs.calendarCursorMs
    val pastFrom = if (cursor <= 0L) startOfDay(now, FIRST_RUN_DAYS) else maxOf(cursor, startOfDay(now, MAX_LOOKBACK_DAYS))
    val events = try {
      val past = if (pastFrom < todayStart) {
        query(context, pastFrom, todayStart).filter { it.day >= dayOf(pastFrom, false) && it.day <= dayOf(todayStart - 1, false) }
      } else {
        emptyList()
      }
      val today = query(context, todayStart, todayEnd).filter { it.day == dayOf(todayStart, false) }
      past + today
    } catch (_: SecurityException) {
      return 0
    }
    val inserted = TrackerDatabase.get(context).insertCalendar(events)
    prefs.calendarCursorMs = maxOf(cursor, todayStart)
    return inserted
  }

  private fun startOfDay(ms: Long, daysBack: Int): Long = Calendar.getInstance().apply {
    timeInMillis = ms
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
    add(Calendar.DAY_OF_MONTH, -daysBack)
  }.timeInMillis

  private fun dayOf(ms: Long, allDay: Boolean): String {
    val format = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT)
    // All-day events are stored as UTC midnight.
    if (allDay) format.timeZone = TimeZone.getTimeZone("UTC")
    return format.format(Date(ms))
  }

  private fun query(context: Context, from: Long, to: Long): List<CalendarEvent> {
    val uri = CalendarContract.Instances.CONTENT_URI.buildUpon()
      .also { ContentUris.appendId(it, from); ContentUris.appendId(it, to) }
      .build()
    val projection = arrayOf(
      CalendarContract.Instances.EVENT_ID,
      CalendarContract.Instances.BEGIN,
      CalendarContract.Instances.END,
      CalendarContract.Instances.TITLE,
      CalendarContract.Instances.ALL_DAY,
      CalendarContract.Instances.EVENT_LOCATION,
      CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
      CalendarContract.Instances.SELF_ATTENDEE_STATUS,
      CalendarContract.Instances.STATUS,
      CalendarContract.Instances.HAS_ATTENDEE_DATA,
    )
    val out = ArrayList<CalendarEvent>()
    context.contentResolver.query(uri, projection, null, null, "${CalendarContract.Instances.BEGIN} ASC")?.use { c ->
      while (c.moveToNext() && out.size < MAX_EVENTS) {
        val selfStatus = c.getInt(7)
        val status = c.getInt(8)
        if (selfStatus == CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED) continue
        if (status == CalendarContract.Events.STATUS_CANCELED) continue
        val eventId = c.getLong(0)
        val begin = c.getLong(1)
        val allDay = c.getInt(4) == 1
        out.add(
          CalendarEvent(
            id = "$eventId-$begin",
            day = dayOf(begin, allDay),
            title = c.getString(3)?.trim().takeUnless { it.isNullOrEmpty() } ?: "(no title)",
            startMs = begin,
            endMs = c.getLong(2),
            allDay = allDay,
            attendees = if (c.getInt(9) == 1) attendees(context, eventId) else emptyList(),
            calendarName = c.getString(6),
            location = c.getString(5)?.trim().takeUnless { it.isNullOrEmpty() },
          ),
        )
      }
    }
    return out
  }

  /** Display names, or email addresses when there is no name. */
  private fun attendees(context: Context, eventId: Long): List<String> {
    val out = ArrayList<String>()
    context.contentResolver.query(
      CalendarContract.Attendees.CONTENT_URI,
      arrayOf(CalendarContract.Attendees.ATTENDEE_NAME, CalendarContract.Attendees.ATTENDEE_EMAIL),
      "${CalendarContract.Attendees.EVENT_ID} = ?",
      arrayOf(eventId.toString()),
      null,
    )?.use { c ->
      while (c.moveToNext() && out.size < MAX_ATTENDEES) {
        val label = c.getString(0)?.trim().takeUnless { it.isNullOrEmpty() } ?: c.getString(1)?.trim()
        if (!label.isNullOrEmpty()) out.add(label)
      }
    }
    return out
  }
}
