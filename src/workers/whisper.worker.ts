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

type WorkerResponse = {
  type: 'received' | 'init_complete' | 'progress' | 'transcribe_complete' | 'error';
  messageType?: string;
  progress?: { status: string; progress?: number; data?: any };
  result?: WhisperResult;
  error?: string;
};

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

    // Configure pipeline options
    const pipelineOptions = {
      progress_callback: callback,
      ...(useWebGPU ? { backend: 'webgpu' } : {}),
      revision: 'main',
      quantized: true,
      cache_dir: '/whisper_cache',
      local_files_only: false,
      model_file_name: 'model.onnx',
      session_options: {
        executionProviders: ['wasm'],
        enableMemPattern: false,
        executionMode: 'sequential'
      }
    };

    // Initialize pipeline with retry
    let initError = null;
    for (let i = 0; i < 2; i++) {
      try {
        whisperPipeline = await pipeline(
          'automatic-speech-recognition',
          'onnx-community/whisper-small',
          pipelineOptions
        );
        break;
      } catch (error) {
        initError = error;
        console.warn(`Pipeline initialization attempt ${i + 1} failed:`, error);
        await delay(1000);
      }
    }

    if (!whisperPipeline) {
      throw initError || new Error('Failed to initialize pipeline');
    }
    self.postMessage({ type: 'init_complete' });
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message });
  }
}

// Utility function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Cleanup and reinitialize pipeline
async function cleanupAndReinitialize(callback: (progress: { status: string; progress?: number }) => void) {
  try {
    // Cleanup existing pipeline
    if (whisperPipeline) {
      try {
        await whisperPipeline.dispose();
      } catch (error) {
        console.warn('Error disposing pipeline:', error);
      }
      whisperPipeline = null;
    }

    // Clear any cached data
    if ('caches' in self) {
      try {
        const cache = await caches.open('whisper-cache');
        await cache.delete('/whisper_cache');
      } catch (error) {
        console.warn('Error clearing cache:', error);
      }
    }

    // Reinitialize
    await initializePipeline(callback, false);
    
    // Verify initialization
    if (!whisperPipeline) {
      throw new Error('Pipeline reinitialization failed');
    }
  } catch (error) {
    console.error('Error during reinitialization:', error);
    throw error;
  }
}

// Process audio data with retry logic
async function processAudio(audioData: Float32Array, maxRetries = 3) {
  if (!whisperPipeline) {
    throw new Error('Pipeline not initialized');
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // If this is a retry attempt, cleanup and reinitialize
      if (attempt > 0) {
        self.postMessage({ 
          type: 'progress', 
          progress: { 
            status: `Reinitializing for retry (attempt ${attempt + 1}/${maxRetries})...`,
            progress: 0 
          } 
        });
        
        await cleanupAndReinitialize((progress) => {
          self.postMessage({ 
            type: 'progress', 
            progress: {
              status: `Preparing for retry ${attempt + 1}/${maxRetries}`,
              progress: progress.progress
            }
          });
        });

        await delay(500); // Short delay after reinitialization
      }

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
    return; // Successful completion
  } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Log the error for debugging
      console.error(`Transcription error (attempt ${attempt + 1}/${maxRetries}):`, error);
      
      // If this is not the last attempt, continue to the next retry
      if (attempt < maxRetries - 1) {
        self.postMessage({ 
          type: 'progress', 
          progress: { 
            status: `Error occurred, preparing for retry...`,
            progress: 0 
          } 
        });
        continue;
      }
    }
  }

  // If we exhausted all retries and still have an error, throw it
  if (lastError) {
    self.postMessage({ type: 'error', error: lastError.message });
    return;
  }
}

// Handle incoming messages
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;

  // Immediately acknowledge receipt of the message
  self.postMessage({ type: 'received', messageType: type });

  // Process the message asynchronously
  (async () => {
    try {
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
    } catch (error) {
      self.postMessage({ 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })();
};