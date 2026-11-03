package expo.modules.vmemtracker

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Process

/**
 * Turns UsageStatsManager events into foreground sessions and stores them as
 * raw `app_usage` events. Runs from WorkManager every 15 minutes and from the
 * app when it opens. Records only what happened after the previous run.
 */
object UsageCollector {
  // UsageEvents.Event types by value; some names need a newer API than minSdk 24.
  private const val MOVE_TO_FOREGROUND = 1 // ACTIVITY_RESUMED from API 29
  private const val MOVE_TO_BACKGROUND = 2 // ACTIVITY_PAUSED from API 29
  private const val SCREEN_NON_INTERACTIVE = 16
  private const val KEYGUARD_SHOWN = 17
  private const val DEVICE_SHUTDOWN = 26

  private const val MIN_SESSION_MS = 1_000L

  /** Activity switches inside one app pause and resume it within this gap. */
  private const val MERGE_GAP_MS = 2_000L

  /** Bounds a run after a long gap (for example, the app was force-stopped). */
  private const val MAX_LOOKBACK_MS = 3L * 24 * 60 * 60 * 1000

  fun hasUsageAccess(context: Context): Boolean {
    val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    // Each call is deprecated on some API level; both still work.
    @Suppress("DEPRECATION")
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  /**
   * Collects up to `now` and returns the number of sessions stored. Paused,
   * no Usage Access or the first run: moves the cursor to `now` and records
   * nothing, so that time is never captured later.
   */
  @Synchronized
  fun collect(context: Context, now: Long = System.currentTimeMillis()): Int {
    val prefs = TrackerPrefs(context)
    prefs.lastCollectAtMs = now
    if (prefs.paused) {
      prefs.skipTo(now)
      return 0
    }
    if (!hasUsageAccess(context)) {
      prefs.lastCollectError = "usage_access"
      prefs.skipTo(now)
      return 0
    }
    val cursor = prefs.cursorMs
    if (cursor <= 0L) {
      prefs.lastCollectError = null
      prefs.skipTo(now)
      return 0
    }
    val from = maxOf(cursor, now - MAX_LOOKBACK_MS)
    if (from >= now) return 0

    val denied = prefs.denyList + DenyList.alwaysExcluded(context)
    val sessions = ArrayList<UsageSession>()
    // A carried session survives only when this run starts where the last one ended.
    var openPackage: String? = if (from == cursor) prefs.openPackage else null
    var openStart = maxOf(prefs.openStartMs, from)

    fun close(at: Long) {
      val pkg = openPackage ?: return
      if (pkg !in denied && at - openStart >= MIN_SESSION_MS) {
        sessions.add(UsageSession(pkg, openStart, at))
      }
      openPackage = null
    }

    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val events = usm.queryEvents(from, now)
    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      val at = event.timeStamp
      if (at < from || at > now) continue
      when (event.eventType) {
        MOVE_TO_FOREGROUND -> {
          val pkg = event.packageName ?: continue
          if (pkg != openPackage) {
            close(at)
            openPackage = pkg
            openStart = at
          }
        }
        MOVE_TO_BACKGROUND -> if (event.packageName == openPackage) close(at)
        SCREEN_NON_INTERACTIVE, KEYGUARD_SHOWN, DEVICE_SHUTDOWN -> close(at)
      }
    }
    // Still in the foreground: store the part up to now and carry the rest.
    val stillOpen = openPackage
    if (stillOpen != null) {
      close(now)
      openPackage = stillOpen
      openStart = now
    }

    TrackerDatabase.get(context).insertUsage(merge(sessions)) { AppLabels.label(context, it) }
    prefs.saveCursor(now, openPackage, if (openPackage == null) 0L else openStart)
    prefs.lastCollectError = null
    return sessions.size
  }

  private fun merge(sessions: List<UsageSession>): List<UsageSession> {
    val out = ArrayList<UsageSession>()
    for (session in sessions.sortedBy { it.startMs }) {
      val last = out.lastOrNull()
      if (last != null && last.packageName == session.packageName && session.startMs - last.endMs <= MERGE_GAP_MS) {
        out[out.size - 1] = last.copy(endMs = maxOf(last.endMs, session.endMs))
      } else {
        out.add(session)
      }
    }
    return out
  }
}
