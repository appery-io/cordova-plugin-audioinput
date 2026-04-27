import AVFoundation
import AudioToolbox

private let kNumberBuffers = 10

protocol AudioReceiverDelegate: AnyObject {
    func didReceiveAudioData(_ data: Data, dataLength length: Int32)
    func didEncounterError(_ msg: String)
    func didFinish(_ url: String)
}

private func handleInputBuffer(
    userData: UnsafeMutableRawPointer?,
    inAQ: AudioQueueRef,
    inBuffer: AudioQueueBufferRef,
    inStartTime: UnsafePointer<AudioTimeStamp>,
    inNumPackets: UInt32,
    inPacketDesc: UnsafePointer<AudioStreamPacketDescription>?
) {
    guard let userData = userData else { return }
    let state = userData.assumingMemoryBound(to: AudioReceiver.RecordState.self)

    var numPackets = inNumPackets
    if numPackets == 0 && state.pointee.dataFormat.mBytesPerPacket != 0 {
        numPackets = inBuffer.pointee.mAudioDataByteSize / state.pointee.dataFormat.mBytesPerPacket
    }

    guard state.pointee.isRunning else { return }

    let bytesPerPacket = state.pointee.dataFormat.mBytesPerPacket
    let sampleStart = state.pointee.currentPacket
    let sampleEnd = sampleStart + Int64(inBuffer.pointee.mAudioDataByteSize / bytesPerPacket) - 1
    let nsamples = sampleEnd - sampleStart + 1

    let data = Data(bytes: inBuffer.pointee.mAudioData, count: Int(inBuffer.pointee.mAudioDataByteSize))

    state.pointee.currentPacket += Int64(numPackets)

    AudioQueueEnqueueBuffer(state.pointee.queue!, inBuffer, 0, nil)

    if let selfPtr = state.pointee.selfPtr {
        let receiver = Unmanaged<AudioReceiver>.fromOpaque(selfPtr).takeUnretainedValue()
        receiver.forwardAudioData(data, length: Int32(nsamples))
    }
}

class AudioReceiver: NSObject {
    fileprivate struct RecordState {
        var selfPtr: UnsafeMutableRawPointer?
        var dataFormat = AudioStreamBasicDescription()
        var queue: AudioQueueRef?
        var bufferByteSize: UInt32 = 0
        var currentPacket: Int64 = 0
        var isRunning = false
    }

    weak var delegate: AudioReceiverDelegate?

    private let statePtr: UnsafeMutablePointer<RecordState>
    private var audioRecorder: AVAudioRecorder?
    private var fileUrl: URL?
    private var startedFileUrl: URL?

    init(sampleRate: Int32, bufferSize: Int32, channels: Int16, audioFormat: String, sourceType: Int32, fileUrl urlString: String?) {
        statePtr = .allocate(capacity: 1)
        statePtr.initialize(to: RecordState())
        super.init()

        statePtr.pointee.selfPtr = Unmanaged.passUnretained(self).toOpaque()

        let maxBufferSize: UInt32 = 0x100000

        let session = AVAudioSession.sharedInstance()
        var categoryOptions: AVAudioSession.CategoryOptions = [.mixWithOthers, .defaultToSpeaker]
        if isBTHeadsetConnected() {
            categoryOptions.insert(.allowBluetoothA2DP)
        }
        try? session.setCategory(.playAndRecord, options: categoryOptions)

        switch sourceType {
        case 7:  try? session.setMode(.voiceChat)
        case 5:  try? session.setMode(.videoRecording)
        case 9:  try? session.setMode(.measurement)
        default: try? session.setMode(.default)
        }

        try? session.setActive(true)

        let bitRate: UInt32 = audioFormat == "PCM_8BIT" ? 8 : 16

        var fmt = AudioStreamBasicDescription()
        fmt.mFormatID = kAudioFormatLinearPCM
        fmt.mSampleRate = Float64(sampleRate)
        fmt.mBitsPerChannel = bitRate
        fmt.mChannelsPerFrame = UInt32(channels)
        fmt.mFramesPerPacket = 1
        fmt.mBytesPerFrame = (bitRate / 8) * UInt32(channels)
        fmt.mBytesPerPacket = fmt.mBytesPerFrame
        fmt.mFormatFlags = kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked

        statePtr.pointee.dataFormat = fmt
        statePtr.pointee.bufferByteSize = min(UInt32(bufferSize), maxBufferSize)

        if let urlString = urlString {
            fileUrl = URL(string: urlString)
        }
    }

    deinit {
        if let queue = statePtr.pointee.queue {
            AudioQueueDispose(queue, true)
        }
        statePtr.deinitialize(count: 1)
        statePtr.deallocate()
    }

    func start() {
        if statePtr.pointee.isRunning {
            stop()
        }

        if fileUrl == nil {
            startStreamingCapture()
        } else {
            startFileRecording()
        }
    }

    func stop() {
        guard statePtr.pointee.isRunning else { return }
        statePtr.pointee.isRunning = false

        if fileUrl == nil {
            if let queue = statePtr.pointee.queue {
                AudioQueueStop(queue, true)
            }
        } else {
            audioRecorder?.stop()
            if let url = startedFileUrl {
                delegate?.didFinish(url.absoluteString)
            }
        }
    }

    func pause() {
        if let queue = statePtr.pointee.queue {
            AudioQueuePause(queue)
        }
    }

    func forwardAudioData(_ data: Data, length: Int32) {
        delegate?.didReceiveAudioData(data, dataLength: length)
    }

    // MARK: - Private

    private func startStreamingCapture() {
        statePtr.pointee.currentPacket = 0

        var status = AudioQueueNewInput(
            &statePtr.pointee.dataFormat,
            handleInputBuffer,
            statePtr,
            nil,
            nil,
            0,
            &statePtr.pointee.queue
        )
        if status != noErr {
            handleError(status, "AudioQueueNewInput")
            return
        }

        guard let queue = statePtr.pointee.queue else { return }

        for i in 0..<kNumberBuffers {
            var buffer: AudioQueueBufferRef?
            status = AudioQueueAllocateBuffer(queue, statePtr.pointee.bufferByteSize, &buffer)
            if status != noErr {
                handleError(status, "AudioQueueAllocateBuffer[\(i)]")
                return
            }
            if let buffer = buffer {
                status = AudioQueueEnqueueBuffer(queue, buffer, 0, nil)
                if status != noErr {
                    handleError(status, "AudioQueueEnqueueBuffer[\(i)]")
                    return
                }
            }
        }

        statePtr.pointee.isRunning = true
        status = AudioQueueStart(queue, nil)
        if status != noErr {
            handleError(status, "AudioQueueStart")
            statePtr.pointee.isRunning = false
        }
    }

    private func startFileRecording() {
        guard let url = fileUrl, url.isFileURL else {
            delegate?.didEncounterError("Invalid file URL: \(fileUrl?.absoluteString ?? "nil")")
            return
        }

        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVNumberOfChannelsKey: statePtr.pointee.dataFormat.mChannelsPerFrame,
            AVSampleRateKey: statePtr.pointee.dataFormat.mSampleRate,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false,
            AVEncoderAudioQualityKey: AVAudioQuality.max.rawValue
        ]

        do {
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord)
            audioRecorder = try AVAudioRecorder(url: url, settings: settings)
            audioRecorder?.prepareToRecord()
            audioRecorder?.record()
            statePtr.pointee.isRunning = true
            startedFileUrl = url
        } catch {
            delegate?.didEncounterError("AVAudioRecorder error: \(error.localizedDescription)")
        }
    }

    private func handleError(_ status: OSStatus, _ context: String = "") {
        guard status != noErr else { return }
        let label = context.isEmpty ? "" : " in \(context)"
        delegate?.didEncounterError("AudioReceiver error [\(status)]\(label)")
    }

    private func isBTHeadsetConnected() -> Bool {
        AVAudioSession.sharedInstance().currentRoute.outputs.contains { port in
            port.portType == .bluetoothA2DP || port.portType == .bluetoothHFP
        }
    }
}
