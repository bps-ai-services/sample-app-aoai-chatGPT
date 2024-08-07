import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: '../static',
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    port: 5174, // Replace with your desired port number
    proxy: {
      '/ask': 'http://localhost:5000',
      '/chat': 'http://localhost:5000',
      '/history': 'http://127.0.0.1:5000',
      '/conversation': 'http://127.0.0.1:5000',
      '/frontend_settings': 'http://127.0.0.1:5000',
      '/v3/history/generate': 'http://127.0.0.1:5000',
      '/v3/conversation': 'http://127.0.0.1:5000',
      '/v3/history/conversation_feedback': 'http://127.0.0.1:5000'
    }
  }
})
