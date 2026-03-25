/**
 * Audio input plugin for Capacitor
 * Provides real-time audio capture with support for streaming and file recording
 */

export interface AudioInputPlugin {
  /**
   * Initialize the audio input plugin
   *
   * @param options Configuration options for audio capture
   * @returns Promise that resolves when initialization is complete
   */
  initialize(options: AudioInputOptions): Promise<void>;

  /**
   * Check if microphone permission has been granted
   *
   * @returns Promise with permission status
   */
  checkMicrophonePermission(): Promise<{ granted: boolean }>;

  /**
   * Request microphone permission from the user
   *
   * @returns Promise with permission result
   */
  getMicrophonePermission(): Promise<{ granted: boolean }>;

  /**
   * Start audio capture
   *
   * @param options Configuration options for audio capture
   * @returns Promise that resolves when recording starts
   */
  start(options?: AudioInputOptions): Promise<void>;

  /**
   * Stop audio capture
   *
   * @returns Promise with file URL if recording to file, otherwise void
   */
  stop(): Promise<{ fileUrl?: string }>;

  /**
   * Check whether the plugin is currently capturing audio.
   */
  isCapturing(): Promise<{ capturing: boolean }>;

  /**
   * Get the currently active capture configuration.
   */
  getCfg(): Promise<AudioInputOptions>;

  /**
   * Add a listener for audio data events
   *
   * @param eventName Name of the event to listen for
   * @param listenerFunc Callback function to handle the event
   * @returns Promise with listener handle for removal
   */
  addListener(
    eventName: 'audioData',
    listenerFunc: (event: AudioDataEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Add a listener for audio error events
   *
   * @param eventName Name of the event to listen for
   * @param listenerFunc Callback function to handle the event
   * @returns Promise with listener handle for removal
   */
  addListener(
    eventName: 'audioError',
    listenerFunc: (event: AudioErrorEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Add a listener for recording finished events (when recording to file)
   *
   * @param eventName Name of the event to listen for
   * @param listenerFunc Callback function to handle the event
   * @returns Promise with listener handle for removal
   */
  addListener(
    eventName: 'audioInputFinished',
    listenerFunc: (event: AudioFinishedEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Add a listener for state changes.
   */
  addListener(
    eventName: 'stateChange',
    listenerFunc: (event: AudioStateEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Remove all listeners for this plugin
   *
   * @returns Promise that resolves when listeners are removed
   */
  removeAllListeners(): Promise<void>;
}

/**
 * Configuration options for audio input capture
 */
export interface AudioInputOptions {
  /**
   * Sample rate in Hz (e.g., 44100, 48000)
   * @default 44100
   */
  sampleRate?: number;

  /**
   * Buffer size in bytes (should be power of 2, <= 16384)
   * @default 16384
   */
  bufferSize?: number;

  /**
   * Number of audio channels (1 = mono, 2 = stereo)
   * @default 1
   */
  channels?: number;

  /**
   * Audio format ('PCM_16BIT' or 'PCM_8BIT')
   * @default 'PCM_16BIT'
   */
  format?: 'PCM_16BIT' | 'PCM_8BIT';

  /**
   * Whether to normalize audio data to -1.0 to 1.0 range
   * @default true
   */
  normalize?: boolean;

  /**
   * Normalization factor (audio data will be divided by this value)
   * @default 32767.0
   */
  normalizationFactor?: number;

  /**
   * Audio source type
   * - 0: DEFAULT
   * - 1: MIC (Android only)
   * - 5: CAMCORDER
   * - 6: VOICE_RECOGNITION (Android only)
   * - 7: VOICE_COMMUNICATION
   * - 9: UNPROCESSED
   * @default 0
   */
  audioSourceType?: number;

  /**
   * File URL to save recording (file://... format)
   * If set, audio data events will not be fired during recording.
   * Instead, audioInputFinished event will fire when recording stops.
   */
  fileUrl?: string;
}

/**
 * Audio data event containing PCM samples
 */
export interface AudioDataEvent {
  /**
   * Array of audio samples
   * - Int16Array if normalize=false
   * - Float32Array if normalize=true (values -1.0 to 1.0)
   */
  data: number[];

  /**
   * Metadata describing the emitted chunk.
   */
  sampleRate?: number;
  channels?: number;
  format?: 'PCM_16BIT' | 'PCM_8BIT';
  timestamp?: number;
}

/**
 * Audio error event
 */
export interface AudioErrorEvent {
  /**
   * Error message
   */
  message: string;

  /**
   * Optional machine-friendly error code.
   */
  code?: string;
}

/**
 * Recording finished event (when recording to file)
 */
export interface AudioFinishedEvent {
  /**
   * File URL where audio was saved
   */
  fileUrl: string;

  /**
   * Unix timestamp (ms) when the finished event was emitted.
   */
  timestamp?: number;
}

/**
 * Capture state change event.
 */
export interface AudioStateEvent {
  state: 'idle' | 'capturing' | 'stopped' | 'error';
  message?: string;
  timestamp?: number;
}

/**
 * Plugin listener handle for removing listeners
 */
export interface PluginListenerHandle {
  remove: () => Promise<void>;
}

/**
 * Audio source types enum for convenience
 */
export enum AudioSourceType {
  DEFAULT = 0,
  MIC = 1,
  CAMCORDER = 5,
  VOICE_RECOGNITION = 6,
  VOICE_COMMUNICATION = 7,
  UNPROCESSED = 9,
}

/**
 * Sample rates enum for convenience
 */
export enum SampleRate {
  TELEPHONE_8000Hz = 8000,
  CD_QUARTER_11025Hz = 11025,
  VOIP_16000Hz = 16000,
  CD_HALF_22050Hz = 22050,
  MINI_DV_32000Hz = 32000,
  CD_XA_37800Hz = 37800,
  NTSC_44056Hz = 44056,
  CD_AUDIO_44100Hz = 44100,
  DVD_AUDIO_48000Hz = 48000,
}
