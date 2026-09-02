import { defineConfig } from 'vite';

// Builds the background transcription worker as one self-contained Node bundle. Dependencies
// are bundled in (noExternal) so the runtime image needs nothing beyond Node and FFmpeg.
export default defineConfig({
  // The web app's public assets have no place in the worker output.
  publicDir: false,
  build: {
    ssr: 'src/features/videoEditor/worker/main.ts',
    target: 'node22',
    outDir: 'dist-transcription-worker',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: 'worker.mjs'
      }
    }
  },
  ssr: {
    noExternal: true
  }
});
