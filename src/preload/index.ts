import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/types';
import type { AppSettings, DshStatusInfo, DshVersionInfo, EnvReport } from '../shared/types';

type Listener = (...args: any[]) => void;

function listenTo(channel: string) {
  return (cb: Listener) => {
    const listener = (_evt: any, ...args: any[]) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.off(channel, listener);
  };
}

const dsh = {
  start: (): Promise<DshStatusInfo> => ipcRenderer.invoke(IpcChannels.DSH_START),
  stop: (): Promise<void> => ipcRenderer.invoke(IpcChannels.DSH_STOP),
  restart: (): Promise<DshStatusInfo> => ipcRenderer.invoke(IpcChannels.DSH_RESTART),
  status: (): Promise<DshStatusInfo> => ipcRenderer.invoke(IpcChannels.DSH_STATUS),
  terminalWrite: (data: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.DSH_TERMINAL_WRITE, data),
  // version sync
  checkUpdate: (): Promise<DshVersionInfo> =>
    ipcRenderer.invoke(IpcChannels.DSH_CHECK_UPDATE),
  upgrade: (): Promise<DshVersionInfo> =>
    ipcRenderer.invoke(IpcChannels.DSH_UPGRADE),
  onUpgradeProgress: listenTo(IpcChannels.DSH_ON_UPGRADE_PROGRESS),
  // events
  onStatus: listenTo(IpcChannels.DSH_ON_STATUS),
  onStdout: listenTo(IpcChannels.DSH_ON_STDOUT),
  onStderr: listenTo(IpcChannels.DSH_ON_STDERR),
  onAutoStartRequest: listenTo('dsh:autoStart'),
  onToggleTerminal: listenTo('app:toggle-terminal'),
};

const env = {
  inspect: (): Promise<EnvReport> => ipcRenderer.invoke(IpcChannels.ENV_INSPECT),
  provisionNode: (): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.ENV_PROVISION_NODE),
  onProgress: listenTo(IpcChannels.ENV_ON_PROGRESS),
};

const store = {
  get: <K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> =>
    ipcRenderer.invoke(IpcChannels.STORE_GET, key),
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.STORE_SET, key, value),
  getAll: (): Promise<AppSettings> => ipcRenderer.invoke(IpcChannels.STORE_GET_ALL),
};

const window = {
  minimize: (): Promise<void> => ipcRenderer.invoke(IpcChannels.WINDOW_MINIMIZE),
  toggleMaximize: (): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.WINDOW_MAXIMIZE),
  close: (): Promise<void> => ipcRenderer.invoke(IpcChannels.WINDOW_CLOSE),
  isMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.WINDOW_IS_MAXIMIZED),
};

const shell = {
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.SHELL_OPEN_EXTERNAL, url),
  showItemInFolder: (p: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.SHELL_SHOW_ITEM_IN_FOLDER, p),
};

const app = {
  quit: (): Promise<void> => ipcRenderer.invoke(IpcChannels.APP_QUIT),
  relaunch: (): Promise<void> => ipcRenderer.invoke(IpcChannels.APP_RELAUNCH),
};

export interface DshDesktopApi {
  dsh: typeof dsh;
  env: typeof env;
  store: typeof store;
  window: typeof window;
  shell: typeof shell;
  app: typeof app;
}

const api: DshDesktopApi = {
  dsh,
  env,
  store,
  window,
  shell,
  app,
};

contextBridge.exposeInMainWorld('dsh', api);
