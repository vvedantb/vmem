package expo.modules.vmemtracker

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager

object DenyList {
  /**
   * Messaging apps. Blocked by default; the user can edit the list in
   * Settings. A blocked app is not recorded at all, not even as a gap.
   */
  val DEFAULTS: List<String> = listOf(
    "com.whatsapp",
    "com.whatsapp.w4b",
    "org.telegram.messenger",
    "org.telegram.messenger.web",
    "org.thunderdog.challegram",
    "org.thoughtcrime.securesms",
    "com.google.android.apps.messaging",
    "com.samsung.android.messaging",
    "com.android.mms",
    "com.android.messaging",
    "com.facebook.orca",
    "com.facebook.mlite",
    "com.instagram.direct",
    "com.discord",
    "com.Slack",
    "com.microsoft.teams",
    "com.google.android.apps.dynamite",
    "com.skype.raider",
    "com.viber.voip",
    "jp.naver.line.android",
    "com.tencent.mm",
    "com.kakao.talk",
    "com.snapchat.android",
    "ch.threema.app",
    "com.wire",
    "im.vector.app",
  )

  /**
   * Never recorded and not editable: this app, the home screen and the
   * system UI. They are noise, not activity.
   */
  fun alwaysExcluded(context: Context): Set<String> {
    val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
    val launchers = context.packageManager
      .queryIntentActivities(home, PackageManager.MATCH_DEFAULT_ONLY)
      .mapNotNull { it.activityInfo?.packageName }
    return buildSet {
      add(context.packageName)
      add("com.android.systemui")
      addAll(launchers)
    }
  }
}

object AppLabels {
  /** The app's display name, or the package name when it is not visible or not installed. */
  fun label(context: Context, packageName: String): String = try {
    val pm = context.packageManager
    @Suppress("DEPRECATION")
    pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
  } catch (_: PackageManager.NameNotFoundException) {
    packageName
  }

  fun isInstalled(context: Context, packageName: String): Boolean = try {
    @Suppress("DEPRECATION")
    context.packageManager.getApplicationInfo(packageName, 0)
    true
  } catch (_: PackageManager.NameNotFoundException) {
    false
  }
}
