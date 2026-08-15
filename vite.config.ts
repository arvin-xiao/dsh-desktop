import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(__dirname, 'src/renderer'),
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@shared': path.join(__dirname, 'src/shared'),
      '@renderer': path.join(__dirname, 'src/renderer'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.join(__dirname, 'out/renderer'),
    emptyOutDir: true,
  },
  optimizeDeps: {
    include: ['xterm', 'xterm-addon-fit', 'xterm-addon-web-links'],
  },
});
