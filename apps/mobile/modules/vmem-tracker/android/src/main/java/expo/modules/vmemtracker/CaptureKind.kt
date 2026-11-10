package expo.modules.vmemtracker

/**
 * Values of `events.kind` and `queue.kind`. The app turns each kind into
 * review items (apps/mobile/src/capture). A new collector writes raw events
 * with its own kind and the app adds a batcher for it.
 */
object CaptureKind {
  /** Foreground app sessions from UsageStatsManager (phase 1). */
  const val APP_USAGE = "app_usage"

  /** Text or a link shared to vmem (phase 1). */
  const val SHARE = "share"

  /** A quick note typed or dictated in the app (text only). */
  const val NOTE = "note"

  /** Clipboard text saved by a tap on Save clipboard. Never read in the background. */
  const val CLIPBOARD = "clipboard"

  /** Phase 2: on-screen text from an AccessibilityService. Not collected yet. */
  const val SCREEN_TEXT = "screen_text"

  /** Phase 3: posted notifications from a NotificationListenerService. Not collected yet. */
  const val NOTIFICATION = "notification"
}

/** Values of `queue.status`. Nothing uploads before `APPROVED`. */
object QueueStatus {
  const val PENDING_REVIEW = "pending_review"
  const val APPROVED = "approved"
  const val UPLOADED = "uploaded"
}
