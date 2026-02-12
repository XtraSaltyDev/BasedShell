import type { AppearanceMode, AppearancePreference, ThemeName, ThemeSelection } from './types';

export interface ThemeMeta {
  appearance: AppearanceMode;
  electronBgColor: string;
}

export const THEME_META: Record<ThemeName, ThemeMeta> = {
  graphite: {
    appearance: 'dark',
    electronBgColor: '#0b0d12'
  },
  midnight: {
    appearance: 'dark',
    electronBgColor: '#070b13'
  },
  'solarized-dark': {
    appearance: 'dark',
    electronBgColor: '#00232d'
  },
  paper: {
    appearance: 'light',
    electronBgColor: '#f0ede4'
  },
  aurora: {
    appearance: 'dark',
    electronBgColor: '#0a0e1a'
  },
  noir: {
    appearance: 'dark',
    electronBgColor: '#000000'
  },
  fog: {
    appearance: 'dark',
    electronBgColor: '#1c1b1f'
  }
};

export function resolveAppearance(
  preference: AppearancePreference,
  systemAppearance: AppearanceMode
): AppearanceMode {
  if (preference === 'system') {
    return systemAppearance;
  }

  return preference;
}

export function resolveThemeName(selection: ThemeSelection, appearance: AppearanceMode): ThemeName {
  if (selection !== 'system') {
    return selection;
  }

  return appearance === 'light' ? 'paper' : 'graphite';
}
