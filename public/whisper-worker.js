let pipeline = null;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('message', async (event) => {
  if (event.data.type === 'INIT_PIPELINE') {
    if (!pipeline) {
      const { pipeline: Pipeline } = await import('@xenova/transformers');
      pipeline = await Pipeline.getInstance('Xenova/whisper-small');
    }
    event.ports[0].postMessage({ type: 'PIPELINE_READY' });
  } else if (event.data.type === 'TRANSCRIBE') {
    if (!pipeline) {
      event.ports[0].postMessage({
        type: 'ERROR',
        error: 'Pipeline not initialized'
      });
      return;
    }

    try {
      const result = await pipeline(event.data.audio);
      event.ports[0].postMessage({
        type: 'TRANSCRIPTION_COMPLETE',
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