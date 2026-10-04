package ssbot.core.vision

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import org.opencv.core.Core
import org.opencv.core.Mat
import org.opencv.core.Scalar
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import java.nio.FloatBuffer
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

data class Detection(val x1: Double, val y1: Double, val x2: Double, val y2: Double, val confidence: Double, val cls: Int)

/**
 * YOLOv5 inference reproducing `torch.hub.load(..., 'custom')` + AutoShape:
 * same letterbox (size 640, stride 32, pad 114), conf 0.25, IoU 0.45, class-offset NMS
 * and scale_boxes back to the input image. The model is the bot's best.pt exported to ONNX
 * with dynamic input size (see tools/export_models.sh).
 */
class Yolo(modelBytes: ByteArray, numThreads: Int = 4, useXnnpack: Boolean = false) : AutoCloseable {
    private val env = OrtEnvironment.getEnvironment()
    /** True when the XNNPACK (ARM-optimised) execution provider is active. */
    var accelerated = false
        private set

    private val session: OrtSession = createSession(modelBytes, numThreads, useXnnpack)

    private fun createSession(bytes: ByteArray, threads: Int, xnnpack: Boolean): OrtSession {
        if (xnnpack) {
            try {
                val opts = OrtSession.SessionOptions().apply {
                    setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
                    // XNNPACK runs its own thread pool; ORT's pool then only needs one thread.
                    addXnnpack(mapOf("intra_op_num_threads" to threads.toString()))
                    setIntraOpNumThreads(1)
                }
                return env.createSession(bytes, opts).also { accelerated = true }
            } catch (e: Exception) {
                // Provider not available in this ONNX Runtime build: fall back to the default CPU provider.
            }
        }
        return env.createSession(bytes, OrtSession.SessionOptions().apply {
            setIntraOpNumThreads(threads)
            setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
        })
    }
    private val inputName = session.inputNames.first()

    var confThres = 0.25
    var iouThres = 0.45
    var maxDet = 1000

    /** [bgr] is a BGR frame; AutoShape receives the RGB PIL image made from it. */
    @Synchronized
    fun detect(bgr: Mat, size: Int = 640, stride: Int = 32): List<Detection> {
        val h0 = bgr.rows()
        val w0 = bgr.cols()
        val g = size.toDouble() / max(h0, w0)
        val h1 = makeDivisible((h0 * g).toInt(), stride)
        val w1 = makeDivisible((w0 * g).toInt(), stride)

        // letterbox(im, (h1, w1), auto=False)
        val r = min(h1.toDouble() / h0, w1.toDouble() / w0)
        val unpadW = pyRound(w0 * r)
        val unpadH = pyRound(h0 * r)
        val dw = (w1 - unpadW) / 2.0
        val dh = (h1 - unpadH) / 2.0
        val rgb = Mat()
        Imgproc.cvtColor(bgr, rgb, Imgproc.COLOR_BGR2RGB)
        val resized = if (unpadW != w0 || unpadH != h0) {
            Mat().also { Imgproc.resize(rgb, it, Size(unpadW.toDouble(), unpadH.toDouble()), 0.0, 0.0, Imgproc.INTER_LINEAR) }
        } else rgb
        val top = pyRound(dh - 0.1)
        val bottom = pyRound(dh + 0.1)
        val left = pyRound(dw - 0.1)
        val right = pyRound(dw + 0.1)
        val padded = Mat()
        Core.copyMakeBorder(resized, padded, top, bottom, left, right, Core.BORDER_CONSTANT, Scalar(114.0, 114.0, 114.0))
        if (resized !== rgb) resized.release()
        rgb.release()

        val ih = padded.rows()
        val iw = padded.cols()
        val bytes = ByteArray(ih * iw * 3)
        padded.get(0, 0, bytes)
        padded.release()
        val plane = ih * iw
        val chw = FloatArray(3 * plane)
        for (i in 0 until plane) {
            chw[i] = (bytes[3 * i].toInt() and 0xFF) / 255f
            chw[plane + i] = (bytes[3 * i + 1].toInt() and 0xFF) / 255f
            chw[2 * plane + i] = (bytes[3 * i + 2].toInt() and 0xFF) / 255f
        }

        val out: Array<FloatArray>
        OnnxTensor.createTensor(env, FloatBuffer.wrap(chw), longArrayOf(1, 3, ih.toLong(), iw.toLong())).use { input ->
            session.run(mapOf(inputName to input)).use { res ->
                @Suppress("UNCHECKED_CAST")
                out = (res[0].value as Array<Array<FloatArray>>)[0]
            }
        }
        val dets = nms(out)

        // scale_boxes(img1_shape=(h1,w1), boxes, img0_shape=(h0,w0)) + clip
        val gain = min(h1.toDouble() / h0, w1.toDouble() / w0)
        val padX = (w1 - w0 * gain) / 2
        val padY = (h1 - h0 * gain) / 2
        return dets.map {
            Detection(
                ((it.x1 - padX) / gain).coerceIn(0.0, w0.toDouble()),
                ((it.y1 - padY) / gain).coerceIn(0.0, h0.toDouble()),
                ((it.x2 - padX) / gain).coerceIn(0.0, w0.toDouble()),
                ((it.y2 - padY) / gain).coerceIn(0.0, h0.toDouble()),
                it.confidence, it.cls,
            )
        }
    }

    /** utils.general.non_max_suppression (single label per box, class-offset NMS). */
    private fun nms(pred: Array<FloatArray>): List<Detection> {
        val maxWh = 7680.0
        val cand = ArrayList<Detection>()
        for (row in pred) {
            val obj = row[4]
            if (obj <= confThres) continue
            var best = -1f
            var cls = 0
            for (c in 5 until row.size) {
                val v = row[c] * obj
                if (v > best) { best = v; cls = c - 5 }
            }
            if (best <= confThres) continue
            val x = row[0].toDouble(); val y = row[1].toDouble(); val w = row[2].toDouble(); val h = row[3].toDouble()
            cand.add(Detection(x - w / 2, y - h / 2, x + w / 2, y + h / 2, best.toDouble(), cls))
        }
        cand.sortByDescending { it.confidence }
        val boxes = if (cand.size > 30000) cand.subList(0, 30000) else cand
        val keep = ArrayList<Detection>()
        val suppressed = BooleanArray(boxes.size)
        for (i in boxes.indices) {
            if (suppressed[i]) continue
            val a = boxes[i]
            keep.add(a)
            if (keep.size >= maxDet) break
            val ao = a.cls * maxWh
            for (j in i + 1 until boxes.size) {
                if (suppressed[j]) continue
                val b = boxes[j]
                val bo = b.cls * maxWh
                if (iou(a.x1 + ao, a.y1 + ao, a.x2 + ao, a.y2 + ao, b.x1 + bo, b.y1 + bo, b.x2 + bo, b.y2 + bo) > iouThres) suppressed[j] = true
            }
        }
        return keep
    }

    private fun iou(ax1: Double, ay1: Double, ax2: Double, ay2: Double, bx1: Double, by1: Double, bx2: Double, by2: Double): Double {
        val iw = max(0.0, min(ax2, bx2) - max(ax1, bx1))
        val ih = max(0.0, min(ay2, by2) - max(ay1, by1))
        val inter = iw * ih
        val union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
        return if (union <= 0) 0.0 else inter / union
    }

    override fun close() {
        session.close()
    }

    companion object {
        fun makeDivisible(x: Int, divisor: Int) = (ceil(x.toDouble() / divisor) * divisor).toInt()

        /** Python's round(): half to even. */
        fun pyRound(v: Double): Int = Math.rint(v).toInt()
    }
}
