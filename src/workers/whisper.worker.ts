import { pipeline } from '@huggingface/transformers';
import { WHISPER_CONFIG } from '@/config/whisper';
import { WhisperResult } from '@/types/whisper';

let whisperPipeline: any = null;

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
    const result = await whisperPipeline(audioData, {
      chunk_length_s: WHISPER_CONFIG.chunkLengthSeconds,
      stride_length_s: WHISPER_CONFIG.strideLengthSeconds,
      language: WHISPER_CONFIG.language,
      return_timestamps: true,
      task: 'transcribe',
    });

    self.postMessage({ type: 'transcribe_complete', result });
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