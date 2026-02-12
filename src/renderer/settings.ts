import type { AppSettings, AppearanceMode, CursorStyle, SettingsPatch, ThemeSelection } from '../shared/types';
import { applyThemeChrome, resolveThemeState } from './themes';
import './tokens.css';
import './settings-window.css';

const THEME_OPTIONS: Array<{ value: ThemeSelection; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'graphite', label: 'Graphite' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'solarized-dark', label: 'Solarized' },
  { value: 'paper', label: 'Paper' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'noir', label: 'Noir' },
  { value: 'fog', label: 'Fog' },
  { value: 'catppuccin-latte', label: 'Latte' },
  { value: 'catppuccin-frappe', label: 'Frappe' },
  { value: 'catppuccin-macchiato', label: 'Macchiato' },
  { value: 'catppuccin-mocha', label: 'Mocha' }
];

const dom = {
  form: document.querySelector<HTMLFormElement>('#settings-form'),
  status: document.querySelector<HTMLParagraphElement>('#settings-status'),
  saveButton: document.querySelector<HTMLButtonElement>('#settings-save'),
  cancelButton: document.querySelector<HTMLButtonElement>('#settings-cancel'),
  resetButton: document.querySelector<HTMLButtonElement>('#settings-reset'),
  navItems: document.querySelectorAll<HTMLButtonElement>('.settings-nav-item'),
  sections: document.querySelectorAll<HTMLElement>('.settings-section'),
  themeSwatches: document.querySelector<HTMLDivElement>('#setting-theme-swatches'),
  themeInput: document.querySelector<HTMLInputElement>('#setting-theme'),
  fontFamily: document.querySelector<HTMLInputElement>('#setting-font-family'),
  fontSize: document.querySelector<HTMLInputElement>('#setting-font-size'),
  lineHeight: document.querySelector<HTMLInputElement>('#setting-line-height'),
  scrollback: document.querySelector<HTMLInputElement>('#setting-scrollback'),
  opacity: document.querySelector<HTMLInputElement>('#setting-opacity'),
  appearance: document.querySelector<HTMLSelectElement>('#setting-appearance'),
  cursorStyle: document.querySelector<HTMLSelectElement>('#setting-cursor-style'),
  cursorBlink: document.querySelector<HTMLInputElement>('#setting-cursor-blink'),
  vibrancy: document.querySelector<HTMLInputElement>('#setting-vibrancy')
};

function assertDom<T>(value: T | null, id: string): T {
  if (!value) {
    throw new Error(`Missing required element: ${id}`);
  }

  return value;
}

const ui = {
  form: assertDom(dom.form, '#settings-form'),
  status: assertDom(dom.status, '#settings-status'),
  saveButton: assertDom(dom.saveButton, '#settings-save'),
  cancelButton: assertDom(dom.cancelButton, '#settings-cancel'),
  resetButton: assertDom(dom.resetButton, '#settings-reset'),
  navItems: dom.navItems,
  sections: dom.sections,
  themeSwatches: assertDom(dom.themeSwatches, '#setting-theme-swatches'),
  themeInput: assertDom(dom.themeInput, '#setting-theme'),
  fontFamily: assertDom(dom.fontFamily, '#setting-font-family'),
  fontSize: assertDom(dom.fontSize, '#setting-font-size'),
  lineHeight: assertDom(dom.lineHeight, '#setting-line-height'),
  scrollback: assertDom(dom.scrollback, '#setting-scrollback'),
  opacity: assertDom(dom.opacity, '#setting-opacity'),
  appearance: assertDom(dom.appearance, '#setting-appearance'),
  cursorStyle: assertDom(dom.cursorStyle, '#setting-cursor-style'),
  cursorBlink: assertDom(dom.cursorBlink, '#setting-cursor-blink'),
  vibrancy: assertDom(dom.vibrancy, '#setting-vibrancy')
};

let settings: AppSettings;
let systemAppearance: AppearanceMode = 'dark';
let isDirty = false;
let isSaving = false;
let activeSection = 'appearance';

function applyPlatformClass(): void {
  const ua = navigator.userAgent.toLowerCase();
  const isMac = ua.includes('mac os x') || ua.includes('macintosh');
  if (isMac) {
    document.documentElement.classList.add('platform-mac');
  }
}

function setRangeFill(input: HTMLInputElement): void {
  if (input.type !== 'range') {
    return;
  }

  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || min);
  const ratio = max <= min ? 0 : (value - min) / (max - min);
  input.style.setProperty('--fill-percent', `${Math.round(ratio * 100)}%`);
}

function setStatus(message: string): void {
  ui.status.textContent = message;
}

function markDirty(nextDirty: boolean): void {
  isDirty = nextDirty;
  ui.saveButton.disabled = isSaving || !isDirty;
  if (isDirty) {
    setStatus('Unsaved changes. Press Save or Cmd/Ctrl+S to apply.');
  } else {
    setStatus('No pending changes.');
  }
}

function syncThemeSwatches(): void {
  const selected = ui.themeInput.value;
  const buttons = ui.themeSwatches.querySelectorAll<HTMLButtonElement>('.theme-swatch');
  for (const button of buttons) {
    const active = button.dataset.theme === selected;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function patchFromForm(): SettingsPatch {
  return {
    fontFamily: ui.fontFamily.value,
    fontSize: Number(ui.fontSize.value),
    lineHeight: Number(ui.lineHeight.value),
    scrollback: Number(ui.scrollback.value),
    backgroundOpacity: Number(ui.opacity.value),
    theme: ui.themeInput.value as ThemeSelection,
    appearancePreference: ui.appearance.value as AppSettings['appearancePreference'],
    cursorStyle: ui.cursorStyle.value as CursorStyle,
    cursorBlink: ui.cursorBlink.checked,
    vibrancy: ui.vibrancy.checked
  };
}

function mergePatch(source: AppSettings, patch: SettingsPatch): AppSettings {
  return {
    ...source,
    ...patch,
    schemaVersion: source.schemaVersion,
    ui: {
      ...source.ui,
      ...patch.ui
    },
    profiles: source.profiles,
    defaultProfileId: source.defaultProfileId
  };
}

function applyPreview(patch: SettingsPatch): void {
  const preview = mergePatch(settings, patch);
  const resolved = resolveThemeState(preview, systemAppearance);
  applyThemeChrome(resolved, preview.vibrancy);
  document.documentElement.style.setProperty('--surface-opacity', preview.backgroundOpacity.toFixed(2));
}

function syncFormFromState(source: AppSettings): void {
  ui.fontFamily.value = source.fontFamily;
  ui.fontSize.value = String(source.fontSize);
  ui.lineHeight.value = String(source.lineHeight);
  ui.scrollback.value = String(source.scrollback);
  ui.opacity.value = String(source.backgroundOpacity);
  ui.themeInput.value = source.theme;
  ui.appearance.value = source.appearancePreference;
  ui.cursorStyle.value = source.cursorStyle;
  ui.cursorBlink.checked = source.cursorBlink;
  ui.vibrancy.checked = source.vibrancy;

  setRangeFill(ui.fontSize);
  setRangeFill(ui.lineHeight);
  setRangeFill(ui.opacity);
  syncThemeSwatches();
  applyPreview({});
}

function renderThemeSwatches(): void {
  ui.themeSwatches.innerHTML = '';
  for (const option of THEME_OPTIONS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'theme-swatch';
    swatch.dataset.theme = option.value;
    swatch.textContent = option.label;
    swatch.addEventListener('click', () => {
      if (ui.themeInput.value === option.value) {
        return;
      }

      ui.themeInput.value = option.value;
      syncThemeSwatches();
      applyPreview(patchFromForm());
      markDirty(true);
    });
    ui.themeSwatches.append(swatch);
  }
}

async function saveSettings(): Promise<void> {
  if (isSaving || !isDirty) {
    return;
  }

  isSaving = true;
  ui.saveButton.disabled = true;
  setStatus('Saving settings...');

  try {
    settings = await window.terminalAPI.updateSettings(patchFromForm());
    syncFormFromState(settings);
    markDirty(false);
    setStatus('Settings saved.');
  } catch {
    setStatus('Failed to save settings.');
    markDirty(true);
  } finally {
    isSaving = false;
    ui.saveButton.disabled = !isDirty;
  }
}

function activateNav(sectionName: string): void {
  for (const item of ui.navItems) {
    const active = item.dataset.section === sectionName;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
  }
}

function showSection(sectionName: string): void {
  const fallbackSection = ui.sections[0]?.dataset.section || 'appearance';
  const hasSection = Array.from(ui.sections).some((section) => section.dataset.section === sectionName);
  const nextSection = hasSection ? sectionName : fallbackSection;
  let matched = false;
  for (const section of ui.sections) {
    const active = section.dataset.section === nextSection;
    section.classList.toggle('active', active);
    section.toggleAttribute('hidden', !active);
    if (active) {
      matched = true;
    }
  }

  if (!matched) {
    return;
  }

  activeSection = nextSection;
  activateNav(nextSection);
}

function bindSectionNav(): void {
  for (const item of ui.navItems) {
    item.setAttribute('role', 'tab');
    item.setAttribute('aria-selected', item.classList.contains('active') ? 'true' : 'false');
    item.addEventListener('click', () => {
      const sectionName = item.dataset.section;
      if (!sectionName || sectionName === activeSection) {
        return;
      }

      showSection(sectionName);
    });
  }
}

function bindForm(): void {
  const onInput = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'range') {
      setRangeFill(target);
    }

    applyPreview(patchFromForm());
    markDirty(true);
  };

  ui.form.addEventListener('input', onInput);
  ui.form.addEventListener('change', onInput);

  ui.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveSettings();
  });

  ui.saveButton.addEventListener('click', () => {
    void saveSettings();
  });

  ui.cancelButton.addEventListener('click', () => {
    window.close();
  });

  ui.resetButton.addEventListener('click', () => {
    syncFormFromState(settings);
    markDirty(false);
  });

  window.addEventListener('keydown', (event) => {
    const isMod = event.metaKey || event.ctrlKey;
    if (isMod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveSettings();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      window.close();
    }
  });
}

function bindExternalEvents(): void {
  window.terminalAPI.onSystemAppearanceChanged(({ appearance }) => {
    systemAppearance = appearance;
    applyPreview(patchFromForm());
  });

  window.terminalAPI.onSettingsChanged(({ settings: next }) => {
    if (isSaving) {
      return;
    }

    settings = next;
    if (!isDirty) {
      syncFormFromState(next);
      markDirty(false);
      return;
    }

    setStatus('Settings changed in another window. Save or Reset to reconcile.');
  });

  window.terminalAPI.onMenuAction((action) => {
    if (action === 'settings') {
      window.focus();
    }
  });
}

async function boot(): Promise<void> {
  applyPlatformClass();
  renderThemeSwatches();
  bindSectionNav();
  showSection(activeSection);
  bindForm();
  bindExternalEvents();

  systemAppearance = await window.terminalAPI.getSystemAppearance();
  settings = await window.terminalAPI.getSettings();
  syncFormFromState(settings);
  markDirty(false);
}

void boot();
