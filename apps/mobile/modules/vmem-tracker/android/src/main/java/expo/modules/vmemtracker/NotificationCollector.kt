package expo.modules.vmemtracker

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Receives posted notifications while the user has allowed Notification
 * access in system settings. Android starts and stops this service. All rules
 * are in `NotificationCollector`.
 */
class VmemNotificationListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    try {
      NotificationCollector.record(applicationContext, sbn)
    } catch (_: RuntimeException) {
      // A capture that fails must never crash the listener.
    }
  }
}

/**
 * Turns a posted notification into a raw `notification` event: `subject` is
 * the title, `text` is the body. Records only when the user turned
 * Notifications on in Settings, recording is not paused and the app is not
 * blocked. The app sends the events to the server for a digest before Review
 * (src/capture/notifications.ts).
 */
object NotificationCollector {
  private const val MAX_TITLE_CHARS = 200
  private const val MAX_TEXT_CHARS = 1000

  /** Status noise: media, downloads, calls, alarms and system notices hold no event worth a memory. */
  private val SKIPPED_CATEGORIES = setOf(
    Notification.CATEGORY_TRANSPORT,
    Notification.CATEGORY_PROGRESS,
    Notification.CATEGORY_CALL,
    Notification.CATEGORY_ALARM,
    Notification.CATEGORY_SERVICE,
    Notification.CATEGORY_SYSTEM,
    Notification.CATEGORY_STATUS,
    "navigation",
  )

  /** True when the user allowed Notification access for this app in system settings. */
  fun hasAccess(context: Context): Boolean {
    val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
      ?: return false
    return enabled.split(':').any {
      ComponentName.unflattenFromString(it)?.packageName == context.packageName
    }
  }

  fun record(context: Context, sbn: StatusBarNotification) {
    val prefs = TrackerPrefs(context)
    if (!prefs.notificationsEnabled || prefs.paused) return
    val notification = sbn.notification ?: return
    if (sbn.isOngoing) return
    if ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
    // The app marked it as not for the lock screen at all.
    if (notification.visibility == Notification.VISIBILITY_SECRET) return
    if (notification.category in SKIPPED_CATEGORIES) return
    val packageName = sbn.packageName
    if (packageName in prefs.denyList || packageName in DenyList.alwaysExcluded(context)) return

    val extras = notification.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))
      ?.toString()?.trim().orEmpty()
    // A title alone ("3 new messages") holds no content.
    if (text.isEmpty()) return

    TrackerDatabase.get(context).insertNotification(
      packageName = packageName,
      label = AppLabels.label(context, packageName),
      title = title.take(MAX_TITLE_CHARS),
      text = text.take(MAX_TEXT_CHARS),
      at = sbn.postTime,
    )
  }
}
