import { Plugin } from 'vite';
import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs/promises';

const buildServiceWorker = async (isDev: boolean = false) => {
  const outfile = 'dist/whisper-worker.js';
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, 'src/whisper-worker.ts')],
    bundle: true,
    outfile,
    format: 'iife',
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
  let distDir: string;

  return {
    name: 'service-worker',
    configResolved(config) {
      distDir = config.build.outDir;
    },
    configureServer(server) {
      // Create a virtual module for the service worker
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/whisper-worker.js') {
          try {
            // Ensure dist directory exists
            await fs.mkdir('dist', { recursive: true });
            
            // Build the service worker
            await buildServiceWorker(true);
            
            // Read and serve the built file
            const content = await fs.readFile('dist/whisper-worker.js', 'utf-8');
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Service-Worker-Allowed', '/');
            res.end(content);
          } catch (error) {
            console.error('Error serving service worker:', error);
            next(error);
          }
        } else {
          next();
        }
      });
    },
    async buildStart() {
      // Ensure dist directory exists
      await fs.mkdir('dist', { recursive: true });
    },
    async writeBundle() {
      // Build and copy the service worker to the dist directory
      await buildServiceWorker(false);
      
      // Copy the built service worker to the final output directory if it's different
      if (distDir !== 'dist') {
        await fs.mkdir(distDir, { recursive: true });
        await fs.copyFile(
          'dist/whisper-worker.js',
          path.join(distDir, 'whisper-worker.js')
        );
      }
    },
  };
}