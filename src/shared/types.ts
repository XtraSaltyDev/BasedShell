export type ThemeName = 'graphite' | 'midnight' | 'solarized-dark' | 'paper' | 'aurora' | 'noir' | 'fog';

export type ThemeSelection = ThemeName | 'system';

export type AppearanceMode = 'light' | 'dark';

export type AppearancePreference = 'system' | AppearanceMode;

export type CursorStyle = 'block' | 'underline' | 'bar';

export interface TerminalAnsiTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface ThemeChrome {
  bgBase: string;
  bgSurface: string;
  bgElevated: string;
  bgOverlay: string;
  bgInset: string;
  borderDefault: string;
  borderSubtle: string;
  borderStrong: string;
  borderAccent: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  textInverse: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  accentSubtle: string;
  danger: string;
  dangerHover: string;
  dangerMuted: string;
  warning: string;
  info: string;
  success: string;
  focusRing: string;
  topbarBg: string;
  statusbarBg: string;
  statusbarFg: string;
  panelBg: string;
  panelBorder: string;
  searchBg: string;
  searchBorder: string;
  inputBg: string;
  inputBorder: string;
  inputFg: string;
  inputPlaceholder: string;
  tabBgIdle: string;
  tabBgActive: string;
  tabBgHover: string;
  tabFgIdle: string;
  tabFgActive: string;
  tabBorderIdle: string;
  tabBorderActive: string;
  tabIndicator: string;
}

export interface FullTheme {
  terminal: TerminalAnsiTheme;
  chrome: ThemeChrome;
  electronBgColor: string;
  appearance: AppearanceMode;
  vibrancy?: 'under-window';
}

export interface TerminalProfile {
  id: string;
  name: string;
  shell: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export interface AppSettings {
  schemaVersion: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  scrollback: number;
  backgroundOpacity: number;
  theme: ThemeSelection;
  appearancePreference: AppearancePreference;
  vibrancy: boolean;
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

export interface SessionContextEvent {
  sessionId: string;
  cwd: string;
  sshHost: string | null;
}

export interface GitStatus {
  repo: string;
  root: string;
  branch: string;
  dirty: boolean;
}

export interface SystemAppearanceEvent {
  appearance: AppearanceMode;
}

export interface SettingsChangedEvent {
  settings: AppSettings;
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
  | 'clear-terminal'
  | 'command-palette';

export type SettingsPatch = Partial<
  Omit<AppSettings, 'schemaVersion' | 'profiles' | 'defaultProfileId'>
> & {
  profiles?: TerminalProfile[];
  defaultProfileId?: string;
};
