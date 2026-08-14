package com.roomscan

import android.widget.FrameLayout
import com.facebook.react.uimanager.ThemedReactContext
import com.google.ar.core.Config
import io.github.sceneview.ar.ARSceneView

class ARScanView(context: ThemedReactContext) : FrameLayout(context) {

  val sceneView: ARSceneView = ARSceneView(
    context,
    sessionConfiguration = { session, config ->
      config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
      config.updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
      config.depthMode =
        if (session.isDepthModeSupported(Config.DepthMode.AUTOMATIC))
          Config.DepthMode.AUTOMATIC
        else Config.DepthMode.DISABLED
      config.focusMode = Config.FocusMode.AUTO
    }
  ).apply {
    onSessionUpdated = { session, frame -> ScanEngine.onFrame(context, session, frame) }
  }

  init {
    addView(sceneView)
  }

  // RN ne relaye pas toujours les passes de layout aux vues Android natives :
  // forcer la mesure, sinon la vue AR reste en 0x0.
  override fun requestLayout() {
    super.requestLayout()
    post {
      measure(
        MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
      )
      layout(left, top, right, bottom)
    }
  }
}
