package expo.modules.vmemtracker

import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

/**
 * JS API of the tracker. Values cross the bridge as JSON strings; the app
 * parses them with zod (modules/vmem-tracker/src/api.ts). Async functions run
 * off the main thread.
 */
class VmemTrackerModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val db: TrackerDatabase get() = TrackerDatabase.get(context)

  override fun definition() = ModuleDefinition {
    Name("VmemTracker")

    OnCreate {
      appContext.reactContext?.applicationContext?.let { TrackerScheduler.ensureScheduled(it) }
    }

    AsyncFunction("getStatus") { Tracker.statusJson(context) }

    AsyncFunction("collectNow") {
      UsageCollector.collect(context)
      CalendarCollector.collect(context)
      Tracker.statusJson(context)
    }

    AsyncFunction("readEvents") { db.eventsJson() }

    AsyncFunction("insertNote") { text: String ->
      db.insertText(CaptureKind.NOTE, text.take(MAX_TEXT_CHARS), System.currentTimeMillis())
    }

    AsyncFunction("insertClipboard") { text: String ->
      db.insertText(CaptureKind.CLIPBOARD, text.take(MAX_TEXT_CHARS), System.currentTimeMillis())
    }

    AsyncFunction("updateQueueBody") { id: Long, body: String ->
      db.updateQueueBody(id, body, System.currentTimeMillis())
    }

    AsyncFunction("promote") { batchJson: String ->
      db.promote(JSONObject(batchJson), System.currentTimeMillis())
    }

    AsyncFunction("listQueue") { db.queueJson(RECENT_UPLOADED) }

    AsyncFunction("approve") { idsJson: String ->
      val changed = db.approve(ids(idsJson), System.currentTimeMillis())
      TrackerScheduler.enqueueUpload(context)
      changed
    }

    AsyncFunction("approveAll") {
      val changed = db.approve(null, System.currentTimeMillis())
      TrackerScheduler.enqueueUpload(context)
      changed
    }

    AsyncFunction("discard") { idsJson: String -> db.discard(ids(idsJson)) }

    AsyncFunction("retry") { idsJson: String ->
      db.retry(ids(idsJson), System.currentTimeMillis())
      TrackerScheduler.enqueueUpload(context)
    }

    AsyncFunction("markUploaded") { id: Long -> db.markUploaded(id, System.currentTimeMillis()) }

    AsyncFunction("markFailed") { id: Long, error: String, countAttempt: Boolean ->
      db.markFailed(id, error, countAttempt, System.currentTimeMillis())
    }

    AsyncFunction("setPaused") { paused: Boolean ->
      Tracker.setPaused(context, paused)
      Tracker.statusJson(context)
    }

    AsyncFunction("getDenyList") { appsJson(TrackerPrefs(context).denyList.sorted()) }

    AsyncFunction("setDenyList") { packagesJson: String ->
      val array = JSONArray(packagesJson)
      TrackerPrefs(context).denyList = (0 until array.length())
        .map { array.getString(it).trim() }
        .filter { it.isNotEmpty() }
        .toSet()
    }

    AsyncFunction("resetDenyList") { TrackerPrefs(context).resetDenyList() }

    AsyncFunction("listRecentApps") { recentAppsJson() }

    AsyncFunction("setAuthToken") { token: String? ->
      TrackerPrefs(context).setToken(token)
      if (token != null && db.approvedCount() > 0) TrackerScheduler.enqueueUpload(context)
    }

    AsyncFunction("setCalendarEnabled") { enabled: Boolean ->
      Tracker.setCalendarEnabled(context, enabled)
      Tracker.statusJson(context)
    }

    AsyncFunction("setBaseUrl") { url: String -> TrackerPrefs(context).baseUrl = url }

    AsyncFunction("deleteAllData") { Tracker.deleteAllData(context) }

    Function("openUsageAccessSettings") {
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }

  private fun ids(json: String): List<Long> {
    val array = JSONArray(json)
    return (0 until array.length()).map { array.getLong(it) }
  }

  private fun appsJson(packages: List<String>): String {
    val ctx = context
    val out = JSONArray()
    for (pkg in packages) {
      out.put(
        JSONObject()
          .put("package", pkg)
          .put("label", AppLabels.label(ctx, pkg))
          .put("installed", AppLabels.isInstalled(ctx, pkg)),
      )
    }
    return out.toString()
  }

  /** Apps used in the last week, most recent first, for the blocked apps picker. */
  private fun recentAppsJson(): String {
    val ctx = context
    if (!UsageCollector.hasUsageAccess(ctx)) return "[]"
    val now = System.currentTimeMillis()
    val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val excluded = DenyList.alwaysExcluded(ctx)
    val recent = usm.queryAndAggregateUsageStats(now - WEEK_MS, now).values
      .filter { it.totalTimeInForeground > 0 && it.packageName !in excluded }
      .sortedByDescending { it.lastTimeUsed }
      .take(RECENT_APPS)
    val out = JSONArray()
    for (stats in recent) {
      out.put(
        JSONObject()
          .put("package", stats.packageName)
          .put("label", AppLabels.label(ctx, stats.packageName))
          .put("lastUsedMs", stats.lastTimeUsed),
      )
    }
    return out.toString()
  }

  private companion object {
    const val RECENT_UPLOADED = 20
    const val MAX_TEXT_CHARS = 20_000
    const val RECENT_APPS = 60
    const val WEEK_MS = 7L * 24 * 60 * 60 * 1000
  }
}
