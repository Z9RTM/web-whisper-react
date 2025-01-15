import { Plugin } from 'vite';
import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs/promises';

const buildServiceWorker = async (isDev: boolean = false) => {
  const outfile = 'public/whisper-worker.js';
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, 'src/whisper-worker.ts')],
    bundle: true,
    outfile,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    minify: !isDev,
    sourcemap: isDev,
    define: {
      'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
      'global': 'globalThis',
    },
    loader: {
      '.wasm': 'file',
    },
    metafile: true,
    external: ['fs', 'path', 'url', 'http', 'https', 'zlib'],
  });
};

export function serviceWorkerPlugin(): Plugin {
  return {
    name: 'service-worker',
    async buildStart() {
      // Ensure the public directory exists
      await fs.mkdir('public', { recursive: true });
    },
    async writeBundle() {
      await buildServiceWorker(false);
    },
    configureServer(server) {
      // Serve the service worker from the public directory during development
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/whisper-worker.js') {
          try {
            await buildServiceWorker(true);
            const content = await fs.readFile('public/whisper-worker.js', 'utf-8');
            res.setHeader('Content-Type', 'application/javascript');
            res.end(content);
          } catch (error) {
            console.error('Error building service worker:', error);
            next(error);
          }
        } else {
          next();
        }
      });
    },
  };
}