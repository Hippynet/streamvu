import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3003,
    host: true, // Listen on all interfaces (0.0.0.0)
    strictPort: true,
    // Ensure HMR works from any host
    hmr: {
      // Don't specify host - let it use the page's host
      protocol: 'ws',
      clientPort: 3003,
    },
    // Allow access from any origin in development
    cors: true,
  },
  build: {
    sourcemap: true,
  },
  // Ensure base is relative
  base: '/',
})
