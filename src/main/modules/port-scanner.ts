import * as net from 'node:net';

/** 检测某个端口是否被占用（被占用返回 true） */
export function isPortTaken(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: any) => {
      if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
        resolve(true);
      } else {
        resolve(true);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, host);
  });
}

/** 从 startPort 开始找第一个可用端口，最多尝试 range 次 */
export async function findFreePort(
  startPort: number,
  range = 20,
  host = '127.0.0.1',
): Promise<number> {
  for (let p = startPort; p < startPort + range; p++) {
    if (!(await isPortTaken(p, host))) return p;
  }
  throw new Error(
    `No free port found in range [${startPort}, ${startPort + range - 1}]`,
  );
}

/** 探测 HTTP 服务是否就绪（连续 successCount 次 2xx 即视为 OK） */
export async function waitForHttpReady(
  url: string,
  opts: {
    timeoutMs: number;
    intervalMs?: number;
    successCount?: number;
  },
): Promise<void> {
  const { timeoutMs, intervalMs = 500, successCount = 2 } = opts;
  const start = Date.now();
  let consecutiveOk = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), intervalMs);
      const res = await fetch(url, { signal: ctrl.signal }).catch(() => null);
      clearTimeout(t);
      if (res && res.ok) {
        consecutiveOk++;
        if (consecutiveOk >= successCount) return;
      } else {
        consecutiveOk = 0;
      }
    } catch {
      consecutiveOk = 0;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`HTTP service at ${url} not ready within ${timeoutMs}ms`);
}
