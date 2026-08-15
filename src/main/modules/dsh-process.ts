import { EventEmitter } from 'node:events';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { IPty, IPtyForkOptions } from 'node-pty';
import { app } from 'electron';
import type { DshStatus, DshStatusInfo } from '../../shared/types';
import {
  DSH_PACKAGE,
  DSH_DEFAULT_VERSION,
  DSH_READY_CHECK_INTERVAL_MS,
  DSH_READY_TIMEOUT_MS,
  DSH_STOP_TIMEOUT_MS,
} from '../../shared/constants';
import { waitForHttpReady } from './port-scanner';
import { log } from '../utils/logger';
import { resolveNpxExecutable, buildNpmExecFallback } from '../utils/npx-path';
import { getDshPackageSpec } from './dsh-version';

let ptyModule: typeof import('node-pty') | null = null;
function loadPty(): typeof import('node-pty') | null {
  if (ptyModule === undefined) {
    try {
      ptyModule = require('node-pty') as typeof import('node-pty');
    } catch (e) {
      ptyModule = null;
      log.warn('[dsh-process] node-pty not available, falling back to child_process', (e as any).message);
    }
  }
  return ptyModule;
}

export class DshProcess extends EventEmitter {
  private _status: DshStatus = 'idle';
  private _port?: number;
  private _url?: string;
  private _pid?: number;
  private _error?: string;
  private _pty?: IPty;
  private _cleanup?: () => void;

  constructor(
    private readonly nodePath: string,
    private readonly options: {
      dshPackage?: string;
      dshVersion?: string;
      cwd?: string;
      envVars?: Record<string, string>;
      extraArgs?: string[];
      preset?: 'standard' | 'code' | 'minimal' | 'creator';
    } = {},
  ) {
    super();
  }

  get status(): DshStatus {
    return this._status;
  }

  getStatusInfo(): DshStatusInfo {
    return {
      status: this._status,
      port: this._port,
      url: this._url,
      error: this._error,
      pid: this._pid,
    };
  }

  async start(port: number): Promise<void> {
    if (this._status === 'starting' || this._status === 'running') return;
    this._set('starting', { port, url: `http://127.0.0.1:${port}`, error: undefined });

    // Resolve the npx executable bundled with (or alongside) the given node.
    let npxPath = await resolveNpxExecutable(this.nodePath);
    const version = this.options.dshVersion || DSH_DEFAULT_VERSION;
    const pkgSpec = this.options.dshPackage
      ? this.options.dshPackage
      : getDshPackageSpec(version);
    let args: string[] = [
      '-y', pkgSpec,
      'web', '--port', String(port),
      '--host', '127.0.0.1',
    ];
    if (this.options.extraArgs) args.push(...this.options.extraArgs);

    const cwd = this.options.cwd || app.getPath('home');
    const envVars: Record<string, string> = {
      ...process.env,
      npm_config_yes: 'true',
      NODE_SKIP_PLATFORM_CHECK: '1',
      ...this.options.envVars,
    };

    // ---- Auto fallback: npx -> npm exec ----
    // If npxPath is just a bare name (i.e. nothing resolved to absolute path),
    // or we later get ENOENT, convert the command to npm exec -- <pkgSpec> ...
    const npxLooksMissing =
      !npxPath || !path.isAbsolute(npxPath) || !existsSync(npxPath);
    let usedFallback = false;
    if (npxLooksMissing) {
      const fb = buildNpmExecFallback(this.nodePath, args);
      log.warn(
        '[dsh-process] npx not resolved to existing absolute file',
        `(${npxPath}) → falling back to npm exec via`, fb.executable,
      );
      this.emit('stderr', `\r\n[DSH Desktop] npx 未在 PATH 中找到，改用 npm exec 启动 …\r\n`);
      npxPath = fb.executable;
      args = fb.args;
      Object.assign(envVars, fb.envAdd);
      usedFallback = true;
    }

    const pty = loadPty();
    const useFallback = !pty;

    try {
      if (!useFallback) {
        const ptyOpts: IPtyForkOptions = {
          name: 'xterm-256color',
          cols: 120,
          rows: 40,
          cwd,
          env: envVars as any,
        };
        if (process.platform === 'win32') {
          const shell = process.env.ComSpec || 'cmd.exe';
          const line = [npxPath, ...args].map(quote).join(' ');
          const shellArgs = ['/d', '/s', '/c', `"${line}"`];
          log.info('[dsh-process] pty spawn win32', shell, shellArgs.join(' '));
          this._pty = pty.spawn(shell, shellArgs, ptyOpts);
        } else {
          log.info('[dsh-process] pty spawn unix', npxPath, args.join(' '));
          try {
            this._pty = pty.spawn(npxPath, args, ptyOpts);
          } catch (spawnErr: any) {
            // On macOS the PTY layer can throw ENOENT even when child_process
            // wouldn't — retry once with npm exec fallback.
            if (!usedFallback && /ENOENT|not found/i.test(spawnErr?.message || '')) {
              log.warn('[dsh-process] pty spawn ENOENT, retry via npm exec');
              const fb = buildNpmExecFallback(this.nodePath, args);
              npxPath = fb.executable;
              args = fb.args;
              Object.assign(envVars, fb.envAdd);
              Object.assign(ptyOpts, { env: envVars as any });
              this._pty = pty.spawn(npxPath, args, ptyOpts);
            } else {
              throw spawnErr;
            }
          }
        }
        this._pid = this._pty.pid;
        this._pty.onData((data) => this.emit('stdout', data));
        this._pty.onExit((ev) => {
          log.info('[dsh-process] pty exited', ev);
          this._onProcessExit(ev.exitCode, undefined);
        });
        this._cleanup = () => {
          try {
            this._pty?.kill();
          } catch {}
        };
      } else {
        try {
          await this._spawnChildFallback(npxPath, args, cwd, envVars);
        } catch (spawnErr: any) {
          if (!usedFallback && /ENOENT/i.test(spawnErr?.message || '')) {
            log.warn('[dsh-process] child spawn ENOENT, retry via npm exec');
            const fb = buildNpmExecFallback(this.nodePath, args);
            Object.assign(envVars, fb.envAdd);
            await this._spawnChildFallback(fb.executable, fb.args, cwd, envVars);
          } else {
            throw spawnErr;
          }
        }
      }

      const url = `http://127.0.0.1:${port}`;
      log.info('[dsh-process] waiting for HTTP ready', url);
      await waitForHttpReady(url, {
        timeoutMs: DSH_READY_TIMEOUT_MS,
        intervalMs: DSH_READY_CHECK_INTERVAL_MS,
        successCount: 2,
      });
      this._set('running', { port, url });
    } catch (e: any) {
      log.error('[dsh-process] start failed:', e?.message || e);
      await this._cleanupNoThrow();
      this._set('error', { error: e?.message || String(e) });
      throw e;
    }
  }

  async stop(timeoutMs = DSH_STOP_TIMEOUT_MS): Promise<void> {
    if (this._status === 'idle' || this._status === 'stopping') return;
    this._set('stopping');
    log.info('[dsh-process] stopping timeoutMs=', timeoutMs, 'pid=', this._pid);
    const stopped = this._onProcessExit._done;
    const deadline = Date.now() + timeoutMs;
    // Try to send graceful kill through PTY or platform-specific kill
    try {
      if (this._pty) {
        if (process.platform === 'win32') {
          // pty.kill() sends WM_CLOSE-like on Windows; fallthrough on timeout
          this._pty.kill();
        } else {
          this._pty.write('\x03'); // Ctrl+C first
          setTimeout(() => this._pty?.kill('SIGTERM'), 1500);
        }
      }
      this._cleanup?.();
    } catch (e) {
      log.warn('[dsh-process] graceful kill issue', (e as any).message);
    }
    // Wait for status to become idle/error
    while (Date.now() < deadline) {
      if (this._status === 'idle' || this._status === 'error') return;
      await new Promise((r) => setTimeout(r, 100));
    }
    // Force kill by PID if still alive
    if (this._pid) await forceKillPid(this._pid);
    this._set('idle', { pid: undefined, port: undefined, url: undefined });
  }

  async restart(port: number): Promise<void> {
    await this.stop();
    await new Promise((r) => setTimeout(r, 300));
    await this.start(port);
  }

  writeToStdin(data: string): void {
    try {
      this._pty?.write(data);
    } catch {}
  }

  // -------- fallback via child_process when node-pty unavailable --------
  private async _spawnChildFallback(
    npxPath: string,
    args: string[],
    cwd: string,
    env: Record<string, string>,
  ) {
    const { spawn } = await import('node:child_process');
    const child = spawn(npxPath, args, {
      cwd,
      env: env as any,
      shell: process.platform === 'win32',
    });
    this._pid = child.pid;
    child.stdout?.on('data', (d) => this.emit('stdout', String(d)));
    child.stderr?.on('data', (d) => this.emit('stderr', String(d)));
    child.on('close', (code, sig) => this._onProcessExit(code ?? undefined, sig ?? undefined));
    child.on('error', (e) => {
      log.error('[dsh-process] child error', e.message);
      this._onProcessExit(undefined, undefined, e.message);
    });
    this._cleanup = () => {
      try {
        if (process.platform === 'win32') child.kill('SIGTERM');
        else child.kill('SIGINT');
        setTimeout(() => child.kill('SIGKILL'), 2000).unref();
      } catch {}
    };
  }

  private _onProcessExit = (
    code?: number,
    signal?: string,
    extraErr?: string,
  ) => {
    (this._onProcessExit as any)._done = true;
    if (this._status === 'stopping' || this._status === 'idle') {
      this._set('idle', { pid: undefined, port: undefined, url: undefined });
      return;
    }
    const msg = extraErr ||
      `Process exited with code ${code ?? 'unknown'}${signal ? ' signal=' + signal : ''}`;
    log.warn('[dsh-process] process exit unexpected:', msg);
    this._set('error', { error: msg, pid: undefined });
    this.emit('stderr', `\r\n[DSH Desktop] ${msg}\r\n`);
  };

  private async _cleanupNoThrow() {
    try {
      this._cleanup?.();
    } catch {}
    if (this._pid) {
      try {
        await forceKillPid(this._pid);
      } catch {}
    }
    this._pty = undefined;
    this._cleanup = undefined;
  }

  private _set(
    status: DshStatus,
    extra: Partial<DshStatusInfo> = {},
  ) {
    this._status = status;
    if ('port' in extra && extra.port !== undefined) this._port = extra.port;
    if ('url' in extra && extra.url !== undefined) this._url = extra.url;
    if ('error' in extra) this._error = extra.error;
    if ('pid' in extra) this._pid = extra.pid;
    const info = this.getStatusInfo();
    this.emit('status', info);
  }
}

function quote(s: string): string {
  if (/[\s"]/.test(s)) return `"${s.replace(/"/g, '\\"')}"`;
  return s;
}

async function forceKillPid(pid: number): Promise<void> {
  const { exec } = await import('node:child_process');
  const run = (cmd: string) =>
    new Promise<void>((resolve) => exec(cmd, () => resolve()));
  if (process.platform === 'win32') {
    await run(`taskkill /F /T /PID ${pid} 2>nul`);
  } else {
    await run(`kill -TERM ${pid} 2>/dev/null || true`);
    await new Promise((r) => setTimeout(r, 300));
    await run(`kill -KILL ${pid} 2>/dev/null || true`);
  }
}
