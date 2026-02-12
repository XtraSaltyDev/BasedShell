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
  ProfileCard,
  SessionContextEvent,
  SessionSummary,
  SettingsPatch,
  ThemeSelection,
  WorkspacePreset,
  WorkspaceStartupTab
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
  profileCardId: string;
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

interface CreateTabOptions {
  profileCardId?: string;
  cwd?: string;
  startupCommand?: string;
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
  statusWorkspace: document.querySelector<HTMLButtonElement>('#status-workspace'),
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
  settingVibrancy: document.querySelector<HTMLInputElement>('#setting-vibrancy'),
  settingWorkspace: document.querySelector<HTMLSelectElement>('#setting-workspace'),
  settingWorkspaceName: document.querySelector<HTMLInputElement>('#setting-workspace-name'),
  settingWorkspaceDefaultCard: document.querySelector<HTMLSelectElement>('#setting-workspace-default-card'),
  settingWorkspaceTabs: document.querySelector<HTMLDivElement>('#setting-workspace-tabs'),
  settingWorkspaceAddTab: document.querySelector<HTMLButtonElement>('#setting-workspace-add-tab'),
  settingWorkspaceNew: document.querySelector<HTMLButtonElement>('#setting-workspace-new'),
  settingWorkspaceDelete: document.querySelector<HTMLButtonElement>('#setting-workspace-delete'),
  settingWorkspaceCapture: document.querySelector<HTMLButtonElement>('#setting-workspace-capture'),
  settingProfileCard: document.querySelector<HTMLSelectElement>('#setting-profile-card'),
  settingCardName: document.querySelector<HTMLInputElement>('#setting-card-name'),
  settingCardProfile: document.querySelector<HTMLSelectElement>('#setting-card-profile'),
  settingCardTheme: document.querySelector<HTMLSelectElement>('#setting-card-theme'),
  settingCardFontSize: document.querySelector<HTMLInputElement>('#setting-card-font-size'),
  settingCardLineHeight: document.querySelector<HTMLInputElement>('#setting-card-line-height'),
  settingCardCursorStyle: document.querySelector<HTMLSelectElement>('#setting-card-cursor-style'),
  settingCardCursorBlink: document.querySelector<HTMLSelectElement>('#setting-card-cursor-blink'),
  settingCardPadding: document.querySelector<HTMLInputElement>('#setting-card-padding'),
  settingCardNew: document.querySelector<HTMLButtonElement>('#setting-card-new'),
  settingCardDelete: document.querySelector<HTMLButtonElement>('#setting-card-delete')
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
let editingWorkspaceId = '';
let editingProfileCardId = '';

function assertDom<T>(value: T | null, id: string): T {
  if (!value) {
    throw new Error(`Missing required element: ${id}`);
  }

  return value;
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
  statusWorkspace: assertDom(dom.statusWorkspace, '#status-workspace'),
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
  searchClose: assertDom(dom.searchClose, '#search-close'),
  settingsPanel: assertDom(dom.settingsPanel, '#settings-panel'),
  settingsScrim: assertDom(dom.settingsScrim, '#settings-scrim'),
  settingsClose: assertDom(dom.settingsClose, '#settings-close'),
  settingsCancel: assertDom(dom.settingsCancel, '#settings-cancel'),
  settingsSave: assertDom(dom.settingsSave, '#settings-save'),
  settingsForm: assertDom(dom.settingsForm, '#settings-form'),
  settingThemeSwatches: assertDom(dom.settingThemeSwatches, '#setting-theme-swatches'),
  settingFontFamily: assertDom(dom.settingFontFamily, '#setting-font-family'),
  settingFontSize: assertDom(dom.settingFontSize, '#setting-font-size'),
  settingLineHeight: assertDom(dom.settingLineHeight, '#setting-line-height'),
  settingScrollback: assertDom(dom.settingScrollback, '#setting-scrollback'),
  settingOpacity: assertDom(dom.settingOpacity, '#setting-opacity'),
  settingTheme: assertDom(dom.settingTheme, '#setting-theme'),
  settingAppearance: assertDom(dom.settingAppearance, '#setting-appearance'),
  settingCursorStyle: assertDom(dom.settingCursorStyle, '#setting-cursor-style'),
  settingCursorBlink: assertDom(dom.settingCursorBlink, '#setting-cursor-blink'),
  settingVibrancy: assertDom(dom.settingVibrancy, '#setting-vibrancy'),
  settingWorkspace: assertDom(dom.settingWorkspace, '#setting-workspace'),
  settingWorkspaceName: assertDom(dom.settingWorkspaceName, '#setting-workspace-name'),
  settingWorkspaceDefaultCard: assertDom(dom.settingWorkspaceDefaultCard, '#setting-workspace-default-card'),
  settingWorkspaceTabs: assertDom(dom.settingWorkspaceTabs, '#setting-workspace-tabs'),
  settingWorkspaceAddTab: assertDom(dom.settingWorkspaceAddTab, '#setting-workspace-add-tab'),
  settingWorkspaceNew: assertDom(dom.settingWorkspaceNew, '#setting-workspace-new'),
  settingWorkspaceDelete: assertDom(dom.settingWorkspaceDelete, '#setting-workspace-delete'),
  settingWorkspaceCapture: assertDom(dom.settingWorkspaceCapture, '#setting-workspace-capture'),
  settingProfileCard: assertDom(dom.settingProfileCard, '#setting-profile-card'),
  settingCardName: assertDom(dom.settingCardName, '#setting-card-name'),
  settingCardProfile: assertDom(dom.settingCardProfile, '#setting-card-profile'),
  settingCardTheme: assertDom(dom.settingCardTheme, '#setting-card-theme'),
  settingCardFontSize: assertDom(dom.settingCardFontSize, '#setting-card-font-size'),
  settingCardLineHeight: assertDom(dom.settingCardLineHeight, '#setting-card-line-height'),
  settingCardCursorStyle: assertDom(dom.settingCardCursorStyle, '#setting-card-cursor-style'),
  settingCardCursorBlink: assertDom(dom.settingCardCursorBlink, '#setting-card-cursor-blink'),
  settingCardPadding: assertDom(dom.settingCardPadding, '#setting-card-padding'),
  settingCardNew: assertDom(dom.settingCardNew, '#setting-card-new'),
  settingCardDelete: assertDom(dom.settingCardDelete, '#setting-card-delete')
};

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

function currentWorkspace(): WorkspacePreset | undefined {
  return settings.workspaces.find((workspace) => workspace.id === settings.activeWorkspaceId) ?? settings.workspaces[0];
}

function defaultProfileCardForActiveWorkspace(): string {
  return currentWorkspace()?.defaultProfileCardId || settings.defaultProfileCardId;
}

function profileCardById(cardId: string | undefined): ProfileCard | undefined {
  if (!cardId) {
    return undefined;
  }

  return settings.profileCards.find((card) => card.id === cardId);
}

function resolvedProfileCard(cardId: string | undefined): ProfileCard {
  const byId = profileCardById(cardId);
  if (byId) {
    return byId;
  }

  return (
    settings.profileCards.find((card) => card.id === settings.defaultProfileCardId) ??
    settings.profileCards[0] ?? {
      id: 'default-card',
      name: 'Default Card',
      profileId: settings.defaultProfileId
    }
  );
}

function terminalThemeForCard(card: ProfileCard | undefined) {
  if (!card?.theme) {
    return resolvedTheme.theme.terminal;
  }

  const state = resolveThemeState(
    {
      ...settings,
      theme: card.theme
    },
    systemAppearance
  );
  return state.theme.terminal;
}

function terminalOptions(card?: ProfileCard): ITerminalOptions {
  const selectedCard = card ?? resolvedProfileCard(settings.defaultProfileCardId);
  return {
    fontFamily: selectedCard.fontFamily || settings.fontFamily,
    fontSize: selectedCard.fontSize ?? settings.fontSize,
    lineHeight: selectedCard.lineHeight ?? settings.lineHeight,
    cursorStyle: selectedCard.cursorStyle ?? settings.cursorStyle,
    cursorBlink: selectedCard.cursorBlink ?? settings.cursorBlink,
    scrollback: settings.scrollback,
    theme: terminalThemeForCard(selectedCard),
    allowTransparency: true,
    convertEol: false,
    rightClickSelectsWord: true,
    macOptionIsMeta: true
  };
}

function applyTabSettings(tab: TabState): void {
  const card = resolvedProfileCard(tab.profileCardId);
  tab.term.options.fontFamily = card.fontFamily || settings.fontFamily;
  tab.term.options.fontSize = card.fontSize ?? settings.fontSize;
  tab.term.options.lineHeight = card.lineHeight ?? settings.lineHeight;
  tab.term.options.cursorStyle = card.cursorStyle ?? settings.cursorStyle;
  tab.term.options.cursorBlink = card.cursorBlink ?? settings.cursorBlink;
  tab.term.options.scrollback = settings.scrollback;
  tab.term.options.theme = terminalThemeForCard(card);
  tab.container.style.padding = `${card.padding ?? 8}px`;
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
  'fog'
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

    const workspace = currentWorkspace();
    ui.statusWorkspace.textContent = workspace?.name || 'Workspace';
    ui.statusWorkspace.title = workspace
      ? `Active workspace: ${workspace.name}. Click to switch workspace.`
      : 'No workspace configured.';
    setStatusSegmentState(ui.statusWorkspace, 'idle');

    ui.statusTheme.textContent = resolvedTheme.themeName;
    ui.statusTheme.title = 'Theme';
    setStatusSegmentState(ui.statusTheme, 'idle');
    return;
  }

  const shellLabel = shellName(active.shell);
  ui.statusShell.textContent = active.exited ? `${shellLabel} (Exited)` : `${shellLabel} · ${active.pid}`;
  ui.statusShell.title = `Shell: ${active.shell}${active.exited ? ' (exited)' : ''}. Click to open settings.`;
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

  const workspace = currentWorkspace();
  ui.statusWorkspace.textContent = workspace?.name || 'Workspace';
  ui.statusWorkspace.title = workspace
    ? `Active workspace: ${workspace.name}. Click to switch workspace.`
    : 'No workspace configured.';
  setStatusSegmentState(ui.statusWorkspace, 'idle');

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

async function createTab(options: CreateTabOptions = {}): Promise<void> {
  const tabId = crypto.randomUUID();
  const container = document.createElement('div');
  container.className = 'terminal-pane';
  container.id = `panel-${tabId}`;
  container.setAttribute('role', 'tabpanel');
  container.setAttribute('aria-labelledby', `tab-${tabId}`);
  ui.terminalHost.appendChild(container);

  const profileCard = resolvedProfileCard(options.profileCardId);
  const term = new Terminal(terminalOptions(profileCard));
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
      profileId: profileCard.profileId,
      cwd: options.cwd,
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
    searchResultCount: 0,
    profileCardId: profileCard.id
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

  if (options.startupCommand && options.startupCommand.trim()) {
    window.terminalAPI.writeToSession({
      sessionId: summary.sessionId,
      data: `${options.startupCommand.trim()}\r`
    });
  }
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
    await createTab({
      profileCardId: defaultProfileCardForActiveWorkspace()
    });
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

function workspaceById(workspaceId: string | undefined): WorkspacePreset | undefined {
  if (!workspaceId) {
    return undefined;
  }

  return settings.workspaces.find((workspace) => workspace.id === workspaceId);
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function snapshotCurrentTabs(defaultProfileCardId: string): WorkspaceStartupTab[] {
  const startupTabs: WorkspaceStartupTab[] = [];
  for (const tabId of tabOrder) {
    const tab = tabs.get(tabId);
    if (!tab) {
      continue;
    }

    startupTabs.push({
      id: makeId('startup'),
      profileCardId: profileCardById(tab.profileCardId)?.id ?? defaultProfileCardId,
      cwd: tab.cwd,
      command: ''
    });
  }

  if (startupTabs.length > 0) {
    return startupTabs;
  }

  return [
    {
      id: makeId('startup'),
      profileCardId: defaultProfileCardId,
      cwd: homeDirectory || '/',
      command: ''
    }
  ];
}

function disposeAllTabs(): void {
  for (const tab of tabs.values()) {
    clearOutputPulse(tab);
    clearTabSearch(tab);
    window.terminalAPI.closeSession(tab.sessionId);
    tab.term.dispose();
    tab.container.remove();
  }

  tabs.clear();
  tabOrder = [];
  activeTabId = '';
  renderTabStrip();
}

async function loadWorkspaceTabs(workspace: WorkspacePreset): Promise<void> {
  disposeAllTabs();
  const startupTabs =
    workspace.startupTabs.length > 0
      ? workspace.startupTabs
      : [
          {
            id: makeId('startup'),
            profileCardId: workspace.defaultProfileCardId,
            cwd: homeDirectory || '/',
            command: ''
          }
        ];

  for (const startup of startupTabs) {
    await createTab({
      profileCardId: startup.profileCardId || workspace.defaultProfileCardId,
      cwd: startup.cwd,
      startupCommand: startup.command
    });
  }

  renderTabStrip();
  updateStatus();
  void refreshActiveGitStatus(true);
}

async function setActiveWorkspace(workspaceId: string, reloadTabs: boolean): Promise<void> {
  const workspace = workspaceById(workspaceId);
  if (!workspace) {
    return;
  }

  if (settings.activeWorkspaceId !== workspace.id) {
    settings = await window.terminalAPI.updateSettings({ activeWorkspaceId: workspace.id });
  }

  if (reloadTabs) {
    const active = workspaceById(settings.activeWorkspaceId);
    if (active) {
      await loadWorkspaceTabs(active);
    }
  }

  if (isSettingsOpen()) {
    syncSettingsFormFromState(settings);
  }

  syncCommandPaletteActions();
  updateStatus();
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
  return ui.settingsPanel.classList.contains('open');
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
  const selectedTheme = ui.settingTheme.value;
  const swatches = ui.settingThemeSwatches.querySelectorAll<HTMLButtonElement>('.theme-swatch');
  for (const swatch of swatches) {
    const selected = swatch.dataset.theme === selectedTheme;
    swatch.classList.toggle('selected', selected);
    swatch.setAttribute('aria-checked', selected ? 'true' : 'false');
    swatch.setAttribute('role', 'radio');
    swatch.tabIndex = selected ? 0 : -1;
  }
}

function focusSelectedThemeSwatch(): void {
  const selected = ui.settingThemeSwatches.querySelector<HTMLButtonElement>('.theme-swatch.selected');
  (selected ?? ui.settingThemeSwatches.querySelector<HTMLButtonElement>('.theme-swatch'))?.focus();
}

function selectOptions(
  element: HTMLSelectElement,
  options: Array<{ value: string; label: string }>,
  selectedValue: string
): void {
  element.innerHTML = '';
  for (const option of options) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    element.append(opt);
  }

  if (options.some((option) => option.value === selectedValue)) {
    element.value = selectedValue;
    return;
  }

  element.value = options[0]?.value ?? '';
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

function workspaceStartupRowsFromEditor(defaultProfileCardId: string): WorkspaceStartupTab[] {
  const rows = ui.settingWorkspaceTabs.querySelectorAll<HTMLDivElement>('.workspace-tab-row');
  const tabs: WorkspaceStartupTab[] = [];
  for (const row of rows) {
    const profileCard = row.querySelector<HTMLSelectElement>('.workspace-tab-card');
    const cwdInput = row.querySelector<HTMLInputElement>('.workspace-tab-cwd');
    const commandInput = row.querySelector<HTMLInputElement>('.workspace-tab-command');
    if (!profileCard || !cwdInput || !commandInput) {
      continue;
    }

    tabs.push({
      id: row.dataset.tabId || makeId('startup'),
      profileCardId: profileCard.value || defaultProfileCardId,
      cwd: cwdInput.value.trim() || homeDirectory || '/',
      command: commandInput.value.trim()
    });
  }

  if (tabs.length > 0) {
    return tabs;
  }

  return [
    {
      id: makeId('startup'),
      profileCardId: defaultProfileCardId,
      cwd: homeDirectory || '/',
      command: ''
    }
  ];
}

function appendWorkspaceStartupRow(tab: WorkspaceStartupTab): void {
  const row = document.createElement('div');
  row.className = 'workspace-tab-row';
  row.dataset.tabId = tab.id || makeId('startup');

  const cardSelect = document.createElement('select');
  cardSelect.className = 'workspace-tab-card';
  selectOptions(
    cardSelect,
    settings.profileCards.map((card) => ({ value: card.id, label: card.name })),
    tab.profileCardId
  );

  const cwdInput = document.createElement('input');
  cwdInput.className = 'workspace-tab-cwd';
  cwdInput.type = 'text';
  cwdInput.placeholder = '/path/to/project';
  cwdInput.value = tab.cwd || homeDirectory || '/';

  const commandInput = document.createElement('input');
  commandInput.className = 'workspace-tab-command';
  commandInput.type = 'text';
  commandInput.placeholder = 'Optional startup command';
  commandInput.value = tab.command || '';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'workspace-tab-remove';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    row.remove();
    previewSettingsFromForm();
  });

  row.append(cardSelect, cwdInput, commandInput, removeButton);
  ui.settingWorkspaceTabs.append(row);
}

function syncWorkspaceEditor(source: AppSettings): void {
  const workspaceOptions = source.workspaces.map((workspace) => ({
    value: workspace.id,
    label: workspace.name
  }));
  const fallbackWorkspaceId = source.activeWorkspaceId || workspaceOptions[0]?.value || '';
  const nextWorkspaceId =
    editingWorkspaceId && source.workspaces.some((workspace) => workspace.id === editingWorkspaceId)
      ? editingWorkspaceId
      : fallbackWorkspaceId;
  editingWorkspaceId = nextWorkspaceId;

  selectOptions(ui.settingWorkspace, workspaceOptions, nextWorkspaceId);
  const workspace = source.workspaces.find((item) => item.id === nextWorkspaceId) ?? source.workspaces[0];
  if (!workspace) {
    return;
  }

  ui.settingWorkspaceName.value = workspace.name;
  selectOptions(
    ui.settingWorkspaceDefaultCard,
    source.profileCards.map((card) => ({ value: card.id, label: card.name })),
    workspace.defaultProfileCardId
  );

  ui.settingWorkspaceTabs.innerHTML = '';
  for (const tab of workspace.startupTabs) {
    appendWorkspaceStartupRow(tab);
  }
}

function syncProfileCardEditor(source: AppSettings): void {
  const cardOptions = source.profileCards.map((card) => ({
    value: card.id,
    label: card.name
  }));
  const fallbackCardId = source.defaultProfileCardId || cardOptions[0]?.value || '';
  const nextCardId =
    editingProfileCardId && source.profileCards.some((card) => card.id === editingProfileCardId)
      ? editingProfileCardId
      : fallbackCardId;
  editingProfileCardId = nextCardId;

  selectOptions(ui.settingProfileCard, cardOptions, nextCardId);
  selectOptions(
    ui.settingCardProfile,
    source.profiles.map((profile) => ({ value: profile.id, label: profile.name })),
    source.profileCards.find((card) => card.id === nextCardId)?.profileId ?? source.defaultProfileId
  );

  const card = source.profileCards.find((item) => item.id === nextCardId) ?? source.profileCards[0];
  if (!card) {
    return;
  }

  ui.settingCardName.value = card.name;
  ui.settingCardTheme.value = card.theme ?? '';
  ui.settingCardFontSize.value = card.fontSize ? String(card.fontSize) : '';
  ui.settingCardLineHeight.value = card.lineHeight ? String(card.lineHeight) : '';
  ui.settingCardCursorStyle.value = card.cursorStyle ?? '';
  ui.settingCardCursorBlink.value =
    typeof card.cursorBlink === 'boolean' ? (card.cursorBlink ? 'true' : 'false') : '';
  ui.settingCardPadding.value = card.padding !== undefined ? String(card.padding) : '';
}

function syncSettingsFormFromState(source: AppSettings): void {
  ui.settingFontFamily.value = source.fontFamily;
  ui.settingFontSize.value = String(source.fontSize);
  ui.settingLineHeight.value = String(source.lineHeight);
  ui.settingScrollback.value = String(source.scrollback);
  ui.settingOpacity.value = String(source.backgroundOpacity);
  ui.settingTheme.value = source.theme;
  ui.settingAppearance.value = source.appearancePreference;
  ui.settingCursorStyle.value = source.cursorStyle;
  ui.settingCursorBlink.checked = source.cursorBlink;
  ui.settingVibrancy.checked = source.vibrancy;

  setRangeFill(ui.settingFontSize);
  setRangeFill(ui.settingLineHeight);
  setRangeFill(ui.settingOpacity);
  syncThemeSwatches();
  syncWorkspaceEditor(source);
  syncProfileCardEditor(source);
}

function settingsPatchFromForm(): SettingsPatch {
  const base = settingsPreviewBaseline ?? settings;
  const workspaceId = ui.settingWorkspace.value || base.activeWorkspaceId;
  const activeWorkspace = base.workspaces.find((workspace) => workspace.id === workspaceId) ?? base.workspaces[0];
  const profileCardId = ui.settingProfileCard.value || base.defaultProfileCardId;

  const profileCards = base.profileCards.map((card) => {
    if (card.id !== profileCardId) {
      return card;
    }

    return {
      ...card,
      name: ui.settingCardName.value.trim() || card.name,
      profileId: ui.settingCardProfile.value || card.profileId,
      theme: (ui.settingCardTheme.value || undefined) as ThemeSelection | undefined,
      fontSize: parseOptionalNumber(ui.settingCardFontSize.value),
      lineHeight: parseOptionalNumber(ui.settingCardLineHeight.value),
      cursorStyle: (ui.settingCardCursorStyle.value || undefined) as CursorStyle | undefined,
      cursorBlink:
        ui.settingCardCursorBlink.value === ''
          ? undefined
          : ui.settingCardCursorBlink.value === 'true',
      padding: parseOptionalNumber(ui.settingCardPadding.value)
    };
  });

  const workspaces = base.workspaces.map((workspace) => {
    if (workspace.id !== workspaceId) {
      return workspace;
    }

    const defaultProfileCardId = ui.settingWorkspaceDefaultCard.value || workspace.defaultProfileCardId;
    return {
      ...workspace,
      name: ui.settingWorkspaceName.value.trim() || workspace.name,
      defaultProfileCardId,
      startupTabs: workspaceStartupRowsFromEditor(defaultProfileCardId)
    };
  });

  const nextDefaultProfileCardId = base.profileCards.some((card) => card.id === base.defaultProfileCardId)
    ? base.defaultProfileCardId
    : profileCards[0]?.id || base.defaultProfileCardId;

  return {
    fontFamily: ui.settingFontFamily.value,
    fontSize: Number(ui.settingFontSize.value),
    lineHeight: Number(ui.settingLineHeight.value),
    scrollback: Number(ui.settingScrollback.value),
    backgroundOpacity: Number(ui.settingOpacity.value),
    theme: ui.settingTheme.value as ThemeSelection,
    appearancePreference: ui.settingAppearance.value as AppSettings['appearancePreference'],
    cursorStyle: ui.settingCursorStyle.value as CursorStyle,
    cursorBlink: ui.settingCursorBlink.checked,
    vibrancy: ui.settingVibrancy.checked,
    profileCards,
    defaultProfileCardId: nextDefaultProfileCardId,
    workspaces,
    activeWorkspaceId: activeWorkspace?.id ?? workspaceId
  };
}

function closeSettingsPanel(discardPreview: boolean): void {
  if (discardPreview && settingsPreviewBaseline) {
    settings = settingsPreviewBaseline;
    applySettingsToAllTabs();
    renderTabStrip();
    updateStatus();
  }

  settingsPreviewBaseline = null;
  ui.settingsPanel.classList.remove('open');
  ui.settingsPanel.setAttribute('aria-hidden', 'true');
  ui.settingsScrim.classList.remove('open');
  ui.terminalHost.classList.remove('panel-open');
  setTimeout(() => {
    if (!isSettingsOpen()) {
      ui.settingsScrim.classList.add('hidden');
    }
  }, 280);
  activeTab()?.term.focus();
}

function openSettings(): void {
  if (isSettingsOpen()) {
    focusSelectedThemeSwatch();
    return;
  }

  settingsPreviewBaseline = structuredClone(settings);
  editingWorkspaceId = settings.activeWorkspaceId;
  editingProfileCardId = settings.defaultProfileCardId;
  syncSettingsFormFromState(settings);

  ui.settingsScrim.classList.remove('hidden');
  ui.terminalHost.classList.add('panel-open');
  requestAnimationFrame(() => {
    ui.settingsPanel.classList.add('open');
    ui.settingsPanel.setAttribute('aria-hidden', 'false');
    ui.settingsScrim.classList.add('open');
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
    profiles: settingsPreviewBaseline.profiles,
    defaultProfileId: settingsPreviewBaseline.defaultProfileId,
    profileCards: patch.profileCards ?? settingsPreviewBaseline.profileCards,
    defaultProfileCardId: patch.defaultProfileCardId ?? settingsPreviewBaseline.defaultProfileCardId,
    workspaces: patch.workspaces ?? settingsPreviewBaseline.workspaces,
    activeWorkspaceId: patch.activeWorkspaceId ?? settingsPreviewBaseline.activeWorkspaceId
  };
  applySettingsToAllTabs();
  renderTabStrip();
  syncCommandPaletteActions();
  updateStatus();
}

async function saveSettingsFromForm(): Promise<void> {
  const previousWorkspaceId = settings.activeWorkspaceId;
  const patch = settingsPatchFromForm();
  settings = await window.terminalAPI.updateSettings(patch);
  editingWorkspaceId = settings.activeWorkspaceId;
  editingProfileCardId = settings.defaultProfileCardId;
  settingsPreviewBaseline = null;
  if (previousWorkspaceId !== settings.activeWorkspaceId) {
    const workspace = workspaceById(settings.activeWorkspaceId);
    if (workspace) {
      await loadWorkspaceTabs(workspace);
    }
  }
  applySettingsToAllTabs();
  renderTabStrip();
  syncCommandPaletteActions();
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

async function updateWorkspaceList(nextWorkspaces: WorkspacePreset[], activeWorkspaceId: string): Promise<void> {
  settings = await window.terminalAPI.updateSettings({
    workspaces: nextWorkspaces,
    activeWorkspaceId
  });
}

async function saveCurrentTabsToWorkspace(workspaceId: string): Promise<void> {
  const workspace = workspaceById(workspaceId);
  if (!workspace) {
    return;
  }

  const startupTabs = snapshotCurrentTabs(workspace.defaultProfileCardId);
  const nextWorkspaces = settings.workspaces.map((item) =>
    item.id === workspace.id
      ? {
          ...item,
          startupTabs
        }
      : item
  );
  await updateWorkspaceList(nextWorkspaces, settings.activeWorkspaceId);
  if (isSettingsOpen()) {
    syncSettingsFormFromState(settings);
  }
  syncCommandPaletteActions();
  toasts.show(`Saved ${startupTabs.length} tab${startupTabs.length === 1 ? '' : 's'} to ${workspace.name}.`, 'success');
}

async function createWorkspaceFromCurrentTabs(): Promise<void> {
  const fallbackCardId = settings.defaultProfileCardId || resolvedProfileCard(undefined).id;
  const startupTabs = snapshotCurrentTabs(fallbackCardId);
  const name = `Workspace ${settings.workspaces.length + 1}`;
  const nextWorkspace: WorkspacePreset = {
    id: makeId('workspace'),
    name,
    layout: 'tabs',
    defaultProfileCardId: fallbackCardId,
    startupTabs
  };
  await updateWorkspaceList([...settings.workspaces, nextWorkspace], nextWorkspace.id);
  editingWorkspaceId = nextWorkspace.id;
  if (isSettingsOpen()) {
    syncSettingsFormFromState(settings);
  }
  syncCommandPaletteActions();
  updateStatus();
  toasts.show(`Created ${name}.`, 'success');
}

async function deleteWorkspace(workspaceId: string): Promise<void> {
  if (settings.workspaces.length <= 1) {
    toasts.show('At least one workspace is required.', 'info');
    return;
  }

  const target = workspaceById(workspaceId);
  if (!target) {
    return;
  }
  const wasActiveWorkspace = settings.activeWorkspaceId === workspaceId;

  const remaining = settings.workspaces.filter((workspace) => workspace.id !== workspaceId);
  const replacement = remaining[0];
  if (!replacement) {
    return;
  }

  const nextActiveId = settings.activeWorkspaceId === workspaceId ? replacement.id : settings.activeWorkspaceId;
  await updateWorkspaceList(remaining, nextActiveId);
  editingWorkspaceId = settings.activeWorkspaceId;
  if (isSettingsOpen()) {
    syncSettingsFormFromState(settings);
  }

  if (wasActiveWorkspace) {
    await loadWorkspaceTabs(replacement);
  }

  syncCommandPaletteActions();
  toasts.show(`Deleted workspace ${target.name}.`, 'success');
}

async function createProfileCard(): Promise<void> {
  const fallbackProfileId = settings.defaultProfileId;
  const nextCard: ProfileCard = {
    id: makeId('card'),
    name: `Card ${settings.profileCards.length + 1}`,
    profileId: fallbackProfileId
  };

  settings = await window.terminalAPI.updateSettings({
    profileCards: [...settings.profileCards, nextCard]
  });
  editingProfileCardId = nextCard.id;
  if (isSettingsOpen()) {
    syncSettingsFormFromState(settings);
  }
  applySettingsToAllTabs();
  renderTabStrip();
  syncCommandPaletteActions();
  toasts.show(`Created ${nextCard.name}.`, 'success');
}

async function deleteProfileCard(profileCardId: string): Promise<void> {
  if (settings.profileCards.length <= 1) {
    toasts.show('At least one profile card is required.', 'info');
    return;
  }

  const target = profileCardById(profileCardId);
  if (!target) {
    return;
  }

  const remaining = settings.profileCards.filter((card) => card.id !== profileCardId);
  const replacement = remaining[0];
  if (!replacement) {
    return;
  }

  const nextDefaultCardId =
    settings.defaultProfileCardId === profileCardId ? replacement.id : settings.defaultProfileCardId;
  const nextWorkspaces = settings.workspaces.map((workspace) => ({
    ...workspace,
    defaultProfileCardId:
      workspace.defaultProfileCardId === profileCardId ? nextDefaultCardId : workspace.defaultProfileCardId,
    startupTabs: workspace.startupTabs.map((tab) => ({
      ...tab,
      profileCardId: tab.profileCardId === profileCardId ? nextDefaultCardId : tab.profileCardId
    }))
  }));

  settings = await window.terminalAPI.updateSettings({
    profileCards: remaining,
    defaultProfileCardId: nextDefaultCardId,
    workspaces: nextWorkspaces
  });
  editingProfileCardId = nextDefaultCardId;
  if (isSettingsOpen()) {
    syncSettingsFormFromState(settings);
  }
  applySettingsToAllTabs();
  renderTabStrip();
  syncCommandPaletteActions();
  updateStatus();
  toasts.show(`Deleted ${target.name}.`, 'success');
}

function commandPaletteActions(): CommandPaletteAction[] {
  const actions: CommandPaletteAction[] = [
    {
      id: 'new-tab',
      title: 'New Tab',
      description: 'Create a new terminal tab',
      shortcut: 'Cmd/Ctrl+T',
      keywords: ['tab', 'create', 'terminal'],
      run: () =>
        void createTab({
          profileCardId: defaultProfileCardForActiveWorkspace()
        })
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
      description: 'Open the settings drawer',
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
    },
    {
      id: 'workspace-new',
      title: 'Create Workspace from Current Tabs',
      description: 'Create a new workspace and snapshot current tabs',
      keywords: ['workspace', 'save', 'tabs'],
      run: () => void createWorkspaceFromCurrentTabs()
    },
    {
      id: 'workspace-save',
      title: 'Save Tabs to Active Workspace',
      description: 'Update active workspace startup tabs from current tabs',
      keywords: ['workspace', 'save', 'startup'],
      run: () => void saveCurrentTabsToWorkspace(settings.activeWorkspaceId)
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

  for (const workspace of settings.workspaces) {
    actions.push({
      id: `workspace-switch:${workspace.id}`,
      title: workspace.id === settings.activeWorkspaceId ? `Workspace: ${workspace.name} (Active)` : `Workspace: ${workspace.name}`,
      description: `Load ${workspace.startupTabs.length} startup tab${workspace.startupTabs.length === 1 ? '' : 's'}`,
      keywords: ['workspace', 'switch', 'context'],
      run: () => void setActiveWorkspace(workspace.id, true)
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
        void createTab({
          profileCardId: defaultProfileCardForActiveWorkspace()
        });
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

function applyStaticIcons(): void {
  ui.searchButton.innerHTML = icon('search', 14);
  ui.searchPrev.innerHTML = icon('chevron-up', 14);
  ui.searchNext.innerHTML = icon('chevron-down', 14);
  ui.searchClose.innerHTML = icon('close', 13);
  ui.newTabButton.innerHTML = icon('plus', 14);
  ui.settingsButton.innerHTML = icon('gear', 15);
  ui.settingsClose.innerHTML = icon('close', 14);
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
      void createTab({
        profileCardId: defaultProfileCardForActiveWorkspace()
      });
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
    void createTab({
      profileCardId: defaultProfileCardForActiveWorkspace()
    });
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

  ui.statusWorkspace.addEventListener('click', () => {
    openCommandPalette();
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

  ui.settingWorkspace.addEventListener('change', () => {
    editingWorkspaceId = ui.settingWorkspace.value;
    syncWorkspaceEditor(settings);
    previewSettingsFromForm();
  });

  ui.settingProfileCard.addEventListener('change', () => {
    editingProfileCardId = ui.settingProfileCard.value;
    syncProfileCardEditor(settings);
    previewSettingsFromForm();
  });

  ui.settingWorkspaceAddTab.addEventListener('click', () => {
    const workspace = workspaceById(editingWorkspaceId) ?? currentWorkspace();
    appendWorkspaceStartupRow({
      id: makeId('startup'),
      profileCardId: workspace?.defaultProfileCardId || settings.defaultProfileCardId,
      cwd: homeDirectory || '/',
      command: ''
    });
    previewSettingsFromForm();
  });

  ui.settingWorkspaceNew.addEventListener('click', () => {
    void createWorkspaceFromCurrentTabs();
  });

  ui.settingWorkspaceDelete.addEventListener('click', () => {
    void deleteWorkspace(editingWorkspaceId || settings.activeWorkspaceId);
  });

  ui.settingWorkspaceCapture.addEventListener('click', () => {
    void saveCurrentTabsToWorkspace(editingWorkspaceId || settings.activeWorkspaceId);
  });

  ui.settingCardNew.addEventListener('click', () => {
    void createProfileCard();
  });

  ui.settingCardDelete.addEventListener('click', () => {
    void deleteProfileCard(editingProfileCardId || settings.defaultProfileCardId);
  });

  ui.settingThemeSwatches.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const swatch = target.closest<HTMLButtonElement>('.theme-swatch');
    const theme = swatch?.dataset.theme;
    if (!swatch || !theme) {
      return;
    }

    if (ui.settingTheme.value !== theme) {
      ui.settingTheme.value = theme;
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
  ui.settingsForm.addEventListener('input', onSettingsFormChange);
  ui.settingsForm.addEventListener('change', onSettingsFormChange);

  ui.settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveSettingsFromForm();
  });

  ui.settingsSave.addEventListener('click', () => {
    void saveSettingsFromForm();
  });

  ui.settingsCancel.addEventListener('click', () => {
    closeSettingsPanel(true);
  });

  ui.settingsClose.addEventListener('click', () => {
    closeSettingsPanel(true);
  });

  ui.settingsScrim.addEventListener('click', () => {
    closeSettingsPanel(true);
  });

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
  bindSystemAppearanceEvents();
  startGitStatusPolling();
  const workspace = currentWorkspace();
  if (workspace) {
    await loadWorkspaceTabs(workspace);
  } else {
    await createTab({
      profileCardId: defaultProfileCardForActiveWorkspace()
    });
  }
  updateStatus();
  void refreshActiveGitStatus(true);
}

void boot();
