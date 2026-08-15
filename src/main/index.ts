import { app, BrowserWindow } from 'electron';
import { setupLogger, log } from './utils/logger';
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

// ---- Logging first ----
setupLogger();
log.info(`[boot] dsh-desktop starting (isDev=${isDev})`);
log.info('[boot] platform=', process.platform, 'arch=', process.arch);
log.info('[boot] electron version=', process.versions.electron, 'node=', process.version);

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
  if (process.platform !== 'darwin') {
    app.isQuiting = true;
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) rt.winMgr.createMainWindow();
});

app.on('before-quit', async (e) => {
  if (!(app as any)._dshShutdownHandled) {
    e.preventDefault();
    (app as any)._dshShutdownHandled = true;
    try {
      rt.winMgr.unregisterGlobalShortcuts();
      if (rt.dsh) {
        await rt.dsh.stop(5000).catch(() => {});
      }
    } catch {}
    setTimeout(() => app.quit(), 50);
  }
});

process.on('uncaughtException', (e) => {
  log.error('[uncaughtException]', e);
});
process.on('unhandledRejection', (e) => {
  log.error('[unhandledRejection]', e);
});
