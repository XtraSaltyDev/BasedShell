import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal, type ITerminalOptions } from '@xterm/xterm';
import type {
  AppUpdateState,
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
import type { PaneNavigationDirection, PaneNode, SplitDirection } from '../shared/panes';
import {
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  collapseOnClose,
  computeDepthAtNode,
  directionalNeighbor,
  findActiveSessionId,
  listLeafPaneIds,
  splitLeaf
} from '../shared/panes';
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
  paneTree: PaneNode;
  activePaneId: string;
  panes: Map<string, PaneState>;
  title: string;
  titleTooltip: string;
  container: HTMLDivElement;
  hasUnreadOutput: boolean;
}

interface PaneState {
  paneId: string;
  sessionId: string;
  tabId: string;
  shell: string;
  pid: number;
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  wrapper: HTMLDivElement;
  viewport: HTMLDivElement;
  cwd: string;
  sshHost: string | null;
  sshHostHint: string | null;
  startedAt: number;
  lastExitCode: number | null;
  lastExitDurationMs: number | null;
  exited: boolean;
  hasUnreadOutput: boolean;
  searchResultIndex: number;
  searchResultCount: number;
  outputPulseTimer?: ReturnType<typeof setTimeout>;
}

interface SessionLookup {
  tabId: string;
  paneId: string;
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
  settingPromptStyle: HTMLSelectElement;
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
  quickPalette: document.querySelector<HTMLButtonElement>('#quick-palette'),
  quickSearch: document.querySelector<HTMLButtonElement>('#quick-search'),
  quickSettings: document.querySelector<HTMLButtonElement>('#quick-settings'),
  quickToast: document.querySelector<HTMLButtonElement>('#quick-toast'),
  quickNewTab: document.querySelector<HTMLButtonElement>('#quick-new-tab'),
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
  settingPromptStyle: document.querySelector<HTMLSelectElement>('#setting-prompt-style'),
  settingCursorBlink: document.querySelector<HTMLInputElement>('#setting-cursor-blink'),
  settingVibrancy: document.querySelector<HTMLInputElement>('#setting-vibrancy')
};

let settings: AppSettings;
let systemAppearance: AppearanceMode = 'dark';
let resolvedTheme: ResolvedThemeState;
const tabs = new Map<string, TabState>();
let tabOrder: string[] = [];
let activeTabId = '';
const sessionToPane = new Map<string, SessionLookup>();
const tabRemovalTimers = new Map<string, ReturnType<typeof setTimeout>>();
let settingsPreviewBaseline: AppSettings | null = null;
let homeDirectory = '';
const gitStatusByCwd = new Map<string, GitStatusSnapshot>();
const pendingGitRequests = new Set<string>();
let gitPollTimer: ReturnType<typeof setInterval> | undefined;
let lastCommandContext: CommandContext | null = null;
let updateState: AppUpdateState | null = null;
let updateDownloadToastBucket = -1;
let manualUpdateCheckPending = false;
const ratioPersistTimers = new Map<SplitDirection, ReturnType<typeof setTimeout>>();
const MAX_SPLIT_DEPTH = 2;
const RESIZE_STEP = 0.03;
const RELEASES_URL = 'https://github.com/XtraSaltyDev/BasedShell/releases/latest';

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
    ['settingPromptStyle', dom.settingPromptStyle],
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
    settingPromptStyle: dom.settingPromptStyle as HTMLSelectElement,
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
  quickPalette: assertDom(dom.quickPalette, '#quick-palette'),
  quickSearch: assertDom(dom.quickSearch, '#quick-search'),
  quickSettings: assertDom(dom.quickSettings, '#quick-settings'),
  quickToast: assertDom(dom.quickToast, '#quick-toast'),
  quickNewTab: assertDom(dom.quickNewTab, '#quick-new-tab'),
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

function applyPaneBackground(pane: PaneState): void {
  const bg = resolvedTheme.theme.terminal.background;
  pane.wrapper.style.backgroundColor = bg;
  pane.viewport.style.backgroundColor = bg;
}

function applyPaneSettings(pane: PaneState): void {
  pane.term.options.fontFamily = settings.fontFamily;
  pane.term.options.fontSize = settings.fontSize;
  pane.term.options.lineHeight = settings.lineHeight;
  pane.term.options.cursorStyle = settings.cursorStyle;
  pane.term.options.cursorBlink = settings.cursorBlink;
  pane.term.options.scrollback = settings.scrollback;
  pane.term.options.theme = resolvedTheme.theme.terminal;
  applyPaneBackground(pane);
  pane.fit.fit();
  window.terminalAPI.resizeSession({
    sessionId: pane.sessionId,
    cols: pane.term.cols,
    rows: pane.term.rows
  });
}

function applySettingsToAllTabs(): void {
  applyThemeState();
  setSurfaceOpacity(settings.backgroundOpacity);

  for (const tab of tabs.values()) {
    for (const pane of tab.panes.values()) {
      applyPaneSettings(pane);
    }
  }

  if (isSearchOpen()) {
    refreshSearchForActiveTab();
  }
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

function activeTab(): TabState | undefined {
  return tabs.get(activeTabId);
}

function activePaneForTab(tab: TabState | undefined): PaneState | undefined {
  if (!tab) {
    return undefined;
  }

  return tab.panes.get(tab.activePaneId);
}

function activePane(): PaneState | undefined {
  return activePaneForTab(activeTab());
}

function paneAndTabBySession(sessionId: string): { tab: TabState; pane: PaneState } | null {
  const lookup = sessionToPane.get(sessionId);
  if (!lookup) {
    return null;
  }

  const tab = tabs.get(lookup.tabId);
  const pane = tab?.panes.get(lookup.paneId);
  if (!tab || !pane) {
    return null;
  }

  return { tab, pane };
}

function resolveTabTitle(tab: TabState): { title: string; tooltip: string } {
  const pane = activePaneForTab(tab);
  if (!pane) {
    return {
      title: 'No Session',
      tooltip: 'No active pane session'
    };
  }

  const cwd = normalizePath(pane.cwd || '/');
  const host = pane.sshHost ?? pane.sshHostHint;
  const git = gitStatusByCwd.get(pane.cwd);

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
  const tabExited = tab.panes.size > 0 && Array.from(tab.panes.values()).every((pane) => pane.exited);
  element.classList.toggle('active', isActive);
  element.classList.toggle('exit', tabExited);
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
    if (tabExited) {
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

function setStatusSegmentState(button: HTMLButtonElement, state: 'idle' | 'success' | 'warning' | 'danger' | 'info'): void {
  button.dataset.state = state;
}

function setSegmentContent(button: HTMLButtonElement, prefix: 'dot' | 'icon' | 'none', label: string): void {
  button.textContent = '';
  if (prefix === 'dot') {
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    button.appendChild(dot);
  } else if (prefix === 'icon') {
    const ico = document.createElement('span');
    ico.className = 'status-icon';
    ico.textContent = '\u2387';
    button.appendChild(ico);
  }
  const span = document.createElement('span');
  span.textContent = label;
  button.appendChild(span);
}

async function refreshActiveGitStatus(force = false): Promise<void> {
  const pane = activePane();
  if (!pane) {
    return;
  }

  const cwd = pane.cwd;
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

function onUpdateStateChanged(next: AppUpdateState): void {
  const previous = updateState;
  updateState = next;
  syncCommandPaletteActions();

  if (next.status === 'checking') {
    updateDownloadToastBucket = -1;
  }

  if (next.status === 'not-available' && manualUpdateCheckPending) {
    manualUpdateCheckPending = false;
    toasts.show(`BasedShell ${next.currentVersion} is up to date.`, 'success');
    return;
  }

  if (next.status === 'unsupported' && manualUpdateCheckPending) {
    manualUpdateCheckPending = false;
    toasts.show('Auto-update is unavailable in this build. Use “Open Latest Release Downloads”.', 'info');
    return;
  }

  if (!previous) {
    return;
  }

  if (next.status === 'available' && previous.status !== 'available') {
    manualUpdateCheckPending = false;
    const version = next.nextVersion ? ` ${next.nextVersion}` : '';
    toasts.show(`Update${version} is available. Downloading now...`, 'info');
    return;
  }

  if (next.status === 'downloading' && typeof next.progress === 'number') {
    const bucket = Math.floor(next.progress / 25);
    if (bucket > updateDownloadToastBucket && bucket >= 1 && bucket <= 3) {
      updateDownloadToastBucket = bucket;
      toasts.show(`Update download ${Math.round(next.progress)}%`, 'info');
    }
    return;
  }

  if (next.status === 'downloaded' && previous.status !== 'downloaded') {
    manualUpdateCheckPending = false;
    updateDownloadToastBucket = -1;
    const version = next.nextVersion ? ` ${next.nextVersion}` : '';
    toasts.show(
      `Update${version} downloaded. Run “Restart to Apply Update” from the command palette.`,
      'success'
    );
    return;
  }

  if (next.status === 'error' && next.message && next.message !== previous.message) {
    manualUpdateCheckPending = false;
    toasts.show(next.message, 'error', 0);
  }
}

async function checkForUpdates(manual = true): Promise<void> {
  if (manual) {
    manualUpdateCheckPending = true;
  }

  try {
    const next = await window.terminalAPI.checkForUpdates();
    onUpdateStateChanged(next);

    if (!manual) {
      return;
    }

    if (next.status === 'checking') {
      toasts.show('Checking for updates...', 'info');
      return;
    }

    if (next.status === 'unsupported') {
      manualUpdateCheckPending = false;
      toasts.show(
        next.message ?? 'Auto-update is unavailable in this build. Use manual release downloads.',
        'info'
      );
      return;
    }

    if (next.status === 'error') {
      manualUpdateCheckPending = false;
      if (next.message) {
        toasts.show(next.message, 'error', 0);
      }
    }
  } catch {
    manualUpdateCheckPending = false;
    toasts.show('Unable to check for updates.', 'error', 0);
  }
}

async function installDownloadedUpdate(): Promise<void> {
  if (updateState?.status === 'unsupported') {
    await openReleaseDownloads();
    return;
  }

  try {
    const started = await window.terminalAPI.installUpdate();
    if (!started) {
      toasts.show('No downloaded update is ready yet.', 'info');
      return;
    }

    toasts.show('Restarting to install update...', 'info');
  } catch {
    toasts.show('Unable to install downloaded update.', 'error', 0);
  }
}

async function openReleaseDownloads(): Promise<void> {
  try {
    const opened = await window.terminalAPI.openReleasesPage();
    if (!opened) {
      toasts.show(`Unable to open releases page. URL: ${RELEASES_URL}`, 'error', 0);
      return;
    }

    toasts.show('Opened latest release downloads.', 'success');
  } catch {
    toasts.show(`Unable to open releases page. URL: ${RELEASES_URL}`, 'error', 0);
  }
}

function updateStatus(): void {
  const tab = activeTab();
  const pane = activePaneForTab(tab);
  if (!tab || !pane) {
    setSegmentContent(ui.statusShell, 'dot', 'No Session');
    ui.statusShell.title = 'No active session';
    setStatusSegmentState(ui.statusShell, 'idle');

    setSegmentContent(ui.statusCwd, 'dot', 'Path —');
    ui.statusCwd.title = 'No active session path';
    setStatusSegmentState(ui.statusCwd, 'idle');

    setSegmentContent(ui.statusGit, 'icon', 'Git —');
    ui.statusGit.title = 'No active repository';
    setStatusSegmentState(ui.statusGit, 'idle');

    setSegmentContent(ui.statusContext, 'none', 'Exit —');
    ui.statusContext.title = 'No command context available';
    setStatusSegmentState(ui.statusContext, 'idle');

    setSegmentContent(ui.statusTabs, 'none', '0 tabs');
    ui.statusTabs.title = 'No open tabs';
    setStatusSegmentState(ui.statusTabs, 'idle');

    setSegmentContent(ui.statusTheme, 'none', resolvedTheme.themeName);
    ui.statusTheme.title = 'Theme';
    setStatusSegmentState(ui.statusTheme, 'idle');
    return;
  }

  const shellLabel = shellName(pane.shell);
  setSegmentContent(ui.statusShell, 'dot', pane.exited ? `${shellLabel} (Exited)` : shellLabel);
  ui.statusShell.title = `Shell: ${pane.shell}${pane.exited ? ' (exited)' : ''}. Click to open settings.`;
  setStatusSegmentState(ui.statusShell, pane.exited ? 'warning' : 'success');

  setSegmentContent(ui.statusCwd, 'dot', truncateMiddle(toTildePath(pane.cwd), 34));
  ui.statusCwd.title = `Working directory: ${pane.cwd}. Click to copy path.`;
  setStatusSegmentState(ui.statusCwd, 'info');

  const git = gitStatusByCwd.get(pane.cwd);
  if (git) {
    ui.statusGit.textContent = '';
    const gitIcon = document.createElement('span');
    gitIcon.className = 'status-icon';
    gitIcon.textContent = '\u2387';
    ui.statusGit.appendChild(gitIcon);
    const branchSpan = document.createElement('span');
    branchSpan.textContent = git.branch;
    ui.statusGit.appendChild(branchSpan);
    if (git.dirty) {
      const dirtySpan = document.createElement('span');
      dirtySpan.style.color = 'var(--color-warning)';
      dirtySpan.textContent = '*';
      ui.statusGit.appendChild(dirtySpan);
    }
    ui.statusGit.title = `Git branch: ${git.branch}${git.dirty ? ' (dirty)' : ' (clean)'} · Click to refresh`;
    setStatusSegmentState(ui.statusGit, git.dirty ? 'warning' : 'success');
  } else {
    setSegmentContent(ui.statusGit, 'icon', 'No Repo');
    ui.statusGit.title = `No git repository detected for ${pane.cwd}. Click to refresh.`;
    setStatusSegmentState(ui.statusGit, 'idle');
  }

  const context =
    pane.lastExitCode !== null && pane.lastExitDurationMs !== null
      ? { exitCode: pane.lastExitCode, durationMs: pane.lastExitDurationMs }
      : lastCommandContext;
  if (context) {
    setSegmentContent(ui.statusContext, 'none', `\u2713 ${context.exitCode} \u00b7 ${formatDuration(context.durationMs)}`);
    ui.statusContext.title = `Last process exit code ${context.exitCode} after ${formatDuration(context.durationMs)}.`;
    setStatusSegmentState(ui.statusContext, context.exitCode === 0 ? 'success' : 'danger');
  } else {
    setSegmentContent(ui.statusContext, 'none', 'Exit —');
    ui.statusContext.title = 'No command context available yet.';
    setStatusSegmentState(ui.statusContext, 'idle');
  }

  setSegmentContent(ui.statusTabs, 'none', `${tabOrder.length} tab${tabOrder.length === 1 ? '' : 's'}`);
  ui.statusTabs.title = `${tabOrder.length} open tab${tabOrder.length === 1 ? '' : 's'}.`;
  setStatusSegmentState(ui.statusTabs, 'idle');

  const themeLabel =
    settings.theme === 'system' ? `System (${resolvedTheme.themeName})` : resolvedTheme.themeName;
  setSegmentContent(ui.statusTheme, 'none', themeLabel);
  ui.statusTheme.title = `Theme: ${themeLabel}. Click to cycle themes.`;
  setStatusSegmentState(ui.statusTheme, 'idle');
}

function updatePaneFocusStyles(tab: TabState): void {
  for (const pane of tab.panes.values()) {
    const isActivePane = tab.id === activeTabId && pane.paneId === tab.activePaneId;
    pane.wrapper.classList.toggle('active', isActivePane);
    pane.wrapper.classList.toggle('unread', pane.hasUnreadOutput && !isActivePane);
    pane.wrapper.classList.toggle('exited', pane.exited);
  }
}

function fitVisiblePanes(tab: TabState): void {
  if (tab.id !== activeTabId) {
    return;
  }

  const leafIds = listLeafPaneIds(tab.paneTree);
  for (const paneId of leafIds) {
    const pane = tab.panes.get(paneId);
    if (!pane) {
      continue;
    }

    pane.fit.fit();
    window.terminalAPI.resizeSession({
      sessionId: pane.sessionId,
      cols: pane.term.cols,
      rows: pane.term.rows
    });
  }
}

function scheduleFitVisiblePanes(tab: TabState): void {
  if (tab.id !== activeTabId) {
    return;
  }

  requestAnimationFrame(() => {
    fitVisiblePanes(tab);
  });
}

function persistSplitRatio(direction: SplitDirection, ratio: number): void {
  const key = direction === 'vertical' ? 'lastVerticalSplitRatio' : 'lastHorizontalSplitRatio';
  const normalized = clamp(ratio, MIN_SPLIT_RATIO, MAX_SPLIT_RATIO);
  const previous = settings.ui[key];
  if (previous !== null && Math.abs(previous - normalized) < 0.01) {
    return;
  }

  settings.ui = {
    ...settings.ui,
    [key]: normalized
  };

  const existing = ratioPersistTimers.get(direction);
  if (existing) {
    clearTimeout(existing);
  }

  ratioPersistTimers.set(
    direction,
    setTimeout(() => {
      const nextUi = {
        [key]: normalized
      };

      void window.terminalAPI
        .updateSettings({ ui: nextUi })
        .then((next) => {
          settings = next;
        })
        .catch(() => {
          toasts.show('Unable to persist split ratio preference.', 'error', 0);
        })
        .finally(() => {
          ratioPersistTimers.delete(direction);
        });
    }, 220)
  );
}

function updateSplitRatioInTree(
  node: PaneNode,
  splitId: string,
  ratio: number
): { node: PaneNode; changed: boolean; direction?: SplitDirection; ratio?: number } {
  if (node.type === 'leaf') {
    return { node, changed: false };
  }

  if (node.splitId === splitId) {
    const normalized = clamp(ratio, MIN_SPLIT_RATIO, MAX_SPLIT_RATIO);
    if (Math.abs(normalized - node.ratio) < 0.001) {
      return { node, changed: false };
    }

    return {
      node: {
        ...node,
        ratio: normalized
      },
      changed: true,
      direction: node.direction,
      ratio: normalized
    };
  }

  const left = updateSplitRatioInTree(node.children[0], splitId, ratio);
  if (left.changed) {
    return {
      node: {
        ...node,
        children: [left.node, node.children[1]]
      },
      changed: true,
      direction: left.direction,
      ratio: left.ratio
    };
  }

  const right = updateSplitRatioInTree(node.children[1], splitId, ratio);
  if (right.changed) {
    return {
      node: {
        ...node,
        children: [node.children[0], right.node]
      },
      changed: true,
      direction: right.direction,
      ratio: right.ratio
    };
  }

  return { node, changed: false };
}

function renderPaneNode(tab: TabState, node: PaneNode): HTMLElement {
  if (node.type === 'leaf') {
    const pane = tab.panes.get(node.paneId);
    if (!pane) {
      const fallback = document.createElement('div');
      fallback.className = 'pane-missing';
      fallback.textContent = 'Pane unavailable';
      return fallback;
    }

    if (!pane.wrapper.contains(pane.viewport)) {
      pane.wrapper.appendChild(pane.viewport);
    }

    pane.wrapper.dataset.paneId = pane.paneId;
    pane.wrapper.onclick = () => {
      if (tab.id !== activeTabId) {
        activateTab(tab.id);
      }
      setActivePane(tab.id, pane.paneId, true);
    };

    return pane.wrapper;
  }

  const split = document.createElement('div');
  split.className = `pane-split pane-split-${node.direction}`;
  split.dataset.splitId = node.splitId;

  const first = document.createElement('div');
  first.className = 'pane-branch pane-branch-first';
  first.style.flexBasis = `${Math.round(node.ratio * 10000) / 100}%`;
  first.style.flexGrow = '0';
  first.style.flexShrink = '0';
  first.appendChild(renderPaneNode(tab, node.children[0]));

  const second = document.createElement('div');
  second.className = 'pane-branch pane-branch-second';
  second.appendChild(renderPaneNode(tab, node.children[1]));

  const divider = document.createElement('div');
  divider.className = `pane-divider pane-divider-${node.direction}`;
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-label', `Resize ${node.direction} split`);
  divider.onpointerdown = (event) => {
    event.preventDefault();

    const splitSelector = `[data-split-id="${node.splitId}"]`;
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!tabs.has(tab.id)) {
        return;
      }

      const liveTab = tabs.get(tab.id);
      const liveSplit = liveTab?.container.querySelector<HTMLElement>(splitSelector) ?? split;
      const hostRect = liveSplit.getBoundingClientRect();
      if (hostRect.width < 1 || hostRect.height < 1) {
        return;
      }

      const ratio =
        node.direction === 'vertical'
          ? (moveEvent.clientX - hostRect.left) / hostRect.width
          : (moveEvent.clientY - hostRect.top) / hostRect.height;

      const next = tabs.get(tab.id);
      if (!next) {
        return;
      }

      const update = updateSplitRatioInTree(next.paneTree, node.splitId, ratio);
      if (!update.changed || update.ratio === undefined || !update.direction) {
        return;
      }

      next.paneTree = update.node;
      renderPaneLayout(next);
      updateStatus();
      persistSplitRatio(update.direction, update.ratio);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  split.append(first, divider, second);
  return split;
}

function renderPaneLayout(tab: TabState): void {
  tab.container.textContent = '';
  tab.container.appendChild(renderPaneNode(tab, tab.paneTree));
  updatePaneFocusStyles(tab);
  scheduleFitVisiblePanes(tab);
}

function setActivePane(tabId: string, paneId: string, focus: boolean): void {
  const tab = tabs.get(tabId);
  const pane = tab?.panes.get(paneId);
  if (!tab || !pane) {
    return;
  }

  tab.activePaneId = paneId;
  pane.hasUnreadOutput = false;
  if (tab.id === activeTabId) {
    updatePaneFocusStyles(tab);
    if (reconcileTabTitles()) {
      renderTabStrip();
      syncCommandPaletteActions();
    }
    updateStatus();
    if (isSearchOpen()) {
      refreshSearchForActiveTab();
    }
    void refreshActiveGitStatus(false);
    if (focus) {
      pane.term.focus();
    }
  }
}

function activateTab(tabId: string): void {
  const target = tabs.get(tabId);
  if (!target) {
    return;
  }

  activeTabId = tabId;
  target.hasUnreadOutput = false;
  const pane = target.panes.get(target.activePaneId);
  if (pane) {
    pane.hasUnreadOutput = false;
  }

  for (const [currentId, tab] of tabs.entries()) {
    tab.container.classList.toggle('active', currentId === tabId);
    updatePaneFocusStyles(tab);
  }

  renderTabStrip();
  updateStatus();
  if (isSearchOpen()) {
    refreshSearchForActiveTab();
  }
  void refreshActiveGitStatus(false);
  if (pane) {
    pane.term.focus();
  }
  scheduleFitVisiblePanes(target);
}

function clearOutputPulse(pane: PaneState): void {
  if (pane.outputPulseTimer) {
    clearTimeout(pane.outputPulseTimer);
    pane.outputPulseTimer = undefined;
  }
}

function markPaneOutput(tab: TabState, pane: PaneState): void {
  if (pane.exited) {
    return;
  }

  if (tab.id === activeTabId && pane.paneId === tab.activePaneId) {
    return;
  }

  pane.hasUnreadOutput = true;
  if (tab.id !== activeTabId && !tab.hasUnreadOutput) {
    tab.hasUnreadOutput = true;
    renderTabStrip();
  }
  updatePaneFocusStyles(tab);
}

async function createPaneForTab(tabId: string, cwd?: string): Promise<PaneState | null> {
  const tab = tabs.get(tabId);
  const basisPane = activePaneForTab(tab);
  const cols = basisPane?.term.cols ?? 120;
  const rows = basisPane?.term.rows ?? 34;

  let summary: SessionSummary;
  try {
    summary = await window.terminalAPI.createSession({
      cols,
      rows,
      cwd
    });
  } catch (error) {
    toasts.show(`Failed to create session: ${String(error)}`, 'error', 0);
    return null;
  }

  const paneId = `pane-${summary.sessionId}`;
  const wrapper = document.createElement('div');
  wrapper.className = 'pane-shell';
  wrapper.tabIndex = -1;
  wrapper.dataset.paneId = paneId;

  const viewport = document.createElement('div');
  viewport.className = 'pane-viewport';
  wrapper.appendChild(viewport);

  const term = new Terminal(terminalOptions());
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(new WebLinksAddon());
  term.open(viewport);

  const pane: PaneState = {
    paneId,
    sessionId: summary.sessionId,
    tabId,
    shell: summary.shell,
    pid: summary.pid,
    term,
    fit,
    search,
    wrapper,
    viewport,
    cwd: normalizePath(summary.cwd || '/'),
    sshHost: null,
    sshHostHint: null,
    startedAt: Date.now(),
    lastExitCode: null,
    lastExitDurationMs: null,
    exited: false,
    hasUnreadOutput: false,
    searchResultIndex: -1,
    searchResultCount: 0
  };
  applyPaneBackground(pane);

  term.onData((data) => {
    window.terminalAPI.writeToSession({
      sessionId: pane.sessionId,
      data
    });
  });

  term.onResize(({ cols: nextCols, rows: nextRows }) => {
    window.terminalAPI.resizeSession({
      sessionId: pane.sessionId,
      cols: nextCols,
      rows: nextRows
    });
  });

  search.onDidChangeResults(({ resultIndex, resultCount }) => {
    pane.searchResultIndex = resultIndex;
    pane.searchResultCount = resultCount;
    const active = activePane();
    if (active && active.paneId === pane.paneId) {
      syncSearchCounter();
    }
  });

  term.onTitleChange((incomingTitle) => {
    const nextHostHint = hostFromTitleHint(incomingTitle);
    if (nextHostHint === pane.sshHostHint) {
      return;
    }

    pane.sshHostHint = nextHostHint;
    const currentTab = tabs.get(tabId);
    if (currentTab && reconcileTabTitles()) {
      renderTabStrip();
      syncCommandPaletteActions();
    }
  });

  sessionToPane.set(pane.sessionId, {
    tabId,
    paneId
  });

  return pane;
}

async function splitActivePane(direction: SplitDirection): Promise<void> {
  const tab = activeTab();
  const pane = activePaneForTab(tab);
  if (!tab || !pane) {
    return;
  }

  const depth = computeDepthAtNode(tab.paneTree, pane.paneId);
  if (depth === null || depth >= MAX_SPLIT_DEPTH) {
    toasts.show('Maximum split depth reached', 'info');
    return;
  }

  const createdPane = await createPaneForTab(tab.id, pane.cwd);
  if (!createdPane) {
    return;
  }

  const ratio =
    direction === 'vertical'
      ? settings.ui.lastVerticalSplitRatio ?? 0.5
      : settings.ui.lastHorizontalSplitRatio ?? 0.5;
  const nextTree = splitLeaf(tab.paneTree, pane.paneId, direction, createdPane.sessionId, ratio);
  const activeSession = findActiveSessionId(nextTree, createdPane.paneId);
  if (!activeSession) {
    window.terminalAPI.closeSession(createdPane.sessionId);
    createdPane.term.dispose();
    sessionToPane.delete(createdPane.sessionId);
    return;
  }

  tab.panes.set(createdPane.paneId, createdPane);
  tab.paneTree = nextTree;
  tab.activePaneId = createdPane.paneId;
  tab.hasUnreadOutput = false;
  renderPaneLayout(tab);
  if (reconcileTabTitles()) {
    renderTabStrip();
    syncCommandPaletteActions();
  }
  if (tab.id === activeTabId) {
    createdPane.term.focus();
    updateStatus();
    void refreshActiveGitStatus(true);
  }
}

function closePaneRuntime(tab: TabState, paneId: string): void {
  const pane = tab.panes.get(paneId);
  if (!pane) {
    return;
  }

  clearOutputPulse(pane);
  pane.search.clearDecorations();
  window.terminalAPI.closeSession(pane.sessionId);
  pane.term.dispose();
  pane.wrapper.remove();
  tab.panes.delete(paneId);
  sessionToPane.delete(pane.sessionId);
}

async function closePane(tabId: string, paneId: string): Promise<void> {
  const tab = tabs.get(tabId);
  if (!tab) {
    return;
  }

  if (tab.panes.size <= 1) {
    await closeTab(tabId);
    return;
  }

  closePaneRuntime(tab, paneId);
  const nextTree = collapseOnClose(tab.paneTree, paneId);
  if (!nextTree) {
    await closeTab(tabId);
    return;
  }

  tab.paneTree = nextTree;
  if (!tab.panes.has(tab.activePaneId)) {
    const fallbackPane = listLeafPaneIds(nextTree)[0];
    if (fallbackPane) {
      tab.activePaneId = fallbackPane;
    }
  }

  renderPaneLayout(tab);
  if (reconcileTabTitles()) {
    renderTabStrip();
    syncCommandPaletteActions();
  }
  if (tab.id === activeTabId) {
    updateStatus();
    const nextPane = activePaneForTab(tab);
    if (nextPane) {
      nextPane.term.focus();
    }
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

  const tab: TabState = {
    id: tabId,
    paneTree: {
      type: 'leaf',
      paneId: 'pending',
      sessionId: 'pending'
    },
    activePaneId: 'pending',
    panes: new Map<string, PaneState>(),
    title: 'New Tab',
    titleTooltip: 'Initializing',
    container,
    hasUnreadOutput: false
  };

  tabs.set(tabId, tab);
  tabOrder.push(tabId);

  const pane = await createPaneForTab(tabId);
  if (!pane) {
    tabs.delete(tabId);
    tabOrder = tabOrder.filter((id) => id !== tabId);
    container.remove();
    updateStatus();
    return;
  }

  tab.panes.set(pane.paneId, pane);
  tab.paneTree = {
    type: 'leaf',
    paneId: pane.paneId,
    sessionId: pane.sessionId
  };
  tab.activePaneId = pane.paneId;
  renderPaneLayout(tab);
  reconcileTabTitles();
  syncCommandPaletteActions();
  activateTab(tabId);
}

async function closeTab(tabId: string): Promise<void> {
  const tab = tabs.get(tabId);
  if (!tab) {
    return;
  }

  const paneIds = [...tab.panes.keys()];
  for (const paneId of paneIds) {
    closePaneRuntime(tab, paneId);
  }
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

function resizePaneToward(direction: PaneNavigationDirection): void {
  const tab = activeTab();
  if (!tab) {
    return;
  }
  const activePaneId = tab.activePaneId;

  function walk(node: PaneNode): { node: PaneNode; contains: boolean; changed: boolean; ratio?: number; splitDirection?: SplitDirection } {
    if (node.type === 'leaf') {
      return {
        node,
        contains: node.paneId === activePaneId,
        changed: false
      };
    }

    const left = walk(node.children[0]);
    if (left.changed) {
      return {
        node: {
          ...node,
          children: [left.node, node.children[1]]
        },
        contains: true,
        changed: true,
        ratio: left.ratio,
        splitDirection: left.splitDirection
      };
    }

    const right = walk(node.children[1]);
    if (right.changed) {
      return {
        node: {
          ...node,
          children: [node.children[0], right.node]
        },
        contains: true,
        changed: true,
        ratio: right.ratio,
        splitDirection: right.splitDirection
      };
    }

    const contains = left.contains || right.contains;
    if (!contains) {
      return { node, contains: false, changed: false };
    }

    const shouldHandle =
      (node.direction === 'vertical' && (direction === 'left' || direction === 'right')) ||
      (node.direction === 'horizontal' && (direction === 'up' || direction === 'down'));
    if (!shouldHandle) {
      return { node, contains: true, changed: false };
    }

    const inFirst = left.contains;
    let delta = 0;
    if (node.direction === 'vertical') {
      delta = inFirst
        ? direction === 'right'
          ? RESIZE_STEP
          : -RESIZE_STEP
        : direction === 'right'
          ? -RESIZE_STEP
          : RESIZE_STEP;
    } else {
      delta = inFirst
        ? direction === 'down'
          ? RESIZE_STEP
          : -RESIZE_STEP
        : direction === 'down'
          ? -RESIZE_STEP
          : RESIZE_STEP;
    }

    const ratio = clamp(node.ratio + delta, MIN_SPLIT_RATIO, MAX_SPLIT_RATIO);
    if (Math.abs(ratio - node.ratio) < 0.001) {
      return { node, contains: true, changed: false };
    }

    return {
      node: {
        ...node,
        ratio
      },
      contains: true,
      changed: true,
      ratio,
      splitDirection: node.direction
    };
  }

  const next = walk(tab.paneTree);
  if (!next.changed || next.ratio === undefined || !next.splitDirection) {
    return;
  }

  tab.paneTree = next.node;
  renderPaneLayout(tab);
  updateStatus();
  persistSplitRatio(next.splitDirection, next.ratio);
}

function focusPaneToward(direction: PaneNavigationDirection): void {
  const tab = activeTab();
  if (!tab) {
    return;
  }

  const nextPaneId = directionalNeighbor(tab.paneTree, tab.activePaneId, direction);
  if (!nextPaneId) {
    return;
  }

  setActivePane(tab.id, nextPaneId, true);
}

async function splitActivePaneVertical(): Promise<void> {
  await splitActivePane('vertical');
}

async function splitActivePaneHorizontal(): Promise<void> {
  await splitActivePane('horizontal');
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

function clearPaneSearch(pane: PaneState): void {
  pane.search.clearDecorations();
  pane.searchResultIndex = -1;
  pane.searchResultCount = 0;
}

function clearSearchDecorationsForAllTabs(): void {
  for (const tab of tabs.values()) {
    for (const pane of tab.panes.values()) {
      clearPaneSearch(pane);
    }
  }
}

function syncSearchCounter(): void {
  const term = ui.searchInput.value;
  const pane = activePane();
  if (!term) {
    ui.searchCounter.textContent = 'Type to search';
    return;
  }

  if (!pane) {
    ui.searchCounter.textContent = 'No active tab';
    return;
  }

  if (pane.searchResultCount < 1) {
    ui.searchCounter.textContent = '0 matches';
    return;
  }

  if (pane.searchResultIndex >= 0) {
    ui.searchCounter.textContent = `${pane.searchResultIndex + 1}/${pane.searchResultCount}`;
    return;
  }

  ui.searchCounter.textContent = `${pane.searchResultCount} matches`;
}

function runSearch(forward: boolean, incremental = false): void {
  const pane = activePane();
  if (!pane) {
    syncSearchCounter();
    return;
  }

  const term = ui.searchInput.value;
  if (!term) {
    clearPaneSearch(pane);
    syncSearchCounter();
    return;
  }

  const options = searchOptions(incremental);
  try {
    const found = forward ? pane.search.findNext(term, options) : pane.search.findPrevious(term, options);
    if (!found) {
      pane.searchResultIndex = -1;
    }
    syncSearchCounter();
  } catch {
    pane.searchResultIndex = -1;
    pane.searchResultCount = 0;
    ui.searchCounter.textContent = 'Invalid regex';
  }
}

function refreshSearchForActiveTab(): void {
  const pane = activePane();
  if (!pane) {
    syncSearchCounter();
    return;
  }

  if (!ui.searchInput.value) {
    clearPaneSearch(pane);
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
  activePane()?.term.focus();
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

  const rangeValue = input.parentElement?.querySelector<HTMLSpanElement>('.range-value');
  if (rangeValue) {
    const step = Number(input.step || 1);
    if (step < 1) {
      rangeValue.textContent = String(value);
    } else {
      rangeValue.textContent = `${Math.round(value)}`;
    }
  }
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
  settingsUi.settingPromptStyle.value = source.promptStyle;
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
    promptStyle: settingsUi.settingPromptStyle.value as AppSettings['promptStyle'],
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
  activePane()?.term.focus();
}

function openSettings(): void {
  if (!settingsUi) {
    return;
  }

  if (isSettingsOpen()) {
    settingsUi.settingsPanel.querySelector<HTMLElement>('.settings-form')?.focus();
    return;
  }

  settingsPreviewBaseline = { ...settings, ui: { ...settings.ui }, profiles: [...settings.profiles] };
  syncSettingsFormFromState(settings);
  syncThemeSwatches();

  settingsUi.settingsScrim.classList.remove('hidden');
  settingsUi.settingsPanel.setAttribute('aria-hidden', 'false');
  ui.terminalHost.classList.add('panel-open');

  requestAnimationFrame(() => {
    settingsUi.settingsPanel.classList.add('open');
    settingsUi.settingsScrim.classList.add('open');
    focusSelectedThemeSwatch();
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
    ui: {
      ...settingsPreviewBaseline.ui,
      ...patch.ui
    },
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
  activePane()?.term.clear();
}

function copyActiveCwdToClipboard(): void {
  const pane = activePane();
  if (!pane) {
    return;
  }

  void navigator.clipboard
    .writeText(pane.cwd)
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
      description: 'Open a new terminal tab',
      icon: '+',
      shortcut: 'Cmd/Ctrl+T',
      keywords: ['tab', 'create', 'terminal'],
      run: () => void createTab()
    },
    {
      id: 'close-tab',
      title: 'Close Active Tab',
      description: 'Close the current terminal tab',
      icon: '\u00d7',
      shortcut: 'Cmd/Ctrl+W',
      keywords: ['tab', 'close'],
      run: () => {
        if (activeTabId) {
          void closeTab(activeTabId);
        }
      }
    },
    {
      id: 'close-pane',
      title: 'Close Active Pane',
      description: 'Close the focused pane and collapse the split',
      icon: '\u00d7',
      keywords: ['pane', 'close', 'split'],
      run: () => {
        const tab = activeTab();
        if (!tab) {
          return;
        }
        void closePane(tab.id, tab.activePaneId);
      }
    },
    {
      id: 'split-vertical',
      title: 'Split Vertical',
      description: 'Split the current pane vertically',
      icon: '\u2862',
      shortcut: 'Cmd/Ctrl+Alt+D',
      keywords: ['split', 'pane', 'vertical'],
      run: () => void splitActivePaneVertical()
    },
    {
      id: 'split-horizontal',
      title: 'Split Horizontal',
      description: 'Split the current pane horizontally',
      icon: '\u2863',
      shortcut: 'Cmd/Ctrl+Alt+Shift+D',
      keywords: ['split', 'pane', 'horizontal'],
      run: () => void splitActivePaneHorizontal()
    },
    {
      id: 'focus-pane-left',
      title: 'Focus Pane Left',
      description: 'Move focus to the pane on the left',
      icon: '\u2190',
      shortcut: 'Cmd/Ctrl+Alt+Left',
      keywords: ['pane', 'focus', 'left'],
      run: () => focusPaneToward('left')
    },
    {
      id: 'focus-pane-right',
      title: 'Focus Pane Right',
      description: 'Move focus to the pane on the right',
      icon: '\u2192',
      shortcut: 'Cmd/Ctrl+Alt+Right',
      keywords: ['pane', 'focus', 'right'],
      run: () => focusPaneToward('right')
    },
    {
      id: 'focus-pane-up',
      title: 'Focus Pane Up',
      description: 'Move focus to the pane above',
      icon: '\u2191',
      shortcut: 'Cmd/Ctrl+Alt+Up',
      keywords: ['pane', 'focus', 'up'],
      run: () => focusPaneToward('up')
    },
    {
      id: 'focus-pane-down',
      title: 'Focus Pane Down',
      description: 'Move focus to the pane below',
      icon: '\u2193',
      shortcut: 'Cmd/Ctrl+Alt+Down',
      keywords: ['pane', 'focus', 'down'],
      run: () => focusPaneToward('down')
    },
    {
      id: 'resize-pane-left',
      title: 'Resize Pane Left',
      description: 'Resize active pane toward the left',
      icon: '\u21e4',
      shortcut: 'Cmd/Ctrl+Alt+Shift+Left',
      keywords: ['pane', 'resize', 'left'],
      run: () => resizePaneToward('left')
    },
    {
      id: 'resize-pane-right',
      title: 'Resize Pane Right',
      description: 'Resize active pane toward the right',
      icon: '\u21e5',
      shortcut: 'Cmd/Ctrl+Alt+Shift+Right',
      keywords: ['pane', 'resize', 'right'],
      run: () => resizePaneToward('right')
    },
    {
      id: 'resize-pane-up',
      title: 'Resize Pane Up',
      description: 'Resize active pane toward the top',
      icon: '\u21e4',
      shortcut: 'Cmd/Ctrl+Alt+Shift+Up',
      keywords: ['pane', 'resize', 'up'],
      run: () => resizePaneToward('up')
    },
    {
      id: 'resize-pane-down',
      title: 'Resize Pane Down',
      description: 'Resize active pane toward the bottom',
      icon: '\u21e5',
      shortcut: 'Cmd/Ctrl+Alt+Shift+Down',
      keywords: ['pane', 'resize', 'down'],
      run: () => resizePaneToward('down')
    },
    {
      id: 'next-tab',
      title: 'Next Tab',
      description: 'Move to the next tab',
      icon: '\u21e2',
      keywords: ['tab', 'next'],
      run: nextTab
    },
    {
      id: 'previous-tab',
      title: 'Previous Tab',
      description: 'Move to the previous tab',
      icon: '\u21e0',
      keywords: ['tab', 'previous'],
      run: previousTab
    },
    {
      id: 'search',
      title: 'Find in Terminal',
      description: 'Open terminal search',
      icon: '\u2315',
      shortcut: 'Cmd/Ctrl+F',
      keywords: ['search', 'find', 'output'],
      run: openSearch
    },
    {
      id: 'settings',
      title: 'Open Settings',
      description: 'Open settings',
      icon: '\u2699',
      shortcut: 'Cmd/Ctrl+,',
      keywords: ['settings', 'preferences', 'config'],
      run: openSettings
    },
    {
      id: 'clear-terminal',
      title: 'Clear Terminal',
      description: 'Clear the active terminal viewport',
      icon: '\u2421',
      shortcut: 'Cmd/Ctrl+Shift+K',
      keywords: ['clear', 'terminal'],
      run: clearActiveTerminal
    },
    {
      id: 'check-for-updates',
      title: 'Check for Updates',
      description: updateState
        ? updateState.status === 'unsupported'
          ? `Manual-update build · current version ${updateState.currentVersion}`
          : `Current version ${updateState.currentVersion}`
        : 'Check if a newer BasedShell release is available',
      icon: '\u21bb',
      keywords: ['update', 'release', 'version'],
      run: () => void checkForUpdates(true)
    },
    {
      id: 'open-release-downloads',
      title: 'Open Latest Release Downloads',
      description: 'Open GitHub Releases for manual install/update',
      icon: '\u21d7',
      keywords: ['update', 'download', 'release', 'github'],
      run: () => void openReleaseDownloads()
    },
    {
      id: 'install-update',
      title:
        updateState?.status === 'downloaded'
          ? 'Restart to Apply Update'
          : updateState?.status === 'unsupported'
            ? 'Install Update Manually'
            : 'Install Downloaded Update',
      description:
        updateState?.status === 'downloaded'
          ? `Install${updateState.nextVersion ? ` ${updateState.nextVersion}` : ''} and restart BasedShell`
          : updateState?.status === 'unsupported'
            ? 'Open release downloads page to update manually'
          : 'No downloaded update is currently ready',
      icon: '\u2b73',
      keywords: ['update', 'restart', 'install'],
      run: () => void installDownloadedUpdate()
    },
    {
      id: 'theme-cycle',
      title: 'Cycle Theme',
      description: 'Switch to the next available theme',
      icon: '\u25d0',
      keywords: ['theme', 'appearance', 'style'],
      run: () => void cycleTheme()
    },
    {
      id: 'git-refresh',
      title: 'Refresh Git Status',
      description: 'Refresh branch and dirty state for active tab',
      icon: '\u2387',
      keywords: ['git', 'branch', 'dirty'],
      run: () => void refreshActiveGitStatus(true)
    },
    {
      id: 'copy-cwd',
      title: 'Copy Working Directory',
      description: 'Copy current tab path to clipboard',
      icon: '\u2398',
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
    const pane = activePaneForTab(tab);

    const shortcut = index <= 8 ? `Cmd/Ctrl+${index + 1}` : undefined;
    actions.push({
      id: `switch-tab:${tabId}`,
      title: `Switch to ${tab.title}`,
      description: pane?.cwd || 'No active pane',
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
        commandPalette?.toggle();
        break;
      case 'check-for-updates':
        void checkForUpdates(true);
        break;
      default:
        break;
    }
  });
}

function bindSessionEvents(): void {
  window.terminalAPI.onSessionData(({ sessionId, data }) => {
    const match = paneAndTabBySession(sessionId);
    if (!match) {
      return;
    }

    match.pane.term.write(data);
    markPaneOutput(match.tab, match.pane);
  });

  window.terminalAPI.onSessionExit(({ sessionId, exitCode }) => {
    const match = paneAndTabBySession(sessionId);
    if (!match) {
      return;
    }

    const { tab, pane } = match;
    const durationMs = Date.now() - pane.startedAt;
    pane.lastExitCode = exitCode;
    pane.lastExitDurationMs = durationMs;
    pane.exited = true;
    pane.hasUnreadOutput = false;
    clearOutputPulse(pane);
    lastCommandContext = {
      exitCode,
      durationMs,
      at: Date.now()
    };
    pane.term.writeln(`\r\n\x1b[31m[process exited with code ${exitCode}]\x1b[0m`);
    toasts.show(
      `Session exited with code ${exitCode} after ${formatDuration(durationMs)}.`,
      exitCode === 0 ? 'info' : 'error',
      exitCode === 0 ? 3000 : 0
    );
    if (tab.id === activeTabId) {
      updatePaneFocusStyles(tab);
    }
    renderTabStrip();
    updateStatus();
  });

  window.terminalAPI.onSessionContext((event: SessionContextEvent) => {
    const match = paneAndTabBySession(event.sessionId);
    if (!match) {
      return;
    }

    const { tab, pane } = match;
    const nextCwd = normalizePath(event.cwd || pane.cwd);
    const nextSshHost = event.sshHost?.trim() || null;
    if (pane.cwd === nextCwd && pane.sshHost === nextSshHost) {
      return;
    }

    pane.cwd = nextCwd;
    pane.sshHost = nextSshHost;
    if (reconcileTabTitles()) {
      renderTabStrip();
      syncCommandPaletteActions();
    }
    updateStatus();
    if (tab.id === activeTabId && pane.paneId === tab.activePaneId) {
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

function bindUpdateEvents(): void {
  window.terminalAPI.onAppUpdateState((next) => {
    onUpdateStateChanged(next);
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
    const keyLower = event.key.toLowerCase();

    if (isMod && event.altKey && !event.shiftKey && keyLower === 'd') {
      event.preventDefault();
      void splitActivePaneVertical();
      return;
    }

    if (isMod && event.altKey && event.shiftKey && keyLower === 'd') {
      event.preventDefault();
      void splitActivePaneHorizontal();
      return;
    }

    if (isMod && event.altKey && !event.shiftKey) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        focusPaneToward('left');
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        focusPaneToward('right');
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusPaneToward('up');
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusPaneToward('down');
        return;
      }
    }

    if (isMod && event.altKey && event.shiftKey) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        resizePaneToward('left');
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        resizePaneToward('right');
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        resizePaneToward('up');
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        resizePaneToward('down');
        return;
      }
    }

    if (isMod && event.shiftKey && keyLower === 'p') {
      event.preventDefault();
      openCommandPalette();
      return;
    }

    if (isMod && !event.shiftKey && keyLower === 'k') {
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

    if (isMod && keyLower === 'g') {
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

    if (isMod && event.shiftKey && keyLower === 'k') {
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

  ui.quickPalette.addEventListener('click', () => {
    openCommandPalette();
  });

  ui.quickSearch.addEventListener('click', () => {
    openSearch();
  });

  ui.quickSettings.addEventListener('click', () => {
    openSettings();
  });

  ui.quickToast.addEventListener('click', () => {
    toasts.show('This is a sample notification toast.', 'info');
  });

  ui.quickNewTab.addEventListener('click', () => {
    void createTab();
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

      fitVisiblePanes(tab);
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
  try {
    updateState = await window.terminalAPI.getUpdateState();
  } catch {
    updateState = null;
  }
  applySettingsToAllTabs();
  applyStaticIcons();
  initializeCommandPalette();
  bindUI();
  bindKeyboardShortcuts();
  bindMenuActions();
  bindUpdateEvents();
  bindSessionEvents();
  bindSettingsEvents();
  bindSystemAppearanceEvents();
  startGitStatusPolling();
  await createTab();
  updateStatus();
  void refreshActiveGitStatus(true);
}

void boot();
