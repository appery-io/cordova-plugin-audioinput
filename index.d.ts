import type {
  AudioDataEvent,
  AudioErrorEvent,
  AudioFinishedEvent,
  AudioInputOptions,
  AudioInputPlugin,
  AudioStateEvent,
  PluginListenerHandle,
} from './src/definitions';

export type {
  AudioDataEvent,
  AudioErrorEvent,
  AudioFinishedEvent,
  AudioInputOptions,
  AudioInputPlugin,
  AudioStateEvent,
  PluginListenerHandle,
} from './src/definitions';

export { AudioSourceType, SampleRate } from './src/definitions';

/**
 * Capacitor/Cordova plugin runtime value.
 */
export declare const AudioInput: AudioInputPlugin;

/**
 * Legacy callback-oriented Cordova configuration.
 * @deprecated Prefer AudioInputOptions with the Promise API.
 */
export interface AudioInputConfiguration extends AudioInputOptions {
  streamToWebAudio?: boolean;
  audioContext?: AudioContext;
  concatenateMaxChunks?: number;
  onError?: (message: string) => void;
  debug?: boolean;
}

/**
 * Legacy callback-oriented Cordova interface.
 * @deprecated Prefer the `AudioInput` exported value and Promise API.
 */
export interface AudioInputLegacy {
  FORMAT: {
    PCM_16BIT: string;
    PCM_8BIT: string;
  };

  CHANNELS: {
    MONO: number;
    STEREO: number;
  };

  SAMPLERATE: {
    TELEPHONE_8000Hz: number;
    CD_QUARTER_11025Hz: number;
    VOIP_16000Hz: number;
    CD_HALF_22050Hz: number;
    MINI_DV_32000Hz: number;
    CD_XA_37800Hz: number;
    NTSC_44056Hz: number;
    CD_AUDIO_44100Hz: number;
  };

  AUDIOSOURCE_TYPE: {
    DEFAULT: number;
    CAMCORDER: number;
    MIC: number;
    UNPROCESSED: number;
    VOICE_COMMUNICATION: number;
    VOICE_RECOGNITION: number;
  };

  initialize(cfg: AudioInputConfiguration, onComplete: (result?: unknown) => void): void;
  checkMicrophonePermission(onComplete: (granted: boolean) => void): void;
  getMicrophonePermission(onComplete: (granted: boolean) => void): void;
  start(cfg: AudioInputConfiguration): void;
  stop(onStopped: (result?: unknown) => void): void;
  connect(audioNode: AudioNode): void;
  disconnect(): void;
  getAudioContext(): AudioContext;
  getCfg(): AudioInputConfiguration;
  isCapturing(): boolean | unknown[];

  addListener(
    eventName: 'audioData',
    listenerFunc: (event: AudioDataEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'audioError',
    listenerFunc: (event: AudioErrorEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'audioInputFinished',
    listenerFunc: (event: AudioFinishedEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'stateChange',
    listenerFunc: (event: AudioStateEvent) => void,
  ): Promise<PluginListenerHandle>;
}

declare global {
  interface Window {
    audioinput: AudioInputLegacy;
  }

  const audioinput: AudioInputLegacy;
}
