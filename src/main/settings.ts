import fs from 'node:fs';
import path from 'node:path';
import type {
  AppSettings,
  AppearancePreference,
  CursorStyle,
  ProfileCard,
  SettingsPatch,
  TabHostLabelMode,
  TerminalProfile,
  ThemeSelection,
  WorkspacePreset,
  WorkspaceStartupTab
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
const TAB_HOST_LABEL_MODES = new Set<TabHostLabelMode>(['off', 'ssh-only', 'all']);
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

function sanitizeProfileCard(
  candidate: ProfileCard,
  fallbackProfileId: string
): ProfileCard {
  const theme = normalizeThemeSelection(candidate.theme);
  return {
    id: candidate.id?.trim() || 'default-card',
    name: candidate.name?.trim() || 'Default Card',
    profileId: candidate.profileId?.trim() || fallbackProfileId,
    theme: theme,
    fontFamily: candidate.fontFamily?.trim() || undefined,
    fontSize:
      Number.isFinite(candidate.fontSize) && Number(candidate.fontSize) > 0
        ? clamp(Number(candidate.fontSize), 10, 28)
        : undefined,
    lineHeight:
      Number.isFinite(candidate.lineHeight) && Number(candidate.lineHeight) > 0
        ? clamp(Number(candidate.lineHeight), 1.0, 2.0)
        : undefined,
    cursorStyle: candidate.cursorStyle && CURSORS.has(candidate.cursorStyle) ? candidate.cursorStyle : undefined,
    cursorBlink: typeof candidate.cursorBlink === 'boolean' ? candidate.cursorBlink : undefined,
    padding:
      Number.isFinite(candidate.padding) && Number(candidate.padding) >= 0
        ? Math.round(clamp(Number(candidate.padding), 0, 64))
        : undefined
  };
}

function sanitizeStartupTab(
  candidate: WorkspaceStartupTab,
  defaultProfileCardId: string,
  fallbackCwd: string
): WorkspaceStartupTab {
  const cwdCandidate = candidate.cwd?.trim() || fallbackCwd;
  const cwd = fs.existsSync(cwdCandidate) ? cwdCandidate : fallbackCwd;

  return {
    id: candidate.id?.trim() || 'startup-tab',
    profileCardId: candidate.profileCardId?.trim() || defaultProfileCardId,
    cwd,
    command: candidate.command?.trim() || ''
  };
}

function sanitizeWorkspace(
  candidate: WorkspacePreset,
  fallbackProfileCardId: string,
  fallbackCwd: string
): WorkspacePreset {
  const defaultProfileCardId = candidate.defaultProfileCardId?.trim() || fallbackProfileCardId;
  const startupTabs = Array.isArray(candidate.startupTabs)
    ? candidate.startupTabs.map((tab) => sanitizeStartupTab(tab, defaultProfileCardId, fallbackCwd))
    : [];

  return {
    id: candidate.id?.trim() || 'default-workspace',
    name: candidate.name?.trim() || 'Default Workspace',
    layout: 'tabs',
    defaultProfileCardId,
    startupTabs:
      startupTabs.length > 0
        ? startupTabs
        : [
            {
              id: 'startup-tab-1',
              profileCardId: defaultProfileCardId,
              cwd: fallbackCwd,
              command: ''
            }
          ]
  };
}

export class SettingsService {
  private readonly store: JsonStore<AppSettings>;

  constructor(userDataPath: string) {
    const home = process.env.HOME || userDataPath;
    const shell = process.env.SHELL || '/bin/zsh';

    const defaults: AppSettings = {
      fontFamily: `'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace`,
      fontSize: 14,
      lineHeight: 1.35,
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: 20000,
      backgroundOpacity: 0.92,
      theme: 'graphite',
      appearancePreference: 'system',
      tabHostLabelMode: 'ssh-only',
      vibrancy: false,
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
      defaultProfileId: 'default',
      profileCards: [
        {
          id: 'default-card',
          name: 'Default Card',
          profileId: 'default'
        }
      ],
      defaultProfileCardId: 'default-card',
      workspaces: [
        {
          id: 'default-workspace',
          name: 'Default Workspace',
          layout: 'tabs',
          defaultProfileCardId: 'default-card',
          startupTabs: [
            {
              id: 'startup-tab-1',
              profileCardId: 'default-card',
              cwd: home,
              command: ''
            }
          ]
        }
      ],
      activeWorkspaceId: 'default-workspace'
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
      profiles: patch.profiles ?? current.profiles,
      defaultProfileId: patch.defaultProfileId ?? current.defaultProfileId,
      profileCards: patch.profileCards ?? current.profileCards,
      defaultProfileCardId: patch.defaultProfileCardId ?? current.defaultProfileCardId,
      workspaces: patch.workspaces ?? current.workspaces,
      activeWorkspaceId: patch.activeWorkspaceId ?? current.activeWorkspaceId
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

  findProfileCard(profileCardId?: string): ProfileCard {
    const settings = this.store.read();
    const id = profileCardId || settings.defaultProfileCardId;
    const explicit = settings.profileCards.find((card) => card.id === id);
    if (explicit) {
      return explicit;
    }

    const fallback = settings.profileCards[0];
    if (fallback) {
      return fallback;
    }

    return {
      id: 'default-card',
      name: 'Default Card',
      profileId: settings.defaultProfileId
    };
  }

  findWorkspace(workspaceId?: string): WorkspacePreset {
    const settings = this.store.read();
    const id = workspaceId || settings.activeWorkspaceId;
    const explicit = settings.workspaces.find((workspace) => workspace.id === id);
    if (explicit) {
      return explicit;
    }

    const fallback = settings.workspaces[0];
    if (fallback) {
      return fallback;
    }

    return {
      id: 'default-workspace',
      name: 'Default Workspace',
      layout: 'tabs',
      defaultProfileCardId: settings.defaultProfileCardId,
      startupTabs: [
        {
          id: 'startup-tab-1',
          profileCardId: settings.defaultProfileCardId,
          cwd: process.env.HOME || '/',
          command: ''
        }
      ]
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

    const profileCards = (candidate.profileCards || []).map((card) => sanitizeProfileCard(card, defaultProfileId));
    const dedupedProfileCards: ProfileCard[] = [];
    const seenCards = new Set<string>();
    for (const profileCard of profileCards) {
      if (seenCards.has(profileCard.id)) {
        continue;
      }

      seenCards.add(profileCard.id);
      dedupedProfileCards.push({
        ...profileCard,
        profileId: dedupedProfiles.some((profile) => profile.id === profileCard.profileId)
          ? profileCard.profileId
          : defaultProfileId
      });
    }

    if (dedupedProfileCards.length === 0) {
      dedupedProfileCards.push({
        id: 'default-card',
        name: 'Default Card',
        profileId: defaultProfileId
      });
    }

    const fallbackProfileCard = dedupedProfileCards[0];
    const defaultProfileCardId =
      candidate.defaultProfileCardId && dedupedProfileCards.some((card) => card.id === candidate.defaultProfileCardId)
        ? candidate.defaultProfileCardId
        : fallbackProfileCard
          ? fallbackProfileCard.id
          : 'default-card';

    const workspaces = (candidate.workspaces || []).map((workspace) =>
      sanitizeWorkspace(workspace, defaultProfileCardId, fallbackCwd)
    );
    const dedupedWorkspaces: WorkspacePreset[] = [];
    const seenWorkspaces = new Set<string>();
    for (const workspace of workspaces) {
      if (seenWorkspaces.has(workspace.id)) {
        continue;
      }

      seenWorkspaces.add(workspace.id);
      const fallbackCardId = dedupedProfileCards.some((card) => card.id === workspace.defaultProfileCardId)
        ? workspace.defaultProfileCardId
        : defaultProfileCardId;
      dedupedWorkspaces.push({
        ...workspace,
        defaultProfileCardId: fallbackCardId,
        startupTabs: workspace.startupTabs.map((tab) => ({
          ...tab,
          profileCardId: dedupedProfileCards.some((card) => card.id === tab.profileCardId)
            ? tab.profileCardId
            : fallbackCardId
        }))
      });
    }

    if (dedupedWorkspaces.length === 0) {
      dedupedWorkspaces.push({
        id: 'default-workspace',
        name: 'Default Workspace',
        layout: 'tabs',
        defaultProfileCardId,
        startupTabs: [
          {
            id: 'startup-tab-1',
            profileCardId: defaultProfileCardId,
            cwd: fallbackCwd,
            command: ''
          }
        ]
      });
    }

    const fallbackWorkspace = dedupedWorkspaces[0];
    const activeWorkspaceId =
      candidate.activeWorkspaceId && dedupedWorkspaces.some((workspace) => workspace.id === candidate.activeWorkspaceId)
        ? candidate.activeWorkspaceId
        : fallbackWorkspace
          ? fallbackWorkspace.id
          : 'default-workspace';

    return {
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
      tabHostLabelMode: TAB_HOST_LABEL_MODES.has(candidate.tabHostLabelMode)
        ? candidate.tabHostLabelMode
        : 'ssh-only',
      vibrancy: Boolean(candidate.vibrancy),
      profiles: dedupedProfiles,
      defaultProfileId,
      profileCards: dedupedProfileCards,
      defaultProfileCardId,
      workspaces: dedupedWorkspaces,
      activeWorkspaceId
    };
  }
}
