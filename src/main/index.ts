import { app, BrowserWindow } from 'electron';
import { setupLogger, log } from './utils/logger';
import { buildAugmentedPath } from './utils/npx-path';
import { WindowManager } from './modules/window';
import { EnvProvisioner } from './modules/env-provisioner';
import { registerIpcHandlers, Runtime } from './modules/ipc';
import { getStore } from './modules/store';
import type { AppSettings } from '../shared/types';

// 单例
declare global {
  namespace NodeJS {
    interface Process {
      noAsar?: boolean;
    }
  }
}
// 让 Electron 类型通过 app.isQuiting
declare module 'electron' {
  interface App {
    isQuiting?: boolean;
  }
}

const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1';

// ---- PATH augmentation (highest priority, before any child-process work) ----
// In particular, double-click launched macOS apps get a PATH that is missing
// Homebrew (/opt/homebrew/bin, /usr/local/bin), nvm, volta, nodenv, asdf dirs.
// Fixing it globally at boot means which()/spawn()/execFile() in all modules
// will resolve `node`/`npx`/`npm` the same way the user's shell does.
(() => {
  const before = process.env.PATH || '';
  const augmented = buildAugmentedPath(before);
  if (augmented !== before) {
    process.env.PATH = augmented;
    (process.env as any).Path = augmented; // win32 compat
  }
})();

// ---- Logging first ----
setupLogger();
log.info(`[boot] dsh-desktop starting (isDev=${isDev})`);
log.info('[boot] platform=', process.platform, 'arch=', process.arch);
log.info('[boot] electron version=', process.versions.electron, 'node=', process.version);
log.info('[boot] PATH=', process.env.PATH);

app.name = 'DSH Desktop';
if (process.platform === 'win32') {
  app.setAppUserModelId('com.deepseek.harness.desktop');
}

const rt: Runtime = {
  winMgr: new WindowManager(isDev),
  envProvisioner: new EnvProvisioner(),
  dsh: null,
};
registerIpcHandlers(rt);

// -------- single instance lock --------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log.warn('[boot] second instance detected, quitting');
  app.quit();
} else {
  app.on('second-instance', () => rt.winMgr.showMainWindow());
}

// -------- app lifecycle --------
app.whenReady().then(async () => {
  try {
    rt.winMgr.buildAppMenu();
    rt.winMgr.createTray();
    rt.winMgr.registerGlobalShortcuts();
    await rt.winMgr.createMainWindow();
    // apply startOnLogin
    try {
      const s = (getStore().store as AppSettings).app;
      app.setLoginItemSettings({
        openAtLogin: !!s.startOnLogin,
      });
    } catch {}
    // AutoStart if settings.dsh.autoStart
    const autoStart = (getStore().store as AppSettings).dsh.autoStart;
    if (autoStart) {
      const w = rt.winMgr.mainWindow;
      setTimeout(() => w?.webContents.send('dsh:autoStart'), 800);
    }
  } catch (e) {
    log.error('[boot] whenReady failed:', e);
  }
});

app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  // BUT: if user explicitly triggered quit (app.isQuiting is true),
  // we must respect that even on darwin.
  if (process.platform !== 'darwin' || app.isQuiting) {
    app.isQuiting = true;
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  // BUT: skip if we are in the middle of quitting.
  if (!app.isQuiting && BrowserWindow.getAllWindows().length === 0) {
    rt.winMgr.createMainWindow();
  }
});

app.on('before-quit', (e) => {
  if (!(app as any)._dshShutdownHandled) {
    e.preventDefault();
    // --- Critical: set isQuiting IMMEDIATELY ---
    // This flag is checked in win.on('close') to bypass minimize-to-tray,
    // and in window-all-closed to force quit on macOS. Without setting it
    // here, the 2nd app.quit() will attempt to close the window, the
    // close-event handler sees minimizeToTray=true + !isQuiting, and calls
    // e.preventDefault() + win.hide() — leaving the app running forever
    // in the Dock with no visible window.
    app.isQuiting = true;
    (app as any)._dshShutdownHandled = true;

    // Give immediate visual feedback: hide window + destroy tray so that
    // the Dock icon actually disappears / stops bouncing even if the
    // dsh shutdown takes a couple of seconds.
    try {
      if (rt.winMgr.tray) {
        rt.winMgr.tray.destroy();
        rt.winMgr.tray = null;
      }
    } catch {}
    try { rt.winMgr.mainWindow?.hide(); } catch {}

    // Run shutdown asynchronously (Electron does NOT await async event
    // callbacks), then re-issue app.quit() once cleanup is done. We also
    // add a hard process.exit() fallback so the app can never get stuck
    // (e.g. if node-pty / child_process refuses to die).
    const shutdown = async () => {
      try {
        rt.winMgr.unregisterGlobalShortcuts();
      } catch (err) {
        log.warn('[quit] unregister shortcuts failed:', (err as any).message);
      }
      if (rt.dsh) {
        try {
          await Promise.race([
            rt.dsh.stop(5000),
            new Promise<void>((res) => setTimeout(res, 6000)),
          ]);
        } catch (err) {
          log.warn('[quit] dsh.stop error (ignored):', (err as any).message);
        }
      }
      // Force-close any remaining windows directly — bypasses the
      // minimize-to-tray guard because we already set isQuiting=true,
      // but just to be safe we call destroy() which skips 'close'.
      for (const w of BrowserWindow.getAllWindows()) {
        try { w.destroy(); } catch {}
      }
      setTimeout(() => {
        app.quit();
        // Final safety net: if electron-builder / some native module still
        // holds the event loop open after 1.5s, exit the node process.
        setTimeout(() => process.exit(0), 1500).unref();
      }, 0);
    };
    shutdown();
  }
});

process.on('uncaughtException', (e) => {
  log.error('[uncaughtException]', e);
});
process.on('unhandledRejection', (e) => {
  log.error('[unhandledRejection]', e);
});
