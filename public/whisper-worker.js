let pipeline = null;
let transformers = null;

// Load transformers library from CDN
self.importScripts('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.15.0');

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('message', async (event) => {
  if (event.data.type === 'INIT_PIPELINE') {
    if (!pipeline) {
      try {
        // Use the globally loaded transformers library
        pipeline = await self.pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
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
    if (!pipeline) {
      event.ports[0].postMessage({
        type: 'ERROR',
        error: 'Pipeline not initialized'
      });
      return;
    }

    try {
      const result = await pipeline(event.data.audio, {
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