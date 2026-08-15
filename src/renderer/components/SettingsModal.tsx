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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Settings</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <h4 style={{ margin: '16px 0 6px', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Runtime
        </h4>

        <div className="modal-row">
          <label>Preferred port</label>
          <input
            type="number"
            min={1024}
            max={65535}
            value={s.dsh.preferredPort}
            onChange={(e) => onChange({ dsh: { ...s.dsh, preferredPort: clamp(+e.target.value, 1024, 65535) } })}
          />
        </div>

        <div className="modal-row">
          <label>Auto-start DSH on launch</label>
          <Toggle
            on={s.dsh.autoStart}
            onChange={(v) => onChange({ dsh: { ...s.dsh, autoStart: v } })}
          />
        </div>

        <div className="modal-row">
          <label>Default profile preset</label>
          <select
            value={s.dsh.profilePreset}
            onChange={(e) => onChange({ dsh: { ...s.dsh, profilePreset: e.target.value as any } })}
          >
            <option value="standard">Standard (recommended)</option>
            <option value="code">Code mode</option>
            <option value="minimal">Minimal</option>
            <option value="creator">Creator</option>
          </select>
        </div>

        <h4 style={{ margin: '16px 0 6px', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          DSH Version Sync
        </h4>

        <div className="modal-row">
          <label>
            Target version
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginTop: 2 }}>
              Pin a specific semver or use <code>latest</code>
            </div>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="text"
              value={s.dsh.version}
              placeholder="latest"
              onChange={(e) => onChange({ dsh: { ...s.dsh, version: e.target.value } })}
              style={{ width: 120 }}
            />
          </div>
        </div>

        <div className="modal-row">
          <label>
            Version status
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginTop: 2 }}>
              {versionInfo ? (
                <>
                  Installed: <strong>{versionInfo.installedVersion || '—'}</strong>
                  {' / '}
                  Latest: <strong>{versionInfo.latestVersion || '—'}</strong>
                  {versionInfo.updateAvailable && (
                    <span style={{ color: 'var(--accent, #3b82f6)', marginLeft: 6 }}>
                      Update available
                    </span>
                  )}
                  {versionInfo.error && (
                    <span style={{ color: '#ef4444', marginLeft: 6 }}>{versionInfo.error}</span>
                  )}
                </>
              ) : (
                <>Click "Check" to query npm registry</>
              )}
            </div>
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
          <div className="modal-row">
            <pre style={{
              width: '100%',
              maxHeight: 120,
              overflow: 'auto',
              fontSize: 10,
              lineHeight: 1.4,
              background: 'rgba(0,0,0,0.3)',
              padding: 8,
              borderRadius: 4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>{upgradeLog}</pre>
          </div>
        )}

        <h4 style={{ margin: '16px 0 6px', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Node.js Environment
        </h4>

        <div className="modal-row">
          <label>
            Use system Node.js (requires &ge; v{MIN_NODE_VERSION})
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginTop: 2 }}>
              Current: {envReport?.systemNode?.version || 'not found'} {systemNodeOK ? '✓' : '✗'}
            </div>
          </label>
          <Toggle
            on={s.env.useSystemNode}
            onChange={(v) => onChange({ env: { ...s.env, useSystemNode: v } })}
          />
        </div>

        <div className="modal-row">
          <label>
            Portable (bundled) Node.js
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginTop: 2 }}>
              Version: {s.env.bundledNodeVersion} — {bundledExists ? 'Cached ✓' : 'Not downloaded'}
            </div>
          </label>
          <button className="btn primary" onClick={() => void onDownloadNode()}>
            {bundledExists ? 'Re-download' : 'Download now'}
          </button>
        </div>

        <div className="modal-row">
          <label>Skip Node.js version check (not recommended)</label>
          <Toggle
            on={s.env.skipNodeVersionCheck}
            onChange={(v) => onChange({ env: { ...s.env, skipNodeVersionCheck: v } })}
          />
        </div>

        <div className="modal-row">
          <label>Effective Node.js path (read-only)</label>
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

        <h4 style={{ margin: '16px 0 6px', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Appearance &amp; Behaviour
        </h4>

        <div className="modal-row">
          <label>Minimize to tray instead of quitting</label>
          <Toggle
            on={s.app.minimizeToTray}
            onChange={(v) => onChange({ app: { ...s.app, minimizeToTray: v } })}
          />
        </div>

        <div className="modal-row">
          <label>Open at login (auto-start on boot)</label>
          <Toggle
            on={s.app.startOnLogin}
            onChange={(v) => onChange({ app: { ...s.app, startOnLogin: v } })}
          />
        </div>

        <div className="modal-row">
          <label>Theme</label>
          <select
            value={s.app.theme}
            onChange={(e) => onChange({ app: { ...s.app, theme: e.target.value as any } })}
          >
            <option value="system">Follow system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div className="modal-row">
          <label>Language</label>
          <select
            value={s.app.language}
            onChange={(e) => onChange({ app: { ...s.app, language: e.target.value as any } })}
          >
            <option value="zh-CN">简体中文</option>
            <option value="en-US">English</option>
          </select>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

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
