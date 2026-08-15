import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * electron-builder 对 macOS 未签名包的默认处理是"adhoc linker-signed"：
 *   - Identifier 保留为 Electron（未替换为 appId）
 *   - Info.plist=not bound
 *   - Sealed Resources=none
 * 在 macOS 26 (Sequoia 2+) 中，这种形态直接被 XProtect YARA 规则命中，
 * 判定为"包含恶意软件"级别，导致用户无法通过"仍要打开"按钮放行。
 *
 * 此 afterPack 钩子对打包后、打 DMG 前的 .app 执行完整的本地 ad-hoc 重签：
 *   - 强制替换 Identifier 为我们的 appId
 *   - --generate-entitlement-der 让 Info.plist 被 bound
 *   - --deep 递归签 Helper/Framework
 *   - 确保 codesign --verify 显示 "satisfies its Designated Requirement"
 */
export default async function afterPack(context) {
  const { appOutDir, packager } = context;
  if (packager.platform.name !== 'mac') return; // 只处理 macOS

  const prodName = packager.appInfo.productFilename || packager.appInfo.name;
  const appPath = path.join(appOutDir, `${prodName}.app`);
  if (!fs.existsSync(appPath)) {
    console.log(`[afterPack-mac-sign] skip: ${appPath} not found`);
    return;
  }

  const appId = packager.config.appId || 'com.deepseek.harness.desktop';
  console.log(`[afterPack-mac-sign] target: ${appPath}`);
  console.log(`[afterPack-mac-sign] force Identifier: ${appId}`);

  const run = (bin, args) => {
    console.log(`  $ ${bin} ${args.join(' ')}`);
    const r = spawnSync(bin, args, { encoding: 'utf8' });
    if (r.stdout && r.stdout.trim()) console.log(r.stdout.trimEnd());
    if (r.stderr && r.stderr.trim()) console.warn(r.stderr.trimEnd());
    if (r.status !== 0) {
      throw new Error(`[afterPack-mac-sign] ${bin} exit ${r.status}`);
    }
  };

  // 1) 清除旧签名（如果有的话）
  try {
    run('codesign', ['--remove-signature', '--all-architectures', appPath]);
  } catch (e) {
    // 没有签名时会警告，忽略
  }

  // 2) 先签内部 Frameworks / Helpers （--deep 在新版本 codesign 中不可靠，所以我们自己递归）
  const frameworksDir = path.join(appPath, 'Contents', 'Frameworks');
  const recursiveSign = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    // 先签子目录再签自身
    const dirs = [];
    for (const e of entries) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.endsWith('.framework')) dirs.push(fp);
        else if (e.name.endsWith('.app')) dirs.push(fp);
        else if (e.name.endsWith('.xpc')) dirs.push(fp);
        else recursiveSign(fp);
      } else if (e.isFile() && !e.name.endsWith('.lproj') && !e.name.endsWith('.txt')
                 && !e.name.endsWith('.png') && !e.name.endsWith('.icns')
                 && !e.name.endsWith('.svg') && !e.name.endsWith('.gif')
                 && !e.name.endsWith('.jpg') && !e.name.endsWith('.jpeg')
                 && !e.name.endsWith('.json') && !e.name.endsWith('.md')) {
        // 仅 Mach-O 文件需要签（通过文件头判断避免签资源）
        try {
          const fd = fs.openSync(fp, 'r');
          const buf = Buffer.alloc(4);
          fs.readSync(fd, buf, 0, 4, 0);
          fs.closeSync(fd);
          const magic = buf.readUInt32BE(0);
          const isMachO = (magic === 0xfeedface || magic === 0xcefaedfe
                        || magic === 0xfeedfacf || magic === 0xcffaedfe
                        || magic === 0xcafebabe || magic === 0xbebafeca);
          if (isMachO) {
            run('codesign', [
              '--force', '--sign', '-', '--all-architectures',
              '--timestamp=none', '--generate-entitlement-der',
              '--identifier', appId,
              fp,
            ]);
          }
        } catch {}
      }
    }
    for (const d of dirs) {
      recursiveSign(d);
      run('codesign', [
        '--force', '--sign', '-', '--all-architectures',
        '--timestamp=none', '--generate-entitlement-der',
        '--identifier', appId,
        d,
      ]);
    }
  };
  if (fs.existsSync(frameworksDir)) {
    recursiveSign(frameworksDir);
  }

  // 3) 最后签 .app 本体（必须带 Info.plist binding + entitlement der）
  run('codesign', [
    '--force', '--sign', '-', '--all-architectures',
    '--timestamp=none', '--generate-entitlement-der',
    '--identifier', appId,
    // 注意：不要加 --requirements =（空 requirement 在 macOS 26 codesign 会语法报错）
    // 让系统使用默认 designated requirement 即可
    appPath,
  ]);

  // 4) 验证
  const v = spawnSync('codesign', ['--verify', '--deep', '--verbose=3', appPath],
                      { encoding: 'utf8' });
  console.log('\n[afterPack-mac-sign] verify output:');
  console.log((v.stdout || '') + (v.stderr || ''));
  if (v.status !== 0) {
    throw new Error(`[afterPack-mac-sign] codesign verify fail exit ${v.status}`);
  }

  // 打印签名详情（方便在 CI 日志里确认）
  const d = spawnSync('codesign', ['-dvv', appPath], { encoding: 'utf8' });
  console.log('\n[afterPack-mac-sign] signature details:');
  console.log((d.stdout || '') + (d.stderr || ''));
}
