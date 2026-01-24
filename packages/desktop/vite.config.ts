import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  plugins: [],
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: 'esnext',
  },
});
