import path from 'node:path';
import { defineConfig } from 'vite';

const rendererRoot = path.resolve(__dirname, 'src/renderer');

export default defineConfig({
  root: rendererRoot,
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: path.resolve(rendererRoot, 'index.html'),
        settings: path.resolve(rendererRoot, 'settings.html')
      }
    }
  }
});
