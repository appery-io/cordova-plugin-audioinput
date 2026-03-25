import { WebPlugin } from '@capacitor/core';

import type {
  AudioInputPlugin,
  AudioInputOptions,
  AudioDataEvent,
  AudioErrorEvent,
  AudioStateEvent,
} from './definitions';

/**
 * Web implementation of AudioInput plugin
 * Uses Web Audio API for browser-based audio capture
 */
export class AudioInputWeb extends WebPlugin implements AudioInputPlugin {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private micGainNode: GainNode | null = null;
  private capturing = false;
  private hasMicrophonePermission = false;
  private options: AudioInputOptions = {};

  async initialize(options: AudioInputOptions): Promise<void> {
    this.options = { ...this.options, ...options };
    this.emitStateChange('idle');
    return Promise.resolve();
  }

  async checkMicrophonePermission(): Promise<{ granted: boolean }> {
    if (this.mediaStream !== null || this.hasMicrophonePermission) {
      return { granted: true };
    }

    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        const granted = status.state === 'granted';
        if (granted) {
          this.hasMicrophonePermission = true;
        }
        return { granted };
      } catch {
        // Fall through to cached permission state.
      }
    }

    return { granted: this.hasMicrophonePermission };
  }

  async getMicrophonePermission(): Promise<{ granted: boolean }> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // We got permission, but we'll close this stream for now
      // It will be reopened in start()
      stream.getTracks().forEach(track => track.stop());
      this.hasMicrophonePermission = true;

      return { granted: true };
    } catch (error) {
      console.error('Microphone permission denied:', error);
      return { granted: false };
    }
  }

  async start(options?: AudioInputOptions): Promise<void> {
    if (this.capturing) {
      throw new Error('Already capturing audio');
    }

    if (options) {
      this.options = { ...this.options, ...options };
    }
    this.warnUnsupportedOptions();

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });
      this.hasMicrophonePermission = true;

      // Create audio context
      const AudioContext =
        window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContext();

      // Create nodes
      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.micGainNode = this.audioContext.createGain();

      // Create script processor for audio data
      const bufferSize = this.options.bufferSize || 16384;
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessor.onaudioprocess = event => {
        if (!this.capturing) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const samples = this.processSamples(inputData);
        const format = this.options.format || 'PCM_16BIT';
        const sampleRate = this.audioContext ? this.audioContext.sampleRate : 0;

        this.notifyListeners('audioData', {
          data: samples,
          sampleRate,
          channels: 1,
          format,
          timestamp: Date.now(),
        } as AudioDataEvent);
      };

      // Connect the audio graph
      source.connect(this.micGainNode);
      this.micGainNode.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      this.capturing = true;
      this.emitStateChange('capturing');
    } catch (error: any) {
      this.emitError(error.message || 'Failed to start audio capture');
      this.emitStateChange(
        'error',
        error.message || 'Failed to start audio capture',
      );
      throw error;
    }
  }

  async stop(): Promise<{ fileUrl?: string }> {
    this.capturing = false;

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.micGainNode) {
      this.micGainNode.disconnect();
      this.micGainNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.emitStateChange('stopped');
    return {};
  }

  async isCapturing(): Promise<{ capturing: boolean }> {
    return { capturing: this.capturing };
  }

  async getCfg(): Promise<AudioInputOptions> {
    return { ...this.options };
  }

  /**
   * Process audio samples according to options
   */
  private processSamples(inputData: Float32Array): number[] {
    const normalize = this.options.normalize !== false;
    const normalizationFactor = this.options.normalizationFactor || 32767.0;

    if (normalize) {
      // Return as Float32Array (already normalized -1 to 1)
      return Array.from(inputData);
    } else {
      // Convert to Int16Array
      const output = new Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const sample = Math.max(-1, Math.min(1, inputData[i]));
        output[i] = Math.floor(sample * normalizationFactor);
      }
      return output;
    }
  }

  private emitStateChange(
    state: AudioStateEvent['state'],
    message?: string,
  ): void {
    this.notifyListeners('stateChange', {
      state,
      message,
      timestamp: Date.now(),
    } as AudioStateEvent);
  }

  private emitError(message: string, code?: string): void {
    this.notifyListeners('audioError', {
      message,
      code,
    } as AudioErrorEvent);
  }

  private warnUnsupportedOptions(): void {
    if (this.options.fileUrl) {
      const message =
        'Web implementation does not support fileUrl recording; continuing in stream mode.';
      console.warn(message);
      this.emitError(message, 'WEB_FILE_RECORDING_UNSUPPORTED');
    }

    if ((this.options.channels || 1) !== 1) {
      const message =
        'Web implementation currently captures mono only; requested channels value is ignored.';
      console.warn(message);
      this.emitError(message, 'WEB_CHANNELS_UNSUPPORTED');
    }
  }
}
