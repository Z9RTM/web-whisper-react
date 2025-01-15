import { pipeline } from '@xenova/transformers';

let whisperPipeline = null;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('message', async (event) => {
  if (event.data.type === 'INIT_PIPELINE') {
    if (!whisperPipeline) {
      try {
        whisperPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
          progress_callback: (progress) => {
            if (progress.status === 'progress' && progress.progress !== undefined) {
              event.ports[0].postMessage({
                type: 'LOADING_PROGRESS',
                progress: Math.round(progress.progress)
              });
            }
          }
        });
        event.ports[0].postMessage({ type: 'PIPELINE_READY' });
      } catch (error) {
        event.ports[0].postMessage({
          type: 'ERROR',
          error: error.message
        });
      }
    } else {
      event.ports[0].postMessage({ type: 'PIPELINE_READY' });
    }
  } else if (event.data.type === 'PROCESS_AUDIO') {
    if (!whisperPipeline) {
      event.ports[0].postMessage({
        type: 'ERROR',
        error: 'Pipeline not initialized'
      });
      return;
    }

    try {
      const result = await whisperPipeline(event.data.audio, {
        chunk_length_s: event.data.config.chunkLengthSeconds,
        stride_length_s: event.data.config.strideLengthSeconds,
        language: event.data.config.language,
        return_timestamps: true,
      });
      event.ports[0].postMessage({
        type: 'PROCESS_COMPLETE',
        result: result
      });
    } catch (error) {
      event.ports[0].postMessage({
        type: 'ERROR',
        error: error.message
      });
    }
  }
});