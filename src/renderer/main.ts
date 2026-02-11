import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal, type ITerminalOptions } from '@xterm/xterm';
import type {
  AppSettings,
  AppearanceMode,
  CursorStyle,
  MenuAction,
  SessionSummary,
  SettingsPatch,
  ThemeSelection
} from '../shared/types';
import { applyThemeChrome, resolveThemeState, type ResolvedThemeState } from './themes';
import { icon } from './icons';
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
  exited: boolean;
  hasUnreadOutput: boolean;
  hasRecentOutput: boolean;
  outputPulseTimer?: ReturnType<typeof setTimeout>;
}

const dom = {
  tabStrip: document.querySelector<HTMLDivElement>('#tab-strip'),
  newTabButton: document.querySelector<HTMLButtonElement>('#new-tab-button'),
  settingsButton: document.querySelector<HTMLButtonElement>('#settings-button'),
  terminalHost: document.querySelector<HTMLDivElement>('#terminal-host'),
  statusLeft: document.querySelector<HTMLSpanElement>('#status-left'),
  statusRight: document.querySelector<HTMLSpanElement>('#status-right'),
  searchPanel: document.querySelector<HTMLDivElement>('#search-panel'),
  searchInput: document.querySelector<HTMLInputElement>('#search-input'),
  searchCase: document.querySelector<HTMLInputElement>('#search-case-sensitive'),
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
  settingTheme: document.querySelector<HTMLSelectElement>('#setting-theme'),
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
let tabCount = 0;
const tabRemovalTimers = new Map<string, ReturnType<typeof setTimeout>>();
let settingsPreviewBaseline: AppSettings | null = null;

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
  terminalHost: assertDom(dom.terminalHost, '#terminal-host'),
  statusLeft: assertDom(dom.statusLeft, '#status-left'),
  statusRight: assertDom(dom.statusRight, '#status-right'),
  searchPanel: assertDom(dom.searchPanel, '#search-panel'),
  searchInput: assertDom(dom.searchInput, '#search-input'),
  searchCase: assertDom(dom.searchCase, '#search-case-sensitive'),
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
  settingVibrancy: assertDom(dom.settingVibrancy, '#setting-vibrancy')
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nextTabLabel(): string {
  tabCount += 1;
  return `Tab ${tabCount}`;
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

  const title = element.querySelector<HTMLSpanElement>('.tab-title');
  if (title && title.textContent !== tab.title) {
    title.textContent = tab.title;
  }

  const dot = element.querySelector<HTMLSpanElement>('.tab-indicator-dot');
  if (dot) {
    dot.classList.remove('active', 'unread', 'exited');
    if (tab.exited) {
      dot.classList.add('exited');
    } else if (tab.hasUnreadOutput) {
      dot.classList.add('unread');
    } else if (tab.hasRecentOutput) {
      dot.classList.add('active');
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

function updateStatus(): void {
  const active = tabs.get(activeTabId);
  if (!active) {
    ui.statusLeft.textContent = 'No active session';
    ui.statusRight.textContent = '';
    return;
  }

  ui.statusLeft.textContent = active.exited
    ? `Exited · ${active.shell}`
    : `${active.shell} · PID ${active.pid}`;
  const themeLabel =
    settings.theme === 'system' ? `System (${resolvedTheme.themeName})` : resolvedTheme.themeName;
  ui.statusRight.textContent = `${tabOrder.length} tab${tabOrder.length === 1 ? '' : 's'} · ${themeLabel}`;
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

  if (tab.hasRecentOutput) {
    tab.hasRecentOutput = false;
    renderTabStrip();
  }
}

function markTabOutput(tab: TabState): void {
  if (tab.exited) {
    return;
  }

  if (tab.id === activeTabId) {
    const shouldRender = !tab.hasRecentOutput;
    tab.hasRecentOutput = true;
    if (tab.outputPulseTimer) {
      clearTimeout(tab.outputPulseTimer);
    }

    tab.outputPulseTimer = setTimeout(() => {
      tab.outputPulseTimer = undefined;
      if (!tab.hasRecentOutput) {
        return;
      }

      tab.hasRecentOutput = false;
      renderTabStrip();
    }, 1200);

    if (shouldRender) {
      renderTabStrip();
    }

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
    ui.statusLeft.textContent = `Failed to create session: ${String(error)}`;
    ui.statusRight.textContent = '';
    return;
  }

  const title = nextTabLabel();
  const tab: TabState = {
    id: tabId,
    sessionId: summary.sessionId,
    title,
    shell: summary.shell,
    pid: summary.pid,
    term,
    fit,
    search,
    container,
    exited: false,
    hasUnreadOutput: false,
    hasRecentOutput: false
  };

  tabs.set(tabId, tab);
  tabOrder.push(tabId);

  term.onData((data) => {
    window.terminalAPI.writeToSession({
      sessionId: summary.sessionId,
      data
    });
  });

  term.onTitleChange((incomingTitle) => {
    if (incomingTitle.trim().length === 0) {
      return;
    }

    tab.title = incomingTitle.trim();
    renderTabStrip();
  });

  term.onResize(({ cols, rows }) => {
    window.terminalAPI.resizeSession({
      sessionId: summary.sessionId,
      cols,
      rows
    });
  });

  activateTab(tabId);
  renderTabStrip();
  updateStatus();
}

async function closeTab(tabId: string): Promise<void> {
  const tab = tabs.get(tabId);
  if (!tab) {
    return;
  }

  clearOutputPulse(tab);
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

  renderTabStrip();
  updateStatus();
}

function activeTab(): TabState | undefined {
  return tabs.get(activeTabId);
}

function openSearch(): void {
  ui.searchPanel.classList.remove('hidden');
  ui.searchInput.focus();
  ui.searchInput.select();
}

function closeSearch(): void {
  ui.searchPanel.classList.add('hidden');
  activeTab()?.term.focus();
}

function runSearch(forward: boolean): void {
  const tab = activeTab();
  if (!tab) {
    return;
  }

  const term = ui.searchInput.value;
  if (!term) {
    return;
  }

  const options = {
    caseSensitive: ui.searchCase.checked,
    incremental: true
  };

  if (forward) {
    tab.search.findNext(term, options);
  } else {
    tab.search.findPrevious(term, options);
  }
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
    swatch.classList.toggle('selected', swatch.dataset.theme === selectedTheme);
  }
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
}

function settingsPatchFromForm(): SettingsPatch {
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
    vibrancy: ui.settingVibrancy.checked
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
    ui.settingTheme.focus();
    return;
  }

  settingsPreviewBaseline = structuredClone(settings);
  syncSettingsFormFromState(settings);

  ui.settingsScrim.classList.remove('hidden');
  ui.terminalHost.classList.add('panel-open');
  requestAnimationFrame(() => {
    ui.settingsPanel.classList.add('open');
    ui.settingsPanel.setAttribute('aria-hidden', 'false');
    ui.settingsScrim.classList.add('open');
    ui.settingTheme.focus();
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

    tab.exited = true;
    tab.hasUnreadOutput = false;
    clearOutputPulse(tab);
    tab.term.writeln(`\r\n\x1b[31m[process exited with code ${exitCode}]\x1b[0m`);
    renderTabStrip();
    updateStatus();
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
  ui.newTabButton.innerHTML = icon('plus', 14);
  ui.settingsButton.innerHTML = icon('gear', 14);
  ui.settingsClose.innerHTML = icon('close', 14);
}

function bindKeyboardShortcuts(): void {
  window.addEventListener('keydown', (event) => {
    const isMod = event.metaKey || event.ctrlKey;

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

      if (!ui.searchPanel.classList.contains('hidden')) {
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

  ui.searchInput.addEventListener('input', () => runSearch(true));
  ui.searchNext.addEventListener('click', () => runSearch(true));
  ui.searchPrev.addEventListener('click', () => runSearch(false));
  ui.searchClose.addEventListener('click', () => closeSearch());

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

    if (target === ui.settingTheme) {
      syncThemeSwatches();
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
}

async function boot(): Promise<void> {
  systemAppearance = await window.terminalAPI.getSystemAppearance();
  settings = await window.terminalAPI.getSettings();
  applySettingsToAllTabs();
  applyStaticIcons();
  bindUI();
  bindKeyboardShortcuts();
  bindMenuActions();
  bindSessionEvents();
  bindSystemAppearanceEvents();
  await createTab();
  updateStatus();
}

void boot();
