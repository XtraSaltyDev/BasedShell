import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app, BrowserWindow, ipcMain, Menu, nativeTheme } from 'electron';
import type {
  AppearanceMode,
  AppSettings,
  CreateSessionRequest,
  GitStatus,
  SessionResizeRequest,
  SessionWriteRequest,
  SettingsChangedEvent,
  SystemAppearanceEvent,
  SettingsPatch,
  WindowState
} from '../shared/types';
import { resolveAppearance, resolveThemeName, THEME_META } from '../shared/theme-meta';
import { createAppMenu } from './menu';
import { SessionManager } from './session-manager';
import { SettingsService } from './settings';
import { JsonStore } from './storage';

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;
let settingsService: SettingsService | null = null;
let windowStateStore: JsonStore<WindowState> | null = null;
const execFileAsync = promisify(execFile);

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

function getSystemAppearance(): AppearanceMode {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function resolveWindowBackground(settings: AppSettings): string {
  const appearance = resolveAppearance(settings.appearancePreference, getSystemAppearance());
  const themeName = resolveThemeName(settings.theme, appearance);
  const themeMeta = THEME_META[themeName];
  return themeMeta.electronBgColor;
}

function applyWindowTheme(window: BrowserWindow, settings: AppSettings): void {
  const backgroundColor = settings.vibrancy ? '#00000000' : resolveWindowBackground(settings);
  window.setBackgroundColor(backgroundColor);

  if (process.platform === 'darwin') {
    window.setVibrancy(settings.vibrancy ? 'under-window' : null);
  }
}

function rendererUrlFor(page: 'index.html'): string | null {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (!rendererUrl) {
    return null;
  }

  const normalized = rendererUrl.endsWith('/') ? rendererUrl : `${rendererUrl}/`;
  return new URL(page, normalized).toString();
}

function loadRendererPage(window: BrowserWindow, page: 'index.html'): void {
  const pageUrl = rendererUrlFor(page);
  if (pageUrl) {
    window.loadURL(pageUrl).catch(() => {
      // Renderer development server can disappear during restarts.
    });
    return;
  }

  window.loadFile(path.join(__dirname, '..', 'renderer', page)).catch(() => {
    // No-op: load failures are surfaced by Electron.
  });
}

function sendSettingsChanged(settings: AppSettings): void {
  const payload: SettingsChangedEvent = { settings };
  if (mainWindow) {
    mainWindow.webContents.send('settings:changed', payload);
  }
}

async function resolveGitStatus(cwd: string): Promise<GitStatus | null> {
  if (typeof cwd !== 'string') {
    return null;
  }

  const trimmed = cwd.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const repoRoot = await execFileAsync('git', ['-C', trimmed, 'rev-parse', '--show-toplevel'], {
      timeout: 1500,
      maxBuffer: 128 * 1024
    });
    const root = repoRoot.stdout.trim();
    if (!root) {
      return null;
    }

    const repo = path.basename(root);
    if (!repo) {
      return null;
    }

    const branch = await execFileAsync('git', ['-C', trimmed, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      timeout: 1500,
      maxBuffer: 128 * 1024
    });
    const branchName = branch.stdout.trim();
    if (!branchName) {
      return null;
    }

    const dirty = await execFileAsync('git', ['-C', trimmed, 'status', '--porcelain'], {
      timeout: 1500,
      maxBuffer: 512 * 1024
    });

    return {
      repo,
      root,
      branch: branchName,
      dirty: dirty.stdout.trim().length > 0
    };
  } catch {
    return null;
  }
}

function createMainWindow(settings: AppSettings): BrowserWindow {
  const state = getWindowStateStore().read();
  const backgroundColor = settings.vibrancy ? '#00000000' : resolveWindowBackground(settings);
  const useVibrancy = process.platform === 'darwin' && settings.vibrancy;

  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 600,
    title: 'BasedShell',
    backgroundColor,
    transparent: useVibrancy,
    vibrancy: useVibrancy ? 'under-window' : undefined,
    visualEffectState: useVibrancy ? 'active' : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 14 } : undefined,
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  loadRendererPage(window, 'index.html');

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
  ipcMain.handle('app:get-home-directory', () => app.getPath('home'));
  ipcMain.handle('system:get-appearance', () => getSystemAppearance());
  ipcMain.handle('git:status', (_, cwd: string) => resolveGitStatus(cwd));

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

    const next = settingsService.update(patch);
    if (mainWindow) {
      applyWindowTheme(mainWindow, next);
    }
    sendSettingsChanged(next);

    return next;
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
  mainWindow = createMainWindow(settingsService.get());

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
    nativeTheme.on('updated', () => {
      if (!settingsService) {
        return;
      }

      const settings = settingsService.get();
      if (mainWindow) {
        applyWindowTheme(mainWindow, settings);
      }

      const payload: SystemAppearanceEvent = {
        appearance: getSystemAppearance()
      };
      if (mainWindow) {
        mainWindow.webContents.send('system:appearance-changed', payload);
      }
    });

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
