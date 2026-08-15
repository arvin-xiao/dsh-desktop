import React, { useEffect, useState } from 'react';
import type { DshStatusInfo } from '@shared/types';

interface Props {
  status: DshStatusInfo;
  onOpenSettings: () => void;
}

const TitleBar: React.FC<Props> = ({ status, onOpenSettings }) => {
  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    (async () => setIsMax(await window.dsh.window.isMaximized()))();
  }, []);

  const label: Record<DshStatusInfo['status'], string> = {
    idle: 'Idle',
    starting: 'Starting…',
    running: 'Running',
    stopping: 'Stopping…',
    error: 'Error',
  };

  return (
    <div className="titlebar">
      <div className="brand">
        <div className="brand-badge" title="DeepSeek Harness">
          <DeepSeekLogoMark />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <div style={{ fontWeight: 700, letterSpacing: 0.2 }}>DSH Desktop</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 500, marginTop: 2 }}>
            DeepSeek Harness
          </div>
        </div>
        {status.url && (
          <div className="badge" style={{ marginLeft: 4 }}>
            {status.url.replace('http://', '')}
          </div>
        )}
      </div>

      <div className="spacer" />

      <div className="status">
        <span className={`dot ${status.status}`} />
        <span>{label[status.status]}</span>
        {status.port && <span style={{ marginLeft: 6 }} className="badge">:{status.port}</span>}
      </div>

      <div className="actions">
        <button
          className="tb-btn"
          title="Settings"
          onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
          aria-label="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <button
          className="tb-btn"
          title="Minimize"
          onClick={(e) => { e.stopPropagation(); void window.dsh.window.minimize(); }}
          aria-label="Minimize"
        >
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></svg>
        </button>
        <button
          className="tb-btn"
          title={isMax ? 'Restore' : 'Maximize'}
          onClick={async (e) => {
            e.stopPropagation();
            const next = await window.dsh.window.toggleMaximize();
            setIsMax(next);
          }}
          aria-label="Maximize"
        >
          {isMax ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="0.5" width="9" height="9" rx="1.5"/><path d="M1 3.5h-.5A1.5 1.5 0 0 0 2 5V10a1.5 1.5 0 0 0 1.5 1.5H9"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="0.75" y="0.75" width="10.5" height="10.5" rx="1.5"/></svg>
          )}
        </button>
        <button
          className="tb-btn close"
          title="Close"
          onClick={(e) => { e.stopPropagation(); void window.dsh.window.close(); }}
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13"/></svg>
        </button>
      </div>
    </div>
  );
};

// ---- DeepSeek brand logo mark (matches CSS gradient block) ----
const DeepSeekLogoMark: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="tblogo-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.98"/>
        <stop offset="100%" stopColor="#fff" stopOpacity="0.88"/>
      </linearGradient>
    </defs>
    <path
      d="M8.2 5.3c.5 0 .8.4.8.9V17.8c0 .5-.3.9-.8.9s-.8-.4-.8-.9V6.2c0-.5.3-.9.8-.9Zm3.34 0h1.9c2.8 0 5 2 5 4.6v2.2c0 2.6-2.2 4.6-5 4.6h-1.9c-.4 0-.8-.4-.8-.9V6.2c0-.5.4-.9.8-.9Zm0 1.8v5.8h1.9c1.6 0 3.3-.9 3.3-2.9v-.1c0-1.9-1.7-2.8-3.3-2.8h-1.9Z"
      fill="url(#tblogo-g)"
    />
  </svg>
);

export default TitleBar;
