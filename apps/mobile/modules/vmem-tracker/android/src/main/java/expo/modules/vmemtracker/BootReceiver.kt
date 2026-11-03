package expo.modules.vmemtracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Keeps periodic collection scheduled after a reboot or an app update. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED -> {
        // The app open before the reboot is gone; do not count the time the phone was off.
        TrackerPrefs(context).dropOpenSession()
        TrackerScheduler.ensureScheduled(context)
      }
      Intent.ACTION_MY_PACKAGE_REPLACED -> TrackerScheduler.ensureScheduled(context)
    }
  }
}
