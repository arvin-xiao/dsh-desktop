import path from 'node:path';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';

/**
 * 在 GUI 应用（特别是 macOS）里 process.env.PATH 通常不包含 Homebrew
 * 等自定义路径。返回一组"应该加进 PATH"的目录，供启动子进程前补全。
 */
export function getExtraPathDirs(): string[] {
  const dirs = new Set<string>();
  const home = process.env.HOME || process.env.USERPROFILE || '';

  if (process.platform === 'darwin') {
    // Homebrew Apple Silicon (M 系列)
    dirs.add('/opt/homebrew/bin');
    dirs.add('/opt/homebrew/sbin');
    // Homebrew Intel
    dirs.add('/usr/local/bin');
    dirs.add('/usr/local/sbin');
    // macOS pkg 安装的 Node
    dirs.add('/usr/local/bin');
    dirs.add('/opt/local/bin'); // MacPorts
  } else if (process.platform === 'linux') {
    dirs.add('/usr/local/bin');
    dirs.add('/usr/bin');
    dirs.add('/home/linuxbrew/.linuxbrew/bin');
  } else if (process.platform === 'win32') {
    // nvm-windows / nodist / 常见 Node 安装路径
    if (process.env.NVM_SYMLINK) dirs.add(process.env.NVM_SYMLINK);
    if (process.env.NVM_HOME) dirs.add(process.env.NVM_HOME);
    dirs.add(path.join(process.env.ProgramData || 'C:\\ProgramData', 'nvm'));
    dirs.add(path.join(process.env.APPDATA || process.env.UserProfile || 'C:\\Users', 'npm'));
  }

  // NVM
  if (home) {
    dirs.add(path.join(home, '.nvm', 'versions', 'node', 'current', 'bin'));
  }
  // Nodenv
  if (home) dirs.add(path.join(home, '.nodenv', 'shims'));
  if (process.env.NODENV_ROOT) dirs.add(path.join(process.env.NODENV_ROOT, 'shims'));
  // asdf
  if (home) dirs.add(path.join(home, '.asdf', 'shims'));
  if (process.env.ASDF_DIR) dirs.add(path.join(process.env.ASDF_DIR, 'shims'));
  // Volta
  if (home) dirs.add(path.join(home, '.volta', 'bin'));
  if (process.env.VOLTA_HOME) dirs.add(path.join(process.env.VOLTA_HOME, 'bin'));
  // fnm
  if (process.env.FNM_MULTISHELL_PATH) dirs.add(process.env.FNM_MULTISHELL_PATH);
  if (home) dirs.add(path.join(home, '.local', 'share', 'fnm'));

  return Array.from(dirs).filter((p) => p && p.length > 1);
}

/**
 * 返回一个 PATH 字符串（补全了常见包管理器目录）。
 */
export function buildAugmentedPath(originalPath?: string): string {
  const existing = (originalPath || process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const extras = getExtraPathDirs().filter((d) => !existing.includes(d) && existsSync(d));
  // 把 extras 放在前面，优先让用户安装的 Node / npx 生效
  return [...extras, ...existing].join(path.delimiter);
}

/**
 * 在补全后的 PATH 里 which 一个可执行文件，返回绝对路径或 null。
 */
export function whichInPath(binName: string, envPath?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const PATH = buildAugmentedPath(envPath);
    const opts: any = { env: { ...process.env, PATH } };
    const exe = process.platform === 'win32' ? (binName.endsWith('.cmd') || binName.endsWith('.exe') ? binName : binName + '.cmd') : binName;
    execFile(
      process.platform === 'win32' ? 'where' : 'which',
      process.platform === 'win32' ? [exe] : [binName],
      opts,
      (err, stdout) => {
        if (err) return resolve(null);
        const raw = String(stdout || '').split(/\r?\n/)[0]?.trim();
        if (!raw) return resolve(null);
        // `which` on macOS escapes spaces with backslashes: /path/with\ spaces/npx
        // Unescape them so the returned path is usable with existsSync / path.resolve
        const unescaped = raw.replace(/\\ /g, ' ');
        resolve(unescaped || null);
      },
    );
  });
}

/**
 * Check if a given nodePath is the Electron packaged app's own binary
 * (not a real Node.js installation). In that case there is no sibling
 * npx/npm, so we should fall back to npm exec via the bare `npm` name.
 */
export function isElectronBinaryPath(nodePath: string): boolean {
  if (!nodePath) return false;
  const ep = (process as any).execPath as string | undefined;
  if (!ep) return false;
  const np = path.resolve(nodePath);
  const epn = path.resolve(ep);
  if (np === epn) return true;
  // Inside the electron .app bundle (macOS: ...app/Contents/...)
  const appContentsDir = path.resolve(path.dirname(epn), '..');
  try {
    const rel = path.relative(appContentsDir, np);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return true;
  } catch {}
  return false;
}

/**
 * Given the absolute path to a node executable, resolve the companion `npx` /
 * `npx.cmd` executable. Strategy:
 *   0) if the nodePath is the Electron binary, return '' (caller must use npm exec)
 *   1) look in node's dir (and ../bin relative) for bundled npx
 *   2) which npx in augmented PATH
 *   3) fall back to 'npx' (bare name lookup)
 */
export async function resolveNpxExecutable(
  nodePath: string,
): Promise<string> {
  const isWin = process.platform === 'win32';
  const npxBinName = isWin ? 'npx.cmd' : 'npx';

  // Guard: if nodePath is the Electron binary, there's no npx alongside it
  if (isElectronBinaryPath(nodePath)) {
    return '';
  }

  // Case A: bundled alongside node
  if (nodePath && existsSync(nodePath)) {
    const dir = path.dirname(path.resolve(nodePath));
    const candidates = [
      path.join(dir, npxBinName),
      path.join(dir, 'bin', npxBinName),
    ];
    for (const c of candidates) {
      try {
        if (existsSync(c)) return c;
      } catch {}
    }
  }

  // Case B: which in augmented PATH (already unescaped in whichInPath)
  const found = await whichInPath(npxBinName);
  if (found) {
    const normalized = path.resolve(found);
    if (existsSync(normalized)) return normalized;
    return normalized;
  }

  // Case C: bare name — caller must ensure env.PATH is augmented when spawning
  return 'npx';
}

/**
 * When `npx` cannot be located even by resolveNpxExecutable — i.e. the user's
 * Node setup has no companion `npx` on disk — we can fall back to spawning
 * `node` directly with `npm exec` (or `npm.cmd exec` on Windows).
 *
 * Returns `{ executable, args }` that you spawn in place of `npxPath + args`.
 * `npxArgs` should be the original args you were going to give to npx, minus
 * the leading `-y` (we handle it via npm_config_yes=true in env instead).
 */
export function buildNpmExecFallback(
  nodePath: string,
  npxArgs: string[],
): { executable: string; args: string[]; envAdd: Record<string, string> } {
  const dir = path.dirname(path.resolve(nodePath));
  const isWin = process.platform === 'win32';
  const npmName = isWin ? 'npm.cmd' : 'npm';
  const candidates = [path.join(dir, npmName), path.join(dir, 'bin', npmName)];
  let npmPath: string | null = null;
  for (const c of candidates) if (existsSync(c)) { npmPath = c; break; }
  if (!npmPath) npmPath = npmName;

  // Drop leading -y if present (handled via env npm_config_yes)
  const rest = npxArgs[0] === '-y' ? npxArgs.slice(1) : npxArgs.slice();
  // npm exec -- <pkg> web --port ...
  return {
    executable: npmPath,
    args: ['exec', '--', ...rest],
    envAdd: { npm_config_yes: 'true' },
  };
}
