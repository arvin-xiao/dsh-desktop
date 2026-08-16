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

  const dotClass = (() => {
    if (status.status === 'running') return 'ready';
    if (status.status === 'error') return 'error';
    if (status.status === 'starting' || status.status === 'stopping') return 'booting';
    return '';
  })();

  return (
    <div className="titlebar">
      <div className="brand">
        <div className="brand-badge" title="DeepSeek Harness">
          <DeepSeekLogoMark />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <div className="brand-name">DSH Desktop</div>
          <div className="brand-sub">DeepSeek Harness</div>
        </div>
        {status.url && (
          <div className="chip" style={{ marginLeft: 10, fontSize: 10.5 }}>
            {status.url.replace('http://', '')}
          </div>
        )}
      </div>

      <div className="spacer" />

      <div className="status" style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 10, color: 'var(--label-secondary)', fontSize: 12 }}>
        <span className={`status-dot ${dotClass}`} />
        <span>{label[status.status]}</span>
        {status.port && <span className="chip" style={{ fontSize: 10.5 }}>:{status.port}</span>}
      </div>

      <div className="toolbar">
        <button
          className="tbtn"
          title="Settings"
          onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
          aria-label="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <button
          className="tbtn"
          title="Minimize"
          onClick={(e) => { e.stopPropagation(); void window.dsh.window.minimize(); }}
          aria-label="Minimize"
        >
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></svg>
        </button>
        <button
          className="tbtn"
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
          className="tbtn close"
          title="Close"
          onClick={(e) => { e.stopPropagation(); void window.dsh.window.close(); }}
          aria-label="Close"
          style={{ marginLeft: 2 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13"/></svg>
        </button>
      </div>
    </div>
  );
};

// ---- DeepSeek brand logo mark (matches CSS gradient block) ----
const DeepSeekLogoMark: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="tblogo-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.98"/>
        <stop offset="100%" stopColor="#fff" stopOpacity="0.88"/>
      </linearGradient>
    </defs>
    <path
      d="M5.2 4.2A1.8 1.8 0 0 1 7 2.4h6.4c5 0 9 4.1 9 9v5.2c0 5-4 9-9 9H7a1.8 1.8 0 0 1-1.8-1.8V4.2Z"
      fill="url(#tblogo-g)"
      opacity="0.08"
    />
    <path
      d="M8.2 6c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1s-1-.45-1-1V7c0-.55.45-1 1-1Zm3.6 0h2c2.9 0 5.2 2.3 5.2 5.2v1.6c0 2.9-2.3 5.2-5.2 5.2h-2c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1Zm0 1.8v6.8h2c1.7 0 3.2-1.3 3.2-3.2v-.4c0-1.9-1.5-3.2-3.2-3.2h-2Z"
      fill="url(#tblogo-g)"
    />
  </svg>
);

export default TitleBar;
