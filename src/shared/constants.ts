export const DEFAULT_PREFERRED_PORT = 3080;
export const PORT_SCAN_RANGE = 20;
export const MIN_NODE_VERSION = '22.15.0';
export const BUNDLED_NODE_VERSION = '22.15.0';
export const DSH_READY_TIMEOUT_MS = 120_000;
export const DSH_STOP_TIMEOUT_MS = 10_000;
export const DSH_PACKAGE = '@deepseek-ai/dsh';
export const DSH_READY_CHECK_INTERVAL_MS = 500;

/**
 * dsh 版本同步策略
 *
 * - DSH_DEFAULT_VERSION: 构建时锁定的默认版本，用 `latest` 或具体 semver
 *   开发者通过 `npm run sync:dsh` 脚本更新此值
 * - 运行时用户可在 Settings 中覆盖（存储到 electron-store）
 * - npx 调用形如 `npx -y @deepseek-ai/dsh@<version> web ...`
 */
export const DSH_DEFAULT_VERSION = 'latest';

/** npm registry 地址，用于查询 dsh 最新版本 */
export const NPM_REGISTRY = 'https://registry.npmjs.org';

/** dsh 版本查询超时 */
export const DSH_VERSION_CHECK_TIMEOUT_MS = 15_000;

export const NODE_DIST_BASE =
  'https://nodejs.org/dist';

export function getNodeDistUrl(
  version: string,
  platform: 'win32' | 'darwin' | 'linux',
  arch: 'x64' | 'arm64',
): { url: string; filename: string; folder: string; kind: 'zip' | 'tar' } {
  const platformName = {
    win32: 'win',
    darwin: 'darwin',
    linux: 'linux',
  }[platform];
  const v = version.startsWith('v') ? version : `v${version}`;
  const folder = `node-${v}-${platformName}-${arch}`;
  if (platform === 'win32') {
    return {
      url: `${NODE_DIST_BASE}/${v}/${folder}.zip`,
      filename: `${folder}.zip`,
      folder,
      kind: 'zip',
    };
  }
  return {
    url: `${NODE_DIST_BASE}/${v}/${folder}.tar.gz`,
    filename: `${folder}.tar.gz`,
    folder,
    kind: 'tar',
  };
}
