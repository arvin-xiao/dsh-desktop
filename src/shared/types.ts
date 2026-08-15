// IPC 通道名、状态枚举、通用类型

export type DshStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'error';

export interface DshStatusInfo {
  status: DshStatus;
  port?: number;
  url?: string;
  error?: string;
  pid?: number;
}

export interface EnvReport {
  systemNode: { path: string; version: string } | null;
  systemNodeSatisfies: boolean;
  bundledNode: { path: string; version: string } | null;
  effectiveNodePath: string;
  dshInstalled: boolean;
  dshVersion?: string;
}

/** dsh 版本同步信息 */
export interface DshVersionInfo {
  /** 当前已安装（npx 缓存）的版本 */
  installedVersion: string | null;
  /** npm registry 上的最新版本 */
  latestVersion: string | null;
  /** 当前配置的目标版本（store 中的值，或构建时默认值） */
  targetVersion: string;
  /** 是否有更新可用 */
  updateAvailable: boolean;
  /** 上次检查时间戳 */
  checkedAt: number;
  /** 查询过程中的错误信息 */
  error?: string;
}

export interface AppSettings {
  window: {
    bounds?: { x: number; y: number; width: number; height: number };
    maximized?: boolean;
    terminalPanelOpen: boolean;
    terminalPanelHeight: number;
  };
  dsh: {
    preferredPort: number;
    autoStart: boolean;
    cwd?: string;
    extraArgs: string[];
    profilePreset: 'standard' | 'code' | 'minimal' | 'creator';
    /** 锁定的 dsh 版本（semver 或 'latest'），默认 DSH_DEFAULT_VERSION */
    version: string;
  };
  env: {
    useSystemNode: boolean;
    bundledNodeVersion: string;
    skipNodeVersionCheck: boolean;
  };
  app: {
    startOnLogin: boolean;
    minimizeToTray: boolean;
    theme: 'system' | 'light' | 'dark';
    language: 'zh-CN' | 'en-US';
  };
}

export const IpcChannels = {
  // window
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
  WINDOW_STATE: 'window:state',
  WINDOW_ON_STATE: 'window:onState',

  // dsh process
  DSH_START: 'dsh:start',
  DSH_STOP: 'dsh:stop',
  DSH_RESTART: 'dsh:restart',
  DSH_STATUS: 'dsh:status',
  DSH_ON_STATUS: 'dsh:onStatus',
  DSH_ON_STDOUT: 'dsh:onStdout',
  DSH_ON_STDERR: 'dsh:onStderr',
  DSH_TERMINAL_WRITE: 'dsh:terminalWrite',

  // dsh version sync
  DSH_CHECK_UPDATE: 'dsh:checkUpdate',
  DSH_UPGRADE: 'dsh:upgrade',
  DSH_ON_UPGRADE_PROGRESS: 'dsh:onUpgradeProgress',

  // env provisioner
  ENV_INSPECT: 'env:inspect',
  ENV_PROVISION_NODE: 'env:provisionNode',
  ENV_ON_PROGRESS: 'env:onProgress',

  // store
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  STORE_GET_ALL: 'store:getAll',

  // shell
  SHELL_OPEN_EXTERNAL: 'shell:openExternal',
  SHELL_SHOW_ITEM_IN_FOLDER: 'shell:showItemInFolder',

  // app
  APP_QUIT: 'app:quit',
  APP_RELAUNCH: 'app:relaunch',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
