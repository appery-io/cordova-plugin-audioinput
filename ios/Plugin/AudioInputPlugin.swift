import Foundation
import Capacitor
import AVFoundation

@objc(AudioInputPlugin)
public class AudioInputPlugin: CAPPlugin, CAPBridgedPlugin, AudioReceiverDelegate {
    public let identifier = "AudioInputPlugin"
    public let jsName = "AudioInput"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkMicrophonePermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getMicrophonePermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isCapturing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCfg", returnType: CAPPluginReturnPromise),
    ]

    private var audioReceiver: AudioReceiver?
    private var fileUrl: String?
    private let processingQueue = DispatchQueue(label: "com.exelerus.audioinput.processing", qos: .userInitiated)

    private var sampleRate: Int32 = 44100
    private var bufferSize: Int32 = 16384
    private var channels: Int16 = 1
    private var format: String = "PCM_16BIT"
    private var audioSourceType: Int32 = 0
    private var normalize: Bool = true
    private var normalizationFactor: Double = 32767.0
    private var isCapturingState: Bool = false
    private var lastFinishedFileUrl: String?

    @objc func initialize(_ call: CAPPluginCall) {
        sampleRate = Int32(call.getInt("sampleRate") ?? 44100)
        bufferSize = Int32(call.getInt("bufferSize") ?? 16384)
        channels = Int16(call.getInt("channels") ?? 1)
        format = call.getString("format") ?? "PCM_16BIT"
        audioSourceType = Int32(call.getInt("audioSourceType") ?? 0)
        normalize = call.getBool("normalize") ?? true
        normalizationFactor = call.getDouble("normalizationFactor") ?? 32767.0
        fileUrl = call.getString("fileUrl")

        emitStateChange("idle")
        call.resolve()
    }

    @objc func checkMicrophonePermission(_ call: CAPPluginCall) {
        let status = AVAudioSession.sharedInstance().recordPermission
        call.resolve(["granted": status == .granted])
    }

    @objc func getMicrophonePermission(_ call: CAPPluginCall) {
        let status = AVAudioSession.sharedInstance().recordPermission

        if status == .granted {
            call.resolve(["granted": true])
            return
        }

        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            call.resolve(["granted": granted])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        if let sr = call.getInt("sampleRate") { sampleRate = Int32(sr) }
        if let bs = call.getInt("bufferSize") { bufferSize = Int32(bs) }
        if let ch = call.getInt("channels") { channels = Int16(ch) }
        if let fmt = call.getString("format") { format = fmt }
        if let ast = call.getInt("audioSourceType") { audioSourceType = Int32(ast) }
        if let norm = call.getBool("normalize") { normalize = norm }
        if let nf = call.getDouble("normalizationFactor") { normalizationFactor = nf }
        fileUrl = call.getString("fileUrl")
        lastFinishedFileUrl = nil

        let status = AVAudioSession.sharedInstance().recordPermission
        if status != .granted {
            emitStateChange("error", "Microphone permission not granted")
            call.reject("Microphone permission not granted")
            return
        }

        if let receiver = audioReceiver {
            receiver.stop()
            audioReceiver = nil
        }

        audioReceiver = AudioReceiver(
            sampleRate: sampleRate,
            bufferSize: bufferSize,
            channels: channels,
            audioFormat: format,
            sourceType: audioSourceType,
            fileUrl: fileUrl
        )
        audioReceiver?.delegate = self
        audioReceiver?.start()
        isCapturingState = true
        emitStateChange("capturing")

        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        audioReceiver?.stop()
        audioReceiver = nil
        isCapturingState = false
        emitStateChange("stopped")
        call.resolve([
            "fileUrl": lastFinishedFileUrl ?? fileUrl ?? NSNull()
        ])
    }

    @objc func isCapturing(_ call: CAPPluginCall) {
        call.resolve(["capturing": isCapturingState])
    }

    @objc func getCfg(_ call: CAPPluginCall) {
        call.resolve(buildCfg())
    }

    // MARK: - AudioReceiverDelegate

    func didReceiveAudioData(_ data: Data, dataLength length: Int32) {
        guard !data.isEmpty else { return }

        processingQueue.async { [weak self] in
            guard let self = self else { return }

            let availableSamples = data.count / MemoryLayout<Int16>.size
            let sampleCount = min(Int(length), availableSamples)
            if sampleCount <= 0 { return }

            let timestamp = Date().timeIntervalSince1970 * 1000
            let chunkMetadata: [String: Any] = [
                "sampleRate": self.sampleRate,
                "channels": self.channels,
                "format": self.format,
                "timestamp": timestamp
            ]

            if self.normalize {
                var samples = [Double]()
                samples.reserveCapacity(sampleCount)
                data.withUnsafeBytes { rawBuffer in
                    let pcmBuffer = rawBuffer.bindMemory(to: Int16.self)
                    for i in 0..<sampleCount {
                        let sample = Int16(littleEndian: pcmBuffer[i])
                        samples.append(Double(sample) / self.normalizationFactor)
                    }
                }
                DispatchQueue.main.async { [weak self] in
                    var payload = chunkMetadata
                    payload["data"] = samples
                    self?.notifyListeners("audioData", data: payload)
                }
            } else {
                var samples = [Int]()
                samples.reserveCapacity(sampleCount)
                data.withUnsafeBytes { rawBuffer in
                    let pcmBuffer = rawBuffer.bindMemory(to: Int16.self)
                    for i in 0..<sampleCount {
                        let sample = Int16(littleEndian: pcmBuffer[i])
                        samples.append(Int(sample))
                    }
                }
                DispatchQueue.main.async { [weak self] in
                    var payload = chunkMetadata
                    payload["data"] = samples
                    self?.notifyListeners("audioData", data: payload)
                }
            }
        }
    }

    func didEncounterError(_ msg: String) {
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("audioError", data: [
                "message": msg,
                "code": "NATIVE_AUDIO_ERROR"
            ])
            self?.emitStateChange("error", msg)
        }
    }

    func didFinish(_ url: String) {
        lastFinishedFileUrl = url
        isCapturingState = false
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("audioInputFinished", data: [
                "fileUrl": url,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ])
            self?.emitStateChange("stopped")
        }
    }

    deinit {
        audioReceiver?.stop()
        audioReceiver = nil
    }

    // MARK: - Private

    private func emitStateChange(_ state: String, _ message: String? = nil) {
        var payload: [String: Any] = [
            "state": state,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
        if let message = message {
            payload["message"] = message
        }
        notifyListeners("stateChange", data: payload)
    }

    private func buildCfg() -> [String: Any] {
        var cfg: [String: Any] = [
            "sampleRate": sampleRate,
            "bufferSize": bufferSize,
            "channels": channels,
            "format": format,
            "audioSourceType": audioSourceType,
            "normalize": normalize,
            "normalizationFactor": normalizationFactor
        ]
        if let fileUrl = fileUrl {
            cfg["fileUrl"] = fileUrl
        }
        return cfg
    }
}
