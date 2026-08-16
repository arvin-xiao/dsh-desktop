import React, { useEffect, useState } from 'react';
import type { DshStatusInfo } from '@shared/types';

interface Props {
  status: DshStatusInfo;
  starting: boolean;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
}

const Sidebar: React.FC<Props> = ({ status, starting, onStart, onStop, onRestart, onOpenSettings }) => {
  const running = status.status === 'running';
  const busy = starting || status.status === 'starting' || status.status === 'stopping';
  return (
    <aside className="sidebar">
      <div className="section-title">Control</div>
      <button
        className="btn primary"
        disabled={busy || running}
        onClick={onStart}
      >
        <PlayIcon /> {starting ? 'Starting…' : running ? 'Already Running' : 'Start DeepSeek Harness'}
      </button>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button className="btn" style={{ flex: 1 }} disabled={!running} onClick={onRestart}>
          <RefreshIcon /> Restart
        </button>
        <button className="btn" style={{ flex: 1 }} disabled={!running} onClick={onStop}>
          <StopIcon /> Stop
        </button>
      </div>

      <div className="spacer" />

      <div className="section-title">Quick Links</div>
      <button className="btn" onClick={() => void window.dsh.shell.openExternal('https://deepseek-harness.github.io/deepseek-harness/')}>
        <BookIcon /> Documentation
      </button>
      <button className="btn" onClick={() => void window.dsh.shell.openExternal('https://github.com/deepseek-ai/deepseek-harness')}>
        <GithubIcon /> GitHub Repository
      </button>
      <button className="btn" onClick={() => void window.dsh.shell.openExternal('https://github.com/topics/dsh-plugin')}>
        <PuzzleIcon /> Community Plugins
      </button>

      <div style={{ height: 12 }} />
      <div className="section-title">App</div>
      <button className="btn" onClick={onOpenSettings}>
        <CogIcon /> Settings
      </button>
      <button className="btn" onClick={() => {
        if (confirm('Restart DSH Desktop?')) void window.dsh.app.relaunch();
      }}>
        <RepeatIcon /> Relaunch App
      </button>
      <button className="btn" onClick={() => {
        if (confirm('Quit DSH Desktop?')) void window.dsh.app.quit();
      }}>
        <QuitIcon /> Quit
      </button>

      <div className="status-row">
        <div className="avatar" title="DeepSeek Harness Desktop">
          <MiniBrandMark />
        </div>
        <div className="who">
          <div className="n">DeepSeek Harness</div>
          <div className="v">Desktop · 0.1.0</div>
        </div>
      </div>
    </aside>
  );
};

// Tiny brand mark used in the sidebar footer (matches titlebar plaque).
const MiniBrandMark: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="sb-avatar-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.98"/>
        <stop offset="100%" stopColor="#fff" stopOpacity="0.88"/>
      </linearGradient>
    </defs>
    <path
      d="M5.2 4.2A1.8 1.8 0 0 1 7 2.4h6.4c5 0 9 4.1 9 9v5.2c0 5-4 9-9 9H7a1.8 1.8 0 0 1-1.8-1.8V4.2Z"
      fill="url(#sb-avatar-g)"
      opacity="0.1"
    />
    <path
      d="M8.2 6c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1s-1-.45-1-1V7c0-.55.45-1 1-1Zm3.6 0h2c2.9 0 5.2 2.3 5.2 5.2v1.6c0 2.9-2.3 5.2-5.2 5.2h-2c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1Zm0 1.8v6.8h2c1.7 0 3.2-1.3 3.2-3.2v-.4c0-1.9-1.5-3.2-3.2-3.2h-2Z"
      fill="url(#sb-avatar-g)"
    />
  </svg>
);

// ----- icons -----
const icon = (d: string) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const PlayIcon = () => icon('M5 3l14 9-14 9V3z');
const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
);
const RefreshIcon = () => icon('M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15');
const BookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);
const GithubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.93c.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.33.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.24 2.75.12 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z"/></svg>
);
const PuzzleIcon = () => icon('M19.439 7.85A3 3 0 0 0 15.5 5c0-1.23-.76-2.3-1.85-2.78a3 3 0 0 0-5.12 1.98A3 3 0 0 0 4.5 6a3 3 0 0 0 .86 5.87A3 3 0 0 0 5 14a3 3 0 0 0 5.87 1.36A3 3 0 0 0 14.5 18c1.1 0 2.06-.6 2.59-1.5a3 3 0 0 0 3.85-4.04 3 3 0 0 0-1.5-4.61z');
const CogIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
);
const RepeatIcon = () => icon('M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3');
const QuitIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
);

export default Sidebar;
