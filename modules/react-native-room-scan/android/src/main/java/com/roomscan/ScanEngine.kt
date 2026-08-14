package com.roomscan

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import java.io.File
import kotlin.math.abs
import kotlin.math.hypot

data class Wall(
  val id: String,
  // Extrémités au sol (repère monde, mètres)
  val ax: Float, val az: Float, val bx: Float, val bz: Float,
  val baseY: Float, val height: Float
)

object ScanEngine {
  private val walls = LinkedHashMap<String, Wall>()
  private var floorY = 0f
  private var lastEmit = 0L
  @Volatile var scanning = false

  fun reset() {
    walls.clear()
    floorY = 0f
  }

  fun onFrame(context: ReactContext, session: Session, frame: Frame) {
    if (!scanning || frame.camera.trackingState != TrackingState.TRACKING) return

    val planes = session.getAllTrackables(Plane::class.java)
      .filter { it.trackingState == TrackingState.TRACKING && it.subsumedBy == null }

    // Sol = plan horizontal vers le haut le plus bas.
    planes.filter { it.type == Plane.Type.HORIZONTAL_UPWARD_FACING }
      .minByOrNull { it.centerPose.ty() }
      ?.let { floorY = it.centerPose.ty() }

    // Murs = plans verticaux, convertis en segments 2D au sol.
    var hasNew = false
    for (plane in planes.filter { it.type == Plane.Type.VERTICAL }) {
      val wall = planeToWall(plane) ?: continue
      if (wall.id !in walls) hasNew = true
      walls[wall.id] = wall
    }

    val now = System.currentTimeMillis()
    if (hasNew || now - lastEmit > 500) {
      lastEmit = now
      emit(context, "onScanUpdate", buildSnapshot())
    }
  }

  /**
   * Sur un plan ARCore, les axes locaux X et Z sont DANS le plan (Y = normale).
   * Pour un plan vertical, rien ne garantit lequel des deux est horizontal :
   * on transforme les deux axes en repère monde et on garde le plus horizontal.
   */
  private fun planeToWall(plane: Plane): Wall? {
    val pose = plane.centerPose
    val xAxis = pose.rotateVector(floatArrayOf(1f, 0f, 0f))
    val zAxis = pose.rotateVector(floatArrayOf(0f, 0f, 1f))

    val dir: FloatArray
    val length: Float
    val height: Float
    if (abs(xAxis[1]) < abs(zAxis[1])) {
      dir = xAxis; length = plane.extentX; height = plane.extentZ
    } else {
      dir = zAxis; length = plane.extentZ; height = plane.extentX
    }

    if (length < 0.5f) return null  // ignorer les fragments < 50 cm

    val half = length / 2f
    return Wall(
      id = plane.hashCode().toString(),
      ax = pose.tx() - dir[0] * half, az = pose.tz() - dir[2] * half,
      bx = pose.tx() + dir[0] * half, bz = pose.tz() + dir[2] * half,
      baseY = floorY, height = height
    )
  }

  fun buildSnapshot(): WritableMap = Arguments.createMap().apply {
    putInt("wallCount", walls.size)
    putInt("objectCount", 0)
    putInt("doorCount", 0)
    putInt("windowCount", 0)
    putArray("surfaces", Arguments.createArray().apply {
      walls.values.forEach { w ->
        pushMap(Arguments.createMap().apply {
          putString("id", w.id)
          putString("type", "wall")
          putDouble("length", hypot((w.bx - w.ax).toDouble(), (w.bz - w.az).toDouble()))
          putDouble("height", w.height.toDouble())
          putDouble("ax", w.ax.toDouble()); putDouble("az", w.az.toDouble())
          putDouble("bx", w.bx.toDouble()); putDouble("bz", w.bz.toDouble())
        })
      }
    })
  }

  /** Export OBJ : un quad par mur, du sol au sommet. */
  fun exportObj(dir: File): File {
    val sb = StringBuilder("# RoomScanner export\n")
    var vi = 1
    for (w in walls.values) {
      val top = w.baseY + w.height
      sb.append("v ${w.ax} ${w.baseY} ${w.az}\n")
      sb.append("v ${w.bx} ${w.baseY} ${w.bz}\n")
      sb.append("v ${w.bx} $top ${w.bz}\n")
      sb.append("v ${w.ax} $top ${w.az}\n")
      sb.append("f $vi ${vi + 1} ${vi + 2} ${vi + 3}\n")
      vi += 4
    }
    val file = File(dir, "scan-${System.currentTimeMillis()}.obj")
    file.writeText(sb.toString())
    return file
  }

  fun emit(context: ReactContext, name: String, body: WritableMap) {
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, body)
  }
}
