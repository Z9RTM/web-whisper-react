import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { serviceWorkerPlugin } from './vite-sw-plugin'

export default defineConfig({
  plugins: [
    react(),
    serviceWorkerPlugin(),
  ],
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
    rollupOptions: {
      output: {
        manualChunks: {
          transformers: ['@xenova/transformers'],
        },
      },
    },
  },
})
