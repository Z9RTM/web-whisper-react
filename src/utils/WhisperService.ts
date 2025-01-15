import { WHISPER_CONFIG } from '@/config/whisper';
import { WhisperResult } from '@/types/whisper';
import { AutoProcessor, AutoModelForSpeechSeq2Seq, pipeline } from '@huggingface/transformers';

type ProgressCallback = (progress: { status: string; progress?: number }) => void;

class WhisperService {
  private static instance: WhisperService;
  private whisperPipeline: any = null;
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
    this.progressCallback = progressCallback || null;
    this.initializationPromise = this.doInitialize();

    try {
      await this.initializationPromise;
    } finally {
      this.isInitializing = false;
      this.initializationPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      console.log('Initializing Whisper pipeline...');
      
      if (this.progressCallback) {
        this.progressCallback({ status: 'progress', progress: 0 });
      }

      // Load processor and model
      const processor = await AutoProcessor.from_pretrained('openai/whisper-small', {
        quantized: true
      });
      if (this.progressCallback) {
        this.progressCallback({ status: 'progress', progress: 50 });
      }

      const model = await AutoModelForSpeechSeq2Seq.from_pretrained('openai/whisper-small', {
        config: {
          model_type: "whisper",
          is_encoder_decoder: true,
          max_position_embeddings: 1500,
          "transformers.js_config": true,
          normalized_config: true
        }
      });
      if (this.progressCallback) {
        this.progressCallback({ status: 'progress', progress: 90 });
      }

      // Create pipeline
      this.whisperPipeline = await pipeline(
        'automatic-speech-recognition',
        {
          model,
          tokenizer: processor.tokenizer,
          feature_extractor: processor.feature_extractor,
        }
      );

      if (this.progressCallback) {
        this.progressCallback({ status: 'progress', progress: 100 });
      }

      console.log('Pipeline initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Whisper pipeline:', error);
      throw error;
    }
  }

  async processAudio(audioData: Float32Array): Promise<WhisperResult> {
    if (!this.whisperPipeline) {
      throw new Error('Pipeline not initialized');
    }

    try {
      console.log('Processing audio...');
      const result = await this.whisperPipeline(audioData, {
        chunk_length_s: WHISPER_CONFIG.chunkLengthSeconds,
        stride_length_s: WHISPER_CONFIG.strideLengthSeconds,
        language: WHISPER_CONFIG.language,
        return_timestamps: true,
        task: 'transcribe',
      });

      console.log('Audio processing complete');
      return result as WhisperResult;
    } catch (error) {
      console.error('Error processing audio:', error);
      throw error;
    }
  }
}

export default WhisperService;