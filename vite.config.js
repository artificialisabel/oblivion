import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  resolve: {
    dedupe: ['three']
  },
  build: {
    rollupOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
