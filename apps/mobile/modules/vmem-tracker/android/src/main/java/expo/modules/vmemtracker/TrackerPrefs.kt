package expo.modules.vmemtracker

import android.content.Context
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Settings and collector state in private SharedPreferences, so WorkManager
 * respects pause and the deny list without JS.
 *
 * The auth token is the short-lived session JWT the app hands over
 * (README "Token handoff"). It stays in app-private storage and is never
 * logged.
 */
class TrackerPrefs(context: Context) {
  private val prefs = context.applicationContext
    .getSharedPreferences(FILE, Context.MODE_PRIVATE)

  var paused: Boolean
    get() = prefs.getBoolean(PAUSED, false)
    set(value) = prefs.edit().putBoolean(PAUSED, value).apply()

  /** Usage events before this time are processed. 0 means never collected. */
  val cursorMs: Long get() = prefs.getLong(CURSOR, 0L)

  /** App still in the foreground at `cursorMs`, carried to the next run. */
  val openPackage: String? get() = prefs.getString(OPEN_PACKAGE, null)
  val openStartMs: Long get() = prefs.getLong(OPEN_START, 0L)

  /** Off by default. The user turns it on in Settings. */
  var calendarEnabled: Boolean
    get() = prefs.getBoolean(CALENDAR_ENABLED, false)
    set(value) = prefs.edit().putBoolean(CALENDAR_ENABLED, value).apply()

  /** Calendar days before this time are collected. 0 means never collected. */
  var calendarCursorMs: Long
    get() = prefs.getLong(CALENDAR_CURSOR, 0L)
    set(value) = prefs.edit().putLong(CALENDAR_CURSOR, value).apply()

  var lastCollectAtMs: Long
    get() = prefs.getLong(LAST_COLLECT_AT, 0L)
    set(value) = prefs.edit().putLong(LAST_COLLECT_AT, value).apply()

  var lastCollectError: String?
    get() = prefs.getString(LAST_COLLECT_ERROR, null)
    set(value) = prefs.edit().putString(LAST_COLLECT_ERROR, value).apply()

  fun saveCursor(cursor: Long, openPackage: String?, openStartMs: Long) {
    prefs.edit()
      .putLong(CURSOR, cursor)
      .putString(OPEN_PACKAGE, openPackage)
      .putLong(OPEN_START, openStartMs)
      .apply()
  }

  /** Records nothing before `now`: used for pause, resume, first run and delete. */
  fun skipTo(now: Long) = saveCursor(now, null, 0L)

  /** After a reboot the open app is gone; do not count the time it was off. */
  fun dropOpenSession() = saveCursor(cursorMs, null, 0L)

  var denyList: Set<String>
    get() {
      val raw = prefs.getString(DENY_LIST, null) ?: return DenyList.DEFAULTS.toSet()
      val array = JSONArray(raw)
      return (0 until array.length()).map { array.getString(it) }.toSet()
    }
    set(value) = prefs.edit()
      .putString(DENY_LIST, JSONArray(value.sorted()).toString())
      .apply()

  fun resetDenyList() = prefs.edit().remove(DENY_LIST).apply()

  var baseUrl: String
    get() = prefs.getString(BASE_URL, null) ?: DEFAULT_BASE_URL
    set(value) = prefs.edit().putString(BASE_URL, value.trimEnd('/')).apply()

  /** Random per install. Keeps usage item ids apart across phones of one account. */
  val installId: String
    get() = prefs.getString(INSTALL_ID, null)
      ?: UUID.randomUUID().toString().also {
        prefs.edit().putString(INSTALL_ID, it).apply()
      }

  val tokenExpiresAtMs: Long get() = prefs.getLong(TOKEN_EXPIRES_AT, 0L)

  /** Stores the token with its JWT `exp`. `null` clears it. */
  fun setToken(token: String?) {
    val editor = prefs.edit()
    if (token.isNullOrBlank()) {
      editor.remove(TOKEN).remove(TOKEN_EXPIRES_AT)
    } else {
      editor.putString(TOKEN, token).putLong(TOKEN_EXPIRES_AT, jwtExpiryMs(token))
    }
    editor.apply()
  }

  /** The token if it is still valid for `marginMs`, else null. */
  fun validToken(now: Long, marginMs: Long = TOKEN_MARGIN_MS): String? {
    val token = prefs.getString(TOKEN, null) ?: return null
    return if (tokenExpiresAtMs - marginMs > now) token else null
  }

  companion object {
    const val DEFAULT_BASE_URL = "https://clear-bear-690.eu-west-1.convex.site"
    private const val TOKEN_MARGIN_MS = 10_000L
    private const val FILE = "vmem_tracker"
    private const val PAUSED = "paused"
    private const val CURSOR = "cursor_ms"
    private const val OPEN_PACKAGE = "open_package"
    private const val OPEN_START = "open_start_ms"
    private const val LAST_COLLECT_AT = "last_collect_at_ms"
    private const val LAST_COLLECT_ERROR = "last_collect_error"
    private const val CALENDAR_ENABLED = "calendar_enabled"
    private const val CALENDAR_CURSOR = "calendar_cursor_ms"
    private const val DENY_LIST = "deny_list"
    private const val BASE_URL = "base_url"
    private const val INSTALL_ID = "install_id"
    private const val TOKEN = "auth_token"
    private const val TOKEN_EXPIRES_AT = "auth_token_expires_at_ms"

    /** `exp` of a JWT in ms, or 0 when the token cannot be read. */
    fun jwtExpiryMs(token: String): Long = try {
      val payload = token.split('.').getOrNull(1) ?: return 0L
      val json = String(
        Base64.decode(payload, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP),
        Charsets.UTF_8,
      )
      JSONObject(json).optLong("exp", 0L) * 1000L
    } catch (_: IllegalArgumentException) {
      0L
    } catch (_: org.json.JSONException) {
      0L
    }
  }
}
