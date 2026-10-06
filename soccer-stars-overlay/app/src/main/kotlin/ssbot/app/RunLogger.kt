package ssbot.app

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.provider.MediaStore
import org.opencv.core.Mat
import org.opencv.core.MatOfInt
import org.opencv.imgcodecs.Imgcodecs
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Records a whole overlay run so it can be shared for debugging:
 *  - run.log: timestamped events (board reads, aims, shots, predictions vs results, calibration…)
 *  - frames: what the detectors saw (the 1071x621 reference window) at key moments
 *
 * Files are written to the app's cache while running; [export] packs them into
 * Download/StarsBot/run-<start time>.zip (on Stop and on Report).
 */
class RunLogger(context: Context) {
    private val appContext = context.applicationContext
    val name: String = "run-" + SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
    private val dir = File(context.cacheDir, name).apply { mkdirs() }
    private val log = File(dir, "run.log")
    private val start = SystemClock.uptimeMillis()
    private var images = 0
    private var exports = 0

    init {
        // Keep only the latest few runs in the cache.
        context.cacheDir.listFiles { f -> f.isDirectory && f.name.startsWith("run-") && f.name != name }
            ?.sortedBy { it.name }?.dropLast(2)?.forEach { it.deleteRecursively() }
        log("run started: device=${Build.MANUFACTURER} ${Build.MODEL} android=${Build.VERSION.RELEASE}")
    }

    @Synchronized
    fun log(line: String) {
        val t = (SystemClock.uptimeMillis() - start) / 1000.0
        runCatching { log.appendText("%8.2f  %s\n".format(t, line)) }
    }

    /** Saves [img] as a JPEG frame (at most [MAX_IMAGES] per run). Returns the file name or null. */
    @Synchronized
    fun frame(tag: String, img: Mat): String? {
        if (images >= MAX_IMAGES) return null
        images++
        val file = "%04d-%s.jpg".format(images, tag)
        runCatching { Imgcodecs.imwrite(File(dir, file).path, img, MatOfInt(Imgcodecs.IMWRITE_JPEG_QUALITY, 85)) }
        return file
    }

    /** Writes a text file into the run folder (replacing it). */
    @Synchronized
    fun file(fileName: String, text: String) {
        runCatching { File(dir, fileName).writeText(text) }
    }

    /** Packs the run folder into Download/StarsBot/<run>.zip. Returns the shown path, or an error. */
    @Synchronized
    fun export(): String {
        if (Build.VERSION.SDK_INT < 29) return "needs Android 10+"
        exports++
        val zipName = if (exports == 1) "$name.zip" else "$name-$exports.zip"
        return try {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, zipName)
                put(MediaStore.MediaColumns.MIME_TYPE, "application/zip")
                put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/StarsBot")
            }
            val resolver = appContext.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: error("cannot create $zipName")
            resolver.openOutputStream(uri)!!.use { os ->
                ZipOutputStream(os).use { zip ->
                    dir.listFiles()?.sortedBy { it.name }?.forEach { f ->
                        zip.putNextEntry(ZipEntry("$name/${f.name}"))
                        f.inputStream().use { it.copyTo(zip) }
                        zip.closeEntry()
                    }
                }
            }
            "Download/StarsBot/$zipName"
        } catch (t: Throwable) {
            "failed: ${t.message}"
        }
    }

    companion object {
        private const val MAX_IMAGES = 400
    }
}
