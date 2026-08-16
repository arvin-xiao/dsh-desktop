import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

interface Props {
  height: number;
  onHeightChange: (h: number) => void;
  onClose: () => void;
}

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;

const TerminalPanel: React.FC<Props> = ({ height, onHeightChange, onClose }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const [, force] = useState(0);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      convertEol: true,
      scrollback: 5000,
      allowProposedApi: true,
      theme: {
        background: '#0a0e1a',
        foreground: '#e5e7eb',
        cursor: '#93c5fd',
        selectionBackground: 'rgba(148,163,184,0.3)',
        black: '#1e293b', red: '#f87171', green: '#34d399', yellow: '#fbbf24',
        blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e5e7eb',
        brightBlack: '#475569', brightRed: '#fca5a5', brightGreen: '#6ee7b7', brightYellow: '#fde68a',
        brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9', brightWhite: '#f1f5f9',
      },
    });
    const fitAddon = new FitAddon();
    const links = new WebLinksAddon((_, url) => void window.dsh.shell.openExternal(url));
    term.loadAddon(fitAddon);
    term.loadAddon(links);
    term.open(container);
    fitAddon.fit();
    term.writeln('\x1b[90m[DSH Desktop] Terminal output from DeepSeek Harness will appear here.\x1b[0m');
    term.writeln('\x1b[90mYou may type input when prompted (e.g. y/N confirmations).\x1b[0m');
    term.writeln('');
    termRef.current = term;
    fitRef.current = fitAddon;

    term.onData((data) => void window.dsh.dsh.terminalWrite(data));

    // subscribe to stdout/stderr
    const off1 = window.dsh.dsh.onStdout((data: string) => {
      try { term.write(data); } catch {}
    });
    const off2 = window.dsh.dsh.onStderr((data: string) => {
      try { term.write(data); } catch {}
    });

    const ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    if (wrapRef.current) ro.observe(wrapRef.current);

    return () => {
      off1();
      off2();
      ro.disconnect();
      term.dispose();
    };
  }, []);

  // Resize fit when height changes
  useEffect(() => {
    setTimeout(() => {
      try { fitRef.current?.fit(); } catch {}
      force((n) => n + 1);
    }, 50);
  }, [height]);

  function onDragMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      // drag up → increases panel height (since panel is on bottom)
      const delta = startY - ev.clientY;
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startH + delta));
      onHeightChange(next);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <div ref={wrapRef} className="terminal-panel" style={{ height }}>
      <div
        style={{
          height: 4,
          cursor: 'ns-resize',
          background: 'transparent',
          width: '100%',
          flexShrink: 0,
          marginTop: -4,
        }}
        onMouseDown={onDragMouseDown}
        title="Resize terminal"
      />
      <div className="header">
        <span className="title">Terminal — dsh process output</span>
        <span className="spacer" />
        <button className="tbtn" onClick={() => {
          try { termRef.current?.clear(); } catch {}
        }} title="Clear">Clear</button>
        <button className="tbtn" onClick={onClose} title="Hide">Hide</button>
      </div>
      <div ref={mountRef} style={{ flex: '1 1 auto', minHeight: 0 }} />
    </div>
  );
};

export default TerminalPanel;
