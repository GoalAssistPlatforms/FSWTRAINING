import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/features/videoEditor/worker/main.ts',
    outDir: 'dist-transcription-worker',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'worker.mjs'
      }
    }
  }
});
