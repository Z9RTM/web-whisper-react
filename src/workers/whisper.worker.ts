import {
  AutoTokenizer,
  AutoProcessor,
  WhisperForConditionalGeneration,
  WhisperTextStreamer,
  full
} from '@huggingface/transformers';
import { WHISPER_CONFIG } from '@/config/whisper';
import { WhisperResult, WhisperChunk } from '@/types/whisper';

const MODEL_ID = 'onnx-community/whisper-small';

/**
 * Singleton class for managing the Whisper model and its components
 */
class WhisperPipeline {
  static tokenizer = null;
  static processor = null;
  static model = null;
  static isProcessing = false;

  static async getInstance(progressCallback = null) {
    try {
      this.tokenizer ??= await AutoTokenizer.from_pretrained(MODEL_ID, {
        progress_callback: progressCallback
      });

      this.processor ??= await AutoProcessor.from_pretrained(MODEL_ID, {
        progress_callback: progressCallback
      });

      this.model ??= await WhisperForConditionalGeneration.from_pretrained(MODEL_ID, {
        dtype: {
          encoder_model: 'fp32',
          decoder_model_merged: 'q4'
        },
        device: 'webgpu',
        progress_callback: progressCallback
      });

      return [this.tokenizer, this.processor, this.model];
    } catch (error) {
      console.error('Error initializing pipeline:', error);
      throw error;
    }
  }

  static async cleanup() {
    try {
      if (this.model) {
        await this.model.dispose();
        this.model = null;
      }
      this.tokenizer = null;
      this.processor = null;
    } catch (error) {
      console.warn('Error during cleanup:', error);
    }
  }
}

// Message types
type WorkerMessage = {
  type: 'load' | 'transcribe';
  data?: {
    audio: Float32Array;
    language?: string;
  };
};

async function initialize(progressCallback: (data: any) => void) {
  try {
    self.postMessage({
      type: 'progress',
      progress: {
        status: 'Loading model...',
        progress: 0
      }
    });

    const [tokenizer, processor, model] = await WhisperPipeline.getInstance(progressCallback);

    self.postMessage({
      type: 'progress',
      progress: {
        status: 'Compiling shaders and warming up model...',
        progress: 90
      }
    });

    // Warm up the model with dummy input
    await model.generate({
      input_features: full([1, 80, 3000], 0.0),
      max_new_tokens: 1,
    });

    self.postMessage({ type: 'init_complete' });
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown initialization error'
    });
  }
}

async function transcribe(audioData: Float32Array) {
  if (WhisperPipeline.isProcessing) {
    throw new Error('Already processing audio');
  }

  try {
    WhisperPipeline.isProcessing = true;
    const [tokenizer, processor, model] = await WhisperPipeline.getInstance();

    // Storage for chunks and timing info
    const chunks: WhisperChunk[] = [];
    let startTime: number | null = null;
    let numTokens = 0;
    let tps: number | undefined;

    // Create streamer for real-time transcription
    const streamer = new WhisperTextStreamer(tokenizer, {
      time_precision: processor.feature_extractor.config.chunk_length / model.config.max_source_positions,
      on_chunk_start: (timestamp: number) => {
        const offset = (WHISPER_CONFIG.chunkLengthSeconds - WHISPER_CONFIG.strideLengthSeconds) * chunks.length;
        chunks.push({
          text: '',
          timestamp: [offset + timestamp, null],
          finalised: false,
          offset
        });
      },
      token_callback_function: () => {
        startTime ??= performance.now();
        if (numTokens++ > 0) {
          tps = (numTokens / (performance.now() - startTime)) * 1000;
        }
      },
      callback_function: (text: string) => {
        if (chunks.length === 0) return;
        chunks[chunks.length - 1].text += text;

        self.postMessage({
          type: 'progress',
          progress: {
            status: 'update',
            data: {
              text: '',
              chunks,
              tps
            }
          }
        });
      },
      on_chunk_end: (timestamp: number) => {
        const current = chunks[chunks.length - 1];
        current.timestamp[1] = timestamp + current.offset;
        current.finalised = true;
      }
    });

    // Process audio
    const inputs = await processor(audioData);
    const result = await model.generate({
      ...inputs,
      language: WHISPER_CONFIG.language,
      task: 'transcribe',
      streamer
    });

    // Get final text
    const outputText = await tokenizer.batch_decode(result, { skip_special_tokens: true });
    const fullText = outputText[0] || chunks.map(chunk => chunk.text).join(' ').trim();

    self.postMessage({
      type: 'transcribe_complete',
      result: {
        text: fullText,
        chunks,
        tps
      }
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown transcription error'
    });

    // Try to cleanup on error
    await WhisperPipeline.cleanup();
  } finally {
    WhisperPipeline.isProcessing = false;
  }
}

// Handle incoming messages
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, data } = event.data;

  try {
    switch (type) {
      case 'load':
        await initialize((progress) => {
          self.postMessage({ type: 'progress', progress });
        });
        break;

      case 'transcribe':
        if (data?.audio) {
          await transcribe(data.audio);
        }
        break;

      default:
        throw new Error('Unknown message type');
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};