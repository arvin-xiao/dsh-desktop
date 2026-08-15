// Lightweight logger (no heavy deps in renderer)
export const log = {
  info: (...args: any[]) => console.log('[dsh-renderer]', ...args),
  warn: (...args: any[]) => console.warn('[dsh-renderer]', ...args),
  error: (...args: any[]) => console.error('[dsh-renderer]', ...args),
};
