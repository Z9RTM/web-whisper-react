import { Plugin } from 'vite';
import { build } from 'vite';
import path from 'path';

export function serviceWorkerPlugin(): Plugin {
  return {
    name: 'service-worker',
    async buildEnd() {
      // Build the service worker
      await build({
        build: {
          lib: {
            entry: path.resolve(__dirname, 'src/whisper-worker.ts'),
            name: 'whisperWorker',
            fileName: () => 'whisper-worker.js',
            formats: ['es'],
          },
          rollupOptions: {
            external: [],
          },
          outDir: 'public',
          emptyOutDir: false,
        },
        configFile: false,
      });
    },
  };
}