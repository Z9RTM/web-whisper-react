import { WHISPER_CONFIG } from '@/config/whisper';
import { WhisperResult } from '@/types/whisper';

type ProgressCallback = (progress: { status: string; progress?: number }) => void;

class WhisperService {
  private static instance: WhisperService;
  private registration: ServiceWorkerRegistration | null = null;
  private progressCallback: ProgressCallback | null = null;

  private constructor() {}

  static getInstance(): WhisperService {
    if (!WhisperService.instance) {
      WhisperService.instance = new WhisperService();
    }
    return WhisperService.instance;
  }

  async initialize(progressCallback?: ProgressCallback): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker is not supported in this browser');
    }

    this.progressCallback = progressCallback || null;

    try {
      this.registration = await navigator.serviceWorker.register('/whisper-worker.js');
      await navigator.serviceWorker.ready;
      
      const result = await this.sendMessage({ type: 'INIT_PIPELINE' });
      if (result.type !== 'PIPELINE_READY') {
        throw new Error('Failed to initialize pipeline');
      }
    } catch (error) {
      console.error('Failed to register service worker:', error);
      throw error;
    }
  }

  async processAudio(audioData: Float32Array): Promise<WhisperResult> {
    if (!this.registration?.active) {
      throw new Error('Service Worker is not active');
    }

    const result = await this.sendMessage({
      type: 'PROCESS_AUDIO',
      audio: audioData,
      config: {
        chunkLengthSeconds: WHISPER_CONFIG.chunkLengthSeconds,
        strideLengthSeconds: WHISPER_CONFIG.strideLengthSeconds,
        language: WHISPER_CONFIG.language,
      }
    });

    if (result.type === 'ERROR') {
      throw new Error(result.error);
    }

    if (result.type === 'PROCESS_COMPLETE') {
      return result.result as WhisperResult;
    }

    throw new Error('Invalid response from worker');
  }

  private sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.registration?.active) {
        reject(new Error('Service Worker is not active'));
        return;
      }

      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        if (event.data.type === 'ERROR') {
          reject(new Error(event.data.error));
        } else if (event.data.type === 'LOADING_PROGRESS' && this.progressCallback) {
          this.progressCallback({
            status: 'progress',
            progress: event.data.progress
          });
        } else {
          resolve(event.data);
        }
      };

      this.registration.active.postMessage(message, [messageChannel.port2]);
    });
  }
}

export default WhisperService;