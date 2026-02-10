export type ThemeName = 'graphite' | 'midnight' | 'solarized-dark' | 'paper';

export type CursorStyle = 'block' | 'underline' | 'bar';

export interface TerminalProfile {
  id: string;
  name: string;
  shell: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export interface AppSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  scrollback: number;
  backgroundOpacity: number;
  theme: ThemeName;
  profiles: TerminalProfile[];
  defaultProfileId: string;
}

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

export interface CreateSessionRequest {
  profileId?: string;
  cwd?: string;
  cols: number;
  rows: number;
}

export interface SessionSummary {
  sessionId: string;
  profileId: string;
  shell: string;
  cwd: string;
  pid: number;
}

export interface SessionDataEvent {
  sessionId: string;
  data: string;
}

export interface SessionExitEvent {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

export interface SessionWriteRequest {
  sessionId: string;
  data: string;
}

export interface SessionResizeRequest {
  sessionId: string;
  cols: number;
  rows: number;
}

export type MenuAction =
  | 'new-tab'
  | 'close-tab'
  | 'next-tab'
  | 'previous-tab'
  | 'search'
  | 'settings'
  | 'clear-terminal';

export type SettingsPatch = Partial<
  Omit<AppSettings, 'profiles' | 'defaultProfileId'>
> & {
  profiles?: TerminalProfile[];
  defaultProfileId?: string;
};
