package com.exelerus.audioinput

import android.Manifest
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.Message
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.exelerus.cordova.audioinputcapture.AudioInputReceiver
import org.json.JSONArray
import java.lang.ref.WeakReference
import java.net.URI
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Capacitor plugin for audio input capture
 * Thin wrapper around the existing AudioInputReceiver class
 */
@CapacitorPlugin(
    name = "AudioInput",
    permissions = [
        Permission(
            strings = [Manifest.permission.RECORD_AUDIO],
            alias = "microphone"
        )
    ]
)
class AudioInputPlugin : Plugin() {

    private var receiver: AudioInputReceiver? = null
    private val processingThread = HandlerThread("AudioInputProcessing").apply { start() }
    private val mainHandler = Handler(Looper.getMainLooper())
    private val handler = AudioInputHandler(this, processingThread.looper)

    private var sampleRate: Int = 44100
    private var bufferSize: Int = 16384
    private var channels: Int = 1
    private var format: String = "PCM_16BIT"
    private var audioSource: Int = 0
    private var fileUrl: URI? = null
    private var normalize: Boolean = true
    private var normalizationFactor: Double = 32767.0
    private var isCapturingState: Boolean = false
    private var lastFinishedFileUrl: String? = null

    @PluginMethod
    fun initialize(call: PluginCall) {
        try {
            sampleRate = call.getInt("sampleRate", 44100)!!
            bufferSize = call.getInt("bufferSize", 16384)!!
            channels = call.getInt("channels", 1)!!
            format = call.getString("format", "PCM_16BIT")!!
            audioSource = call.getInt("audioSourceType", 0)!!
            normalize = call.getBoolean("normalize", true)!!
            normalizationFactor = call.getDouble("normalizationFactor", 32767.0)!!

            val fileUrlString = call.getString("fileUrl")
            fileUrl = if (fileUrlString != null) URI(fileUrlString) else null

            emitStateChange("idle")
            call.resolve()
        } catch (e: Exception) {
            call.reject("Initialization failed: ${e.message}", e)
        }
    }

    @PluginMethod
    fun checkMicrophonePermission(call: PluginCall) {
        val granted = getPermissionState("microphone") == com.getcapacitor.PermissionState.GRANTED
        val ret = JSObject()
        ret.put("granted", granted)
        call.resolve(ret)
    }

    @PluginMethod
    fun getMicrophonePermission(call: PluginCall) {
        if (getPermissionState("microphone") == com.getcapacitor.PermissionState.GRANTED) {
            val ret = JSObject()
            ret.put("granted", true)
            call.resolve(ret)
        } else {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback")
        }
    }

    @PluginMethod
    fun start(call: PluginCall) {
        try {
            // Update options if provided
            sampleRate = call.getInt("sampleRate", sampleRate)!!
            bufferSize = call.getInt("bufferSize", bufferSize)!!
            channels = call.getInt("channels", channels)!!
            format = call.getString("format", format)!!
            audioSource = call.getInt("audioSourceType", audioSource)!!
            normalize = call.getBoolean("normalize", normalize)!!
            normalizationFactor = call.getDouble("normalizationFactor", normalizationFactor)!!

            val fileUrlString = call.getString("fileUrl")
            fileUrl = if (fileUrlString != null) URI(fileUrlString) else null
            lastFinishedFileUrl = null

            // Check permission and request if not granted
            if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
                requestPermissionForAlias("microphone", call, "startPermissionCallback")
                return
            }

            // Permission granted, start recording
            startRecording()
            isCapturingState = true
            emitStateChange("capturing")
            call.resolve()
        } catch (e: Exception) {
            emitStateChange("error", e.message ?: "Failed to start audio capture")
            call.reject("Failed to start audio capture: ${e.message}", e)
        }
    }

    private fun startRecording() {
        // Stop existing receiver if any
        receiver?.interrupt()

        // Create and start new receiver (uses existing Java class!)
        receiver = AudioInputReceiver(
            sampleRate,
            bufferSize,
            channels,
            format,
            audioSource,
            fileUrl
        )
        receiver?.setHandler(handler)
        receiver?.start()
    }

    /**
     * Permission callback for start method
     */
    @com.getcapacitor.annotation.PermissionCallback
    private fun startPermissionCallback(call: PluginCall) {
        if (getPermissionState("microphone") == com.getcapacitor.PermissionState.GRANTED) {
            try {
                startRecording()
                isCapturingState = true
                emitStateChange("capturing")
                call.resolve()
            } catch (e: Exception) {
                emitStateChange("error", e.message ?: "Failed to start audio capture")
                call.reject("Failed to start audio capture: ${e.message}", e)
            }
        } else {
            emitStateChange("error", "Microphone permission denied")
            call.reject("Microphone permission denied")
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        try {
            receiver?.interrupt()
            receiver = null
            isCapturingState = false

            val ret = JSObject()
            val fileUrlToReturn = lastFinishedFileUrl ?: fileUrl?.toString()
            if (fileUrlToReturn != null) {
                ret.put("fileUrl", fileUrlToReturn)
            }
            emitStateChange("stopped")
            call.resolve(ret)
        } catch (e: Exception) {
            emitStateChange("error", e.message ?: "Failed to stop audio capture")
            call.reject("Failed to stop audio capture: ${e.message}", e)
        }
    }

    @PluginMethod
    fun isCapturing(call: PluginCall) {
        val ret = JSObject()
        ret.put("capturing", isCapturingState)
        call.resolve(ret)
    }

    @PluginMethod
    fun getCfg(call: PluginCall) {
        call.resolve(buildCfg())
    }

    override fun handleOnDestroy() {
        receiver?.interrupt()
        receiver = null
        isCapturingState = false
        processingThread.quitSafely()
        super.handleOnDestroy()
    }

    private fun emitAudioData(audioData: JSONArray) {
        mainHandler.post {
            val ret = JSObject()
            ret.put("data", audioData)
            ret.put("sampleRate", sampleRate)
            ret.put("channels", channels)
            ret.put("format", format)
            ret.put("timestamp", System.currentTimeMillis())
            notifyListeners("audioData", ret)
        }
    }

    private fun emitAudioError(message: String, code: String? = null) {
        mainHandler.post {
            val ret = JSObject()
            ret.put("message", message)
            if (code != null) {
                ret.put("code", code)
            }
            notifyListeners("audioError", ret)
        }
    }

    private fun emitAudioFinished(file: String) {
        lastFinishedFileUrl = file
        isCapturingState = false
        mainHandler.post {
            val ret = JSObject()
            ret.put("fileUrl", file)
            ret.put("timestamp", System.currentTimeMillis())
            notifyListeners("audioInputFinished", ret)
        }
        emitStateChange("stopped")
    }

    private fun emitStateChange(state: String, message: String? = null) {
        mainHandler.post {
            val ret = JSObject()
            ret.put("state", state)
            ret.put("timestamp", System.currentTimeMillis())
            if (message != null) {
                ret.put("message", message)
            }
            notifyListeners("stateChange", ret)
        }
    }

    private fun buildCfg(): JSObject {
        val cfg = JSObject()
        cfg.put("sampleRate", sampleRate)
        cfg.put("bufferSize", bufferSize)
        cfg.put("channels", channels)
        cfg.put("format", format)
        cfg.put("audioSourceType", audioSource)
        cfg.put("normalize", normalize)
        cfg.put("normalizationFactor", normalizationFactor)
        if (fileUrl != null) {
            cfg.put("fileUrl", fileUrl.toString())
        }
        return cfg
    }

    /**
     * Permission callback
     */
    @com.getcapacitor.annotation.PermissionCallback
    private fun microphonePermissionCallback(call: PluginCall) {
        val granted = getPermissionState("microphone") == com.getcapacitor.PermissionState.GRANTED
        val ret = JSObject()
        ret.put("granted", granted)
        call.resolve(ret)
    }

    /**
     * Handler for receiving audio data from AudioInputReceiver
     */
    private class AudioInputHandler(plugin: AudioInputPlugin, looper: Looper) : Handler(looper) {
        private val pluginRef = WeakReference(plugin)

        override fun handleMessage(msg: Message) {
            val plugin = pluginRef.get() ?: return

            try {
                val data = msg.data.getString("data")
                val dataBytes = msg.data.getByteArray("dataBytes")
                val error = msg.data.getString("error")
                val file = msg.data.getString("file")

                when {
                    dataBytes != null -> {
                        val buffer = ByteBuffer.wrap(dataBytes).order(ByteOrder.LITTLE_ENDIAN)

                        val audioData = JSONArray()
                        while (buffer.remaining() >= 2) {
                            val sample = buffer.short
                            if (plugin.normalize) {
                                audioData.put((sample.toDouble() / plugin.normalizationFactor))
                            } else {
                                audioData.put(sample.toInt())
                            }
                        }

                        plugin.emitAudioData(audioData)
                    }
                    data != null -> {
                        // Audio data received as Base64 - decode and convert
                        val bytes = Base64.decode(data, Base64.NO_WRAP)
                        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)

                        val audioData = JSONArray()
                        while (buffer.remaining() >= 2) {
                            val sample = buffer.short
                            if (plugin.normalize) {
                                audioData.put((sample.toDouble() / plugin.normalizationFactor))
                            } else {
                                audioData.put(sample.toInt())
                            }
                        }

                        plugin.emitAudioData(audioData)
                    }
                    error != null -> {
                        plugin.emitAudioError(error)
                        plugin.emitStateChange("error", error)
                    }
                    file != null -> {
                        plugin.emitAudioFinished(file)
                    }
                }
            } catch (e: Exception) {
                plugin.emitAudioError("Handler error: ${e.message}", "NATIVE_HANDLER_ERROR")
                plugin.emitStateChange("error", "Handler error: ${e.message}")
            }
        }
    }
}
