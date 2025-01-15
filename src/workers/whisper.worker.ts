import { pipeline, WhisperTextStreamer } from '@huggingface/transformers';
import { WHISPER_CONFIG } from '@/config/whisper';
import { WhisperResult, WhisperChunk } from '@/types/whisper';

interface WhisperPipelineResult {
  text: string;
  chunks?: {
    text: string;
    timestamp: [number, number | null];
  }[];
}

let whisperPipeline: any = null;
let chunkCount = 0;

// Worker message types
type InitMessage = {
  type: 'init';
  useWebGPU?: boolean;
};

type TranscribeMessage = {
  type: 'transcribe';
  audioData: Float32Array;
};

type WorkerMessage = InitMessage | TranscribeMessage;

// Initialize the pipeline
async function initializePipeline(
  callback: (progress: { status: string; progress?: number }) => void,
  useWebGPU: boolean = false
) {
  try {
    // Check WebGPU availability
    if (useWebGPU) {
      if (!navigator.gpu) {
        self.postMessage({ 
          type: 'warning', 
          message: 'WebGPU is not available, falling back to default backend' 
        });
        useWebGPU = false;
      }
    }

    whisperPipeline = await pipeline(
      'automatic-speech-recognition',
      'onnx-community/whisper-small',
      {
        progress_callback: callback,
        ...(useWebGPU ? { backend: 'webgpu' } : {})
      }
    );
    self.postMessage({ type: 'init_complete' });
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message });
  }
}

// Process audio data
async function processAudio(audioData: Float32Array) {
  if (!whisperPipeline) {
    throw new Error('Pipeline not initialized');
  }

  try {
    const time_precision = whisperPipeline.processor.feature_extractor.config.chunk_length / 
                          whisperPipeline.model.config.max_source_positions;

    // Storage for chunks to be processed
    const chunks: WhisperChunk[] = [];
    let startTime: number | null = null;
    let numTokens = 0;
    let tps: number | undefined;

    // Create streamer for real-time transcription
    const streamer = new WhisperTextStreamer(whisperPipeline.tokenizer, {
      time_precision,
      on_chunk_start: (timestamp: number) => {
        const offset = (WHISPER_CONFIG.chunkLengthSeconds - WHISPER_CONFIG.strideLengthSeconds) * chunkCount;
        chunks.push({
          text: '',
          timestamp: [offset + timestamp, null],
          finalised: false,
          offset,
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
        // Append text to the last chunk
        chunks[chunks.length - 1].text += text;

        self.postMessage({
          type: 'progress',
          progress: {
            status: 'update',
            data: {
              text: '', // Full text will be sent on completion
              chunks,
              tps,
            }
          }
        });
      },
      on_chunk_end: (timestamp: number) => {
        const current = chunks[chunks.length - 1];
        current.timestamp[1] = timestamp + current.offset;
        current.finalised = true;
      },
      on_finalize: () => {
        startTime = null;
        numTokens = 0;
        ++chunkCount;
      },
    });

    // Run transcription
    const result: WhisperPipelineResult = await whisperPipeline(audioData, {
      top_k: 0,
      do_sample: false,
      chunk_length_s: WHISPER_CONFIG.chunkLengthSeconds,
      stride_length_s: WHISPER_CONFIG.strideLengthSeconds,
      language: WHISPER_CONFIG.language,
      task: 'transcribe',
      return_timestamps: true,
      force_full_sequences: false,
      streamer,
    });

    // Combine result with chunks
    const fullText = result.text || chunks.map(chunk => chunk.text).join(' ').trim();
    
    // If result contains timestamps, merge them with our chunks
    if (result.chunks) {
      result.chunks.forEach((resultChunk, index) => {
        if (index < chunks.length) {
          chunks[index] = {
            ...chunks[index],
            text: resultChunk.text || chunks[index].text,
            timestamp: resultChunk.timestamp || chunks[index].timestamp,
            finalised: true
          };
        }
      });
    }

    self.postMessage({ 
      type: 'transcribe_complete', 
      result: {
        text: fullText,
        chunks,
        tps,
      }
    });
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message });
  }
}

// Handle incoming messages
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;

  switch (type) {
    case 'init':
      await initializePipeline(
        (progress) => {
          self.postMessage({ type: 'progress', progress });
        },
        event.data.useWebGPU
      );
      break;

    case 'transcribe':
      await processAudio(event.data.audioData);
      break;

    default:
      self.postMessage({ type: 'error', error: 'Unknown message type' });
  }
};