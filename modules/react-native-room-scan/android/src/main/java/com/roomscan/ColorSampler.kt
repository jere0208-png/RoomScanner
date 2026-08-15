package com.roomscan

import android.graphics.ImageFormat
import android.media.Image
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.roundToInt

/**
 * Relevé des couleurs de la pièce pendant le scan (pendant ARCore).
 *
 * Les plans détectés n'ont aucune couleur : on projette donc une petite
 * grille de points de chaque mur — et un semis du sol — dans l'image
 * caméra, et on moyenne les pixels obtenus sur toute la durée du scan.
 *
 * Tout est enveloppé : si l'image n'est pas disponible ou si le format
 * surprend, on renonce silencieusement et le scan continue sans couleurs.
 */
object ColorSampler {

  /** Résolution de la grille relevée sur un mur (le long × en hauteur). */
  private const val COLS = 6
  private const val ROWS = 4
  /** Côté d'une case du sol, en mètres. */
  private const val FLOOR_CELL = 0.4f
  /** Intervalle minimum entre deux lectures d'image (ms). */
  private const val PERIOD_MS = 330L
  /** Incidence minimale retenue (cosinus de l'angle de vue). */
  private const val MIN_INCIDENCE = 0.25f

  private class Accum(cells: Int) {
    val r = FloatArray(cells)
    val g = FloatArray(cells)
    val b = FloatArray(cells)
    val n = IntArray(cells)

    fun add(i: Int, cr: Float, cg: Float, cb: Float) {
      r[i] += cr; g[i] += cg; b[i] += cb; n[i]++
    }

    fun cell(i: Int): Int? =
      if (n[i] > 0) rgb(r[i] / n[i], g[i] / n[i], b[i] / n[i]) else null

    fun mean(): Int? {
      var sr = 0f; var sg = 0f; var sb = 0f; var sn = 0
      for (i in n.indices) { sr += r[i]; sg += g[i]; sb += b[i]; sn += n[i] }
      return if (sn > 0) rgb(sr / sn, sg / sn, sb / sn) else null
    }
  }

  private val walls = HashMap<String, Accum>()
  private val floorTiles = HashMap<Long, FloatArray>() // [r, g, b, n]
  private var lastSample = 0L

  fun reset() {
    walls.clear()
    floorTiles.clear()
    lastSample = 0L
  }

  /** Lit une image caméra et met à jour les moyennes. Jamais bloquant. */
  fun onFrame(frame: Frame, wallList: Collection<Wall>, floorY: Float) {
    val now = System.currentTimeMillis()
    if (now - lastSample < PERIOD_MS) return
    lastSample = now
    var image: Image? = null
    try {
      image = frame.acquireCameraImage()
      if (image.format != ImageFormat.YUV_420_888) return
      sample(frame, image, wallList, floorY)
    } catch (_: Throwable) {
      // Image indisponible sur cette frame : on retentera à la suivante.
    } finally {
      image?.close()
    }
  }

  // ------------------------------------------------------ échantillonnage

  private fun sample(frame: Frame, image: Image, wallList: Collection<Wall>, floorY: Float) {
    val cam = frame.camera
    val view = FloatArray(16)
    val proj = FloatArray(16)
    cam.getViewMatrix(view, 0)
    cam.getProjectionMatrix(proj, 0, 0.1f, 60f)
    val vp = FloatArray(16)
    android.opengl.Matrix.multiplyMM(vp, 0, proj, 0, view, 0)
    val eye = FloatArray(3)
    cam.pose.getTranslation(eye, 0)

    // Points du monde à relever, avec leur normale et leur destination.
    val pts = ArrayList<FloatArray>()   // x, y, z, nx, ny, nz
    val slots = ArrayList<Pair<Any, Int>>() // (id de mur | clé de case, index)

    for (w in wallList) {
      val dx = w.bx - w.ax
      val dz = w.bz - w.az
      val len = hypot(dx.toDouble(), dz.toDouble()).toFloat()
      if (len < 1e-3f) continue
      val nx = -dz / len
      val nz = dx / len
      for (row in 0 until ROWS) {
        for (col in 0 until COLS) {
          val t = (col + 0.5f) / COLS
          val y = w.baseY + w.height * (1f - (row + 0.5f) / ROWS)
          pts.add(floatArrayOf(w.ax + dx * t, y, w.az + dz * t, nx, 0f, nz))
          slots.add(w.id to (row * COLS + col))
        }
      }
    }

    // Sol : semis à pas fixe autour de l'emprise des murs.
    if (wallList.isNotEmpty()) {
      var minX = Float.MAX_VALUE; var maxX = -Float.MAX_VALUE
      var minZ = Float.MAX_VALUE; var maxZ = -Float.MAX_VALUE
      for (w in wallList) {
        minX = minOf(minX, w.ax, w.bx); maxX = maxOf(maxX, w.ax, w.bx)
        minZ = minOf(minZ, w.az, w.bz); maxZ = maxOf(maxZ, w.az, w.bz)
      }
      var i = floor(minX / FLOOR_CELL).toInt()
      val iMax = floor(maxX / FLOOR_CELL).toInt()
      while (i <= iMax) {
        var j = floor(minZ / FLOOR_CELL).toInt()
        val jMax = floor(maxZ / FLOOR_CELL).toInt()
        while (j <= jMax) {
          pts.add(
            floatArrayOf(
              (i + 0.5f) * FLOOR_CELL, floorY, (j + 0.5f) * FLOOR_CELL,
              0f, 1f, 0f,
            )
          )
          slots.add(key(i, j) to -1)
          j++
        }
        i++
      }
    }
    if (pts.isEmpty()) return

    // Projection : monde → coordonnées normalisées OpenGL, puis pixels de
    // l'image. ARCore gère lui-même la rotation de l'écran dans ce passage.
    val ndc = ArrayList<Float>(pts.size * 2)
    val keep = ArrayList<Int>(pts.size)
    val clip = FloatArray(4)
    val world = FloatArray(4)
    for ((idx, p) in pts.withIndex()) {
      val ex = eye[0] - p[0]
      val ey = eye[1] - p[1]
      val ez = eye[2] - p[2]
      val d = hypot(hypot(ex.toDouble(), ey.toDouble()), ez.toDouble()).toFloat()
      if (d < 0.2f || d > 8f) continue
      val cos = abs(p[3] * ex / d + p[4] * ey / d + p[5] * ez / d)
      if (cos < MIN_INCIDENCE) continue
      world[0] = p[0]; world[1] = p[1]; world[2] = p[2]; world[3] = 1f
      android.opengl.Matrix.multiplyMV(clip, 0, vp, 0, world, 0)
      if (clip[3] <= 0.01f) continue
      val x = clip[0] / clip[3]
      val y = clip[1] / clip[3]
      if (x < -1f || x > 1f || y < -1f || y > 1f) continue
      ndc.add(x); ndc.add(y)
      keep.add(idx)
    }
    if (keep.isEmpty()) return

    val inCoords = ndc.toFloatArray()
    val outCoords = FloatArray(inCoords.size)
    frame.transformCoordinates2d(
      Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES, inCoords,
      Coordinates2d.IMAGE_PIXELS, outCoords,
    )

    val yuv = YuvReader(image)
    for ((k, idx) in keep.withIndex()) {
      val px = outCoords[k * 2].roundToInt()
      val py = outCoords[k * 2 + 1].roundToInt()
      val c = yuv.color(px, py) ?: continue
      val (target, cell) = slots[idx]
      if (cell >= 0) {
        val acc = walls.getOrPut(target as String) { Accum(COLS * ROWS) }
        acc.add(cell, c[0], c[1], c[2])
      } else {
        val tile = floorTiles.getOrPut(target as Long) { FloatArray(4) }
        tile[0] += c[0]; tile[1] += c[1]; tile[2] += c[2]; tile[3] += 1f
      }
    }
  }

  // ------------------------------------------------------------- résultat

  /** Couleur moyenne et grille de couleurs d'un mur, pour le pont JS. */
  fun applyTo(map: WritableMap, wallId: String) {
    val acc = walls[wallId] ?: return
    val mean = acc.mean() ?: return
    map.putString("color", hex(mean))
    val texels = Arguments.createArray()
    for (i in 0 until COLS * ROWS) texels.pushString(hex(acc.cell(i) ?: mean))
    map.putMap("texture", Arguments.createMap().apply {
      putInt("cols", COLS)
      putInt("rows", ROWS)
      putArray("texels", texels)
    })
  }

  /** Carte de couleurs du sol, recadrée sur les cases réellement relevées. */
  fun floorPayload(): WritableMap? {
    if (floorTiles.isEmpty()) return null
    var i0 = Int.MAX_VALUE; var i1 = Int.MIN_VALUE
    var j0 = Int.MAX_VALUE; var j1 = Int.MIN_VALUE
    var sr = 0f; var sg = 0f; var sb = 0f; var sn = 0f
    for ((k, v) in floorTiles) {
      val i = (k shr 32).toInt()
      val j = k.toInt()
      i0 = minOf(i0, i); i1 = maxOf(i1, i)
      j0 = minOf(j0, j); j1 = maxOf(j1, j)
      sr += v[0]; sg += v[1]; sb += v[2]; sn += v[3]
    }
    if (sn <= 0f) return null
    val mean = rgb(sr / sn, sg / sn, sb / sn)
    val out = Arguments.createMap()
    out.putString("color", hex(mean))

    val cols = i1 - i0 + 1
    val rows = j1 - j0 + 1
    // Au-delà, la grille pèse plus qu'elle n'apporte au rendu.
    if (cols in 1..64 && rows in 1..64) {
      val texels = Arguments.createArray()
      for (j in j0..j1) {
        for (i in i0..i1) {
          val v = floorTiles[key(i, j)]
          texels.pushString(
            if (v != null && v[3] > 0f) hex(rgb(v[0] / v[3], v[1] / v[3], v[2] / v[3]))
            else hex(mean)
          )
        }
      }
      out.putMap("texture", Arguments.createMap().apply {
        putInt("cols", cols)
        putInt("rows", rows)
        putArray("texels", texels)
        putDouble("minX", (i0 * FLOOR_CELL).toDouble())
        putDouble("maxX", ((i1 + 1) * FLOOR_CELL).toDouble())
        putDouble("minZ", (j0 * FLOOR_CELL).toDouble())
        putDouble("maxZ", ((j1 + 1) * FLOOR_CELL).toDouble())
      })
    }
    return out
  }

  private fun key(i: Int, j: Int): Long = (i.toLong() shl 32) or (j.toLong() and 0xFFFFFFFFL)

  private fun rgb(r: Float, g: Float, b: Float): Int {
    fun c(v: Float) = v.roundToInt().coerceIn(0, 255)
    return (c(r) shl 16) or (c(g) shl 8) or c(b)
  }

  private fun hex(v: Int): String = String.format("#%06X", v and 0xFFFFFF)
}

/** Lecture d'un pixel d'une image YUV_420_888, en RGB 0…255 (BT.601). */
private class YuvReader(private val image: Image) {
  private val yPlane = image.planes[0]
  private val uPlane = image.planes[1]
  private val vPlane = image.planes[2]
  private val w = image.width
  private val h = image.height

  fun color(x: Int, y: Int): FloatArray? {
    if (x < 4 || y < 4 || x >= w - 4 || y >= h - 4) return null
    val yy = yPlane.buffer.get(y * yPlane.rowStride + x * yPlane.pixelStride)
      .toInt() and 0xFF
    val ci = (y / 2) * uPlane.rowStride + (x / 2) * uPlane.pixelStride
    val cj = (y / 2) * vPlane.rowStride + (x / 2) * vPlane.pixelStride
    if (ci >= uPlane.buffer.limit() || cj >= vPlane.buffer.limit()) return null
    val cb = (uPlane.buffer.get(ci).toInt() and 0xFF) - 128
    val cr = (vPlane.buffer.get(cj).toInt() and 0xFF) - 128
    return floatArrayOf(
      yy + 1.402f * cr,
      yy - 0.344136f * cb - 0.714136f * cr,
      yy + 1.772f * cb,
    )
  }
}
