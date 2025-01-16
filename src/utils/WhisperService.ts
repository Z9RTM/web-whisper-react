import { WhisperResult, WhisperStreamUpdate } from '@/types/whisper';

type ProgressCallback = (progress: { 
  status: string; 
  progress?: number;
  data?: WhisperStreamUpdate;
}) => void;

class WhisperService {
  private static instance: WhisperService;
  private worker: Worker | null = null;
  private progressCallback: ProgressCallback | null = null;
  private isInitializing: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private currentResolve: ((value: WhisperResult) => void) | null = null;
  private currentReject: ((reason: any) => void) | null = null;

  private constructor() {}

  static getInstance(): WhisperService {
    if (!WhisperService.instance) {
      WhisperService.instance = new WhisperService();
    }
    return WhisperService.instance;
  }

  private setupWorker() {
    if (this.worker) {
      this.worker.terminate();
    }

    this.worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
      type: 'module'
    });

    this.worker.onmessage = (event) => {
      const { type, progress, result, error } = event.data;

      switch (type) {
        case 'init_complete':
          if (this.progressCallback) {
            this.progressCallback({ status: 'progress', progress: 100 });
          }
          this.isInitializing = false;
          break;

        case 'progress':
          if (this.progressCallback) {
            this.progressCallback(progress);
          }
          break;

        case 'transcribe_complete':
          if (this.currentResolve) {
            this.currentResolve(result);
            this.currentResolve = null;
            this.currentReject = null;
          }
          break;

        case 'error':
          const errorObj = new Error(error);
          if (this.currentReject) {
            this.currentReject(errorObj);
            this.currentResolve = null;
            this.currentReject = null;
          } else {
            console.error('Worker error:', error);
          }
          break;

        default:
          console.debug('Unknown message type:', type);
          break;
      }
    };

    this.worker.onerror = (error) => {
      console.error('Worker error:', error);
      if (this.currentReject) {
        this.currentReject(error);
        this.currentResolve = null;
        this.currentReject = null;
      }
    };
  }

  async initialize(progressCallback?: ProgressCallback): Promise<void> {
    if (this.isInitializing) {
      await this.initializationPromise;
      return;
    }

    this.isInitializing = true;
    this.progressCallback = progressCallback || null;

    this.initializationPromise = new Promise<void>((resolve, reject) => {
      try {
        console.log('Initializing Whisper pipeline...');
        
        if (this.progressCallback) {
          this.progressCallback({ status: 'progress', progress: 0 });
        }

        this.setupWorker();
        
        if (!this.worker) {
          throw new Error('Failed to create worker');
        }

        this.worker.postMessage({ type: 'load' });
        resolve();
      } catch (error) {
        this.isInitializing = false;
        reject(error);
      }
    });

    try {
      await this.initializationPromise;
      console.log('Pipeline initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Whisper pipeline:', error);
      throw error;
    } finally {
      this.initializationPromise = null;
    }
  }

  async processAudio(
    audioData: Float32Array,
    progressCallback?: ProgressCallback
  ): Promise<WhisperResult> {
    if (!this.worker) {
      throw new Error('Pipeline not initialized');
    }

    return new Promise<WhisperResult>((resolve, reject) => {
      try {
        console.log('Processing audio...');
        this.currentResolve = resolve;
        this.currentReject = reject;
        this.progressCallback = progressCallback || null;
        this.worker!.postMessage({ 
          type: 'transcribe',
          data: {
            audio: audioData
          }
        }, [audioData.buffer]);
      } catch (error) {
        reject(error);
      }
    });
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

export default WhisperService;