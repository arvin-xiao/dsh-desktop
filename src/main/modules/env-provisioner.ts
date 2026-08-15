import { execFile, spawn } from 'node:child_process';
import { app } from 'electron';
import { createWriteStream, existsSync, mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import * as tar from 'tar';
import yauzl from 'yauzl-promise';
import type { EnvReport } from '../../shared/types';
import {
  BUNDLED_NODE_VERSION,
  DSH_PACKAGE,
  DSH_DEFAULT_VERSION,
  MIN_NODE_VERSION,
  getNodeDistUrl,
} from '../../shared/constants';
import { log } from '../utils/logger';
import { resolveNpxExecutable, buildNpmExecFallback, buildAugmentedPath } from '../utils/npx-path';
import { getDshPackageSpec } from './dsh-version';

export class EnvProvisioner {
  readonly cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir =
      cacheDir || path.join(app.getPath('userData'), 'cache');
    mkdirSync(this.cacheDir, { recursive: true });
  }

  /** 检测并报告当前 Node / dsh 状态 */
  async inspect(
    options: {
      useSystemNode?: boolean;
      skipNodeVersionCheck?: boolean;
      preferBundledVersion?: string;
      dshVersion?: string;
    } = {},
  ): Promise<EnvReport> {
    const {
      useSystemNode = true,
      skipNodeVersionCheck = false,
      preferBundledVersion = BUNDLED_NODE_VERSION,
      dshVersion = DSH_DEFAULT_VERSION,
    } = options;

    const systemNode = await this.findSystemNode();
    const systemNodeSatisfies =
      !!systemNode && (skipNodeVersionCheck || semver.gte(systemNode.version, MIN_NODE_VERSION));
    const bundledNode = await this.findBundledNode(preferBundledVersion);

    let effectiveNodePath = '';
    if (useSystemNode && systemNodeSatisfies && systemNode) {
      effectiveNodePath = systemNode.path;
    } else if (bundledNode) {
      effectiveNodePath = bundledNode.path;
    } else if (systemNode) {
      // 系统 Node 版本不够但没有便携版时，只能退而求其次，让用户看见报错
      effectiveNodePath = systemNode.path;
    }

    let dshInstalled = false;
    let resolvedDshVersion: string | undefined;
    if (effectiveNodePath) {
      const r = await this.tryRunDshVersion(effectiveNodePath, dshVersion).catch((e) => {
        log.warn('[env] check dsh version failed', e?.message || e);
        return null;
      });
      if (r && r.ok) {
        dshInstalled = true;
        resolvedDshVersion = r.version;
      }
    }

    return {
      systemNode,
      systemNodeSatisfies,
      bundledNode,
      effectiveNodePath,
      dshInstalled,
      dshVersion: resolvedDshVersion,
    };
  }

  /** 下载便携 Node 并返回 node 可执行文件路径 */
  async downloadBundledNode(
    platform: NodeJS.Platform,
    arch: string,
    onProgress?: (pct: number, bytesPerSec: number) => void,
    version = BUNDLED_NODE_VERSION,
  ): Promise<string> {
    if (platform !== 'win32' && platform !== 'darwin' && platform !== 'linux') {
      throw new Error(`Unsupported platform ${platform}`);
    }
    if (arch !== 'x64' && arch !== 'arm64') {
      throw new Error(`Unsupported arch ${arch}`);
    }
    const info = getNodeDistUrl(version, platform, arch);
    const destDir = path.join(this.cacheDir, info.folder);
    if (existsSync(destDir)) {
      const nodePath = this.locateNodeBinary(destDir, platform);
      if (nodePath) return nodePath;
    }
    const archivePath = path.join(this.cacheDir, info.filename);
    await this.downloadFile(info.url, archivePath, onProgress);
    if (info.kind === 'zip') {
      await this.unzip(archivePath, this.cacheDir);
    } else {
      await tar.x({ file: archivePath, cwd: this.cacheDir });
    }
    try {
      await fs.unlink(archivePath);
    } catch {}
    const nodePath = this.locateNodeBinary(destDir, platform);
    if (!nodePath) {
      throw new Error(`Node binary not found after extraction in ${destDir}`);
    }
    return nodePath;
  }

  /** 运行 npx -y @deepseek-ai/dsh@<version> --version 预热缓存 */
  async ensureDshInstalled(
    effectiveNodePath: string,
    onData?: (chunk: string) => void,
    version: string = DSH_DEFAULT_VERSION,
  ): Promise<void> {
    const spec = getDshPackageSpec(version);
    const baseArgs: string[] = ['-y', spec, '--version'];
    let exe = await resolveNpxExecutable(effectiveNodePath);
    let args = baseArgs;
    const env: Record<string, string> = {
      ...process.env,
      PATH: buildAugmentedPath(),
      npm_config_yes: 'true',
    };
    if (!exe || !path.isAbsolute(exe) || !existsSync(exe)) {
      const fb = buildNpmExecFallback(effectiveNodePath, baseArgs);
      log.warn('[env] ensureDshInstalled: npx not found on disk → use npm exec via', fb.executable);
      exe = fb.executable;
      args = fb.args;
      Object.assign(env, fb.envAdd);
    }
    return new Promise((resolve, reject) => {
      const cwd = app.getPath('home');
      const child = spawn(exe, args, {
        cwd,
        env: env as any,
        shell: process.platform === 'win32',
      });
      let buf = '';
      let errBuf = '';
      child.stdout?.on('data', (d) => {
        const s = String(d);
        buf += s;
        onData?.(s);
      });
      child.stderr?.on('data', (d) => {
        const s = String(d);
        errBuf += s;
        onData?.(s);
      });
      child.on('error', (e) => {
        // Last-ditch retry with npm exec fallback path logic
        if (/ENOENT/i.test((e as any).message || '')) {
          const fb = buildNpmExecFallback(effectiveNodePath, baseArgs);
          log.warn('[env] ensureDshInstalled spawn ENOENT → retry via', fb.executable);
          const fbEnv = { ...env, ...fb.envAdd, PATH: buildAugmentedPath(env.PATH) };
          const r = spawn(fb.executable, fb.args, {
            cwd, env: fbEnv as any, shell: process.platform === 'win32',
          });
          r.stdout?.on('data', (d) => { const s = String(d); buf += s; onData?.(s); });
          r.stderr?.on('data', (d) => { const s = String(d); errBuf += s; onData?.(s); });
          r.on('error', reject);
          r.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ensureDshInstalled failed code=${code}: ${errBuf || buf}`));
          });
        } else {
          reject(e);
        }
      });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ensureDshInstalled failed code=${code}: ${errBuf || buf}`));
      });
    });
  }

  // ------------------------------------------------------------------
  // internals
  // ------------------------------------------------------------------

  private async findSystemNode(): Promise<{ path: string; version: string } | null> {
    // IMPORTANT: in packaged Electron apps, `process.execPath` is the app's
    // own binary (e.g. .../DSH Desktop.app/Contents/MacOS/DSH Desktop) which
    // IS a node runtime but has no sibling `npx` / `npm`. Never return it as
    // "system node" — prefer actual user installed nodes. Only ever fall back
    // to it after exhausting real candidates AND the caller knows the risk.
    const isElectronPackagedApp =
      (typeof (process.versions as any).electron === 'string') &&
      !/[\\/]node_modules?[\\/]/.test(process.execPath);

    const candidates: string[] = [];
    if (process.platform === 'win32') {
      candidates.push('node.exe');
    } else if (process.platform === 'darwin') {
      // Homebrew Apple Silicon first, then Intel/standard / MacPorts
      candidates.push(
        '/opt/homebrew/bin/node',
        '/usr/local/bin/node',
        '/opt/local/bin/node',
        '/usr/bin/node',
      );
    } else {
      candidates.push('/usr/local/bin/node', '/usr/bin/node');
    }
    // which/where find（此时 PATH 已经在 boot 阶段补全过）
    try {
      const found = await this.whichNode();
      if (found && !candidates.includes(found)) candidates.push(found);
    } catch {}

    for (const p of candidates) {
      // Skip Electron's own binary masquerading as a "node on PATH"
      if (isElectronPackagedApp && p === process.execPath) continue;
      try {
        const v = await this.getNodeVersion(p);
        if (v) return { path: p, version: v };
      } catch {}
    }

    // Last resort: bundled portable Node (external, never Electron binary)
    // Do NOT use process.execPath because it has no npx/npm sibling.
    return null;
  }

  private whichNode(): Promise<string | null> {
    return new Promise((resolve) => {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      execFile(cmd, ['node'], (err, stdout) => {
        if (err) return resolve(null);
        const line = String(stdout || '').split(/\r?\n/)[0]?.trim();
        resolve(line || null);
      });
    });
  }

  private getNodeVersion(bin: string): Promise<string | null> {
    return new Promise((resolve) => {
      execFile(bin, ['--version'], (err, stdout) => {
        if (err) return resolve(null);
        const raw = String(stdout || '').trim();
        if (!raw) return resolve(null);
        const m = raw.match(/v?(\d+\.\d+\.\d+)/);
        if (!m) return resolve(raw);
        resolve(m[0].startsWith('v') ? m[0] : `v${m[0]}`);
      });
    });
  }

  private async findBundledNode(version: string): Promise<{ path: string; version: string } | null> {
    const info = getNodeDistUrl(version, process.platform as any, process.arch as any);
    const destDir = path.join(this.cacheDir, info.folder);
    if (!existsSync(destDir)) return null;
    const nodePath = this.locateNodeBinary(destDir, process.platform);
    if (!nodePath) return null;
    const v = await this.getNodeVersion(nodePath);
    if (!v) return null;
    return { path: nodePath, version: v };
  }

  private locateNodeBinary(folder: string, platform: NodeJS.Platform): string | null {
    const name = platform === 'win32' ? 'node.exe' : 'node';
    const places = [
      path.join(folder, name),
      path.join(folder, 'bin', name),
    ];
    for (const p of places) if (existsSync(p)) return p;
    return null;
  }

  private async tryRunDshVersion(
    nodePath: string,
    version: string = DSH_DEFAULT_VERSION,
  ): Promise<{ ok: true; version: string } | { ok: false }> {
    const baseArgs: string[] = ['-y', getDshPackageSpec(version), '--version'];
    let exe = await resolveNpxExecutable(nodePath);
    let args = baseArgs;
    const env: Record<string, string> = {
      ...process.env,
      PATH: buildAugmentedPath(),
      npm_config_yes: 'true',
    };
    if (!exe || !path.isAbsolute(exe) || !existsSync(exe)) {
      const fb = buildNpmExecFallback(nodePath, baseArgs);
      exe = fb.executable;
      args = fb.args;
      Object.assign(env, fb.envAdd);
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(
        () => resolve({ ok: false }),
        15_000,
      );
      const spawnOne = (e: string, a: string[]) => {
        const child = spawn(e, a, {
          cwd: app.getPath('home'),
          env: env as any,
          shell: process.platform === 'win32',
        });
        let out = '';
        child.stdout?.on('data', (d) => (out += String(d)));
        child.stderr?.on('data', () => {});
        child.on('error', (err) => {
          // If ENOENT and we haven't used fallback yet, retry via npm exec
          clearTimeout(timeout);
          if (!/ENOENT/.test((err as any).message || '')) return resolve({ ok: false });
          const fb = buildNpmExecFallback(nodePath, baseArgs);
          const fbEnv = { ...env, ...fb.envAdd, PATH: buildAugmentedPath(env.PATH) };
          const r = spawn(fb.executable, fb.args, {
            cwd: app.getPath('home'), env: fbEnv as any, shell: process.platform === 'win32',
          });
          const t2 = setTimeout(() => resolve({ ok: false }), 15_000);
          let out2 = '';
          r.stdout?.on('data', (d) => (out2 += String(d)));
          r.stderr?.on('data', () => {});
          r.on('error', () => { clearTimeout(t2); resolve({ ok: false }); });
          r.on('close', (code) => {
            clearTimeout(t2);
            if (code === 0) {
              const m = out2.trim().match(/(\d+\.\d+\.\d+[^\s]*)/);
              resolve({ ok: true, version: m ? m[1] : out2.trim() });
            } else resolve({ ok: false });
          });
        });
        child.on('close', (code) => {
          clearTimeout(timeout);
          if (code === 0) {
            const m = out.trim().match(/(\d+\.\d+\.\d+[^\s]*)/);
            resolve({ ok: true, version: m ? m[1] : out.trim() });
          } else {
            resolve({ ok: false });
          }
        });
      };
      spawnOne(exe, args);
    });
  }

  private downloadFile(
    url: string,
    dest: string,
    onProgress?: (pct: number, bytesPerSec: number) => void,
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      mkdirSync(path.dirname(dest), { recursive: true });
      try {
        const res = await fetch(url);
        if (!res.ok || !res.body) {
          return reject(new Error(`download ${url} failed: ${res.status}`));
        }
        const total = Number(res.headers.get('content-length')) || 0;
        const writer = createWriteStream(dest);
        const reader = res.body.getReader();
        let received = 0;
        let lastTs = Date.now();
        let lastBytes = 0;
        // @ts-ignore
        for await (const chunk of res.body as any) {
          received += chunk.length;
          writer.write(chunk);
          const now = Date.now();
          if (now - lastTs > 250) {
            const elapsed = (now - lastTs) / 1000 || 0.001;
            const bps = (received - lastBytes) / elapsed;
            lastTs = now;
            lastBytes = received;
            if (onProgress) {
              onProgress(total ? received / total : 0, bps);
            }
          }
        }
        try {
          await reader.closed;
        } catch {}
        writer.end(() => resolve());
      } catch (e) {
        reject(e);
      }
    });
  }

  private async unzip(archive: string, outDir: string): Promise<void> {
    const zip = await yauzl.open(archive);
    try {
      for await (const entry of zip) {
        if (entry.filename.endsWith('/')) {
          await fs.mkdir(path.join(outDir, entry.filename), { recursive: true });
          continue;
        }
        const read = await entry.openReadStream();
        const target = path.join(outDir, entry.filename);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await new Promise<void>((resolve, reject) => {
          const writer = createWriteStream(target);
          read.on('error', reject);
          writer.on('error', reject);
          writer.on('finish', () => resolve());
          read.pipe(writer);
        });
        // Unix zip may have executable bits for node
        try {
          if (path.basename(entry.filename) === 'node' || path.basename(entry.filename) === 'node.exe') {
            await fs.chmod(target, 0o755);
          }
        } catch {}
      }
    } finally {
      await zip.close();
    }
  }
}
