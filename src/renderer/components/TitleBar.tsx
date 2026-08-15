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
        <div className="brand-badge">D</div>
        <div>DSH Desktop</div>
        <div className="badge" style={{ marginLeft: 4 }}>
          {status.url ? status.url.replace('http://', '') : 'local'}
        </div>
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

export default TitleBar;
