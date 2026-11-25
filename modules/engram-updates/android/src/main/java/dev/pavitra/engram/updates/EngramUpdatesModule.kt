package dev.pavitra.engram.updates

import android.content.Context
import android.os.Build
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Two small things for "Tell me about new versions":
 *
 * - `installer()` names the app that installed Engram ("com.android.vending" for
 *   Google Play), so the app knows whether to ask Play or to look at GitHub.
 * - `playUpdate()` asks the Play Store app whether a newer build is available to
 *   this phone, and `startPlayUpdate()` opens Play's own full-screen update. Play
 *   downloads, installs and restarts Engram. Both only work for a Play install.
 */
class EngramUpdatesModule : Module() {
  private var managerInstance: AppUpdateManager? = null

  private fun context(): Context = appContext.reactContext ?: throw Exception("The app is not ready")

  private fun manager(): AppUpdateManager =
    managerInstance ?: AppUpdateManagerFactory.create(context()).also { managerInstance = it }

  override fun definition() = ModuleDefinition {
    Name("EngramUpdates")

    Function("installer") {
      try {
        val ctx = context()
        val pm = ctx.packageManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          pm.getInstallSourceInfo(ctx.packageName).installingPackageName
        } else {
          @Suppress("DEPRECATION")
          pm.getInstallerPackageName(ctx.packageName)
        }
      } catch (error: Exception) {
        null
      }
    }

    AsyncFunction("playUpdate") { promise: Promise ->
      try {
        manager().appUpdateInfo
          .addOnSuccessListener { info ->
            val available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
              info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
            val running = info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
            promise.resolve(mapOf("available" to (available || running), "versionCode" to info.availableVersionCode()))
          }
          .addOnFailureListener { error ->
            promise.reject(CodedException("PLAY_UPDATE_FAILED", error.message ?: "Google Play could not be asked", error))
          }
      } catch (error: Exception) {
        promise.reject(CodedException("PLAY_UPDATE_FAILED", error.message ?: "Google Play could not be asked", error))
      }
    }

    AsyncFunction("startPlayUpdate") { promise: Promise ->
      try {
        val activity = appContext.currentActivity ?: throw Exception("The app is not ready")
        val m = manager()
        m.appUpdateInfo
          .addOnSuccessListener { info ->
            val usable = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE ||
              info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
            if (!usable || !info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
              promise.resolve(false)
              return@addOnSuccessListener
            }
            m.startUpdateFlow(info, activity, AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build())
              .addOnSuccessListener { promise.resolve(true) }
              .addOnFailureListener { error ->
                promise.reject(CodedException("PLAY_UPDATE_FAILED", error.message ?: "The update could not start", error))
              }
          }
          .addOnFailureListener { error ->
            promise.reject(CodedException("PLAY_UPDATE_FAILED", error.message ?: "Google Play could not be asked", error))
          }
      } catch (error: Exception) {
        promise.reject(CodedException("PLAY_UPDATE_FAILED", error.message ?: "The update could not start", error))
      }
    }
  }
}
