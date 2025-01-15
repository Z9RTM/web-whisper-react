/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

import { pipeline } from '@xenova/transformers';

let whisperPipeline: any = null;

// Service Workerのインストール時の処理
self.addEventListener('install', (event: ExtendableEvent) => {
  console.log('[Whisper Service Worker] Installing...');
  event.waitUntil(self.skipWaiting());
});

// Service Workerのアクティベート時の処理
self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log('[Whisper Service Worker] Activating...');
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // 古いキャッシュの削除などの処理をここに追加できます
    ])
  );
});

// メッセージ処理
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (!event.ports || event.ports.length === 0) {
    console.error('[Whisper Service Worker] No message port provided');
    return;
  }

  const port = event.ports[0];

  const sendError = (error: Error | string) => {
    const errorMessage = error instanceof Error ? error.message : error;
    console.error('[Whisper Service Worker] Error:', errorMessage);
    port.postMessage({
      type: 'ERROR',
      error: errorMessage
    });
  };

  const handleMessage = async () => {
    try {
      switch (event.data.type) {
        case 'INIT_PIPELINE':
          if (!whisperPipeline) {
            console.log('[Whisper Service Worker] Initializing pipeline...');
            whisperPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
              progress_callback: (progress: { status: string; progress?: number }) => {
                if (progress.status === 'progress' && progress.progress !== undefined) {
                  port.postMessage({
                    type: 'LOADING_PROGRESS',
                    progress: Math.round(progress.progress)
                  });
                }
              }
            });
            console.log('[Whisper Service Worker] Pipeline initialized');
          }
          port.postMessage({ type: 'PIPELINE_READY' });
          break;

        case 'PROCESS_AUDIO':
          if (!whisperPipeline) {
            throw new Error('Pipeline not initialized');
          }
          console.log('[Whisper Service Worker] Processing audio...');
          const result = await whisperPipeline(event.data.audio, {
            chunk_length_s: event.data.config.chunkLengthSeconds,
            stride_length_s: event.data.config.strideLengthSeconds,
            language: event.data.config.language,
            return_timestamps: true,
          });
          console.log('[Whisper Service Worker] Audio processing complete');
          port.postMessage({
            type: 'PROCESS_COMPLETE',
            result: result
          });
          break;

        default:
          throw new Error(`Unknown message type: ${event.data.type}`);
      }
    } catch (error) {
      sendError(error);
    }
  };

  handleMessage().catch(sendError);
});