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
        const line = String(stdout || '').split(/\r?\n/)[0]?.trim();
        resolve(line || null);
      },
    );
  });
}

/**
 * Given the absolute path to a node executable, resolve the companion `npx` /
 * `npx.cmd` executable. Strategy:
 *   1) look in node's dir (and ../bin relative) for bundled npx
 *   2) which npx in augmented PATH
 *   3) fall back to 'npx' (bare name lookup)
 */
export async function resolveNpxExecutable(
  nodePath: string,
): Promise<string> {
  const isWin = process.platform === 'win32';
  const npxBinName = isWin ? 'npx.cmd' : 'npx';

  // Case A: bundled alongside node
  if (nodePath && existsSync(nodePath)) {
    const dir = path.dirname(path.resolve(nodePath));
    const candidates = [
      path.join(dir, npxBinName),
      path.join(dir, 'bin', npxBinName),
      // Homebrew puts them both in the same dir under /opt/homebrew/bin
      // so path.join(dir, npxBinName) covers the common case
    ];
    for (const c of candidates) {
      try {
        if (existsSync(c)) return c;
      } catch {}
    }
    // Also try sibling npm because `npm exec` can always run dsh when npx is missing
    const npmName = isWin ? 'npm.cmd' : 'npm';
    for (const c of [path.join(dir, npmName), path.join(dir, 'bin', npmName)]) {
      try {
        if (existsSync(c)) {
          // Record for use by runViaNpmExec helper later, but as an executable path
          // we still want npx. Fall through to which below.
          break;
        }
      } catch {}
    }
  }

  // Case B: which in augmented PATH
  const found = await whichInPath(npxBinName);
  if (found) return found;

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
