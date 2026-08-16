import React, { useMemo, useState, useCallback } from 'react';
import type { AppSettings, EnvReport, DshVersionInfo } from '@shared/types';
import { MIN_NODE_VERSION } from '@shared/constants';

interface Props {
  settings: AppSettings;
  envReport: EnvReport | null;
  onClose: () => void;
  onChange: (patch: Partial<AppSettings>) => void;
  onDownloadNode: () => Promise<void>;
}

const SettingsModal: React.FC<Props> = ({ settings, envReport, onClose, onChange, onDownloadNode }) => {
  const s = settings;
  const systemNodeOK = envReport?.systemNodeSatisfies ?? false;
  const bundledExists = !!envReport?.bundledNode;
  const effectivePath = useMemo(() => envReport?.effectiveNodePath || '—', [envReport]);

  // --- dsh version sync state ---
  const [versionInfo, setVersionInfo] = useState<DshVersionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeLog, setUpgradeLog] = useState('');

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true);
    setUpgradeLog('');
    try {
      const info = await window.dsh.dsh.checkUpdate();
      setVersionInfo(info);
    } catch (e: any) {
      setVersionInfo({
        installedVersion: null,
        latestVersion: null,
        targetVersion: s.dsh.version,
        updateAvailable: false,
        checkedAt: Date.now(),
        error: e?.message || String(e),
      });
    } finally {
      setChecking(false);
    }
  }, [s.dsh.version]);

  const handleUpgrade = useCallback(async () => {
    setUpgrading(true);
    setUpgradeLog('');
    const unsub = window.dsh.dsh.onUpgradeProgress((chunk: string) => {
      setUpgradeLog((prev) => prev + chunk);
    });
    try {
      const info = await window.dsh.dsh.upgrade();
      setVersionInfo(info);
    } catch (e: any) {
      setUpgradeLog((prev) => prev + `\n[ERROR] ${e?.message || e}`);
    } finally {
      setUpgrading(false);
      unsub();
    }
  }, []);

  return (
    <div className="modal-mask" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        {/* ---- Modal Header ---- */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: 'var(--ds-gradient)',
              color: 'white', display: 'grid', placeItems: 'center',
              boxShadow: '0 4px 10px rgba(77,107,254,0.28)',
              fontWeight: 700, fontSize: 14,
            }}>
              <DeepSeekLogoMark />
            </div>
            <div>
              <h3 style={{ margin: 0, lineHeight: 1.2 }}>设置 / Settings</h3>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                自定义 DSH Desktop 运行行为
              </div>
            </div>
          </div>
          <button className="btn ghost" onClick={onClose} title="Close (Esc)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13"/></svg>
          </button>
        </div>

        {/* ---- Modal Body ---- */}
        <div className="modal-body">

          {/* =====  Runtime  ===== */}
          <div className="modal-section-title">运行时 / Runtime</div>

          <div className="modal-row">
            <label>
              首选端口 Preferred port
              <span className="hint">DSH Web 界面监听的本地端口</span>
            </label>
            <input
              type="number"
              min={1024}
              max={65535}
              value={s.dsh.preferredPort}
              onChange={(e) => onChange({ dsh: { ...s.dsh, preferredPort: clamp(+e.target.value, 1024, 65535) } })}
            />
          </div>

          <div className="modal-row">
            <label>
              启动应用时自动运行 DSH
              <span className="hint">Auto-start DSH on launch</span>
            </label>
            <Toggle
              on={s.dsh.autoStart}
              onChange={(v) => onChange({ dsh: { ...s.dsh, autoStart: v } })}
            />
          </div>

          <div className="modal-row">
            <label>
              默认配置预设 Default profile preset
              <span className="hint">首次启动 DSH 时加载的默认配置</span>
            </label>
            <select
              value={s.dsh.profilePreset}
              onChange={(e) => onChange({ dsh: { ...s.dsh, profilePreset: e.target.value as any } })}
            >
              <option value="standard">Standard（推荐）</option>
              <option value="code">Code mode</option>
              <option value="minimal">Minimal</option>
              <option value="creator">Creator</option>
            </select>
          </div>

          {/* =====  DSH Version Sync  ===== */}
          <div className="modal-section-title">版本同步 / DSH Version Sync</div>

          <div className="modal-row">
            <label>
              目标版本 Target version
              <span className="hint">锁定到具体 semver，或使用 <code>latest</code> 保持最新</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                value={s.dsh.version}
                placeholder="latest"
                onChange={(e) => onChange({ dsh: { ...s.dsh, version: e.target.value } })}
                style={{ width: 140 }}
              />
            </div>
          </div>

          <div className="modal-row">
            <label>
              版本状态 Version status
              <span className="hint">
                {versionInfo ? (
                  <span style={{ fontSize: 'inherit' }}>
                    已安装：<strong style={{ color: 'var(--text)' }}>{versionInfo.installedVersion || '—'}</strong>
                    {'  /  '}
                    最新：<strong style={{ color: 'var(--text)' }}>{versionInfo.latestVersion || '—'}</strong>
                    {versionInfo.updateAvailable && (
                      <span className="badge warn" style={{ marginLeft: 8 }}>
                        ↑ Update available
                      </span>
                    )}
                    {versionInfo.error && (
                      <span className="badge err" style={{ marginLeft: 8 }}>
                        {versionInfo.error}
                      </span>
                    )}
                  </span>
                ) : (
                  <>点击右侧 "Check" 向 npm registry 查询</>
                )}
              </span>
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn"
                disabled={checking}
                onClick={() => void handleCheckUpdate()}
              >
                {checking ? 'Checking…' : 'Check'}
              </button>
              <button
                className="btn primary"
                disabled={upgrading || !versionInfo?.updateAvailable}
                onClick={() => void handleUpgrade()}
              >
                {upgrading ? 'Upgrading…' : 'Upgrade'}
              </button>
            </div>
          </div>

          {upgradeLog && (
            <div style={{ margin: '10px 0 4px' }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em' }}>
                Upgrade Log
              </div>
              <div className="upgrade-log">{upgradeLog}</div>
            </div>
          )}

          {/* =====  Node.js Environment  ===== */}
          <div className="modal-section-title">Node.js 环境 / Environment</div>

          <div className="modal-row">
            <label>
              使用系统 Node.js（需 &ge; v{MIN_NODE_VERSION}）
              <span className="hint">
                当前版本：{envReport?.systemNode?.version || '未找到'}
                &nbsp;
                <strong style={{ color: systemNodeOK ? 'var(--ok)' : 'var(--err)' }}>
                  {systemNodeOK ? '✓ 满足要求' : '✗ 不满足'}
                </strong>
              </span>
            </label>
            <Toggle
              on={s.env.useSystemNode}
              onChange={(v) => onChange({ env: { ...s.env, useSystemNode: v } })}
            />
          </div>

          <div className="modal-row">
            <label>
              便携版（内置）Node.js
              <span className="hint">
                版本 {s.env.bundledNodeVersion} —{' '}
                {bundledExists ? (
                  <span style={{ color: 'var(--ok)', fontWeight: 600 }}>已缓存 ✓</span>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>未下载</span>
                )}
              </span>
            </label>
            <button className="btn primary" onClick={() => void onDownloadNode()}>
              {bundledExists ? 'Re-download' : 'Download now'}
            </button>
          </div>

          <div className="modal-row">
            <label>
              跳过 Node.js 版本检查
              <span className="hint">不推荐，可能导致 DSH 无法正常启动</span>
            </label>
            <Toggle
              on={s.env.skipNodeVersionCheck}
              onChange={(v) => onChange({ env: { ...s.env, skipNodeVersionCheck: v } })}
            />
          </div>

          <div className="modal-row">
            <label>
              实际使用的 Node.js 路径
              <span className="hint">只读，根据上方设置自动选择</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="badge" title={effectivePath}>{truncate(effectivePath, 32)}</span>
              <button
                className="btn"
                title="Show in folder"
                disabled={!envReport?.bundledNode}
                onClick={() => envReport?.bundledNode && void window.dsh.shell.showItemInFolder(envReport.bundledNode.path)}
              >
                Reveal
              </button>
            </div>
          </div>

          {/* =====  Appearance & Behaviour  ===== */}
          <div className="modal-section-title">外观 &amp; 行为 / Appearance</div>

          <div className="modal-row">
            <label>
              关闭窗口时最小化到托盘
              <span className="hint">Minimize to tray instead of quitting（关闭窗口后进程保持运行）</span>
            </label>
            <Toggle
              on={s.app.minimizeToTray}
              onChange={(v) => onChange({ app: { ...s.app, minimizeToTray: v } })}
            />
          </div>

          <div className="modal-row">
            <label>
              开机自启动
              <span className="hint">Open at login（系统启动后自动运行应用）</span>
            </label>
            <Toggle
              on={s.app.startOnLogin}
              onChange={(v) => onChange({ app: { ...s.app, startOnLogin: v } })}
            />
          </div>

          <div className="modal-row">
            <label>主题 Theme</label>
            <select
              value={s.app.theme}
              onChange={(e) => onChange({ app: { ...s.app, theme: e.target.value as any } })}
            >
              <option value="system">跟随系统 Follow system</option>
              <option value="light">浅色 Light</option>
              <option value="dark">深色 Dark</option>
            </select>
          </div>

          <div className="modal-row">
            <label>界面语言 Language</label>
            <select
              value={s.app.language}
              onChange={(e) => onChange({ app: { ...s.app, language: e.target.value as any } })}
            >
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
          </div>

        </div> {/* end modal-body */}

        {/* ---- Modal Actions ---- */}
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            完成 Done
          </button>
        </div>
      </div>
    </div>
  );
};

// ---- DeepSeek logo mark (brand icon) ----
const DeepSeekLogoMark: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="ds-logo-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.98"/>
        <stop offset="100%" stopColor="#fff" stopOpacity="0.9"/>
      </linearGradient>
    </defs>
    <path
      d="M5.2 4.2A1.8 1.8 0 0 1 7 2.4h6.4c5 0 9 4.1 9 9v5.2c0 5-4 9-9 9H7a1.8 1.8 0 0 1-1.8-1.8V4.2Z"
      fill="url(#ds-logo-g)"
      opacity="0.08"
    />
    <path
      d="M8.2 6c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1s-1-.45-1-1V7c0-.55.45-1 1-1Zm3.6 0h2c2.9 0 5.2 2.3 5.2 5.2v1.6c0 2.9-2.3 5.2-5.2 5.2h-2c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1Zm0 1.8v6.8h2c1.7 0 3.2-1.3 3.2-3.2v-.4c0-1.9-1.5-3.2-3.2-3.2h-2Z"
      fill="url(#ds-logo-g)"
    />
  </svg>
);

const Toggle: React.FC<{ on: boolean; onChange: (next: boolean) => void }> = ({ on, onChange }) => (
  <div
    className={`toggle ${on ? 'on' : ''}`}
    onClick={() => onChange(!on)}
    role="switch"
    aria-checked={on}
    tabIndex={0}
    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!on); } }}
  />
);

function clamp(n: number, a: number, b: number): number { return Math.max(a, Math.min(b, n)); }
function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return '…' + s.slice(s.length - n + 1);
}

export default SettingsModal;
