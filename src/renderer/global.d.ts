import type {
  AppSettings,
  CreateSessionRequest,
  MenuAction,
  SessionDataEvent,
  SessionExitEvent,
  SessionResizeRequest,
  SessionSummary,
  SessionWriteRequest,
  SettingsPatch
} from '../shared/types';

interface TerminalAPI {
  getVersion: () => Promise<string>;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: SettingsPatch) => Promise<AppSettings>;
  createSession: (request: CreateSessionRequest) => Promise<SessionSummary>;
  writeToSession: (request: SessionWriteRequest) => void;
  resizeSession: (request: SessionResizeRequest) => void;
  closeSession: (sessionId: string) => void;
  onSessionData: (callback: (event: SessionDataEvent) => void) => () => void;
  onSessionExit: (callback: (event: SessionExitEvent) => void) => () => void;
  onMenuAction: (callback: (action: MenuAction) => void) => () => void;
}

declare global {
  interface Window {
    terminalAPI: TerminalAPI;
  }
}

export {};
