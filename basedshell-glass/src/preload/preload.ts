import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings,
  AppearanceMode,
  CreateSessionRequest,
  MenuAction,
  SessionDataEvent,
  SessionExitEvent,
  SessionContextEvent,
  SessionSummary,
  GitStatus,
  SessionResizeRequest,
  SystemAppearanceEvent,
  SessionWriteRequest,
  SettingsPatch,
  SettingsChangedEvent
} from '../shared/types';

function subscribe<T>(channel: string, callback: (event: T) => void): () => void {
  const listener = (_: Electron.IpcRendererEvent, payload: T) => {
    callback(payload);
  };

  ipcRenderer.on(channel, listener);

  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  getHomeDirectory: (): Promise<string> => ipcRenderer.invoke('app:get-home-directory'),
  getSystemAppearance: (): Promise<AppearanceMode> => ipcRenderer.invoke('system:get-appearance'),
  getGitStatus: (cwd: string): Promise<GitStatus | null> => ipcRenderer.invoke('git:status', cwd),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: SettingsPatch): Promise<AppSettings> => ipcRenderer.invoke('settings:update', patch),
  openSettingsWindow: (): Promise<void> => ipcRenderer.invoke('settings:open-window'),
  createSession: (request: CreateSessionRequest): Promise<SessionSummary> =>
    ipcRenderer.invoke('terminal:create-session', request),
  writeToSession: (request: SessionWriteRequest): void => ipcRenderer.send('terminal:write', request),
  resizeSession: (request: SessionResizeRequest): void => ipcRenderer.send('terminal:resize', request),
  closeSession: (sessionId: string): void => ipcRenderer.send('terminal:close-session', sessionId),
  onSessionData: (callback: (event: SessionDataEvent) => void): (() => void) => subscribe('terminal:data', callback),
  onSessionExit: (callback: (event: SessionExitEvent) => void): (() => void) => subscribe('terminal:exit', callback),
  onSessionContext: (callback: (event: SessionContextEvent) => void): (() => void) =>
    subscribe('terminal:context', callback),
  onMenuAction: (callback: (action: MenuAction) => void): (() => void) => subscribe('menu:action', callback),
  onSettingsChanged: (callback: (event: SettingsChangedEvent) => void): (() => void) =>
    subscribe('settings:changed', callback),
  onSystemAppearanceChanged: (callback: (event: SystemAppearanceEvent) => void): (() => void) =>
    subscribe('system:appearance-changed', callback)
};

contextBridge.exposeInMainWorld('terminalAPI', api);
