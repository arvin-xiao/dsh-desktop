import React, { useEffect, useRef, useState } from 'react';
import type { DshStatusInfo, EnvReport } from '@shared/types';
import { MIN_NODE_VERSION } from '@shared/constants';

interface Props {
  status: DshStatusInfo;
  envReport: EnvReport | null;
  starting: boolean;
  envProgress: { pct: number } | null;
  onStart: () => void;
}

const DshWebview: React.FC<Props> = ({ status, envReport, starting, envProgress, onStart }) => {
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const [didStartLoad, setDidStartLoad] = useState(false);
  const lastLoadedUrlRef = useRef<string>('');

  // Whenever status.url changes and is running, load into webview
  useEffect(() => {
    const wv = webviewRef.current;
    const url = status.url;
    if (!wv || !url) return;
    if (status.status === 'running' && lastLoadedUrlRef.current !== url) {
      lastLoadedUrlRef.current = url;
      setDidStartLoad(false);
      try {
        wv.loadURL(url);
      } catch (e) {
        console.error(e);
      }
    }
    if (status.status === 'idle' || status.status === 'error') {
      lastLoadedUrlRef.current = '';
      setDidStartLoad(false);
    }
  }, [status.url, status.status]);

  const needNodeDownload = !!envReport && !envReport.effectiveNodePath;

  if (status.status !== 'running') {
    return (
      <div className="webview-wrap">
        <div className="webview-placeholder">
          <div className="card">
            <div className="brand-badge-hero">
              <DeepSeekLogoSvg size={44} />
            </div>
            <h2>Welcome to DeepSeek Harness</h2>
            <p className="subtitle">
              An agent harness with everything as plugins. Click <b>Start DeepSeek Harness</b> to
              boot the runtime and begin.
            </p>
            <div className="env-summary-card">
              <EnvSummary envReport={envReport} />
              {status.status === 'error' && (
                <div className="chip err" style={{ alignSelf: 'flex-start' }}>
                  Error: {status.error || 'Unknown'}
                </div>
              )}
              {(starting || status.status === 'starting') && (
                <div className="progress">
                  <span style={{ width: `${clampPercent(startingProgress(envProgress))}%` }} />
                </div>
              )}
              {needNodeDownload && (
                <div className="chip warn" style={{ alignSelf: 'flex-start' }}>
                  No Node.js &ge; {MIN_NODE_VERSION} detected. Click Start to download automatically.
                </div>
              )}
            </div>
            <div className="actions">
              <button
                className="btn primary"
                onClick={onStart}
                disabled={starting || status.status === 'starting'}
              >
                {starting ? 'Starting up…' : needNodeDownload ? 'Download Node.js & Start' : 'Start DeepSeek Harness'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="webview-wrap">
      {!didStartLoad && (
        <div className="webview-placeholder">
          <div className="card">
            <h2>Loading DSH UI…</h2>
            <p className="subtitle">Waiting for the web interface to load at {status.url}.</p>
            <div className="progress"><span style={{ width: '60%' }} /></div>
          </div>
        </div>
      )}
      <webview
        ref={webviewRef as any}
        src={status.url}
        partition="persist:dsh-session"
        style={{
          display: didStartLoad ? 'inline-flex' : 'none',
          width: '100%',
          height: '100%',
          background: 'white',
        }}
        onDidAttach={() => {
          const wv = webviewRef.current;
          if (!wv) return;
          wv.addEventListener('did-start-loading', () => {});
          wv.addEventListener('dom-ready', () => {
            setDidStartLoad(true);
          });
          wv.addEventListener('did-fail-load', (e: any) => {
            console.warn('webview fail load', e.errorDescription, e.validatedURL);
          });
          wv.addEventListener('new-window', (e: any) => {
            // Open all <a target=_blank> externally
            void window.dsh.shell.openExternal(e.url);
          });
        }}
      />
    </div>
  );
};

function EnvSummary({ envReport }: { envReport: EnvReport | null }) {
  if (!envReport) return <div className="chip">Checking runtime…</div>;
  return (
    <>
      <SummaryRow label="System Node">
        {envReport.systemNode ? (
          <span className={`chip ${envReport.systemNodeSatisfies ? 'ok' : 'warn'}`}>
            {envReport.systemNode.version}
          </span>
        ) : (
          <span className="chip err">Not found</span>
        )}
      </SummaryRow>
      <SummaryRow label="Portable Node">
        {envReport.bundledNode ? (
          <span className="chip ok">{envReport.bundledNode.version}</span>
        ) : (
          <span className="chip">Not cached</span>
        )}
      </SummaryRow>
      <SummaryRow label="dsh package">
        {envReport.dshInstalled ? (
          <span className="chip ok">
            {envReport.dshVersion ? `v${envReport.dshVersion}` : 'Installed'}
          </span>
        ) : (
          <span className="chip warn">Not installed (will auto-install)</span>
        )}
      </SummaryRow>
    </>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <span className="l">{label}</span>
      {children}
    </div>
  );
}

function startingProgress(p: { pct: number } | null): number {
  if (!p) return 20;
  return Math.max(5, Math.min(95, p.pct * 100));
}
function clampPercent(n: number): number { return Math.max(0, Math.min(100, n)); }

const DeepSeekLogoSvg: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <defs>
      <linearGradient id="dsh-logo-inner" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.85" />
      </linearGradient>
    </defs>
    {/* rounded rect "D" shape — DeepSeek-inspired mark */}
    <path
      d="M10 6.5A3.5 3.5 0 0 1 13.5 3H28.5C36 3 42 9.1 42 16.5v15C42 38.9 36 45 28.5 45H13.5A3.5 3.5 0 0 1 10 41.5V6.5Z"
      fill="url(#dsh-logo-inner)"
      opacity="0.08"
    />
    {/* stylized letters "D" and "S" — evokes DeepSeek Harness brand */}
    <path
      d="M16 12.5c.7 0 1.2.5 1.2 1.2V34.3c0 .7-.5 1.2-1.2 1.2s-1.2-.5-1.2-1.2V13.7c0-.7.5-1.2 1.2-1.2Zm5 0.5h2.9c4.3 0 7.7 3.1 7.7 7.2v4.1c0 4.1-3.4 7.2-7.7 7.2H21c-.7 0-1.2-.5-1.2-1.2V13.7c0-.7.5-1.2 1.2-1.2Zm0 2.8v9h2.9c2.5 0 4.8-1.5 4.8-4.4v-.2c0-2.8-2.3-4.4-4.8-4.4H21Zm8.6 1.3c0-.7.5-1.2 1.2-1.2h2.7c.7 0 1.2.5 1.2 1.2v1.8c0 .7-.5 1.2-1.2 1.2h-1.3c-.7 0-1.2.5-1.2 1.2v1.2c0 .7.5 1.2 1.2 1.2h1.3c.7 0 1.2.5 1.2 1.2v1.8c0 .7-.5 1.2-1.2 1.2h-2.7c-.7 0-1.2-.5-1.2-1.2v-1.6c0-.7.5-1.2 1.2-1.2h1.3c.7 0 1.2-.5 1.2-1.2v-.8c0-.7-.5-1.2-1.2-1.2h-1.3c-.7 0-1.2-.5-1.2-1.2v-1.6Z"
      fill="url(#dsh-logo-inner)"
    />
  </svg>
);

export default DshWebview;
