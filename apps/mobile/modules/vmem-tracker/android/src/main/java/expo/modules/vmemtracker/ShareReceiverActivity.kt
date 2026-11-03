package expo.modules.vmemtracker

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast

/**
 * Android share target for text and links. Writes a `share` event and closes;
 * the app turns it into a review item. Works while recording is paused,
 * because the user starts it.
 */
class ShareReceiverActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val saved = save(intent)
    Toast.makeText(
      this,
      if (saved) R.string.vmem_tracker_share_saved else R.string.vmem_tracker_share_empty,
      Toast.LENGTH_SHORT,
    ).show()
    finish()
  }

  private fun save(intent: Intent?): Boolean {
    if (intent?.action != Intent.ACTION_SEND) return false
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    if (text.isEmpty()) return false
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.trim()?.takeIf { it.isNotEmpty() }
    // The sharing app, when Android tells us (android-app://<package>).
    val source = referrer?.takeIf { it.scheme == "android-app" }?.host
    TrackerDatabase.get(this).insertShare(
      text = text.take(MAX_TEXT_CHARS),
      subject = subject?.take(MAX_SUBJECT_CHARS),
      sourcePackage = source,
      sourceLabel = source?.let { AppLabels.label(this, it) },
      at = System.currentTimeMillis(),
    )
    return true
  }

  private companion object {
    const val MAX_TEXT_CHARS = 20_000
    const val MAX_SUBJECT_CHARS = 300
  }
}
