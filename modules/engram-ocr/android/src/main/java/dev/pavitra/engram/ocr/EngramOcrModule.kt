package dev.pavitra.engram.ocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
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
 * Resolves with the text blocks in reading order; an empty list means no words.
 */
class EngramOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EngramOcr")

    AsyncFunction("read") { uriString: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw Exception("The app is not ready")
        val uri = if (uriString.startsWith("content://") || uriString.startsWith("file://")) {
          Uri.parse(uriString)
        } else {
          val file = File(uriString)
          if (!file.exists()) throw Exception("File not found: $uriString")
          Uri.fromFile(file)
        }
        val image = InputImage.fromFilePath(context, uri)
        val latin = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val devanagari = TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build())

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
}
