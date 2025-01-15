import { WHISPER_CONFIG } from '@/config/whisper';
import { WhisperResult } from '@/types/whisper';

type ProgressCallback = (progress: { status: string; progress?: number }) => void;

class WhisperService {
  private static instance: WhisperService;
  private registration: ServiceWorkerRegistration | null = null;
  private progressCallback: ProgressCallback | null = null;
  private isInitializing: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): WhisperService {
    if (!WhisperService.instance) {
      WhisperService.instance = new WhisperService();
    }
    return WhisperService.instance;
  }

  async initialize(progressCallback?: ProgressCallback): Promise<void> {
    if (this.isInitializing) {
      return this.initializationPromise;
    }

    this.isInitializing = true;
    this.initializationPromise = this.doInitialize(progressCallback);

    try {
      await this.initializationPromise;
    } finally {
      this.isInitializing = false;
      this.initializationPromise = null;
    }
  }

  private async doInitialize(progressCallback?: ProgressCallback): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker is not supported in this browser');
    }

    this.progressCallback = progressCallback || null;

    try {
      // 既存のService Workerを登録解除
      const existingRegistration = await navigator.serviceWorker.getRegistration();
      if (existingRegistration) {
        await existingRegistration.unregister();
      }

      // 新しいService Workerを登録
      console.log('Registering Service Worker...');
      this.registration = await navigator.serviceWorker.register('/whisper-worker.js', {
        scope: '/',
        type: 'module'
      });

      // Service Workerがアクティブになるまで待機
      if (this.registration.installing) {
        await new Promise<void>((resolve) => {
          if (!this.registration) return resolve();
          
          this.registration.installing?.addEventListener('statechange', (e) => {
            if ((e.target as ServiceWorker).state === 'activated') {
              resolve();
            }
          });
        });
      }

      console.log('Service Worker registered. Initializing pipeline...');
      const result = await this.sendMessage({ type: 'INIT_PIPELINE' });
      
      if (result.type !== 'PIPELINE_READY') {
        throw new Error('Failed to initialize pipeline');
      }
      
      console.log('Pipeline initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Service Worker:', error);
      throw error;
    }
  }

  async processAudio(audioData: Float32Array): Promise<WhisperResult> {
    if (!this.registration?.active) {
      throw new Error('Service Worker is not active');
    }

    console.log('Processing audio...');
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
      console.error('Error processing audio:', result.error);
      throw new Error(result.error);
    }

    if (result.type === 'PROCESS_COMPLETE') {
      console.log('Audio processing complete');
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
      const timeoutId = setTimeout(() => {
        messageChannel.port1.close();
        reject(new Error('Message timeout'));
      }, 30000); // 30秒タイムアウト

      messageChannel.port1.onmessage = (event) => {
        clearTimeout(timeoutId);
        
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

      try {
        this.registration.active.postMessage(message, [messageChannel.port2]);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
}

export default WhisperService;