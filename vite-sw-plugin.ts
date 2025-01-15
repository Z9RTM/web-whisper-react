import { Plugin } from 'vite';
import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs/promises';

export function serviceWorkerPlugin(): Plugin {
  return {
    name: 'service-worker',
    async buildStart() {
      // Ensure the public directory exists
      await fs.mkdir('public', { recursive: true });
    },
    async writeBundle() {
      // Build the service worker using esbuild
      await esbuild.build({
        entryPoints: [path.resolve(__dirname, 'src/whisper-worker.ts')],
        bundle: true,
        outfile: 'public/whisper-worker.js',
        format: 'iife',
        platform: 'browser',
        target: 'es2020',
        minify: true,
        define: {
          'process.env.NODE_ENV': '"production"',
        },
      });
    },
    configureServer(server) {
      // Serve the service worker from the public directory during development
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/whisper-worker.js') {
          try {
            await esbuild.build({
              entryPoints: [path.resolve(__dirname, 'src/whisper-worker.ts')],
              bundle: true,
              outfile: 'public/whisper-worker.js',
              format: 'iife',
              platform: 'browser',
              target: 'es2020',
              define: {
                'process.env.NODE_ENV': '"development"',
              },
            });
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