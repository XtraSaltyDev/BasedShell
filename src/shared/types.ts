export type ThemeName =
  | 'graphite'
  | 'midnight'
  | 'solarized-dark'
  | 'paper'
  | 'aurora'
  | 'noir'
  | 'fog'
  | 'catppuccin-latte'
  | 'catppuccin-frappe'
  | 'catppuccin-macchiato'
  | 'catppuccin-mocha';

export type ThemeSelection = ThemeName | 'system';

export type AppearanceMode = 'light' | 'dark';

export type AppearancePreference = 'system' | AppearanceMode;

export type CursorStyle = 'block' | 'underline' | 'bar';
export type PromptStyle = 'system' | 'minimal';

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
  glassBg: string;
  glassBgHeavy: string;
  glassBgLight: string;
  glassBorder: string;
  glassBorderStrong: string;
  glassHighlight: string;
  accentBright: string;
  accentDim: string;
  accentGlow: string;
  dangerGlow: string;
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

export interface UiSettings {
  lastVerticalSplitRatio: number | null;
  lastHorizontalSplitRatio: number | null;
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
  promptStyle: PromptStyle;
  ui: UiSettings;
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

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported';

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string;
  nextVersion: string | null;
  progress: number | null;
  message: string | null;
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
  | 'command-palette'
  | 'check-for-updates';

export type SettingsPatch = Partial<
  Omit<AppSettings, 'schemaVersion' | 'profiles' | 'defaultProfileId' | 'ui'>
> & {
  ui?: Partial<UiSettings>;
  profiles?: TerminalProfile[];
  defaultProfileId?: string;
};
