import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings,
  CreateSessionRequest,
  MenuAction,
  SessionDataEvent,
  SessionExitEvent,
  SessionSummary,
  SessionResizeRequest,
  SessionWriteRequest,
  SettingsPatch
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
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: SettingsPatch): Promise<AppSettings> => ipcRenderer.invoke('settings:update', patch),
  createSession: (request: CreateSessionRequest): Promise<SessionSummary> =>
    ipcRenderer.invoke('terminal:create-session', request),
  writeToSession: (request: SessionWriteRequest): void => ipcRenderer.send('terminal:write', request),
  resizeSession: (request: SessionResizeRequest): void => ipcRenderer.send('terminal:resize', request),
  closeSession: (sessionId: string): void => ipcRenderer.send('terminal:close-session', sessionId),
  onSessionData: (callback: (event: SessionDataEvent) => void): (() => void) => subscribe('terminal:data', callback),
  onSessionExit: (callback: (event: SessionExitEvent) => void): (() => void) => subscribe('terminal:exit', callback),
  onMenuAction: (callback: (action: MenuAction) => void): (() => void) => subscribe('menu:action', callback)
};

contextBridge.exposeInMainWorld('terminalAPI', api);
