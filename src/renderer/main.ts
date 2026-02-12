import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal, type ITerminalOptions } from '@xterm/xterm';
import type {
  AppSettings,
  AppearanceMode,
  CursorStyle,
  GitStatus,
  MenuAction,
  SessionContextEvent,
  SessionSummary,
  SettingsPatch,
  ThemeSelection
} from '../shared/types';
import { applyThemeChrome, resolveThemeState, type ResolvedThemeState } from './themes';
import { icon } from './icons';
import {
  createCommandPalette,
  type CommandPaletteAction,
  type CommandPaletteController
} from './command-palette';
import { createToastManager } from './toast';
import './tokens.css';
import './styles.css';

interface TabState {
  id: string;
  sessionId: string;
  title: string;
  shell: string;
  pid: number;
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  container: HTMLDivElement;
  cwd: string;
  sshHost: string | null;
  sshHostHint: string | null;
  startedAt: number;
  lastExitCode: number | null;
  lastExitDurationMs: number | null;
  titleTooltip: string;
  exited: boolean;
  hasUnreadOutput: boolean;
  hasRecentOutput: boolean;
  searchResultIndex: number;
  searchResultCount: number;
  outputPulseTimer?: ReturnType<typeof setTimeout>;
}

interface GitStatusSnapshot extends GitStatus {
  fetchedAt: number;
}

interface CommandContext {
  exitCode: number;
  durationMs: number;
  at: number;
}

interface SettingsUi {
  settingsPanel: HTMLElement;
  settingsScrim: HTMLDivElement;
  settingsClose: HTMLButtonElement;
  settingsCancel: HTMLButtonElement;
  settingsSave: HTMLButtonElement;
  settingsForm: HTMLFormElement;
  settingThemeSwatches: HTMLDivElement;
  settingFontFamily: HTMLInputElement;
  settingFontSize: HTMLInputElement;
  settingLineHeight: HTMLInputElement;
  settingScrollback: HTMLInputElement;
  settingOpacity: HTMLInputElement;
  settingTheme: HTMLInputElement;
  settingAppearance: HTMLSelectElement;
  settingCursorStyle: HTMLSelectElement;
  settingCursorBlink: HTMLInputElement;
  settingVibrancy: HTMLInputElement;
}

const dom = {
  tabStrip: document.querySelector<HTMLDivElement>('#tab-strip'),
  newTabButton: document.querySelector<HTMLButtonElement>('#new-tab-button'),
  settingsButton: document.querySelector<HTMLButtonElement>('#settings-button'),
  searchButton: document.querySelector<HTMLButtonElement>('#search-button'),
  searchInline: document.querySelector<HTMLDivElement>('#search-inline'),
  terminalHost: document.querySelector<HTMLDivElement>('#terminal-host'),
  statusLeft: document.querySelector<HTMLDivElement>('#status-left'),
  statusRight: document.querySelector<HTMLDivElement>('#status-right'),
  statusShell: document.querySelector<HTMLButtonElement>('#status-shell'),
  statusCwd: document.querySelector<HTMLButtonElement>('#status-cwd'),
  statusGit: document.querySelector<HTMLButtonElement>('#status-git'),
  statusContext: document.querySelector<HTMLButtonElement>('#status-context'),
  statusTabs: document.querySelector<HTMLButtonElement>('#status-tabs'),
  statusTheme: document.querySelector<HTMLButtonElement>('#status-theme'),
  toastContainer: document.querySelector<HTMLDivElement>('#toast-container'),
  toastAnnouncer: document.querySelector<HTMLDivElement>('#toast-announcer'),
  paletteScrim: document.querySelector<HTMLDivElement>('#palette-scrim'),
  commandPalette: document.querySelector<HTMLElement>('#command-palette'),
  paletteInput: document.querySelector<HTMLInputElement>('#palette-input'),
  paletteResults: document.querySelector<HTMLElement>('#palette-results'),
  searchInput: document.querySelector<HTMLInputElement>('#search-input'),
  searchCounter: document.querySelector<HTMLSpanElement>('#search-counter'),
  searchCase: document.querySelector<HTMLButtonElement>('#search-case-sensitive'),
  searchRegex: document.querySelector<HTMLButtonElement>('#search-regex'),
  searchPrev: document.querySelector<HTMLButtonElement>('#search-prev'),
  searchNext: document.querySelector<HTMLButtonElement>('#search-next'),
  searchClose: document.querySelector<HTMLButtonElement>('#search-close'),
  settingsPanel: document.querySelector<HTMLElement>('#settings-panel'),
  settingsScrim: document.querySelector<HTMLDivElement>('#settings-scrim'),
  settingsClose: document.querySelector<HTMLButtonElement>('#settings-close'),
  settingsCancel: document.querySelector<HTMLButtonElement>('#settings-cancel'),
  settingsSave: document.querySelector<HTMLButtonElement>('#settings-save'),
  settingsForm: document.querySelector<HTMLFormElement>('#settings-form'),
  settingThemeSwatches: document.querySelector<HTMLDivElement>('#setting-theme-swatches'),
  settingFontFamily: document.querySelector<HTMLInputElement>('#setting-font-family'),
  settingFontSize: document.querySelector<HTMLInputElement>('#setting-font-size'),
  settingLineHeight: document.querySelector<HTMLInputElement>('#setting-line-height'),
  settingScrollback: document.querySelector<HTMLInputElement>('#setting-scrollback'),
  settingOpacity: document.querySelector<HTMLInputElement>('#setting-opacity'),
  settingTheme: document.querySelector<HTMLInputElement>('#setting-theme'),
  settingAppearance: document.querySelector<HTMLSelectElement>('#setting-appearance'),
  settingCursorStyle: document.querySelector<HTMLSelectElement>('#setting-cursor-style'),
  settingCursorBlink: document.querySelector<HTMLInputElement>('#setting-cursor-blink'),
  settingVibrancy: document.querySelector<HTMLInputElement>('#setting-vibrancy')
};

let settings: AppSettings;
let systemAppearance: AppearanceMode = 'dark';
let resolvedTheme: ResolvedThemeState;
const tabs = new Map<string, TabState>();
let tabOrder: string[] = [];
let activeTabId = '';
const tabRemovalTimers = new Map<string, ReturnType<typeof setTimeout>>();
let settingsPreviewBaseline: AppSettings | null = null;
let homeDirectory = '';
const gitStatusByCwd = new Map<string, GitStatusSnapshot>();
const pendingGitRequests = new Set<string>();
let gitPollTimer: ReturnType<typeof setInterval> | undefined;
let lastCommandContext: CommandContext | null = null;

function assertDom<T>(value: T | null, id: string): T {
  if (!value) {
    throw new Error(`Missing required element: ${id}`);
  }

  return value;
}

function bindSettingsUi(): SettingsUi | null {
  const entries: Array<[keyof SettingsUi, Element | null]> = [
    ['settingsPanel', dom.settingsPanel],
    ['settingsScrim', dom.settingsScrim],
    ['settingsClose', dom.settingsClose],
    ['settingsCancel', dom.settingsCancel],
    ['settingsSave', dom.settingsSave],
    ['settingsForm', dom.settingsForm],
    ['settingThemeSwatches', dom.settingThemeSwatches],
    ['settingFontFamily', dom.settingFontFamily],
    ['settingFontSize', dom.settingFontSize],
    ['settingLineHeight', dom.settingLineHeight],
    ['settingScrollback', dom.settingScrollback],
    ['settingOpacity', dom.settingOpacity],
    ['settingTheme', dom.settingTheme],
    ['settingAppearance', dom.settingAppearance],
    ['settingCursorStyle', dom.settingCursorStyle],
    ['settingCursorBlink', dom.settingCursorBlink],
    ['settingVibrancy', dom.settingVibrancy]
  ];

  const missing: string[] = [];
  for (const [id, element] of entries) {
    if (!element) {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    console.warn(
      `[BasedShell] Settings UI bindings missing (${missing.join(', ')}). ` +
        'Settings drawer controls are disabled. Run `npm run check:dom-contract`.'
    );
    return null;
  }

  return {
    settingsPanel: dom.settingsPanel as HTMLElement,
    settingsScrim: dom.settingsScrim as HTMLDivElement,
    settingsClose: dom.settingsClose as HTMLButtonElement,
    settingsCancel: dom.settingsCancel as HTMLButtonElement,
    settingsSave: dom.settingsSave as HTMLButtonElement,
    settingsForm: dom.settingsForm as HTMLFormElement,
    settingThemeSwatches: dom.settingThemeSwatches as HTMLDivElement,
    settingFontFamily: dom.settingFontFamily as HTMLInputElement,
    settingFontSize: dom.settingFontSize as HTMLInputElement,
    settingLineHeight: dom.settingLineHeight as HTMLInputElement,
    settingScrollback: dom.settingScrollback as HTMLInputElement,
    settingOpacity: dom.settingOpacity as HTMLInputElement,
    settingTheme: dom.settingTheme as HTMLInputElement,
    settingAppearance: dom.settingAppearance as HTMLSelectElement,
    settingCursorStyle: dom.settingCursorStyle as HTMLSelectElement,
    settingCursorBlink: dom.settingCursorBlink as HTMLInputElement,
    settingVibrancy: dom.settingVibrancy as HTMLInputElement
  };
}

const ui = {
  tabStrip: assertDom(dom.tabStrip, '#tab-strip'),
  newTabButton: assertDom(dom.newTabButton, '#new-tab-button'),
  settingsButton: assertDom(dom.settingsButton, '#settings-button'),
  searchButton: assertDom(dom.searchButton, '#search-button'),
  searchInline: assertDom(dom.searchInline, '#search-inline'),
  terminalHost: assertDom(dom.terminalHost, '#terminal-host'),
  statusLeft: assertDom(dom.statusLeft, '#status-left'),
  statusRight: assertDom(dom.statusRight, '#status-right'),
  statusShell: assertDom(dom.statusShell, '#status-shell'),
  statusCwd: assertDom(dom.statusCwd, '#status-cwd'),
  statusGit: assertDom(dom.statusGit, '#status-git'),
  statusContext: assertDom(dom.statusContext, '#status-context'),
  statusTabs: assertDom(dom.statusTabs, '#status-tabs'),
  statusTheme: assertDom(dom.statusTheme, '#status-theme'),
  toastContainer: assertDom(dom.toastContainer, '#toast-container'),
  toastAnnouncer: assertDom(dom.toastAnnouncer, '#toast-announcer'),
  paletteScrim: assertDom(dom.paletteScrim, '#palette-scrim'),
  commandPalette: assertDom(dom.commandPalette, '#command-palette'),
  paletteInput: assertDom(dom.paletteInput, '#palette-input'),
  paletteResults: assertDom(dom.paletteResults, '#palette-results'),
  searchInput: assertDom(dom.searchInput, '#search-input'),
  searchCounter: assertDom(dom.searchCounter, '#search-counter'),
  searchCase: assertDom(dom.searchCase, '#search-case-sensitive'),
  searchRegex: assertDom(dom.searchRegex, '#search-regex'),
  searchPrev: assertDom(dom.searchPrev, '#search-prev'),
  searchNext: assertDom(dom.searchNext, '#search-next'),
  searchClose: assertDom(dom.searchClose, '#search-close')
};
const settingsUi = bindSettingsUi();

const toasts = createToastManager(ui.toastContainer, ui.toastAnnouncer);
let commandPalette: CommandPaletteController | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function setSurfaceOpacity(opacity: number): void {
  document.documentElement.style.setProperty('--surface-opacity', opacity.toFixed(2));
}

function refreshResolvedTheme(): void {
  resolvedTheme = resolveThemeState(settings, systemAppearance);
}

function applyThemeState(): void {
  refreshResolvedTheme();
  applyThemeChrome(resolvedTheme, settings.vibrancy);
}

function terminalOptions(): ITerminalOptions {
  return {
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    cursorStyle: settings.cursorStyle,
    cursorBlink: settings.cursorBlink,
    scrollback: settings.scrollback,
    theme: resolvedTheme.theme.terminal,
    allowTransparency: true,
    convertEol: false,
    rightClickSelectsWord: true,
    macOptionIsMeta: true
  };
}

function applyTabSettings(tab: TabState): void {
  tab.term.options.fontFamily = settings.fontFamily;
  tab.term.options.fontSize = settings.fontSize;
  tab.term.options.lineHeight = settings.lineHeight;
  tab.term.options.cursorStyle = settings.cursorStyle;
  tab.term.options.cursorBlink = settings.cursorBlink;
  tab.term.options.scrollback = settings.scrollback;
  tab.term.options.theme = resolvedTheme.theme.terminal;
  tab.fit.fit();
  window.terminalAPI.resizeSession({
    sessionId: tab.sessionId,
    cols: tab.term.cols,
    rows: tab.term.rows
  });
}

function applySettingsToAllTabs(): void {
  applyThemeState();
  setSurfaceOpacity(settings.backgroundOpacity);

  for (const tab of tabs.values()) {
    applyTabSettings(tab);
  }

  if (isSearchOpen()) {
    refreshSearchForActiveTab();
  }
}

function tabBySessionId(sessionId: string): TabState | undefined {
  for (const tabId of tabOrder) {
    const tab = tabs.get(tabId);
    if (tab?.sessionId === sessionId) {
      return tab;
    }
  }

  return undefined;
}

function updateTabStripOverflow(): void {
  const epsilon = 1;
  const hasLeft = ui.tabStrip.scrollLeft > epsilon;
  const hasRight = ui.tabStrip.scrollLeft + ui.tabStrip.clientWidth < ui.tabStrip.scrollWidth - epsilon;
  ui.tabStrip.classList.toggle('overflow-left', hasLeft);
  ui.tabStrip.classList.toggle('overflow-right', hasRight);
}

function updateTabWidthClass(): void {
  ui.tabStrip.classList.remove('tab-size-regular', 'tab-size-compact', 'tab-size-dense');
  if (tabOrder.length >= 11) {
    ui.tabStrip.classList.add('tab-size-dense');
    return;
  }

  if (tabOrder.length >= 6) {
    ui.tabStrip.classList.add('tab-size-compact');
    return;
  }

  ui.tabStrip.classList.add('tab-size-regular');
}

function normalizePath(pathValue: string): string {
  const replaced = pathValue.replace(/\\/g, '/').trim();
  return replaced.length > 0 ? replaced : '/';
}

function toTildePath(pathValue: string): string {
  const normalized = normalizePath(pathValue);
  if (!homeDirectory) {
    return normalized;
  }

  const home = normalizePath(homeDirectory).replace(/\/+$/, '');
  if (normalized === home) {
    return '~';
  }

  if (normalized.startsWith(`${home}/`)) {
    return `~${normalized.slice(home.length)}`;
  }

  return normalized;
}

function pathSegments(pathValue: string): string[] {
  if (pathValue === '~') {
    return ['~'];
  }

  const trimmed = pathValue.replace(/\/+$/, '');
  if (trimmed === '/') {
    return ['/'];
  }

  return trimmed.split('/').filter((segment) => segment.length > 0);
}

function pathTail(segments: string[], depth: number): string {
  if (segments.length === 0) {
    return '/';
  }

  if ((segments[0] === '~' || segments[0] === '/') && segments.length === 1) {
    return segments[0];
  }

  const count = Math.max(1, Math.min(depth, segments.length));
  return segments.slice(segments.length - count).join('/');
}

function hostFromTitleHint(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^[^@\s]+@([^:\s]+):/);
  if (!match || !match[1]) {
    return null;
  }

  return match[1];
}

function fallbackTabLabel(cwd: string): string {
  const displayPath = toTildePath(cwd || '/');
  const segments = pathSegments(displayPath);
  return pathTail(segments, 1);
}

function resolveTabTitle(tab: TabState): { title: string; tooltip: string } {
  const cwd = normalizePath(tab.cwd || '/');
  const host = tab.sshHost ?? tab.sshHostHint;
  const git = gitStatusByCwd.get(tab.cwd);

  if (git) {
    const repoBranch = `${git.repo} / ${git.branch}`;
    return {
      title: host ? `${host}:${repoBranch}` : repoBranch,
      tooltip: `${git.root} (${git.branch}${git.dirty ? ', dirty' : ', clean'})`
    };
  }

  const fallback = fallbackTabLabel(cwd);
  return {
    title: host ? `${host}:${fallback}` : fallback,
    tooltip: host ? `${host}:${cwd}` : cwd
  };
}

function reconcileTabTitles(): boolean {
  const orderedTabs = tabOrder
    .map((tabId) => tabs.get(tabId))
    .filter((tab): tab is TabState => Boolean(tab));
  if (orderedTabs.length === 0) {
    return false;
  }

  let anyUpdated = false;
  for (const tab of orderedTabs) {
    const next = resolveTabTitle(tab);
    if (tab.title !== next.title || tab.titleTooltip !== next.tooltip) {
      tab.title = next.title;
      tab.titleTooltip = next.tooltip;
      anyUpdated = true;
    }
  }

  return anyUpdated;
}

function createTabElement(tabId: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tab';
  button.dataset.tabId = tabId;
  button.setAttribute('role', 'tab');
  button.id = `tab-${tabId}`;

  const dot = document.createElement('span');
  dot.className = 'tab-indicator-dot';
  dot.setAttribute('aria-hidden', 'true');

  const title = document.createElement('span');
  title.className = 'tab-title';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'tab-close';
  close.title = 'Close tab';
  close.setAttribute('aria-label', 'Close tab');
  close.innerHTML = icon('close', 12);

  button.addEventListener('click', () => activateTab(tabId));
  close.addEventListener('click', (event) => {
    event.stopPropagation();
    void closeTab(tabId);
  });

  button.append(dot, title, close);
  return button;
}

function updateTabElement(element: HTMLButtonElement, tab: TabState, isActive: boolean): void {
  element.classList.toggle('active', isActive);
  element.classList.toggle('exit', tab.exited);
  element.setAttribute('aria-selected', String(isActive));
  element.setAttribute('aria-controls', `panel-${tab.id}`);
  element.title = tab.titleTooltip;

  const title = element.querySelector<HTMLSpanElement>('.tab-title');
  if (title && title.textContent !== tab.title) {
    title.textContent = tab.title;
  }

  const dot = element.querySelector<HTMLSpanElement>('.tab-indicator-dot');
  if (dot) {
    dot.classList.remove('active', 'unread', 'exited');
    if (tab.exited) {
      dot.classList.add('exited');
    } else if (isActive) {
      dot.classList.add('active');
    } else if (tab.hasUnreadOutput) {
      dot.classList.add('unread');
    }
  }
}

function startTabExitAnimation(tabId: string, element: HTMLElement): void {
  if (element.classList.contains('tab-exiting')) {
    return;
  }

  element.classList.add('tab-exiting');
  const remove = () => {
    const timer = tabRemovalTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      tabRemovalTimers.delete(tabId);
    }

    if (element.parentElement) {
      element.remove();
      updateTabStripOverflow();
    }
  };

  element.addEventListener('animationend', remove, { once: true });
  const timer = setTimeout(remove, 260);
  tabRemovalTimers.set(tabId, timer);
}

function renderTabStrip(): void {
  updateTabWidthClass();

  const existingTabs = new Map<string, HTMLButtonElement>();
  for (const child of Array.from(ui.tabStrip.children)) {
    const element = child as HTMLButtonElement;
    const id = element.dataset.tabId;
    if (id) {
      existingTabs.set(id, element);
    }
  }

  for (const [id, element] of existingTabs.entries()) {
    if (!tabs.has(id)) {
      startTabExitAnimation(id, element);
      existingTabs.delete(id);
    }
  }

  let previousElement: HTMLButtonElement | null = null;
  for (const tabId of tabOrder) {
    const tab = tabs.get(tabId);
    if (!tab) {
      continue;
    }

    let element = existingTabs.get(tabId);
    if (!element) {
      element = createTabElement(tabId);
      element.classList.add('tab-entering');
      element.addEventListener(
        'animationend',
        () => {
          element?.classList.remove('tab-entering');
          updateTabStripOverflow();
        },
        { once: true }
      );
    }

    updateTabElement(element, tab, tabId === activeTabId);

    const expectedNext: Element | null = previousElement
      ? previousElement.nextElementSibling
      : ui.tabStrip.firstElementChild;
    if (element !== expectedNext) {
      if (previousElement) {
        previousElement.after(element);
      } else {
        ui.tabStrip.prepend(element);
      }
    }

    previousElement = element;
  }

  updateTabStripOverflow();
}

function shellName(shellPath: string): string {
  const normalized = shellPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || shellPath;
}

function truncateMiddle(value: string, max = 36): string {
  if (value.length <= max) {
    return value;
  }

  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function setStatusSegmentState(button: HTMLButtonElement, state: 'idle' | 'success' | 'warning' | 'danger'): void {
  button.dataset.state = state;
}

async function refreshActiveGitStatus(force = false): Promise<void> {
  const active = activeTab();
  if (!active) {
    return;
  }

  const cwd = active.cwd;
  if (!cwd || pendingGitRequests.has(cwd)) {
    return;
  }

  const cached = gitStatusByCwd.get(cwd);
  if (!force && cached && Date.now() - cached.fetchedAt < 4500) {
    return;
  }

  pendingGitRequests.add(cwd);
  try {
    let changed = false;
    const next = await window.terminalAPI.getGitStatus(cwd);
    if (next) {
      const previous = gitStatusByCwd.get(cwd);
      gitStatusByCwd.set(cwd, {
        ...next,
        fetchedAt: Date.now()
      });
      changed =
        !previous ||
        previous.repo !== next.repo ||
        previous.root !== next.root ||
        previous.branch !== next.branch ||
        previous.dirty !== next.dirty;
    } else {
      changed = gitStatusByCwd.delete(cwd);
    }

    if (changed && reconcileTabTitles()) {
      renderTabStrip();
      syncCommandPaletteActions();
    }
  } catch {
    toasts.show('Unable to refresh Git status.', 'error', 0);
  } finally {
    pendingGitRequests.delete(cwd);
    updateStatus();
  }
}

function startGitStatusPolling(): void {
  if (gitPollTimer) {
    clearInterval(gitPollTimer);
  }

  gitPollTimer = setInterval(() => {
    void refreshActiveGitStatus(false);
  }, 5000);
}

const themeCycleOrder: ThemeSelection[] = [
  'system',
  'graphite',
  'midnight',
  'solarized-dark',
  'paper',
  'aurora',
  'noir',
  'fog',
  'catppuccin-latte',
  'catppuccin-frappe',
  'catppuccin-macchiato',
  'catppuccin-mocha'
];

async function cycleTheme(): Promise<void> {
  const currentIndex = themeCycleOrder.findIndex((theme) => theme === settings.theme);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % themeCycleOrder.length : 0;
  const nextTheme = themeCycleOrder[nextIndex] ?? 'system';

  try {
    settings = await window.terminalAPI.updateSettings({ theme: nextTheme });
    if (isSettingsOpen()) {
      syncSettingsFormFromState(settings);
    }
    applySettingsToAllTabs();
    renderTabStrip();
    updateStatus();
    toasts.show(`Theme: ${nextTheme === 'system' ? `System (${resolvedTheme.themeName})` : resolvedTheme.themeName}`, 'success');
  } catch {
    toasts.show('Failed to switch theme.', 'error', 0);
  }
}

function updateStatus(): void {
  const active = tabs.get(activeTabId);
  if (!active) {
    ui.statusShell.textContent = 'No Session';
    ui.statusShell.title = 'No active session';
    setStatusSegmentState(ui.statusShell, 'idle');

    ui.statusCwd.textContent = 'Path —';
    ui.statusCwd.title = 'No active session path';
    setStatusSegmentState(ui.statusCwd, 'idle');

    ui.statusGit.textContent = 'Git —';
    ui.statusGit.title = 'No active repository';
    setStatusSegmentState(ui.statusGit, 'idle');

    ui.statusContext.textContent = 'Exit —';
    ui.statusContext.title = 'No command context available';
    setStatusSegmentState(ui.statusContext, 'idle');

    ui.statusTabs.textContent = '0 tabs';
    ui.statusTabs.title = 'No open tabs';
    setStatusSegmentState(ui.statusTabs, 'idle');

    ui.statusTheme.textContent = resolvedTheme.themeName;
    ui.statusTheme.title = 'Theme';
    setStatusSegmentState(ui.statusTheme, 'idle');
    return;
  }

  const shellLabel = shellName(active.shell);
  ui.statusShell.textContent = active.exited ? `${shellLabel} (Exited)` : `${shellLabel} · ${active.pid}`;
  ui.statusShell.title = `Shell: ${active.shell}${active.exited ? ' (exited)' : ''}. Click to open settings window.`;
  setStatusSegmentState(ui.statusShell, active.exited ? 'warning' : 'idle');

  ui.statusCwd.textContent = truncateMiddle(active.cwd, 34);
  ui.statusCwd.title = `Working directory: ${active.cwd}. Click to copy path.`;
  setStatusSegmentState(ui.statusCwd, 'idle');

  const git = gitStatusByCwd.get(active.cwd);
  if (git) {
    ui.statusGit.textContent = git.dirty ? `${git.branch} *` : git.branch;
    ui.statusGit.title = `Git branch: ${git.branch}${git.dirty ? ' (dirty)' : ' (clean)'} · Click to refresh`;
    setStatusSegmentState(ui.statusGit, git.dirty ? 'warning' : 'success');
  } else {
    ui.statusGit.textContent = 'No Repo';
    ui.statusGit.title = `No git repository detected for ${active.cwd}. Click to refresh.`;
    setStatusSegmentState(ui.statusGit, 'idle');
  }

  const context =
    active.lastExitCode !== null && active.lastExitDurationMs !== null
      ? { exitCode: active.lastExitCode, durationMs: active.lastExitDurationMs }
      : lastCommandContext;
  if (context) {
    ui.statusContext.textContent = `Exit ${context.exitCode} · ${formatDuration(context.durationMs)}`;
    ui.statusContext.title = `Last process exit code ${context.exitCode} after ${formatDuration(context.durationMs)}.`;
    setStatusSegmentState(ui.statusContext, context.exitCode === 0 ? 'success' : 'danger');
  } else {
    ui.statusContext.textContent = 'Exit —';
    ui.statusContext.title = 'No command context available yet.';
    setStatusSegmentState(ui.statusContext, 'idle');
  }

  ui.statusTabs.textContent = `${tabOrder.length} tab${tabOrder.length === 1 ? '' : 's'}`;
  ui.statusTabs.title = `${tabOrder.length} open tab${tabOrder.length === 1 ? '' : 's'}.`;
  setStatusSegmentState(ui.statusTabs, 'idle');

  const themeLabel =
    settings.theme === 'system' ? `System (${resolvedTheme.themeName})` : resolvedTheme.themeName;
  ui.statusTheme.textContent = themeLabel;
  ui.statusTheme.title = `Theme: ${themeLabel}. Click to cycle themes.`;
  setStatusSegmentState(ui.statusTheme, 'idle');
}

function activateTab(tabId: string): void {
  const target = tabs.get(tabId);
  if (!target) {
    return;
  }

  activeTabId = tabId;
  target.hasUnreadOutput = false;

  for (const [currentId, tab] of tabs.entries()) {
    tab.container.classList.toggle('active', currentId === tabId);
  }

  renderTabStrip();
  updateStatus();
  if (isSearchOpen()) {
    refreshSearchForActiveTab();
  }
  void refreshActiveGitStatus(false);
  const active = tabs.get(tabId);
  active?.fit.fit();
  active?.term.focus();
  if (active) {
    window.terminalAPI.resizeSession({
      sessionId: active.sessionId,
      cols: active.term.cols,
      rows: active.term.rows
    });
  }
}

function clearOutputPulse(tab: TabState): void {
  if (tab.outputPulseTimer) {
    clearTimeout(tab.outputPulseTimer);
    tab.outputPulseTimer = undefined;
  }

  tab.hasRecentOutput = false;
}

function markTabOutput(tab: TabState): void {
  if (tab.exited) {
    return;
  }

  if (tab.id === activeTabId) {
    return;
  }

  if (!tab.hasUnreadOutput) {
    tab.hasUnreadOutput = true;
    renderTabStrip();
  }
}

async function createTab(): Promise<void> {
  const tabId = crypto.randomUUID();
  const container = document.createElement('div');
  container.className = 'terminal-pane';
  container.id = `panel-${tabId}`;
  container.setAttribute('role', 'tabpanel');
  container.setAttribute('aria-labelledby', `tab-${tabId}`);
  ui.terminalHost.appendChild(container);

  const term = new Terminal(terminalOptions());
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(new WebLinksAddon());
  term.open(container);
  fit.fit();

  let summary: SessionSummary;
  try {
    summary = await window.terminalAPI.createSession({
      cols: term.cols,
      rows: term.rows
    });
  } catch (error) {
    term.dispose();
    container.remove();
    toasts.show(`Failed to create session: ${String(error)}`, 'error', 0);
    updateStatus();
    return;
  }

  const initialCwd = normalizePath(summary.cwd || '/');
  const initialTitle = fallbackTabLabel(initialCwd);
  const initialTooltip = initialCwd;
  const tab: TabState = {
    id: tabId,
    sessionId: summary.sessionId,
    title: initialTitle,
    shell: summary.shell,
    pid: summary.pid,
    term,
    fit,
    search,
    container,
    cwd: initialCwd,
    sshHost: null,
    sshHostHint: null,
    startedAt: Date.now(),
    lastExitCode: null,
    lastExitDurationMs: null,
    titleTooltip: initialTooltip,
    exited: false,
    hasUnreadOutput: false,
    hasRecentOutput: false,
    searchResultIndex: -1,
    searchResultCount: 0
  };

  tabs.set(tabId, tab);
  tabOrder.push(tabId);

  term.onData((data) => {
    window.terminalAPI.writeToSession({
      sessionId: summary.sessionId,
      data
    });
  });

  search.onDidChangeResults(({ resultIndex, resultCount }) => {
    tab.searchResultIndex = resultIndex;
    tab.searchResultCount = resultCount;
    if (tab.id === activeTabId) {
      syncSearchCounter();
    }
  });

  term.onTitleChange((incomingTitle) => {
    const nextHostHint = hostFromTitleHint(incomingTitle);
    if (nextHostHint === tab.sshHostHint) {
      return;
    }

    tab.sshHostHint = nextHostHint;
    if (reconcileTabTitles()) {
      renderTabStrip();
      syncCommandPaletteActions();
    }
  });

  term.onResize(({ cols, rows }) => {
    window.terminalAPI.resizeSession({
      sessionId: summary.sessionId,
      cols,
      rows
    });
  });

  reconcileTabTitles();
  syncCommandPaletteActions();
  activateTab(tabId);
}

async function closeTab(tabId: string): Promise<void> {
  const tab = tabs.get(tabId);
  if (!tab) {
    return;
  }

  clearOutputPulse(tab);
  clearTabSearch(tab);
  window.terminalAPI.closeSession(tab.sessionId);
  tab.term.dispose();
  tab.container.remove();

  tabs.delete(tabId);
  tabOrder = tabOrder.filter((id) => id !== tabId);

  if (tabOrder.length === 0) {
    await createTab();
    return;
  }

  if (activeTabId === tabId) {
    const next = tabOrder[Math.max(0, tabOrder.length - 1)];
    if (next) {
      activateTab(next);
    }
  }

  reconcileTabTitles();
  renderTabStrip();
  syncCommandPaletteActions();
  updateStatus();
  if (isSearchOpen()) {
    refreshSearchForActiveTab();
  }
}

function activeTab(): TabState | undefined {
  return tabs.get(activeTabId);
}

function isSearchOpen(): boolean {
  return ui.searchInline.classList.contains('open');
}

function isSearchCaseSensitive(): boolean {
  return ui.searchCase.getAttribute('aria-pressed') === 'true';
}

function isSearchRegexEnabled(): boolean {
  return ui.searchRegex.getAttribute('aria-pressed') === 'true';
}

function setSearchToggleState(button: HTMLButtonElement, pressed: boolean): void {
  button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  button.classList.toggle('active', pressed);
}

function searchDecorations(): NonNullable<ISearchOptions['decorations']> {
  if (resolvedTheme.appearance === 'light') {
    return {
      matchBackground: '#CDEBDF',
      matchBorder: '#5EAE8A',
      matchOverviewRuler: '#5EAE8A',
      activeMatchBackground: '#89C9AC',
      activeMatchBorder: '#2D7A5D',
      activeMatchColorOverviewRuler: '#2D7A5D'
    };
  }

  return {
    matchBackground: '#2A4F42',
    matchBorder: '#4AA97F',
    matchOverviewRuler: '#4AA97F',
    activeMatchBackground: '#3B7F64',
    activeMatchBorder: '#6AD7A7',
    activeMatchColorOverviewRuler: '#6AD7A7'
  };
}

function searchOptions(incremental: boolean): ISearchOptions {
  return {
    caseSensitive: isSearchCaseSensitive(),
    regex: isSearchRegexEnabled(),
    incremental,
    decorations: searchDecorations()
  };
}

function clearTabSearch(tab: TabState): void {
  tab.search.clearDecorations();
  tab.searchResultIndex = -1;
  tab.searchResultCount = 0;
}

function clearSearchDecorationsForAllTabs(): void {
  for (const tab of tabs.values()) {
    clearTabSearch(tab);
  }
}

function syncSearchCounter(): void {
  const term = ui.searchInput.value;
  const tab = activeTab();
  if (!term) {
    ui.searchCounter.textContent = 'Type to search';
    return;
  }

  if (!tab) {
    ui.searchCounter.textContent = 'No active tab';
    return;
  }

  if (tab.searchResultCount < 1) {
    ui.searchCounter.textContent = '0 matches';
    return;
  }

  if (tab.searchResultIndex >= 0) {
    ui.searchCounter.textContent = `${tab.searchResultIndex + 1}/${tab.searchResultCount}`;
    return;
  }

  ui.searchCounter.textContent = `${tab.searchResultCount} matches`;
}

function runSearch(forward: boolean, incremental = false): void {
  const tab = activeTab();
  if (!tab) {
    syncSearchCounter();
    return;
  }

  const term = ui.searchInput.value;
  if (!term) {
    clearTabSearch(tab);
    syncSearchCounter();
    return;
  }

  const options = searchOptions(incremental);
  try {
    const found = forward ? tab.search.findNext(term, options) : tab.search.findPrevious(term, options);
    if (!found) {
      tab.searchResultIndex = -1;
    }
    syncSearchCounter();
  } catch {
    tab.searchResultIndex = -1;
    tab.searchResultCount = 0;
    ui.searchCounter.textContent = 'Invalid regex';
  }
}

function refreshSearchForActiveTab(): void {
  const tab = activeTab();
  if (!tab) {
    syncSearchCounter();
    return;
  }

  if (!ui.searchInput.value) {
    clearTabSearch(tab);
    syncSearchCounter();
    return;
  }

  runSearch(true, true);
}

function openSearch(): void {
  if (!isSearchOpen()) {
    ui.searchInline.classList.add('open');
    ui.searchButton.classList.add('active');
  }

  ui.searchInput.focus();
  ui.searchInput.select();
  refreshSearchForActiveTab();
}

function closeSearch(): void {
  if (!isSearchOpen()) {
    return;
  }

  ui.searchInline.classList.remove('open');
  ui.searchButton.classList.remove('active');
  clearSearchDecorationsForAllTabs();
  syncSearchCounter();
  activeTab()?.term.focus();
}

function isSettingsOpen(): boolean {
  return settingsUi?.settingsPanel.classList.contains('open') ?? false;
}

function setRangeFill(input: HTMLInputElement): void {
  if (input.type !== 'range') {
    return;
  }

  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || min);
  const ratio = max <= min ? 0 : (value - min) / (max - min);
  const percent = `${Math.round(ratio * 100)}%`;
  input.style.setProperty('--fill-percent', percent);
}

function syncThemeSwatches(): void {
  if (!settingsUi) {
    return;
  }

  const selectedTheme = settingsUi.settingTheme.value;
  const swatches = settingsUi.settingThemeSwatches.querySelectorAll<HTMLButtonElement>('.theme-swatch');
  for (const swatch of swatches) {
    const selected = swatch.dataset.theme === selectedTheme;
    swatch.classList.toggle('selected', selected);
    swatch.setAttribute('aria-checked', selected ? 'true' : 'false');
    swatch.setAttribute('role', 'radio');
    swatch.tabIndex = selected ? 0 : -1;
  }
}

function focusSelectedThemeSwatch(): void {
  if (!settingsUi) {
    return;
  }

  const selected = settingsUi.settingThemeSwatches.querySelector<HTMLButtonElement>('.theme-swatch.selected');
  (selected ?? settingsUi.settingThemeSwatches.querySelector<HTMLButtonElement>('.theme-swatch'))?.focus();
}

function syncSettingsFormFromState(source: AppSettings): void {
  if (!settingsUi) {
    return;
  }

  settingsUi.settingFontFamily.value = source.fontFamily;
  settingsUi.settingFontSize.value = String(source.fontSize);
  settingsUi.settingLineHeight.value = String(source.lineHeight);
  settingsUi.settingScrollback.value = String(source.scrollback);
  settingsUi.settingOpacity.value = String(source.backgroundOpacity);
  settingsUi.settingTheme.value = source.theme;
  settingsUi.settingAppearance.value = source.appearancePreference;
  settingsUi.settingCursorStyle.value = source.cursorStyle;
  settingsUi.settingCursorBlink.checked = source.cursorBlink;
  settingsUi.settingVibrancy.checked = source.vibrancy;

  setRangeFill(settingsUi.settingFontSize);
  setRangeFill(settingsUi.settingLineHeight);
  setRangeFill(settingsUi.settingOpacity);
  syncThemeSwatches();
}

function settingsPatchFromForm(): SettingsPatch {
  if (!settingsUi) {
    return {};
  }

  return {
    fontFamily: settingsUi.settingFontFamily.value,
    fontSize: Number(settingsUi.settingFontSize.value),
    lineHeight: Number(settingsUi.settingLineHeight.value),
    scrollback: Number(settingsUi.settingScrollback.value),
    backgroundOpacity: Number(settingsUi.settingOpacity.value),
    theme: settingsUi.settingTheme.value as ThemeSelection,
    appearancePreference: settingsUi.settingAppearance.value as AppSettings['appearancePreference'],
    cursorStyle: settingsUi.settingCursorStyle.value as CursorStyle,
    cursorBlink: settingsUi.settingCursorBlink.checked,
    vibrancy: settingsUi.settingVibrancy.checked
  };
}

function closeSettingsPanel(discardPreview: boolean): void {
  if (!settingsUi) {
    return;
  }

  if (discardPreview && settingsPreviewBaseline) {
    settings = settingsPreviewBaseline;
    applySettingsToAllTabs();
    renderTabStrip();
    updateStatus();
  }

  settingsPreviewBaseline = null;
  settingsUi.settingsPanel.classList.remove('open');
  settingsUi.settingsPanel.setAttribute('aria-hidden', 'true');
  settingsUi.settingsScrim.classList.remove('open');
  ui.terminalHost.classList.remove('panel-open');
  setTimeout(() => {
    if (!isSettingsOpen()) {
      settingsUi.settingsScrim.classList.add('hidden');
    }
  }, 280);
  activeTab()?.term.focus();
}

function openSettings(): void {
  void window.terminalAPI.openSettingsWindow().catch(() => {
    toasts.show('Unable to open settings window.', 'error', 0);
  });
}

function previewSettingsFromForm(): void {
  if (!settingsPreviewBaseline) {
    return;
  }

  const patch = settingsPatchFromForm();
  settings = {
    ...settingsPreviewBaseline,
    ...patch,
    profiles: settingsPreviewBaseline.profiles,
    defaultProfileId: settingsPreviewBaseline.defaultProfileId
  };
  applySettingsToAllTabs();
  renderTabStrip();
  updateStatus();
}

async function saveSettingsFromForm(): Promise<void> {
  if (!settingsUi) {
    return;
  }

  const patch = settingsPatchFromForm();
  settings = await window.terminalAPI.updateSettings(patch);
  settingsPreviewBaseline = null;
  applySettingsToAllTabs();
  renderTabStrip();
  updateStatus();
  closeSettingsPanel(false);
}

function nextTab(): void {
  if (tabOrder.length < 2) {
    return;
  }

  const currentIndex = tabOrder.findIndex((id) => id === activeTabId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % tabOrder.length : 0;
  const next = tabOrder[nextIndex];
  if (next) {
    activateTab(next);
  }
}

function previousTab(): void {
  if (tabOrder.length < 2) {
    return;
  }

  const currentIndex = tabOrder.findIndex((id) => id === activeTabId);
  const previousIndex = currentIndex <= 0 ? tabOrder.length - 1 : currentIndex - 1;
  const next = tabOrder[previousIndex];
  if (next) {
    activateTab(next);
  }
}

function clearActiveTerminal(): void {
  const tab = activeTab();
  tab?.term.clear();
}

function copyActiveCwdToClipboard(): void {
  const active = activeTab();
  if (!active) {
    return;
  }

  void navigator.clipboard
    .writeText(active.cwd)
    .then(() => {
      toasts.show('Copied working directory path.', 'success');
    })
    .catch(() => {
      toasts.show('Unable to copy path to clipboard.', 'error', 0);
    });
}

function commandPaletteActions(): CommandPaletteAction[] {
  const actions: CommandPaletteAction[] = [
    {
      id: 'new-tab',
      title: 'New Tab',
      description: 'Create a new terminal tab',
      shortcut: 'Cmd/Ctrl+T',
      keywords: ['tab', 'create', 'terminal'],
      run: () => void createTab()
    },
    {
      id: 'close-tab',
      title: 'Close Active Tab',
      description: 'Close the current terminal tab',
      shortcut: 'Cmd/Ctrl+W',
      keywords: ['tab', 'close'],
      run: () => {
        if (activeTabId) {
          void closeTab(activeTabId);
        }
      }
    },
    {
      id: 'next-tab',
      title: 'Next Tab',
      description: 'Move to the next tab',
      keywords: ['tab', 'next'],
      run: nextTab
    },
    {
      id: 'previous-tab',
      title: 'Previous Tab',
      description: 'Move to the previous tab',
      keywords: ['tab', 'previous'],
      run: previousTab
    },
    {
      id: 'search',
      title: 'Find in Terminal',
      description: 'Open terminal search',
      shortcut: 'Cmd/Ctrl+F',
      keywords: ['search', 'find', 'output'],
      run: openSearch
    },
    {
      id: 'settings',
      title: 'Open Settings',
      description: 'Open the settings window',
      shortcut: 'Cmd/Ctrl+,',
      keywords: ['settings', 'preferences', 'config'],
      run: openSettings
    },
    {
      id: 'clear-terminal',
      title: 'Clear Terminal',
      description: 'Clear the active terminal viewport',
      shortcut: 'Cmd/Ctrl+K',
      keywords: ['clear', 'terminal'],
      run: clearActiveTerminal
    },
    {
      id: 'theme-cycle',
      title: 'Cycle Theme',
      description: 'Switch to the next available theme',
      keywords: ['theme', 'appearance', 'style'],
      run: () => void cycleTheme()
    },
    {
      id: 'git-refresh',
      title: 'Refresh Git Status',
      description: 'Refresh branch and dirty state for active tab',
      keywords: ['git', 'branch', 'dirty'],
      run: () => void refreshActiveGitStatus(true)
    },
    {
      id: 'copy-cwd',
      title: 'Copy Working Directory',
      description: 'Copy current tab path to clipboard',
      keywords: ['copy', 'path', 'cwd'],
      run: copyActiveCwdToClipboard
    }
  ];

  for (let index = 0; index < tabOrder.length; index += 1) {
    const tabId = tabOrder[index];
    if (!tabId) {
      continue;
    }

    const tab = tabs.get(tabId);
    if (!tab) {
      continue;
    }

    const shortcut = index <= 8 ? `Cmd/Ctrl+${index + 1}` : undefined;
    actions.push({
      id: `switch-tab:${tabId}`,
      title: `Switch to ${tab.title}`,
      description: tab.cwd,
      shortcut,
      keywords: ['tab', 'switch', 'focus'],
      run: () => {
        activateTab(tabId);
      }
    });
  }

  return actions;
}

function syncCommandPaletteActions(): void {
  commandPalette?.setActions(commandPaletteActions());
}

function openCommandPalette(): void {
  syncCommandPaletteActions();
  commandPalette?.open();
}

function initializeCommandPalette(): void {
  commandPalette = createCommandPalette({
    root: ui.commandPalette,
    scrim: ui.paletteScrim,
    input: ui.paletteInput,
    results: ui.paletteResults,
    onActionError: (action, error) => {
      toasts.show(`Command failed: ${action.title} (${String(error)})`, 'error', 0);
    }
  });
  syncCommandPaletteActions();
}

function bindMenuActions(): void {
  window.terminalAPI.onMenuAction((action: MenuAction) => {
    switch (action) {
      case 'new-tab':
        void createTab();
        break;
      case 'close-tab':
        if (activeTabId) {
          void closeTab(activeTabId);
        }
        break;
      case 'next-tab':
        nextTab();
        break;
      case 'previous-tab':
        previousTab();
        break;
      case 'search':
        openSearch();
        break;
      case 'settings':
        openSettings();
        break;
      case 'clear-terminal':
        clearActiveTerminal();
        break;
      case 'command-palette':
        openCommandPalette();
        break;
      default:
        break;
    }
  });
}

function bindSessionEvents(): void {
  window.terminalAPI.onSessionData(({ sessionId, data }) => {
    const tab = tabBySessionId(sessionId);
    if (!tab) {
      return;
    }

    tab.term.write(data);
    markTabOutput(tab);
  });

  window.terminalAPI.onSessionExit(({ sessionId, exitCode }) => {
    const tab = tabBySessionId(sessionId);
    if (!tab) {
      return;
    }

    const durationMs = Date.now() - tab.startedAt;
    tab.lastExitCode = exitCode;
    tab.lastExitDurationMs = durationMs;
    tab.exited = true;
    tab.hasUnreadOutput = false;
    clearOutputPulse(tab);
    lastCommandContext = {
      exitCode,
      durationMs,
      at: Date.now()
    };
    tab.term.writeln(`\r\n\x1b[31m[process exited with code ${exitCode}]\x1b[0m`);
    toasts.show(
      `Session exited with code ${exitCode} after ${formatDuration(durationMs)}.`,
      exitCode === 0 ? 'info' : 'error',
      exitCode === 0 ? 3000 : 0
    );
    renderTabStrip();
    updateStatus();
  });

  window.terminalAPI.onSessionContext((event: SessionContextEvent) => {
    const tab = tabBySessionId(event.sessionId);
    if (!tab) {
      return;
    }

    const nextCwd = normalizePath(event.cwd || tab.cwd);
    const nextSshHost = event.sshHost?.trim() || null;
    if (tab.cwd === nextCwd && tab.sshHost === nextSshHost) {
      return;
    }

    tab.cwd = nextCwd;
    tab.sshHost = nextSshHost;
    if (reconcileTabTitles()) {
      renderTabStrip();
      syncCommandPaletteActions();
    }
    updateStatus();
    if (tab.id === activeTabId) {
      void refreshActiveGitStatus(true);
    }
  });
}

function bindSystemAppearanceEvents(): void {
  window.terminalAPI.onSystemAppearanceChanged(({ appearance }) => {
    systemAppearance = appearance;
    applySettingsToAllTabs();
    renderTabStrip();
    updateStatus();
  });
}

function bindSettingsEvents(): void {
  window.terminalAPI.onSettingsChanged((event) => {
    settings = event.settings;
    applySettingsToAllTabs();
    if (settingsUi && isSettingsOpen()) {
      syncSettingsFormFromState(settings);
    }
    renderTabStrip();
    updateStatus();
    syncCommandPaletteActions();
  });
}

function applyStaticIcons(): void {
  ui.searchButton.innerHTML = icon('search', 14);
  ui.searchPrev.innerHTML = icon('chevron-up', 14);
  ui.searchNext.innerHTML = icon('chevron-down', 14);
  ui.searchClose.innerHTML = icon('close', 13);
  ui.newTabButton.innerHTML = icon('plus', 14);
  ui.settingsButton.innerHTML = icon('gear', 15);
  if (settingsUi) {
    settingsUi.settingsClose.innerHTML = icon('close', 14);
  }
  setSearchToggleState(ui.searchCase, false);
  setSearchToggleState(ui.searchRegex, false);
  syncSearchCounter();
}

function bindKeyboardShortcuts(): void {
  window.addEventListener('keydown', (event) => {
    if (commandPalette?.handleGlobalKeydown(event)) {
      return;
    }

    if (commandPalette?.isOpen()) {
      return;
    }

    const isMod = event.metaKey || event.ctrlKey;

    if (isMod && event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      openCommandPalette();
      return;
    }

    if (isMod && event.key === 't') {
      event.preventDefault();
      void createTab();
      return;
    }

    if (isMod && event.key === 'w') {
      event.preventDefault();
      if (activeTabId) {
        void closeTab(activeTabId);
      }

      return;
    }

    if (isMod && event.key === 'f') {
      event.preventDefault();
      openSearch();
      return;
    }

    if (isMod && event.key.toLowerCase() === 'g') {
      event.preventDefault();
      if (!isSearchOpen()) {
        openSearch();
      }
      runSearch(!event.shiftKey, false);
      return;
    }

    if (event.key === 'F3') {
      event.preventDefault();
      if (!isSearchOpen()) {
        openSearch();
      }
      runSearch(!event.shiftKey, false);
      return;
    }

    if (isMod && event.key === ',') {
      event.preventDefault();
      openSettings();
      return;
    }

    if (isMod && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      clearActiveTerminal();
      return;
    }

    if (isMod && event.key === '=') {
      event.preventDefault();
      settings.fontSize = clamp(settings.fontSize + 1, 10, 28);
      void window.terminalAPI
        .updateSettings({ fontSize: settings.fontSize })
        .then((next) => {
          settings = next;
          applySettingsToAllTabs();
        })
        .catch(() => undefined);
      return;
    }

    if (isMod && event.key === '-') {
      event.preventDefault();
      settings.fontSize = clamp(settings.fontSize - 1, 10, 28);
      void window.terminalAPI
        .updateSettings({ fontSize: settings.fontSize })
        .then((next) => {
          settings = next;
          applySettingsToAllTabs();
        })
        .catch(() => undefined);
      return;
    }

    if (isMod && event.key === '0') {
      event.preventDefault();
      settings.fontSize = 14;
      void window.terminalAPI
        .updateSettings({ fontSize: 14 })
        .then((next) => {
          settings = next;
          applySettingsToAllTabs();
        })
        .catch(() => undefined);
      return;
    }

    if (isMod && !event.shiftKey && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      const index = Number(event.key) - 1;
      const tabId = tabOrder[index];
      if (tabId) {
        activateTab(tabId);
      }
      return;
    }

    if (event.key === 'Escape') {
      if (isSettingsOpen()) {
        event.preventDefault();
        closeSettingsPanel(true);
        return;
      }

      if (isSearchOpen()) {
        event.preventDefault();
        closeSearch();
      }
    }
  });
}

function bindUI(): void {
  ui.newTabButton.addEventListener('click', () => {
    void createTab();
  });

  ui.settingsButton.addEventListener('click', () => {
    openSettings();
  });

  ui.searchButton.addEventListener('click', () => {
    if (isSearchOpen()) {
      closeSearch();
      return;
    }
    openSearch();
  });

  ui.statusShell.addEventListener('click', () => {
    openSettings();
  });

  ui.statusCwd.addEventListener('click', () => {
    copyActiveCwdToClipboard();
  });

  ui.statusGit.addEventListener('click', () => {
    void refreshActiveGitStatus(true);
  });

  ui.statusContext.addEventListener('click', () => {
    if (!lastCommandContext) {
      toasts.show('No command context available yet.', 'info');
      return;
    }

    toasts.show(
      `Last exit ${lastCommandContext.exitCode} after ${formatDuration(lastCommandContext.durationMs)}.`,
      lastCommandContext.exitCode === 0 ? 'success' : 'error',
      lastCommandContext.exitCode === 0 ? 2600 : 0
    );
  });

  ui.statusTheme.addEventListener('click', () => {
    void cycleTheme();
  });

  ui.searchInput.addEventListener('input', () => runSearch(true, true));
  ui.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch(!event.shiftKey, false);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
    }
  });

  ui.searchCase.addEventListener('click', () => {
    setSearchToggleState(ui.searchCase, !isSearchCaseSensitive());
    runSearch(true, true);
  });

  ui.searchRegex.addEventListener('click', () => {
    setSearchToggleState(ui.searchRegex, !isSearchRegexEnabled());
    runSearch(true, true);
  });

  ui.searchNext.addEventListener('click', () => runSearch(true, false));
  ui.searchPrev.addEventListener('click', () => runSearch(false, false));
  ui.searchClose.addEventListener('click', () => closeSearch());

  if (settingsUi) {
    settingsUi.settingThemeSwatches.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const swatch = target.closest<HTMLButtonElement>('.theme-swatch');
      const theme = swatch?.dataset.theme;
      if (!swatch || !theme) {
        return;
      }

      if (settingsUi.settingTheme.value !== theme) {
        settingsUi.settingTheme.value = theme;
        syncThemeSwatches();
        previewSettingsFromForm();
      }
    });

    const onSettingsFormChange = (event: Event): void => {
      if (!isSettingsOpen()) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target instanceof HTMLInputElement && target.type === 'range') {
        setRangeFill(target);
      }

      previewSettingsFromForm();
    };
    settingsUi.settingsForm.addEventListener('input', onSettingsFormChange);
    settingsUi.settingsForm.addEventListener('change', onSettingsFormChange);

    settingsUi.settingsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void saveSettingsFromForm();
    });

    settingsUi.settingsSave.addEventListener('click', () => {
      void saveSettingsFromForm();
    });

    settingsUi.settingsCancel.addEventListener('click', () => {
      closeSettingsPanel(true);
    });

    settingsUi.settingsClose.addEventListener('click', () => {
      closeSettingsPanel(true);
    });

    settingsUi.settingsScrim.addEventListener('click', () => {
      closeSettingsPanel(true);
    });
  }

  ui.tabStrip.addEventListener('scroll', () => {
    updateTabStripOverflow();
  });

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }

    resizeTimer = setTimeout(() => {
      const tab = activeTab();
      if (!tab) {
        return;
      }

      tab.fit.fit();
      window.terminalAPI.resizeSession({
        sessionId: tab.sessionId,
        cols: tab.term.cols,
        rows: tab.term.rows
      });
      updateTabStripOverflow();
    }, 60);
  });

  window.addEventListener('beforeunload', () => {
    if (gitPollTimer) {
      clearInterval(gitPollTimer);
      gitPollTimer = undefined;
    }
  });
}

async function boot(): Promise<void> {
  homeDirectory = await window.terminalAPI.getHomeDirectory();
  systemAppearance = await window.terminalAPI.getSystemAppearance();
  settings = await window.terminalAPI.getSettings();
  applySettingsToAllTabs();
  applyStaticIcons();
  initializeCommandPalette();
  bindUI();
  bindKeyboardShortcuts();
  bindMenuActions();
  bindSessionEvents();
  bindSettingsEvents();
  bindSystemAppearanceEvents();
  startGitStatusPolling();
  await createTab();
  updateStatus();
  void refreshActiveGitStatus(true);
}

void boot();
