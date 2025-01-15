import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 53983,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          transformers: ['@huggingface/transformers'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['@huggingface/transformers'],
    esbuildOptions: {
      target: 'es2020',
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    'process.env.HF_ENDPOINT': JSON.stringify(process.env.HF_ENDPOINT || 'https://huggingface.co'),
  },
})
