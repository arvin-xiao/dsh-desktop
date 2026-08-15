#!/usr/bin/env node
/**
 * 开发同步脚本：查询 npm registry 上 @deepseek-ai/dsh 的最新版本，
 * 并将 src/shared/constants.ts 中的 DSH_DEFAULT_VERSION 更新为该版本。
 *
 * 用法：
 *   npm run sync:dsh              # 查询并更新到最新
 *   npm run sync:dsh -- 1.2.3     # 手动指定版本
 *   npm run sync:dsh -- --check   # 仅检查，不修改文件
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CONSTANTS_FILE = resolve(ROOT, 'src/shared/constants.ts');
const REGISTRY = 'https://registry.npmjs.org/@deepseek-ai/dsh/latest';

async function getLatestVersion() {
  const res = await fetch(REGISTRY, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`npm registry returned ${res.status}`);
  const data = await res.json();
  if (!data.version) throw new Error('no version field in registry response');
  return data.version;
}

function updateConstants(version) {
  const content = readFileSync(CONSTANTS_FILE, 'utf8');
  // Match: export const DSH_DEFAULT_VERSION = 'latest';
  const regex = /(export const DSH_DEFAULT_VERSION\s*=\s*['"])([^'"]*)(['"])/;
  if (!regex.test(content)) {
    throw new Error('Could not find DSH_DEFAULT_VERSION in constants.ts');
  }
  const updated = content.replace(regex, `$1${version}$3`);
  writeFileSync(CONSTANTS_FILE, updated, 'utf8');
  console.log(`Updated DSH_DEFAULT_VERSION -> ${version} in src/shared/constants.ts`);
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const manualVersion = args.find((a) => !a.startsWith('--'));

  let version;
  if (manualVersion) {
    version = manualVersion;
    console.log(`Using manually specified version: ${version}`);
  } else {
    console.log('Querying npm registry for @deepseek-ai/dsh latest...');
    version = await getLatestVersion();
    console.log(`Latest version: ${version}`);
  }

  if (checkOnly) {
    // Read current value
    const content = readFileSync(CONSTANTS_FILE, 'utf8');
    const m = content.match(/export const DSH_DEFAULT_VERSION\s*=\s*['"]([^'"]*)['"]/);
    const current = m ? m[1] : 'unknown';
    console.log(`Current DSH_DEFAULT_VERSION: ${current}`);
    if (current !== version) {
      console.log(`Update available: ${current} -> ${version}`);
      process.exit(1); // exit code 1 to signal "update available"
    } else {
      console.log('Already up to date.');
    }
    return;
  }

  updateConstants(version);
  console.log('Done. Run `npm run build` to rebuild with the new version.');
}

main().catch((e) => {
  console.error('Error:', e.message || e);
  process.exit(1);
});
