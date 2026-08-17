import { runWorkerProcess } from './runtime';

runWorkerProcess().catch(error => {
  console.error('[Worker FATAL] Transcription worker stopped unexpectedly.', {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown startup error'
  });
  process.exitCode = 1;
});
