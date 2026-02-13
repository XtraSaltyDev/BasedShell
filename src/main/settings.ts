import fs from 'node:fs';
import path from 'node:path';
import type {
  AppSettings,
  AppearancePreference,
  CursorStyle,
  PromptStyle,
  SettingsPatch,
  TerminalProfile,
  ThemeSelection,
  UiSettings
} from '../shared/types';
import { JsonStore } from './storage';

const THEMES = new Set<ThemeSelection>([
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
]);
const APPEARANCE_PREFERENCES = new Set<AppearancePreference>(['system', 'dark', 'light']);
const CURSORS = new Set<CursorStyle>(['block', 'underline', 'bar']);
const PROMPT_STYLES = new Set<PromptStyle>(['system', 'minimal']);
const SETTINGS_SCHEMA_VERSION = 4;
const LEGACY_THEME_ALIASES: Record<string, ThemeSelection> = {
  catppuccin: 'catppuccin-mocha'
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeThemeSelection(value: unknown): ThemeSelection | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = LEGACY_THEME_ALIASES[value] ?? value;
  if (THEMES.has(normalized as ThemeSelection)) {
    return normalized as ThemeSelection;
  }

  return undefined;
}

function sanitizeSplitRatio(value: unknown): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  return clamp(Number(value), 0.15, 0.85);
}

function sanitizeUiSettings(candidate: Partial<UiSettings> | undefined): UiSettings {
  return {
    lastVerticalSplitRatio: sanitizeSplitRatio(candidate?.lastVerticalSplitRatio),
    lastHorizontalSplitRatio: sanitizeSplitRatio(candidate?.lastHorizontalSplitRatio)
  };
}

function sanitizeProfile(candidate: TerminalProfile, fallbackCwd: string): TerminalProfile {
  const shell = candidate.shell?.trim() || process.env.SHELL || '/bin/zsh';
  const args = Array.isArray(candidate.args)
    ? candidate.args.filter((arg) => typeof arg === 'string')
    : ['-l'];

  const env = isObject(candidate.env)
    ? Object.fromEntries(
        Object.entries(candidate.env)
          .filter((entry): entry is [string, string] => {
            return typeof entry[0] === 'string' && typeof entry[1] === 'string';
          })
      )
    : {};

  const cwdCandidate = candidate.cwd?.trim() || fallbackCwd;
  const cwd = fs.existsSync(cwdCandidate) ? cwdCandidate : fallbackCwd;

  return {
    id: candidate.id || 'default',
    name: candidate.name || 'Default',
    shell,
    args: args.length > 0 ? args : ['-l'],
    cwd,
    env
  };
}

export class SettingsService {
  private readonly store: JsonStore<AppSettings>;

  constructor(userDataPath: string) {
    const home = process.env.HOME || userDataPath;
    const shell = process.env.SHELL || '/bin/zsh';

    const defaults: AppSettings = {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      fontFamily: `'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace`,
      fontSize: 14,
      lineHeight: 1.35,
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: 20000,
      backgroundOpacity: 0.92,
      theme: 'graphite',
      appearancePreference: 'system',
      vibrancy: false,
      promptStyle: 'system',
      ui: {
        lastVerticalSplitRatio: null,
        lastHorizontalSplitRatio: null
      },
      profiles: [
        {
          id: 'default',
          name: 'Default Shell',
          shell,
          args: ['-l'],
          cwd: home,
          env: {}
        }
      ],
      defaultProfileId: 'default'
    };

    this.store = new JsonStore<AppSettings>(path.join(userDataPath, 'settings.json'), defaults);
    const current = this.store.read();
    this.store.write(this.sanitize(current));
  }

  get(): AppSettings {
    return this.store.read();
  }

  update(patch: SettingsPatch): AppSettings {
    const current = this.store.read();
    const merged: AppSettings = {
      ...current,
      ...patch,
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      ui: {
        ...current.ui,
        ...patch.ui
      },
      profiles: patch.profiles ?? current.profiles,
      defaultProfileId: patch.defaultProfileId ?? current.defaultProfileId
    };

    const next = this.sanitize(merged);

    this.store.write(next);
    return next;
  }

  findProfile(profileId?: string): TerminalProfile {
    const settings = this.store.read();
    const id = profileId || settings.defaultProfileId;
    const explicit = settings.profiles.find((profile) => profile.id === id);
    if (explicit) {
      return explicit;
    }

    const fallback = settings.profiles[0];
    if (fallback) {
      return fallback;
    }

    return {
      id: 'default',
      name: 'Default Shell',
      shell: process.env.SHELL || '/bin/zsh',
      args: ['-l'],
      cwd: process.env.HOME || '/',
      env: {}
    };
  }

  private sanitize(candidate: AppSettings): AppSettings {
    const fallbackCwd = process.env.HOME || '/';
    const profiles = (candidate.profiles || []).map((profile) => sanitizeProfile(profile, fallbackCwd));

    const dedupedProfiles: TerminalProfile[] = [];
    const seen = new Set<string>();
    for (const profile of profiles) {
      if (seen.has(profile.id)) {
        continue;
      }

      seen.add(profile.id);
      dedupedProfiles.push(profile);
    }

    if (dedupedProfiles.length === 0) {
      dedupedProfiles.push(
        sanitizeProfile(
          {
            id: 'default',
            name: 'Default Shell',
            shell: process.env.SHELL || '/bin/zsh',
            args: ['-l'],
            cwd: fallbackCwd,
            env: {}
          },
          fallbackCwd
        )
      );
    }

    const fallbackProfile = dedupedProfiles[0];
    const defaultProfileId =
      candidate.defaultProfileId && dedupedProfiles.some((p) => p.id === candidate.defaultProfileId)
        ? candidate.defaultProfileId
        : fallbackProfile
          ? fallbackProfile.id
          : 'default';

    return {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      fontFamily:
        typeof candidate.fontFamily === 'string' && candidate.fontFamily.trim().length > 0
          ? candidate.fontFamily.trim()
          : `'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace`,
      fontSize: clamp(Number(candidate.fontSize) || 14, 10, 28),
      lineHeight: clamp(Number(candidate.lineHeight) || 1.35, 1.0, 2.0),
      cursorStyle: CURSORS.has(candidate.cursorStyle) ? candidate.cursorStyle : 'block',
      cursorBlink: Boolean(candidate.cursorBlink),
      scrollback: Math.round(clamp(Number(candidate.scrollback) || 20000, 1000, 200000)),
      backgroundOpacity: clamp(Number(candidate.backgroundOpacity) || 0.92, 0.6, 1),
      theme: normalizeThemeSelection(candidate.theme) ?? 'graphite',
      appearancePreference: APPEARANCE_PREFERENCES.has(candidate.appearancePreference)
        ? candidate.appearancePreference
        : 'system',
      vibrancy: Boolean(candidate.vibrancy),
      promptStyle: PROMPT_STYLES.has(candidate.promptStyle) ? candidate.promptStyle : 'system',
      ui: sanitizeUiSettings(candidate.ui),
      profiles: dedupedProfiles,
      defaultProfileId
    };
  }
}
