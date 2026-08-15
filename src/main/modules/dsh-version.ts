import { spawn } from 'node:child_process';
import { app } from 'electron';
import semver from 'semver';
import {
  DSH_PACKAGE,
  DSH_DEFAULT_VERSION,
  NPM_REGISTRY,
  DSH_VERSION_CHECK_TIMEOUT_MS,
} from '../../shared/constants';
import type { DshVersionInfo } from '../../shared/types';
import { resolveNpxExecutable } from '../utils/npx-path';
import { log } from '../utils/logger';

/**
 * 拼接带版本号的包名：@deepseek-ai/dsh@1.2.0 或 @deepseek-ai/dsh@latest
 */
export function getDshPackageSpec(version: string): string {
  const v = version.trim() || 'latest';
  return `${DSH_PACKAGE}@${v}`;
}

/**
 * 查询 npm registry 上 dsh 的最新版本
 */
export async function getLatestDshVersion(): Promise<string | null> {
  const url = `${NPM_REGISTRY}/${DSH_PACKAGE}/latest`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DSH_VERSION_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      log.warn('[dsh-version] npm registry returned', res.status);
      return null;
    }
    const data: any = await res.json();
    const ver = data?.version as string | undefined;
    if (ver && semver.valid(ver)) return ver;
    log.warn('[dsh-version] unexpected registry payload', JSON.stringify(data).slice(0, 200));
    return null;
  } catch (e: any) {
    log.warn('[dsh-version] failed to query npm registry:', e?.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 获取当前已安装（npx 缓存中）的 dsh 版本
 */
export async function getInstalledDshVersion(nodePath: string): Promise<string | null> {
  const npxPath = await resolveNpxExecutable(nodePath);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), DSH_VERSION_CHECK_TIMEOUT_MS);
    const child = spawn(npxPath, ['-y', DSH_PACKAGE, '--version'], {
      cwd: app.getPath('home'),
      env: { ...process.env, npm_config_yes: 'true' } as any,
      shell: process.platform === 'win32',
    });
    let out = '';
    child.stdout?.on('data', (d) => (out += String(d)));
    child.stderr?.on('data', () => {});
    child.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        log.warn('[dsh-version] getInstalledDshVersion exit code', code);
        resolve(null);
        return;
      }
      const m = out.trim().match(/(\d+\.\d+\.\d+[^\s]*)/);
      resolve(m ? m[1] : (out.trim() || null));
    });
  });
}

/**
 * 执行版本检查：对比 installed / latest / target
 */
export async function checkDshVersion(
  nodePath: string,
  targetVersion: string,
): Promise<DshVersionInfo> {
  log.info('[dsh-version] checking updates, target=', targetVersion);
  const [installed, latest] = await Promise.all([
    getInstalledDshVersion(nodePath),
    getLatestDshVersion(),
  ]);

  let updateAvailable = false;
  if (installed && latest) {
    updateAvailable = semver.lt(installed, latest);
  } else if (!installed && latest) {
    // 未安装但有最新版
    updateAvailable = true;
  }

  const info: DshVersionInfo = {
    installedVersion: installed,
    latestVersion: latest,
    targetVersion,
    updateAvailable,
    checkedAt: Date.now(),
  };
  log.info('[dsh-version] check result:', JSON.stringify(info));
  return info;
}

/**
 * 升级 dsh：通过 npx 拉取指定版本并预热缓存
 *
 * @param nodePath  node 可执行文件路径
 * @param version   要升级到的版本（'latest' 或具体 semver）
 * @param onProgress 可选回调，接收 npx 输出
 */
export async function upgradeDsh(
  nodePath: string,
  version: string,
  onProgress?: (chunk: string) => void,
): Promise<string> {
  const npxPath = await resolveNpxExecutable(nodePath);
  const spec = getDshPackageSpec(version);
  log.info('[dsh-version] upgrading to', spec);

  return new Promise((resolve, reject) => {
    const child = spawn(npxPath, ['-y', spec, '--version'], {
      cwd: app.getPath('home'),
      env: { ...process.env, npm_config_yes: 'true' } as any,
      shell: process.platform === 'win32',
    });
    let out = '';
    let errBuf = '';
    child.stdout?.on('data', (d) => {
      const s = String(d);
      out += s;
      onProgress?.(s);
    });
    child.stderr?.on('data', (d) => {
      const s = String(d);
      errBuf += s;
      onProgress?.(s);
    });
    child.on('error', (e) => {
      log.error('[dsh-version] upgrade spawn error:', e.message);
      reject(new Error(`Failed to spawn npx: ${e.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        const m = out.trim().match(/(\d+\.\d+\.\d+[^\s]*)/);
        const resolved = m ? m[1] : out.trim();
        log.info('[dsh-version] upgrade done, resolved version:', resolved);
        resolve(resolved || version);
      } else {
        reject(new Error(`Upgrade failed (exit ${code}): ${errBuf || out}`));
      }
    });
  });
}
