import Store from 'electron-store';
import type { AppSettings } from '../../shared/types';
import { DSH_DEFAULT_VERSION } from '../../shared/constants';

const DEFAULTS: AppSettings = {
  window: {
    terminalPanelOpen: true,
    terminalPanelHeight: 240,
  },
  dsh: {
    preferredPort: 3080,
    autoStart: true,
    extraArgs: [],
    profilePreset: 'standard',
    version: DSH_DEFAULT_VERSION,
  },
  env: {
    useSystemNode: true,
    bundledNodeVersion: '22.15.0',
    skipNodeVersionCheck: false,
  },
  app: {
    startOnLogin: false,
    minimizeToTray: true,
    theme: 'system',
    language: 'zh-CN',
  },
};

let store: Store<AppSettings> | null = null;

export function getStore(): Store<AppSettings> {
  if (!store) {
    store = new Store<AppSettings>({
      defaults: DEFAULTS,
      name: 'config',
      clearInvalidConfig: true,
    });
  }
  return store;
}

export function getDefaults(): AppSettings {
  return JSON.parse(JSON.stringify(DEFAULTS));
}
