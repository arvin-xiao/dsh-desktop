#!/usr/bin/env node
/**
 * DSH Desktop 发布脚本
 *
 * 功能：
 *   1. 读取 package.json version + constants.ts DSH_DEFAULT_VERSION
 *      → 合成 release tag：v<desktop>+dsh<dsh>   （例：v0.1.0+dsh0.1.0-rc.6）
 *   2. （可选）执行 npm run build 与 npm run dist:<platform> 产生安装包
 *   3. Git 提交版本锁变更 → 打 tag → push tag 到 origin
 *   4. 通过 GitHub API 创建 Release（含 body = 说明 + 产物 + SHA256）
 *   5. 上传 dist 产物到 Release assets
 *
 * 环境变量：
 *   PAT           GitHub Classic PAT（scope=repo）  必填
 *   DRY_RUN       若设置为 1，仅走流程不推送 / 不创建 release
 *   SKIP_BUILD    若设置为 1，跳过 build + dist（产物已存在时用）
 *   PLATFORMS     逗号分隔平台：linux,win,mac  默认 linux（沙箱只能打 linux）
 *   OWNER         GitHub 仓库 owner   默认 arvin-xiao
 *   REPO          GitHub 仓库名       默认 dsh-desktop
 *
 * 用法：
 *   PAT=ghp_xxx node scripts/make-release.mjs
 *   PAT=ghp_xxx node scripts/make-release.mjs --skip-build
 *   DRY_RUN=1 node scripts/make-release.mjs
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
} from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const OWNER = process.env.OWNER || 'arvin-xiao';
const REPO = process.env.REPO || 'dsh-desktop';
const PAT = process.env.PAT || '';
const DRY_RUN = process.env.DRY_RUN === '1';
const SKIP_BUILD = process.env.SKIP_BUILD === '1' || process.argv.includes('--skip-build');
const PLATFORMS_STR = process.env.PLATFORMS || 'linux';
const PLATFORMS = PLATFORMS_STR.split(',').map((s) => s.trim()).filter(Boolean);

const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';

if (!PAT && !DRY_RUN) {
  console.error('❌ 缺少 PAT 环境变量（或设置 DRY_RUN=1）');
  process.exit(1);
}

// ---------- helpers ----------
function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function curl({ method = 'GET', path, bodyFile, accept = 'application/vnd.github+json', extraHeaders = [] }) {
  const args = [
    '-sS', '-L',
    ...(PROXY ? ['-x', PROXY] : []),
    '-u', `${OWNER}:${PAT}`,
    '-X', method,
    '-H', `Accept: ${accept}`,
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    '-H', 'User-Agent: dsh-desktop-release',
    '-H', 'Content-Type: application/json',
    '--max-time', '300',
    '-w', '\n%{http_code}',
    ...extraHeaders,
    ...(bodyFile ? ['--data-binary', '@' + bodyFile] : []),
    `https://api.github.com${path}`,
  ];
  const res = spawnSync('curl', args, { maxBuffer: 200 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error('curl exec fail status=' + res.status + ' ' + res.stderr.toString().slice(0, 500));
  }
  const out = res.stdout.toString('utf8');
  const idx = out.lastIndexOf('\n');
  const bodyText = out.slice(0, idx);
  const statusStr = out.slice(idx + 1).trim();
  const status = Number(statusStr);
  const json = (() => { try { return JSON.parse(bodyText); } catch { return undefined; } })();
  return { status, json, text: bodyText };
}

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  const res = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: ROOT, ...opts });
  if (res.status !== 0) throw new Error(`Command failed (exit ${res.status}): ${cmd}`);
}

function tmpFile(name, content) {
  const dir = resolve(ROOT, 'tmp-release');
  mkdirSync(dir, { recursive: true });
  const p = resolve(dir, name);
  writeFileSync(p, content);
  return p;
}

function sha256File(filePath) {
  const buf = readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function listArtifacts(releaseDir) {
  const out = [];
  if (!existsSync(releaseDir)) return out;
  for (const f of readdirSync(releaseDir)) {
    const abs = join(releaseDir, f);
    const st = statSync(abs);
    if (!st.isFile()) continue;
    // 只关心安装包产物，跳过 blockmap / yml 等中间文件
    if (/\.(AppImage|deb|dmg|exe|msi|pkg|rpm|pacman|apk)$/.test(f)) {
      out.push({ name: f, path: abs, size: st.size });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- step 1: 读取版本 ----------
console.log('⏳  Step 1: 读取版本信息');
const pkg = readJson(resolve(ROOT, 'package.json'));
const constantsFile = readFileSync(resolve(ROOT, 'src/shared/constants.ts'), 'utf8');
const m = constantsFile.match(/export const DSH_DEFAULT_VERSION\s*=\s*['"]([^'"]*)['"]/);
if (!m) throw new Error('constants.ts 中找不到 DSH_DEFAULT_VERSION');
const dshVersion = m[1];
const desktopVersion = pkg.version;
const tagName = `v${desktopVersion}+dsh${dshVersion}`;
const releaseTitle = `DSH Desktop v${desktopVersion} (dsh ${dshVersion})`;
console.log(`  desktop version : ${desktopVersion}`);
console.log(`  dsh version     : ${dshVersion}`);
console.log(`  release tag     : ${tagName}`);
console.log(`  release title   : ${releaseTitle}`);

// ---------- step 2: 构建（可选） ----------
if (!SKIP_BUILD) {
  console.log(`⏳  Step 2: 构建产物 (platforms: ${PLATFORMS.join(', ')})`);
  run('npm run build');
  for (const plat of PLATFORMS) {
    if (plat === 'linux') run('npm run dist:linux');
    else if (plat === 'win')   run('npm run dist:win');
    else if (plat === 'mac')   run('npm run dist:mac');
    else throw new Error(`未知 platform: ${plat}`);
  }
} else {
  console.log('⏭️  Step 2 跳过构建 (SKIP_BUILD=1)');
}

// ---------- step 3: 收集产物 + 生成校验 ----------
console.log('⏳  Step 3: 收集产物 & 计算 SHA256');
// electron-builder 输出目录可能为 release/（yml 配置）或 dist/（默认），都尝试
const candidateDirs = [resolve(ROOT, 'release'), resolve(ROOT, 'dist')];
let releaseDir = '';
let artifacts = [];
for (const d of candidateDirs) {
  const found = listArtifacts(d);
  if (found.length > 0) { releaseDir = d; artifacts = found; break; }
}
if (!releaseDir) {
  // 没有产物，仍然创建 release/ 目录用于写 SHASUMS
  releaseDir = resolve(ROOT, 'release');
  console.warn('⚠️  未找到 AppImage/deb/dmg/exe 等产物，继续（仅 release 不带 asset）');
} else {
  console.log(`  产物目录: ${releaseDir} (${artifacts.length} 个文件)`);
}
const checksums = artifacts.map((a) => ({ name: a.name, sha256: sha256File(a.path), size: a.size }));
for (const c of checksums) {
  const kb = Math.round(c.size / 1024);
  console.log(`  ${c.name}  ${c.sha256.slice(0, 16)}…  (${kb} KB)`);
}
// 写 SHASUMS 文本，也作为一个 asset 上传
const shaFileContent = checksums.map((c) => `${c.sha256}  ${c.name}`).join('\n') + '\n';
const shaFileName = `SHASUMS-${tagName}.txt`;
if (!existsSync(releaseDir)) mkdirSync(releaseDir, { recursive: true });
const shaFilePath = resolve(releaseDir, shaFileName);
writeFileSync(shaFilePath, shaFileContent);

// ---------- step 4: Git 提交 & 打 tag & push ----------
console.log('⏳  Step 4: Git 提交 & 打 tag & push tag');
const statusOut = execSync('git status --short', { cwd: ROOT, encoding: 'utf8' }).trim();
const hasChanges = statusOut.length > 0;
if (hasChanges) {
  console.log(`  检测到未提交变更：\n${statusOut.split('\n').map((l) => '    ' + l).join('\n')}`);
  if (DRY_RUN) console.log('  [DRY_RUN] 跳过 git add/commit');
  else {
    run('git add -A');
    run(`git commit -m "chore(release): lock to dsh ${dshVersion} for ${tagName}"`);
    run('git remote set-url origin ' + `https://${OWNER}:${PAT}@github.com/${OWNER}/${REPO}.git`);
    try {
      run('git push origin main');
    } finally {
      run('git remote set-url origin ' + `https://github.com/${OWNER}/${REPO}.git`);
    }
  }
} else {
  console.log('  工作区干净，跳过 commit');
}

// 检查 tag 是否已存在
try {
  const exists = execSync(`git tag -l ${JSON.stringify(tagName)}`, { cwd: ROOT, encoding: 'utf8' }).trim();
  if (exists === tagName) {
    console.warn(`⚠️  本地 tag ${tagName} 已存在，跳过打 tag（若要重新发布请手动删除 tag: git tag -d ${tagName}）`);
  } else {
    if (DRY_RUN) console.log(`  [DRY_RUN] git tag -a ${tagName} -m "${releaseTitle}"`);
    else run(`git tag -a ${tagName} -m "${releaseTitle}"`);
  }
} catch (e) { /* ignore */ }

// push tag
if (DRY_RUN) console.log(`  [DRY_RUN] git push origin refs/tags/${tagName}`);
else {
  run('git remote set-url origin ' + `https://${OWNER}:${PAT}@github.com/${OWNER}/${REPO}.git`);
  try {
    run(`git push origin refs/tags/${tagName}`);
  } finally {
    run('git remote set-url origin ' + `https://github.com/${OWNER}/${REPO}.git`);
  }
}

// ---------- step 5: 生成 release body ----------
console.log('⏳  Step 5: 生成 Release body');
const body = [];
body.push(`### 配套版本\n`);
body.push(`| 项目 | 版本 |`);
body.push(`|---|---|`);
body.push(`| **dsh-desktop** | \`${desktopVersion}\` |`);
body.push(`| **@deepseek-ai/dsh** | \`${dshVersion}\` |`);
body.push(``);
body.push(`### 下载\n`);
body.push(`| 平台 | 包 | 大小 | SHA256 |`);
body.push(`|---|---|---|---|`);
const kbFmt = (n) => {
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  if (n > 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
};
for (const c of checksums) {
  const link = `[${c.name}](https://github.com/${OWNER}/${REPO}/releases/download/${tagName}/${encodeURIComponent(c.name)})`;
  body.push(`| ${c.name.includes('.deb') ? 'Linux (deb)' : c.name.includes('.AppImage') ? 'Linux (AppImage)' : c.name.includes('.dmg') ? 'macOS (DMG)' : c.name.includes('.exe') ? 'Windows (NSIS)' : 'Other'} | ${link} | ${kbFmt(c.size)} | \`${c.sha256.slice(0, 16)}…\` |`);
}
// SHASUMS 文件
body.push(`| - | [${shaFileName}](https://github.com/${OWNER}/${REPO}/releases/download/${tagName}/${encodeURIComponent(shaFileName)}) | - | SHA256 清单 |`);
body.push(``);
body.push(`### 本地校验\n`);
body.push(`\`\`\`bash\nsha256sum -c ${shaFileName}\n\`\`\``);
body.push(``);
body.push(`---\n`);
body.push(`_该 release 与 **@deepseek-ai/dsh@${dshVersion}** 对齐，通过 \`npm run sync:dsh\` 锁定版本后构建。_`);

const releaseBodyText = body.join('\n');
console.log(releaseBodyText);

// ---------- step 6: 创建 GitHub Release ----------
console.log('⏳  Step 6: 创建 GitHub Release');
const releasePayload = {
  tag_name: tagName,
  target_commitish: 'main',
  name: releaseTitle,
  body: releaseBodyText,
  draft: false,
  prerelease: dshVersion.includes('-'), // dsh 含预发布后缀时标为 prerelease
  make_latest: 'true',
};

let releaseApiUrl = '';
let uploadUrl = '';
if (DRY_RUN) {
  console.log('  [DRY_RUN] POST /repos/:owner/:repo/releases with payload:');
  console.log('  ', JSON.stringify(releasePayload, null, 2).split('\n').join('\n   '));
  console.log(`  [DRY_RUN] 不会上传 ${artifacts.length + 1} 个 assets`);
} else {
  const f = tmpFile('release-body.json', JSON.stringify(releasePayload));
  const r = curl({ method: 'POST', path: `/repos/${OWNER}/${REPO}/releases`, bodyFile: f });
  if (r.status !== 201) {
    // 若 tag release 已存在，尝试 GET 旧 release 后更新
    if (r.status === 422) {
      console.warn('  Release 已存在（422），尝试获取并更新...');
      const r2 = curl({ method: 'GET', path: `/repos/${OWNER}/${REPO}/releases/tags/${encodeURIComponent(tagName)}` });
      if (r2.status !== 200) throw new Error('release GET FAIL ' + r2.status + ' ' + r2.text.slice(0, 300));
      const releaseId = r2.json.id;
      const f2 = tmpFile('release-update.json', JSON.stringify(releasePayload));
      const r3 = curl({ method: 'PATCH', path: `/repos/${OWNER}/${REPO}/releases/${releaseId}`, bodyFile: f2 });
      if (r3.status < 200 || r3.status >= 300) throw new Error('release PATCH FAIL ' + r3.status + ' ' + r3.text.slice(0, 500));
      releaseApiUrl = r3.json.url;
      uploadUrl = r3.json.upload_url.split('{')[0];
      console.log(`  已更新 release id=${releaseId}`);
    } else {
      throw new Error('release POST FAIL ' + r.status + ' ' + r.text.slice(0, 800));
    }
  } else {
    releaseApiUrl = r.json.url;
    uploadUrl = r.json.upload_url.split('{')[0];
    console.log(`  Created release id=${r.json.id}`);
  }
  console.log(`  release url = ${releaseApiUrl}`);
  console.log(`  upload url  = ${uploadUrl}`);

  // ---------- step 7: 上传 assets ----------
  console.log(`⏳  Step 7: 上传 ${artifacts.length + 1} 个 assets`);
  const uploadList = [
    ...artifacts.map((a) => ({ name: a.name, path: a.path })),
    { name: shaFileName, path: shaFilePath },
  ];
  for (const asset of uploadList) {
    const st = statSync(asset.path);
    console.log(`  → ${asset.name} (${kbFmt(st.size)})`);
    const uploadFull = `${uploadUrl}?name=${encodeURIComponent(asset.name)}&label=${encodeURIComponent(asset.name)}`;
    // 用 curl 做流式上传 binary，注意 Content-Type 头
    const args = [
      '-sS', '-L',
      ...(PROXY ? ['-x', PROXY] : []),
      '-u', `${OWNER}:${PAT}`,
      '-X', 'POST',
      '-H', 'Accept: application/vnd.github+json',
      '-H', 'X-GitHub-Api-Version: 2022-11-28',
      '-H', 'User-Agent: dsh-desktop-release',
      '-H', 'Content-Type: application/octet-stream',
      '--max-time', '900',
      '-w', '\n%{http_code}',
      '--data-binary', '@' + asset.path,
      uploadFull,
    ];
    const res = spawnSync('curl', args, { maxBuffer: 200 * 1024 * 1024 });
    if (res.status !== 0) {
      throw new Error('upload curl exec fail: ' + res.stderr.toString().slice(0, 400));
    }
    const out = res.stdout.toString('utf8');
    const idx = out.lastIndexOf('\n');
    const bodyT = out.slice(0, idx);
    const code = Number(out.slice(idx + 1).trim());
    if (code < 200 || code >= 300) {
      throw new Error(`upload ${asset.name} FAIL HTTP ${code}: ${bodyT.slice(0, 500)}`);
    }
    console.log(`    ✓ HTTP ${code}`);
  }
}

console.log(`\n✅  Release 流程结束`);
console.log(`    tag     : ${tagName}`);
console.log(`    page    : https://github.com/${OWNER}/${REPO}/releases/tag/${tagName}`);
if (DRY_RUN) console.log(`    (DRY_RUN=1，未实际推送/创建 release)`);
