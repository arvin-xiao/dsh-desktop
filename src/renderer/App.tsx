import React, { useEffect, useState } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import DshWebview from './components/DshWebview';
import TerminalPanel from './components/TerminalPanel';
import SettingsModal from './components/SettingsModal';
import type { AppSettings, DshStatusInfo, EnvReport } from '@shared/types';
import { log } from './utils';

const App: React.FC = () => {
  const [status, setStatus] = useState<DshStatusInfo>({ status: 'idle' });
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [envReport, setEnvReport] = useState<EnvReport | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(240);
  const [showSettings, setShowSettings] = useState(false);
  const [starting, setStarting] = useState(false);
  const [envProgress, setEnvProgress] = useState<{ pct: number } | null>(null);

  // load settings
  useEffect(() => {
    (async () => {
      try {
        const all = await window.dsh.store.getAll();
        setSettings(all as AppSettings);
        setTerminalOpen(all.window.terminalPanelOpen);
        setTerminalHeight(all.window.terminalPanelHeight);
        const s = await window.dsh.dsh.status();
        setStatus(s);
      } catch (e) {
        log.error('init settings/status fail', e);
      }
    })();
  }, []);

  // ---- Apply theme (light / dark / system) ----
  useEffect(() => {
    if (!settings) return;
    const apply = (isDark: boolean) => {
      const root = document.documentElement;
      const body = document.body;
      if (isDark) {
        root.dataset.dark = 'true';
        body.dataset.dark = 'true';
        root.setAttribute('data-ds-dark-theme', '');
        body.style.background = '#151517';
        body.style.color = '#f9fafb';
      } else {
        delete root.dataset.dark;
        delete body.dataset.dark;
        root.removeAttribute('data-ds-dark-theme');
        body.style.background = '#ffffff';
        body.style.color = '#0f1115';
      }
    };

    if (settings.app.theme === 'dark') {
      apply(true);
    } else if (settings.app.theme === 'light') {
      apply(false);
    } else {
      // system: listen to native color scheme changes
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mql.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
  }, [settings?.app.theme]);

  // env inspect on start
  useEffect(() => {
    (async () => {
      try {
        const r = await window.dsh.env.inspect();
        setEnvReport(r);
      } catch (e) {
        log.error('env inspect fail', e);
      }
    })();
    const off = window.dsh.env.onProgress((p: any) => setEnvProgress(p));
    return () => { off(); };
  }, []);

  // dsh events
  useEffect(() => {
    const off1 = window.dsh.dsh.onStatus((s: DshStatusInfo) => setStatus(s));
    const off2 = window.dsh.dsh.onAutoStartRequest(() => {
      void handleStart();
    });
    const off3 = window.dsh.dsh.onToggleTerminal(() => {
      setTerminalOpen((prev) => !prev);
      void persistTerminal(!terminalOpen, terminalHeight);
    });
    return () => { off1(); off2(); off3(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalOpen, terminalHeight]);

  async function persistTerminal(open: boolean, height: number) {
    try {
      const ws: AppSettings['window'] = {
        ...(settings?.window || {}),
        terminalPanelOpen: open,
        terminalPanelHeight: height,
      };
      await window.dsh.store.set('window', ws);
    } catch {}
  }

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    try {
      // 1. 确保 Node 可用
      let report = envReport;
      if (!report?.effectiveNodePath) {
        report = await window.dsh.env.inspect();
        setEnvReport(report);
      }
      if (!report?.effectiveNodePath) {
        // try download
        const nodePath = await window.dsh.env.provisionNode();
        report = await window.dsh.env.inspect();
        setEnvReport(report);
        if (!report?.effectiveNodePath) {
          throw new Error('Failed to acquire Node.js runtime (downloaded ' + nodePath + ')');
        }
      }
      // 2. 启动
      const s = await window.dsh.dsh.start();
      setStatus(s);
    } catch (e: any) {
      log.error('dsh start failed', e);
      alert('Failed to start dsh: ' + (e?.message || String(e)));
    } finally {
      setStarting(false);
      setEnvProgress(null);
    }
  }

  async function handleStop() {
    try { await window.dsh.dsh.stop(); } catch (e) { log.error(e); }
  }
  async function handleRestart() {
    try { await window.dsh.dsh.restart(); } catch (e) { log.error(e); }
  }

  async function setTerminalOpenPersist(next: boolean) {
    setTerminalOpen(next);
    await persistTerminal(next, terminalHeight);
  }

  async function updateSettingsPatch(patch: Partial<AppSettings>) {
    if (!settings) return;
    const next: AppSettings = JSON.parse(JSON.stringify(settings));
    deepMerge(next, patch);
    // apply to store by each top-level key
    const keys = Object.keys(patch) as (keyof AppSettings)[];
    for (const k of keys) {
      await window.dsh.store.set(k, next[k]);
    }
    setSettings(next);
  }

  return (
    <div className="app-shell">
      <TitleBar status={status} onOpenSettings={() => setShowSettings(true)} />

      <div className="body">
        <Sidebar
          status={status}
          starting={starting}
          onStart={handleStart}
          onStop={handleStop}
          onRestart={handleRestart}
          onOpenSettings={() => setShowSettings(true)}
        />

        <div className="content" style={{ minHeight: 0 }}>
          <DshWebview
            status={status}
            envReport={envReport}
            onStart={handleStart}
            starting={starting}
            envProgress={envProgress}
          />
          {terminalOpen && (
            <TerminalPanel
              height={terminalHeight}
              onHeightChange={(h) => {
                setTerminalHeight(h);
                void persistTerminal(terminalOpen, h);
              }}
              onClose={() => setTerminalOpenPersist(false)}
            />
          )}
        </div>
      </div>

      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          envReport={envReport}
          onClose={() => setShowSettings(false)}
          onChange={(patch) => void updateSettingsPatch(patch)}
          onDownloadNode={async () => {
            setEnvProgress({ pct: 0 });
            try {
              await window.dsh.env.provisionNode();
              const r = await window.dsh.env.inspect();
              setEnvReport(r);
            } finally {
              setEnvProgress(null);
            }
          }}
        />
      )}
    </div>
  );
};

function deepMerge<T extends Record<string, any>>(target: T, patch: Partial<T>) {
  for (const k of Object.keys(patch) as (keyof T)[]) {
    const pv = patch[k] as any;
    if (pv && typeof pv === 'object' && !Array.isArray(pv)) {
      if (!target[k] || typeof target[k] !== 'object') {
        (target as any)[k] = {} as any;
      }
      deepMerge(target[k] as any, pv);
    } else {
      (target as any)[k] = pv;
    }
  }
}

export default App;
