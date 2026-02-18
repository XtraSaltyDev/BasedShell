import type {
  AppUpdateState,
  AppSettings,
  AppearanceMode,
  CreateSessionRequest,
  MenuAction,
  SessionDataEvent,
  SessionExitEvent,
  SessionContextEvent,
  SessionResizeRequest,
  SessionSummary,
  SystemAppearanceEvent,
  SessionWriteRequest,
  GitStatus,
  SettingsPatch,
  SettingsChangedEvent
} from '../shared/types';

interface TerminalAPI {
  getVersion: () => Promise<string>;
  getHomeDirectory: () => Promise<string>;
  getUpdateState: () => Promise<AppUpdateState>;
  checkForUpdates: () => Promise<AppUpdateState>;
  installUpdate: () => Promise<boolean>;
  openReleasesPage: () => Promise<boolean>;
  getSystemAppearance: () => Promise<AppearanceMode>;
  getGitStatus: (cwd: string) => Promise<GitStatus | null>;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: SettingsPatch) => Promise<AppSettings>;
  createSession: (request: CreateSessionRequest) => Promise<SessionSummary>;
  writeToSession: (request: SessionWriteRequest) => void;
  resizeSession: (request: SessionResizeRequest) => void;
  closeSession: (sessionId: string) => void;
  onSessionData: (callback: (event: SessionDataEvent) => void) => () => void;
  onSessionExit: (callback: (event: SessionExitEvent) => void) => () => void;
  onSessionContext: (callback: (event: SessionContextEvent) => void) => () => void;
  onMenuAction: (callback: (action: MenuAction) => void) => () => void;
  onAppUpdateState: (callback: (event: AppUpdateState) => void) => () => void;
  onSettingsChanged: (callback: (event: SettingsChangedEvent) => void) => () => void;
  onSystemAppearanceChanged: (callback: (event: SystemAppearanceEvent) => void) => () => void;
}

declare global {
  interface Window {
    terminalAPI: TerminalAPI;
  }
}

export {};
