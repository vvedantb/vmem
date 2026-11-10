package expo.modules.vmemtracker

import android.content.Context
import org.json.JSONObject

/** Actions shared by the JS module, the Quick Settings tile and the workers. */
object Tracker {
  /**
   * Pausing first collects up to now, so activity before the pause is kept.
   * Resuming moves the cursor to now, so the paused time is never recorded.
   */
  fun setPaused(context: Context, paused: Boolean) {
    synchronized(UsageCollector) {
      val prefs = TrackerPrefs(context)
      if (prefs.paused == paused) return
      val now = System.currentTimeMillis()
      if (paused) {
        UsageCollector.collect(context, now)
        prefs.paused = true
      } else {
        prefs.skipTo(now)
        prefs.paused = false
      }
    }
    PauseTileService.refresh(context)
  }

  /** Turning on starts from yesterday. Turning off keeps no calendar cursor. */
  fun setCalendarEnabled(context: Context, enabled: Boolean) {
    synchronized(CalendarCollector) {
      val prefs = TrackerPrefs(context)
      prefs.calendarEnabled = enabled
      prefs.calendarCursorMs = 0L
    }
  }

  fun statusJson(context: Context): String {
    val prefs = TrackerPrefs(context)
    return JSONObject()
      .put("paused", prefs.paused)
      .put("usageAccess", UsageCollector.hasUsageAccess(context))
      .put("calendarEnabled", prefs.calendarEnabled)
      .put("calendarAccess", CalendarCollector.hasAccess(context))
      .put("collectedThroughMs", prefs.cursorMs)
      .put("lastCollectAtMs", prefs.lastCollectAtMs)
      .put("lastCollectError", prefs.lastCollectError ?: JSONObject.NULL)
      .put("tokenExpiresAtMs", prefs.tokenExpiresAtMs)
      .put("installId", prefs.installId)
      .put("counts", TrackerDatabase.get(context).countsJson())
      .toString()
  }

  /**
   * Deletes every capture on the phone and the token. Settings (pause, the
   * blocked apps) stay. Recording restarts from now.
   */
  fun deleteAllData(context: Context) {
    synchronized(UsageCollector) {
      TrackerDatabase.get(context).clearAll()
      val prefs = TrackerPrefs(context)
      prefs.setToken(null)
      prefs.skipTo(System.currentTimeMillis())
    }
    synchronized(CalendarCollector) {
      TrackerPrefs(context).calendarCursorMs = System.currentTimeMillis()
    }
  }
}
