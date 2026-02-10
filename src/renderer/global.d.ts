import type {
  AppSettings,
  AppearanceMode,
  CreateSessionRequest,
  MenuAction,
  SessionDataEvent,
  SessionExitEvent,
  SessionResizeRequest,
  SessionSummary,
  SystemAppearanceEvent,
  SessionWriteRequest,
  SettingsPatch
} from '../shared/types';

interface TerminalAPI {
  getVersion: () => Promise<string>;
  getSystemAppearance: () => Promise<AppearanceMode>;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: SettingsPatch) => Promise<AppSettings>;
  createSession: (request: CreateSessionRequest) => Promise<SessionSummary>;
  writeToSession: (request: SessionWriteRequest) => void;
  resizeSession: (request: SessionResizeRequest) => void;
  closeSession: (sessionId: string) => void;
  onSessionData: (callback: (event: SessionDataEvent) => void) => () => void;
  onSessionExit: (callback: (event: SessionExitEvent) => void) => () => void;
  onMenuAction: (callback: (action: MenuAction) => void) => () => void;
  onSystemAppearanceChanged: (callback: (event: SystemAppearanceEvent) => void) => () => void;
}

declare global {
  interface Window {
    terminalAPI: TerminalAPI;
  }
}

export {};
