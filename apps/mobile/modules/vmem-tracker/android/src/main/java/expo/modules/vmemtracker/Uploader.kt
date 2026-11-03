package expo.modules.vmemtracker

import android.content.Context
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Posts approved items with the stored session token. The app uploads with
 * `@vmem/sdk` while it is open; this covers items left over when it closes.
 * Each body carries an `externalId`, so a repeated post updates the same
 * memory instead of adding a second one.
 */
object Uploader {
  enum class Outcome { DONE, NO_TOKEN, AUTH_FAILED, RETRY_LATER }

  const val MAX_ATTEMPTS = 5
  private const val BATCH = 20
  private const val TIMEOUT_MS = 15_000

  @Synchronized
  fun uploadApproved(context: Context): Outcome {
    val prefs = TrackerPrefs(context)
    val db = TrackerDatabase.get(context)
    while (true) {
      val token = prefs.validToken(System.currentTimeMillis()) ?: return Outcome.NO_TOKEN
      val rows = db.approvedForUpload(MAX_ATTEMPTS, BATCH)
      if (rows.isEmpty()) return Outcome.DONE
      for (row in rows) {
        val code = post(prefs.baseUrl, token, row.body)
        val now = System.currentTimeMillis()
        when {
          code in 200..299 -> db.markUploaded(row.id, now)
          code == 401 -> {
            // Expired or revoked: wait for the app to hand over a new token.
            prefs.setToken(null)
            db.markFailed(row.id, "Sign-in expired. Open vmem to send.", countAttempt = false, now = now)
            return Outcome.AUTH_FAILED
          }
          code == NETWORK_ERROR || code == 408 || code == 429 || code >= 500 -> {
            db.markFailed(row.id, if (code == NETWORK_ERROR) "Offline" else "HTTP $code", countAttempt = false, now = now)
            return Outcome.RETRY_LATER
          }
          else -> db.markFailed(row.id, "HTTP $code", countAttempt = true, now = now)
        }
      }
    }
  }

  private const val NETWORK_ERROR = -1

  private fun post(baseUrl: String, token: String, body: String): Int {
    val connection = try {
      URL("$baseUrl/api/v1/memories").openConnection() as HttpURLConnection
    } catch (_: IOException) {
      return NETWORK_ERROR
    }
    return try {
      connection.requestMethod = "POST"
      connection.connectTimeout = TIMEOUT_MS
      connection.readTimeout = TIMEOUT_MS
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer $token")
      connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val code = connection.responseCode
      // Drain the body so the connection can be reused.
      (if (code < 400) connection.inputStream else connection.errorStream)?.use { it.readBytes() }
      code
    } catch (_: IOException) {
      NETWORK_ERROR
    } finally {
      connection.disconnect()
    }
  }
}
