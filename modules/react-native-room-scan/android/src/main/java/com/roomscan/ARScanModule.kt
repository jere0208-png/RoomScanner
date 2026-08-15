package com.roomscan

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.ar.core.ArCoreApk

class ARScanModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  // Même nom que sur iOS : un seul code JS pour les deux plateformes.
  override fun getName() = "RoomScanModule"

  companion object {
    var currentView: ARScanView? = null
  }

  @ReactMethod
  fun isSupported(promise: Promise) {
    try {
      val availability = ArCoreApk.getInstance().checkAvailability(ctx)
      promise.resolve(availability.isSupported)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun startRoomScan(promise: Promise) {
    ScanEngine.reset()
    ScanEngine.scanning = true
    promise.resolve(null)
  }

  @ReactMethod
  fun stopRoomScan(promise: Promise) {
    ScanEngine.scanning = false
    try {
      val obj = ScanEngine.exportObj(ctx.filesDir)
      val result = Arguments.createMap().apply {
        putString("modelPath", obj.absolutePath)
        putArray("objects", Arguments.createArray())
        merge(ScanEngine.buildSnapshot(withColors = true))
        ScanEngine.floorPayload()?.let { putMap("floor", it) }
      }
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("EXPORT_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun pauseRoomScan() {
    ScanEngine.scanning = false
    currentView?.sceneView?.session?.pause()
  }

  @ReactMethod
  fun resumeRoomScan() {
    currentView?.sceneView?.session?.resume()
    ScanEngine.scanning = true
  }

  // Requis par NativeEventEmitter côté JS.
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
}
