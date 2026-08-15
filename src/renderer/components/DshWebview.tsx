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
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: 'white', display: 'grid', placeItems: 'center',
                fontSize: 28, fontWeight: 800,
              }}>DSH</div>
            </div>
            <h2>Welcome to DeepSeek Harness</h2>
            <p>
              An agent harness with everything as plugins. Click <b>Start DeepSeek Harness</b> to
              boot the runtime and begin.
            </p>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              textAlign: 'left',
              marginTop: 18,
              padding: 14,
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'var(--bg-elev-2)',
            }}>
              <EnvSummary envReport={envReport} />
              {status.status === 'error' && (
                <div className="badge err" style={{ alignSelf: 'flex-start' }}>
                  Error: {status.error || 'Unknown'}
                </div>
              )}
              {(starting || status.status === 'starting') && (
                <div className="progress">
                  <div className="bar" style={{ width: `${clampPercent(startingProgress(envProgress))}%` }} />
                </div>
              )}
              {needNodeDownload && (
                <div className="badge warn" style={{ alignSelf: 'flex-start' }}>
                  No Node.js &ge; {MIN_NODE_VERSION} detected. Click Start to download automatically.
                </div>
              )}
            </div>
            <div style={{ height: 18 }} />
            <button
              className="btn primary"
              onClick={onStart}
              disabled={starting || status.status === 'starting'}
              style={{ padding: '10px 20px', fontSize: 14 }}
            >
              {starting ? 'Starting up…' : needNodeDownload ? 'Download Node.js & Start' : 'Start DeepSeek Harness'}
            </button>
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
            <p>Waiting for the web interface to load at {status.url}.</p>
            <div className="progress"><div className="bar" style={{ width: '60%' }} /></div>
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
  if (!envReport) return <div className="badge">Checking runtime…</div>;
  return (
    <ul className="report-list">
      <li>
        <span>System Node</span>
        {envReport.systemNode ? (
          <span className={envReport.systemNodeSatisfies ? 'badge ok' : 'badge warn'}>
            {envReport.systemNode.version}
          </span>
        ) : (
          <span className="badge err">Not found</span>
        )}
      </li>
      <li>
        <span>Portable Node</span>
        {envReport.bundledNode ? (
          <span className="badge ok">{envReport.bundledNode.version}</span>
        ) : (
          <span className="badge">Not cached</span>
        )}
      </li>
      <li>
        <span>dsh package</span>
        {envReport.dshInstalled ? (
          <span className="badge ok">
            {envReport.dshVersion ? `v${envReport.dshVersion}` : 'Installed'}
          </span>
        ) : (
          <span className="badge warn">Not installed (will auto-install)</span>
        )}
      </li>
    </ul>
  );
}

function startingProgress(p: { pct: number } | null): number {
  if (!p) return 20;
  return Math.max(5, Math.min(95, p.pct * 100));
}
function clampPercent(n: number): number { return Math.max(0, Math.min(100, n)); }

export default DshWebview;
