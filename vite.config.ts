import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static single-page app: relative base so it can be hosted anywhere (Netlify, GitHub Pages, S3…).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
          map: ['leaflet'],
        },
      },
    },
  },
});
