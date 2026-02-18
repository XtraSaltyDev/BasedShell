import { app } from 'electron';
import type { AppUpdateState } from '../shared/types';

interface UpdateInfoLike {
  version?: unknown;
}

interface DownloadProgressLike {
  percent?: unknown;
}

interface UpdaterLike {
  autoDownload: boolean;
  checkForUpdates: () => Promise<unknown> | unknown;
  quitAndInstall: () => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function versionFromInfo(value: unknown): string | null {
  if (!isObject(value)) {
    return null;
  }

  const info = value as UpdateInfoLike;
  if (typeof info.version !== 'string') {
    return null;
  }

  const trimmed = info.version.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function progressFromInfo(value: unknown): number | null {
  if (!isObject(value)) {
    return null;
  }

  const info = value as DownloadProgressLike;
  if (!Number.isFinite(info.percent)) {
    return null;
  }

  const percent = Number(info.percent);
  return Math.max(0, Math.min(100, percent));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return 'Unknown update error';
}

function unsupportedState(message: string): AppUpdateState {
  return {
    status: 'unsupported',
    currentVersion: app.getVersion(),
    nextVersion: null,
    progress: null,
    message
  };
}

export class UpdateService {
  private readonly onStateChange: (state: AppUpdateState) => void;
  private readonly updater: UpdaterLike | null;
  private startupCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private state: AppUpdateState = {
    status: 'idle',
    currentVersion: app.getVersion(),
    nextVersion: null,
    progress: null,
    message: null
  };

  constructor(onStateChange: (state: AppUpdateState) => void) {
    this.onStateChange = onStateChange;
    this.updater = this.loadUpdater();

    if (this.updater) {
      this.updater.autoDownload = true;
      this.bindUpdater(this.updater);
    }
  }

  getState(): AppUpdateState {
    return { ...this.state };
  }

  async checkForUpdates(manual = true): Promise<AppUpdateState> {
    if (!app.isPackaged) {
      this.state = unsupportedState('Updates are available in packaged builds only.');
      this.emit();
      return this.getState();
    }

    if (!this.updater) {
      this.state = unsupportedState('Update engine is not available in this build.');
      this.emit();
      return this.getState();
    }

    if (this.state.status === 'checking' || this.state.status === 'downloading') {
      return this.getState();
    }

    this.state = {
      ...this.state,
      status: 'checking',
      currentVersion: app.getVersion(),
      progress: null,
      message: manual ? 'Checking for updates...' : null
    };
    this.emit();

    try {
      await Promise.resolve(this.updater.checkForUpdates());
    } catch (error) {
      this.state = {
        ...this.state,
        status: 'error',
        message: `Update check failed: ${errorMessage(error)}`
      };
      this.emit();
    }

    return this.getState();
  }

  installUpdateAndRestart(): boolean {
    if (!this.updater || this.state.status !== 'downloaded') {
      return false;
    }

    try {
      this.updater.quitAndInstall();
      return true;
    } catch (error) {
      this.state = {
        ...this.state,
        status: 'error',
        message: `Unable to install downloaded update: ${errorMessage(error)}`
      };
      this.emit();
      return false;
    }
  }

  scheduleStartupCheck(delayMs = 2500): void {
    if (this.startupCheckTimer) {
      clearTimeout(this.startupCheckTimer);
    }

    this.startupCheckTimer = setTimeout(() => {
      this.startupCheckTimer = null;
      void this.checkForUpdates(false);
    }, delayMs);
  }

  dispose(): void {
    if (this.startupCheckTimer) {
      clearTimeout(this.startupCheckTimer);
      this.startupCheckTimer = null;
    }
  }

  private emit(): void {
    this.onStateChange(this.getState());
  }

  private bindUpdater(updater: UpdaterLike): void {
    updater.on('checking-for-update', () => {
      this.state = {
        ...this.state,
        status: 'checking',
        currentVersion: app.getVersion(),
        progress: null
      };
      this.emit();
    });

    updater.on('update-available', (info: unknown) => {
      this.state = {
        ...this.state,
        status: 'available',
        nextVersion: versionFromInfo(info),
        progress: null,
        message: 'Update available. Downloading now...'
      };
      this.emit();
    });

    updater.on('update-not-available', () => {
      this.state = {
        ...this.state,
        status: 'not-available',
        nextVersion: null,
        progress: null,
        message: null
      };
      this.emit();
    });

    updater.on('download-progress', (progress: unknown) => {
      this.state = {
        ...this.state,
        status: 'downloading',
        progress: progressFromInfo(progress)
      };
      this.emit();
    });

    updater.on('update-downloaded', (info: unknown) => {
      this.state = {
        ...this.state,
        status: 'downloaded',
        nextVersion: versionFromInfo(info),
        progress: 100,
        message: 'Update downloaded. Restart BasedShell to apply it.'
      };
      this.emit();
    });

    updater.on('error', (error: unknown) => {
      this.state = {
        ...this.state,
        status: 'error',
        message: `Updater error: ${errorMessage(error)}`
      };
      this.emit();
    });
  }

  private loadUpdater(): UpdaterLike | null {
    try {
      const candidate = require('electron-updater') as { autoUpdater?: unknown };
      if (!candidate || !isObject(candidate)) {
        return null;
      }

      const updater = candidate.autoUpdater;
      if (!updater || !isObject(updater)) {
        return null;
      }

      if (typeof updater.checkForUpdates !== 'function' || typeof updater.quitAndInstall !== 'function') {
        return null;
      }

      const withListeners = updater as unknown as UpdaterLike;
      if (typeof withListeners.on !== 'function') {
        return null;
      }

      return withListeners;
    } catch {
      return null;
    }
  }
}
