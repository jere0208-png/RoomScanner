package com.roomscan

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

class ARScanViewManager : SimpleViewManager<ARScanView>() {

  // Même nom que le composant iOS.
  override fun getName() = "RoomScanView"

  override fun createViewInstance(reactContext: ThemedReactContext): ARScanView =
    ARScanView(reactContext).also { ARScanModule.currentView = it }

  override fun onDropViewInstance(view: ARScanView) {
    super.onDropViewInstance(view)
    if (ARScanModule.currentView === view) ARScanModule.currentView = null
  }
}
