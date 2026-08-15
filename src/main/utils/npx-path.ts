import path from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Given the absolute path to a node executable, resolve the companion `npx` /
 * `npx.cmd` executable. Falls back to the plain `'npx'` string (PATH lookup)
 * when no bundled npx can be located next to the node binary.
 */
export async function resolveNpxExecutable(
  nodePath: string,
): Promise<string> {
  const isWin = process.platform === 'win32';
  const npxBinName = isWin ? 'npx.cmd' : 'npx';
  const dir = path.dirname(path.resolve(nodePath));
  // Portable Node distributions:
  //   win/linux: <root>/npx[.cmd]      (files live at the same level as node)
  //   some linux tarballs: <root>/bin/npx
  //   macOS pkg style: /usr/local/bin/node + /usr/local/bin/npx
  const candidates = [
    path.join(dir, npxBinName),
    path.join(dir, 'bin', npxBinName),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {}
  }

  // Nothing bundled; hope the environment has npx in PATH.
  return 'npx';
}
