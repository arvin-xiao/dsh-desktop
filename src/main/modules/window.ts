import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  globalShortcut,
  shell,
  ipcMain,
  MenuItemConstructorOptions,
  screen,
} from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppSettings } from '../../shared/types';
import { IpcChannels } from '../../shared/types';
import { getStore } from './store';
import { log } from '../utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WindowManager {
  public mainWindow: BrowserWindow | null = null;
  public tray: Tray | null = null;
  private loadingURL = '';

  constructor(private readonly isDev: boolean) {
    this.loadingURL = isDev
      ? 'http://127.0.0.1:5173/index.html'
      : `file://${path.normalize(path.join(__dirname, '..', 'renderer', 'index.html')).split(path.sep).join('/')}`;
  }

  async createMainWindow(): Promise<BrowserWindow> {
    const store = getStore();
    const settings = store.store as AppSettings;
    const savedBounds = settings.window.bounds;
    const workArea = screen.getPrimaryDisplay().workArea;
    const defaultW = 1440;
    const defaultH = 900;
    const width = savedBounds?.width || defaultW;
    const height = savedBounds?.height || defaultH;
    const x =
      savedBounds?.x !== undefined && savedBounds.x >= workArea.x
        ? savedBounds.x
        : Math.max(0, workArea.x + Math.floor((workArea.width - width) / 2));
    const y =
      savedBounds?.y !== undefined && savedBounds.y >= workArea.y
        ? savedBounds.y
        : Math.max(0, workArea.y + Math.floor((workArea.height - height) / 2));

    const iconPath = this._getIconPath();
    const win = new BrowserWindow({
      x, y, width, height,
      minWidth: 1024,
      minHeight: 640,
      frame: false,
      titleBarStyle: 'hiddenInset', // macOS 使用原生交通灯，和 frame(false) 兼容
      show: false,
      backgroundColor: '#0f172a',
      icon: iconPath ? nativeImage.createFromPath(iconPath) : undefined,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        sandbox: false, // node-pty 等需要共享 ABI；通过 contextIsolation + 白名单 preload 保障安全
        nodeIntegration: false,
        webviewTag: true,
        webSecurity: true,
      },
    });

    if (settings.window.maximized) {
      win.maximize();
    }
    win.on('ready-to-show', () => win.show());

    win.on('resize', () => this._persistWindowState());
    win.on('move', () => this._persistWindowState());
    win.on('close', (e) => {
      // minimize to tray 处理
      const s = (getStore().store as AppSettings).app;
      if (s.minimizeToTray && !app.isQuiting) {
        e.preventDefault();
        win.hide();
        this._updateTrayTooltip();
      }
    });
    win.on('closed', () => {
      this.mainWindow = null;
    });

    // Load renderer
    log.info('[window] loading:', this.loadingURL);
    await win.loadURL(this.loadingURL);
    if (this.isDev) {
      // win.webContents.openDevTools({ mode: 'detach' });
    }

    // Open <a target=_blank> externally
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    this.mainWindow = win;
    this._updateTrayTooltip();
    return win;
  }

  showMainWindow() {
    const w = this.mainWindow;
    if (!w) return this.createMainWindow();
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  }

  buildAppMenu() {
    const isMac = process.platform === 'darwin';
    const tpl: MenuItemConstructorOptions[] = [];
    if (isMac) {
      tpl.push({
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: 'Cmd+Q',
            click: () => {
              app.isQuiting = true;
              app.quit();
            },
          },
        ],
      });
    }
    tpl.push({
      label: 'File',
      submenu: [
        {
          label: 'Restart DSH',
          accelerator: isMac ? 'Cmd+Shift+R' : 'Ctrl+Shift+R',
          click: () => this.mainWindow?.webContents.send(IpcChannels.DSH_RESTART),
        },
        { type: 'separator' },
        isMac
          ? { role: 'close' }
          : {
              label: 'Quit',
              accelerator: 'Ctrl+Q',
              click: () => {
                app.isQuiting = true;
                app.quit();
              },
            },
      ],
    });
    tpl.push({
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    });
    tpl.push({
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        {
          label: 'Toggle Terminal Panel',
          accelerator: isMac ? 'Cmd+Shift+T' : 'Ctrl+Shift+T',
          click: () => this.mainWindow?.webContents.send('app:toggle-terminal'),
        },
      ],
    });
    tpl.push({
      label: 'Help',
      submenu: [
        {
          label: 'DeepSeek Harness Documentation',
          click: () => shell.openExternal('https://deepseek-harness.github.io/deepseek-harness/'),
        },
        {
          label: 'GitHub Repository',
          click: () => shell.openExternal('https://github.com/deepseek-ai/deepseek-harness'),
        },
      ],
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
  }

  createTray() {
    const icon = this._getIconPath();
    const img = icon ? nativeImage.createFromPath(icon) : nativeImage.createEmpty();
    if (img.isEmpty()) {
      log.warn('[tray] no tray icon, skipping');
      return;
    }
    try {
      this.tray = new Tray(img.resize({ width: 16, height: 16 }));
      this.tray.setToolTip('DSH Desktop');
      this.tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Show Main Window', click: () => this.showMainWindow() },
          { type: 'separator' },
          {
            label: 'Restart DSH',
            click: () => this.mainWindow?.webContents.send(IpcChannels.DSH_RESTART),
          },
          {
            label: 'Toggle Terminal Panel',
            click: () => this.mainWindow?.webContents.send('app:toggle-terminal'),
          },
          { type: 'separator' },
          {
            label: 'Quit',
            click: () => {
              app.isQuiting = true;
              app.quit();
            },
          },
        ]),
      );
      this.tray.on('click', () => this.showMainWindow());
    } catch (e) {
      log.warn('[tray] create failed:', (e as any).message);
    }
  }

  registerGlobalShortcuts() {
    const isMac = process.platform === 'darwin';
    try {
      globalShortcut.register(isMac ? 'Cmd+Shift+D' : 'Ctrl+Shift+D', () => {
        const w = this.mainWindow;
        if (!w || !w.isVisible()) this.showMainWindow();
        else if (w.isFocused()) w.hide();
        else this.showMainWindow();
      });
      globalShortcut.register(isMac ? 'Cmd+Shift+T' : 'Ctrl+Shift+T', () => {
        this.mainWindow?.webContents.send('app:toggle-terminal');
      });
    } catch (e) {
      log.warn('[shortcuts] register failed', (e as any).message);
    }
  }

  unregisterGlobalShortcuts() {
    globalShortcut.unregisterAll();
  }

  // ---------------- internals ----------------

  private _persistWindowState() {
    const w = this.mainWindow;
    if (!w) return;
    const store = getStore();
    const current = (store.store || {}) as AppSettings;
    try {
      const bounds = w.getBounds();
      const maximized = w.isMaximized();
      store.set('window', {
        ...current.window,
        maximized,
        bounds: maximized ? current.window.bounds : bounds,
      });
    } catch {}
  }

  private _updateTrayTooltip() {
    if (!this.tray) return;
    const s = this.mainWindow?.isVisible() ? 'Running' : 'Minimized to tray';
    this.tray.setToolTip(`DSH Desktop (${s})`);
  }

  private _getIconPath(): string | null {
    // build folder at repo root, look for platform-specific icon
    const iconDir = path.join(__dirname, '..', '..', '..', 'build');
    const candidates: string[] = [];
    if (process.platform === 'win32') candidates.push(path.join(iconDir, 'icon.ico'));
    else if (process.platform === 'darwin') candidates.push(path.join(iconDir, 'icon.icns'));
    candidates.push(path.join(iconDir, 'icon.png'));
    for (const p of candidates) {
      try {
        const fs = require('node:fs');
        if (fs.existsSync(p)) return p;
      } catch {}
    }
    return null;
  }
}
