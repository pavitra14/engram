package dev.pavitra.engram.ocr

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Rect
import android.media.ExifInterface
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Reads the words in a picture on the phone. Two recognisers are tried, Latin
 * and Devanagari (Hindi, Marathi and others), and the one that read more wins.
 *
 * `readLines` is what the app uses: every line of text with where it sits in the
 * picture. A tall picture (a long screenshot) is read in overlapping strips, because
 * the recogniser shrinks a very large image and loses small print. Each strip keeps
 * only the lines whose middle falls in the part of the picture it owns, so a line in
 * the overlap is reported once. `read` is the older call (one string per block).
 */
class EngramOcrModule : Module() {
  // One pair of recognisers for the life of the module. ML Kit clients hold native
  // resources, so they are made once, reused for every picture and closed on destroy.
  private var latinClient: TextRecognizer? = null
  private var devanagariClient: TextRecognizer? = null

  private fun latin(): TextRecognizer =
    latinClient ?: TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).also { latinClient = it }

  private fun devanagari(): TextRecognizer =
    devanagariClient ?: TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build()).also { devanagariClient = it }

  private fun toUri(uriString: String): Uri =
    if (uriString.startsWith("content://") || uriString.startsWith("file://")) {
      Uri.parse(uriString)
    } else {
      val file = File(uriString)
      if (!file.exists()) throw Exception("File not found: $uriString")
      Uri.fromFile(file)
    }

  /** Both scripts read the same image; the one that found more text wins. One failing is no reason to lose the other. */
  private fun recognise(image: InputImage): Text {
    val first = Tasks.await(latin().process(image))
    val second = try {
      Tasks.await(devanagari().process(image))
    } catch (error: Exception) {
      null
    }
    return if (second != null && second.text.length > first.text.length) second else first
  }

  /**
   * Adds the lines of one read to `out`. `offset` is where this read starts in the
   * picture and `scale` how many picture pixels each pixel of it stands for. Lines
   * whose middle is outside [own0, own1) belong to a neighbouring strip.
   */
  private fun collect(text: Text, strip: Int, offset: Int, scale: Int, own0: Int, own1: Int, out: MutableList<Map<String, Any>>) {
    text.textBlocks.forEachIndexed { blockIndex, block ->
      for (line in block.lines) {
        val box = line.boundingBox
        val top = if (box != null) offset + box.top * scale else offset
        val bottom = if (box != null) offset + box.bottom * scale else offset
        val middle = (top + bottom) / 2
        if (middle < own0 || middle >= own1) continue
        out.add(mapOf("text" to line.text, "top" to top, "bottom" to bottom, "block" to strip * 10000 + blockIndex, "strip" to strip))
      }
    }
  }

  private fun sizeOf(context: Context, uri: Uri): Pair<Int, Int> {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    return Pair(bounds.outWidth, bounds.outHeight)
  }

  /** False when the picture is stored turned (a photo with a rotation tag); those are read whole, which turns them upright. */
  private fun isUpright(context: Context, uri: Uri): Boolean =
    try {
      context.contentResolver.openInputStream(uri)?.use {
        val orientation = ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        orientation == ExifInterface.ORIENTATION_NORMAL || orientation == ExifInterface.ORIENTATION_UNDEFINED
      } ?: true
    } catch (error: Exception) {
      true
    }

  private fun readWhole(context: Context, uri: Uri): List<Map<String, Any>> {
    val out = ArrayList<Map<String, Any>>()
    collect(recognise(InputImage.fromFilePath(context, uri)), 0, 0, 1, Int.MIN_VALUE, Int.MAX_VALUE, out)
    return out
  }

  private fun readTall(context: Context, uri: Uri, width: Int, height: Int): List<Map<String, Any>> {
    // Shrink only a very wide picture, and by whole steps; strips are otherwise read at full size.
    var sample = 1
    while (width / sample > MAX_STRIP_WIDTH) sample *= 2
    val stripHeight = (width * STRIP_RATIO).toInt()
    val overlap = (stripHeight * OVERLAP).toInt()
    val step = stripHeight - overlap
    val out = ArrayList<Map<String, Any>>()
    val stream = context.contentResolver.openInputStream(uri) ?: throw Exception("The picture could not be opened")
    try {
      @Suppress("DEPRECATION")
      val decoder = BitmapRegionDecoder.newInstance(stream, false) ?: throw Exception("The picture could not be opened")
      try {
        var top = 0
        var strip = 0
        while (top < height) {
          // A last strip shorter than the overlap would only repeat the one before it, so it is folded into this one.
          val bottom = if (height - (top + stripHeight) < overlap) height else top + stripHeight
          val last = bottom >= height
          val options = BitmapFactory.Options().apply { inSampleSize = sample }
          val bitmap = decoder.decodeRegion(Rect(0, top, width, bottom), options) ?: throw Exception("The picture could not be read")
          try {
            val own0 = if (strip == 0) Int.MIN_VALUE else top + overlap / 2
            val own1 = if (last) Int.MAX_VALUE else top + step + overlap / 2
            collect(recognise(InputImage.fromBitmap(bitmap, 0)), strip, top, sample, own0, own1, out)
          } finally {
            bitmap.recycle()
          }
          if (last) break
          top += step
          strip += 1
        }
      } finally {
        decoder.recycle()
      }
    } finally {
      stream.close()
    }
    return out
  }

  override fun definition() = ModuleDefinition {
    Name("EngramOcr")

    OnDestroy {
      latinClient?.close()
      devanagariClient?.close()
      latinClient = null
      devanagariClient = null
    }

    // Every line with its place in the picture, in reading order. Runs on its own thread:
    // a long picture is several reads in a row.
    AsyncFunction("readLines") { uriString: String, promise: Promise ->
      Thread {
        try {
          val context = appContext.reactContext ?: throw Exception("The app is not ready")
          val uri = toUri(uriString)
          val (width, height) = sizeOf(context, uri)
          val lines = if (width > 0 && height > width * TALL_RATIO && isUpright(context, uri)) {
            // If strips cannot be cut (a format the region reader does not know), read it whole as before.
            try {
              readTall(context, uri, width, height)
            } catch (error: Exception) {
              readWhole(context, uri)
            }
          } else {
            readWhole(context, uri)
          }
          promise.resolve(lines)
        } catch (error: Exception) {
          promise.reject(CodedException("OCR_FAILED", error.message ?: "The picture could not be read", error))
        }
      }.start()
    }

    AsyncFunction("read") { uriString: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw Exception("The app is not ready")
        val uri = toUri(uriString)
        val image = InputImage.fromFilePath(context, uri)
        val latin = latin()
        val devanagari = devanagari()

        latin.process(image)
          .addOnSuccessListener { first ->
            devanagari.process(image)
              .addOnSuccessListener { second ->
                val best = if (second.text.length > first.text.length) second else first
                promise.resolve(best.textBlocks.map { it.text })
              }
              .addOnFailureListener {
                // One script failing is no reason to lose what the other read.
                promise.resolve(first.textBlocks.map { it.text })
              }
          }
          .addOnFailureListener { error ->
            promise.reject(CodedException("OCR_FAILED", error.message ?: "The picture could not be read", error))
          }
      } catch (error: Exception) {
        promise.reject(CodedException("OCR_FAILED", error.message ?: "The picture could not be read", error))
      }
    }
  }

  companion object {
    /** A picture taller than this many widths is read in strips. A phone screenshot is about 2.2; a long one is many times that. */
    private const val TALL_RATIO = 2.0

    /** Each strip is this many widths tall: big enough to hold a page of text, small enough that nothing is shrunk. */
    private const val STRIP_RATIO = 1.5

    /** Neighbouring strips share this share of a strip's height, so a line cut by one edge is whole in the next. */
    private const val OVERLAP = 0.15

    /** Wider than this and a strip is shrunk to fit; the recogniser gains nothing from more. */
    private const val MAX_STRIP_WIDTH = 2400
  }
}
