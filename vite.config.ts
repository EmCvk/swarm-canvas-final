import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/API': {
        target: 'http://127.0.0.1:7801',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/Output': {
        target: 'http://127.0.0.1:7801',
        changeOrigin: true,
      },
      '/View': {
        target: 'http://127.0.0.1:7801',
        changeOrigin: true,
      }
    }
  },
});