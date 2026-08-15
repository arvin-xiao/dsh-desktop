import { app, ipcMain, shell, BrowserWindow } from 'electron';
import type { AppSettings, EnvReport, DshVersionInfo } from '../../shared/types';
import { IpcChannels } from '../../shared/types';
import { WindowManager } from './window';
import { DshProcess } from './dsh-process';
import { EnvProvisioner } from './env-provisioner';
import { findFreePort } from './port-scanner';
import { getStore } from './store';
import { checkDshVersion, upgradeDsh } from './dsh-version';
import { log } from '../utils/logger';

export interface Runtime {
  winMgr: WindowManager;
  envProvisioner: EnvProvisioner;
  dsh: DshProcess | null;
}

export function registerIpcHandlers(rt: Runtime) {
  // ------- window -------
  ipcMain.handle(IpcChannels.WINDOW_MINIMIZE, () => {
    const w = BrowserWindow.getFocusedWindow() || rt.winMgr.mainWindow;
    w?.minimize();
  });
  ipcMain.handle(IpcChannels.WINDOW_MAXIMIZE, () => {
    const w = BrowserWindow.getFocusedWindow() || rt.winMgr.mainWindow;
    if (!w) return false;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
    return w.isMaximized();
  });
  ipcMain.handle(IpcChannels.WINDOW_CLOSE, () => {
    const w = BrowserWindow.getFocusedWindow() || rt.winMgr.mainWindow;
    w?.close();
  });
  ipcMain.handle(IpcChannels.WINDOW_IS_MAXIMIZED, () => {
    const w = rt.winMgr.mainWindow;
    return !!w?.isMaximized();
  });

  // ------- dsh -------
  ipcMain.handle(IpcChannels.DSH_START, async () => {
    const store = getStore();
    const settings = store.store as AppSettings;
    // 1. 获取 Node 路径
    const envReport: EnvReport = await rt.envProvisioner.inspect({
      useSystemNode: settings.env.useSystemNode,
      skipNodeVersionCheck: settings.env.skipNodeVersionCheck,
      preferBundledVersion: settings.env.bundledNodeVersion,
    });
    let nodePath = envReport.effectiveNodePath;
    if (!nodePath) {
      // 需要触发下载
      throw new Error('No usable Node.js found. Please run env:provisionNode first.');
    }

    // 2. 选择端口
    const port = await findFreePort(settings.dsh.preferredPort, 20);
    log.info('[ipc.dsh.start] nodePath=', nodePath, 'port=', port, 'dshVersion=', settings.dsh.version);

    // 3. 创建并启动进程
    rt.dsh?.removeAllListeners();
    rt.dsh = new DshProcess(nodePath, {
      cwd: settings.dsh.cwd || app.getPath('home'),
      extraArgs: settings.dsh.extraArgs,
      dshVersion: settings.dsh.version,
    });

    // 把事件转发到所有窗口
    const forward = (ch: string) => (_evt: any, ...args: any[]) => {
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send(ch, ...args);
      }
    };
    rt.dsh.on('status', () =>
      forward(IpcChannels.DSH_ON_STATUS)(null, rt.dsh!.getStatusInfo()),
    );
    rt.dsh.on('stdout', (data) => forward(IpcChannels.DSH_ON_STDOUT)(null, data));
    rt.dsh.on('stderr', (data) => forward(IpcChannels.DSH_ON_STDERR)(null, data));
    // initial status
    forward(IpcChannels.DSH_ON_STATUS)(null, rt.dsh.getStatusInfo());

    try {
      await rt.dsh.start(port);
      return rt.dsh.getStatusInfo();
    } catch (e: any) {
      log.error('[ipc.dsh.start] start failed:', e?.message || e);
      // 确保 status 事件广播了 error
      forward(IpcChannels.DSH_ON_STATUS)(null, rt.dsh!.getStatusInfo());
      throw e;
    }
  });

  ipcMain.handle(IpcChannels.DSH_STOP, async () => {
    if (!rt.dsh) return;
    await rt.dsh.stop();
  });
  ipcMain.handle(IpcChannels.DSH_RESTART, async () => {
    if (!rt.dsh) return ipcMain.emit(IpcChannels.DSH_START);
    const store = getStore();
    const settings = store.store as AppSettings;
    const port = await findFreePort(settings.dsh.preferredPort, 20);
    await rt.dsh.restart(port);
    return rt.dsh.getStatusInfo();
  });
  ipcMain.handle(IpcChannels.DSH_STATUS, () => rt.dsh?.getStatusInfo() || { status: 'idle' });
  ipcMain.handle(IpcChannels.DSH_TERMINAL_WRITE, (_e, data: string) => {
    rt.dsh?.writeToStdin(data);
  });

  // ------- dsh version sync -------
  ipcMain.handle(IpcChannels.DSH_CHECK_UPDATE, async (): Promise<DshVersionInfo> => {
    const store = getStore();
    const settings = store.store as AppSettings;
    const envReport: EnvReport = await rt.envProvisioner.inspect({
      useSystemNode: settings.env.useSystemNode,
      skipNodeVersionCheck: settings.env.skipNodeVersionCheck,
      preferBundledVersion: settings.env.bundledNodeVersion,
      dshVersion: settings.dsh.version,
    });
    const nodePath = envReport.effectiveNodePath || process.execPath;
    try {
      return await checkDshVersion(nodePath, settings.dsh.version);
    } catch (e: any) {
      log.error('[ipc.dsh.checkUpdate] error:', e?.message || e);
      return {
        installedVersion: envReport.dshVersion || null,
        latestVersion: null,
        targetVersion: settings.dsh.version,
        updateAvailable: false,
        checkedAt: Date.now(),
        error: e?.message || String(e),
      };
    }
  });

  ipcMain.handle(IpcChannels.DSH_UPGRADE, async (evt): Promise<DshVersionInfo> => {
    const store = getStore();
    const settings = store.store as AppSettings;
    const sender = evt.sender;
    const envReport: EnvReport = await rt.envProvisioner.inspect({
      useSystemNode: settings.env.useSystemNode,
      skipNodeVersionCheck: settings.env.skipNodeVersionCheck,
      preferBundledVersion: settings.env.bundledNodeVersion,
      dshVersion: settings.dsh.version,
    });
    const nodePath = envReport.effectiveNodePath || process.execPath;
    const targetVersion = settings.dsh.version === 'latest' ? 'latest' : settings.dsh.version;
    try {
      const resolved = await upgradeDsh(nodePath, targetVersion, (chunk) => {
        sender.send(IpcChannels.DSH_ON_UPGRADE_PROGRESS, chunk);
      });
      // 升级成功后重新检查
      return await checkDshVersion(nodePath, settings.dsh.version);
    } catch (e: any) {
      log.error('[ipc.dsh.upgrade] error:', e?.message || e);
      throw e;
    }
  });

  // ------- env -------
  ipcMain.handle(IpcChannels.ENV_INSPECT, () => {
    const store = getStore();
    const settings = store.store as AppSettings;
    return rt.envProvisioner.inspect({
      useSystemNode: settings.env.useSystemNode,
      skipNodeVersionCheck: settings.env.skipNodeVersionCheck,
      preferBundledVersion: settings.env.bundledNodeVersion,
      dshVersion: settings.dsh.version,
    });
  });
  ipcMain.handle(IpcChannels.ENV_PROVISION_NODE, async (evt) => {
    const sender = evt.sender;
    return rt.envProvisioner.downloadBundledNode(
      process.platform as any,
      process.arch as any,
      (pct, bps) => sender.send(IpcChannels.ENV_ON_PROGRESS, { pct, bps }),
    );
  });

  // ------- store -------
  ipcMain.handle(IpcChannels.STORE_GET, (_e, key: string) => {
    const store = getStore();
    return store.get(key as any);
  });
  ipcMain.handle(
    IpcChannels.STORE_SET,
    (_e, key: string, value: unknown) => {
      const store = getStore();
      store.set(key, value as any);
      return true;
    },
  );
  ipcMain.handle(IpcChannels.STORE_GET_ALL, () => {
    return getStore().store;
  });

  // ------- shell -------
  ipcMain.handle(IpcChannels.SHELL_OPEN_EXTERNAL, async (_e, url: string) => {
    return shell.openExternal(url);
  });
  ipcMain.handle(IpcChannels.SHELL_SHOW_ITEM_IN_FOLDER, async (_e, p: string) => {
    return shell.showItemInFolder(p);
  });

  // ------- app -------
  ipcMain.handle(IpcChannels.APP_QUIT, () => {
    app.isQuiting = true;
    app.quit();
  });
  ipcMain.handle(IpcChannels.APP_RELAUNCH, () => {
    app.relaunch();
    app.isQuiting = true;
    app.quit();
  });
}
