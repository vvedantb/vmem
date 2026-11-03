package expo.modules.vmemtracker

import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Quick Settings tile: on while recording, off while paused. Tap to toggle. */
class PauseTileService : TileService() {
  override fun onStartListening() {
    super.onStartListening()
    render()
  }

  override fun onClick() {
    super.onClick()
    val pause = !TrackerPrefs(this).paused
    val context = applicationContext
    // Pausing collects first, which reads the database: keep it off the main thread.
    Thread {
      Tracker.setPaused(context, pause)
      Handler(Looper.getMainLooper()).post { render() }
    }.start()
  }

  private fun render() {
    val tile = qsTile ?: return
    val paused = TrackerPrefs(this).paused
    tile.state = if (paused) Tile.STATE_INACTIVE else Tile.STATE_ACTIVE
    tile.label = getString(R.string.vmem_tracker_tile_label)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      tile.subtitle = getString(if (paused) R.string.vmem_tracker_tile_paused else R.string.vmem_tracker_tile_on)
    }
    tile.updateTile()
  }

  companion object {
    /** Asks the system to redraw the tile after pause changes in the app. */
    fun refresh(context: Context) {
      try {
        requestListeningState(context, ComponentName(context, PauseTileService::class.java))
      } catch (_: RuntimeException) {
        // No tile added, or the system refused; it redraws when opened.
      }
    }
  }
}
