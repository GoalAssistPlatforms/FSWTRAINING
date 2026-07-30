import { WorkerLogger } from './workerTypes';

export class SafeWorkerLogger implements WorkerLogger {
  info(msg: string, ctx?: any): void {
    console.log(`[Worker INFO] ${msg}`, this.sanitize(ctx));
  }

  error(msg: string, ctx?: any): void {
    console.error(`[Worker ERROR] ${msg}`, this.sanitize(ctx));
  }

  warn(msg: string, ctx?: any): void {
    console.warn(`[Worker WARN] ${msg}`, this.sanitize(ctx));
  }

  private sanitize(ctx?: any): any {
    if (!ctx) return undefined;
    try {
      const copy = JSON.parse(JSON.stringify(ctx));
      this.stripSensitiveKeys(copy);
      return copy;
    } catch {
      return { _unserializable: true };
    }
  }

  private stripSensitiveKeys(obj: any) {
    if (typeof obj !== 'object' || obj === null) return;
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (lower.includes('token') || lower.includes('key') || lower.includes('secret') || lower.includes('transcript')) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        this.stripSensitiveKeys(obj[key]);
      }
    }
  }
}
