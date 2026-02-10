import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import type {
  CreateSessionRequest,
  SessionResizeRequest,
  SessionWriteRequest,
  SettingsPatch,
  WindowState
} from '../shared/types';
import { createAppMenu } from './menu';
import { SessionManager } from './session-manager';
import { SettingsService } from './settings';
import { JsonStore } from './storage';

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;
let settingsService: SettingsService | null = null;
let windowStateStore: JsonStore<WindowState> | null = null;

function getWindowStateStore(): JsonStore<WindowState> {
  if (!windowStateStore) {
    windowStateStore = new JsonStore<WindowState>(path.join(app.getPath('userData'), 'window-state.json'), {
      width: 1280,
      height: 820,
      isMaximized: false
    });
  }

  return windowStateStore;
}

function createMainWindow(): BrowserWindow {
  const state = getWindowStateStore().read();

  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 600,
    title: 'LocalTerminal',
    backgroundColor: '#111317',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL).catch(() => {
      // Renderer development server can disappear during restarts.
    });
  } else {
    window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html')).catch(() => {
      // No-op: load failures are surfaced by Electron.
    });
  }

  if (state.isMaximized) {
    window.maximize();
  }

  window.on('close', () => {
    const bounds = window.getBounds();
    getWindowStateStore().write({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: window.isMaximized()
    });
  });

  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('settings:get', () => {
    if (!settingsService) {
      throw new Error('Settings unavailable');
    }

    return settingsService.get();
  });

  ipcMain.handle('settings:update', (_, patch: SettingsPatch) => {
    if (!settingsService) {
      throw new Error('Settings unavailable');
    }

    return settingsService.update(patch);
  });

  ipcMain.handle('terminal:create-session', (_, request: CreateSessionRequest) => {
    if (!sessionManager) {
      throw new Error('Session manager unavailable');
    }

    return sessionManager.createSession(request);
  });

  ipcMain.on('terminal:write', (_, request: SessionWriteRequest) => {
    sessionManager?.write(request);
  });

  ipcMain.on('terminal:resize', (_, request: SessionResizeRequest) => {
    sessionManager?.resize(request);
  });

  ipcMain.on('terminal:close-session', (_, sessionId: string) => {
    sessionManager?.close(sessionId);
  });
}

function setupApp(): void {
  settingsService = new SettingsService(app.getPath('userData'));
  mainWindow = createMainWindow();

  sessionManager = new SessionManager(settingsService, () => mainWindow);

  const menu = createAppMenu();
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
    sessionManager?.dispose();
  });
}

function initialize(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(() => {
    registerIpcHandlers();
    setupApp();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        setupApp();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

initialize();
