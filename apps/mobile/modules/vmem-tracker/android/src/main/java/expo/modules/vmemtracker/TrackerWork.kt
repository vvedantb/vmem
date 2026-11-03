package expo.modules.vmemtracker

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

object TrackerScheduler {
  private const val COLLECT_WORK = "vmem-tracker-collect"
  private const val UPLOAD_WORK = "vmem-tracker-upload"

  /** Periodic collection (15 minutes is the WorkManager minimum). Safe to call often. */
  fun ensureScheduled(context: Context) {
    val request = PeriodicWorkRequest.Builder(CollectWorker::class.java, 15, TimeUnit.MINUTES).build()
    WorkManager.getInstance(context.applicationContext)
      .enqueueUniquePeriodicWork(COLLECT_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
  }

  /** One upload run once the phone is online. A run already queued is kept. */
  fun enqueueUpload(context: Context) {
    val request = OneTimeWorkRequest.Builder(UploadWorker::class.java)
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
      .build()
    WorkManager.getInstance(context.applicationContext)
      .enqueueUniqueWork(UPLOAD_WORK, ExistingWorkPolicy.KEEP, request)
  }
}

/** Collects usage while the app is closed, prunes old rows and queues an upload when there is something approved. */
class CollectWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val context = applicationContext
    try {
      UsageCollector.collect(context)
    } catch (error: RuntimeException) {
      // SecurityException when Usage Access is revoked mid-run, for example.
      Log.w(TAG, "collect failed", error)
      TrackerPrefs(context).lastCollectError = error.javaClass.simpleName
    }
    val db = TrackerDatabase.get(context)
    db.prune(System.currentTimeMillis())
    if (db.approvedCount() > 0 && TrackerPrefs(context).validToken(System.currentTimeMillis()) != null) {
      TrackerScheduler.enqueueUpload(context)
    }
    return Result.success()
  }

  private companion object {
    const val TAG = "VmemTracker"
  }
}

/** Posts approved items. Without a valid token it stops; the app uploads on its next open. */
class UploadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result = when (Uploader.uploadApproved(applicationContext)) {
    Uploader.Outcome.RETRY_LATER -> Result.retry()
    Uploader.Outcome.DONE, Uploader.Outcome.NO_TOKEN, Uploader.Outcome.AUTH_FAILED -> Result.success()
  }
}
