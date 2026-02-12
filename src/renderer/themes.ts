import type { AppSettings, AppearanceMode, FullTheme, ThemeChrome, ThemeName } from '../shared/types';
import { resolveAppearance, resolveThemeName, THEME_META } from '../shared/theme-meta';

const defaultChrome: ThemeChrome = {
  bgBase: '#0b0d12',
  bgSurface: '#111317',
  bgElevated: '#1a1f2b',
  bgOverlay: 'rgba(15, 18, 28, 0.95)',
  bgInset: '#151b26',
  borderDefault: '#2d3447',
  borderSubtle: '#252e3f',
  borderStrong: '#3b4a63',
  borderAccent: 'rgba(107, 203, 168, 0.35)',
  textPrimary: '#d7deef',
  textSecondary: '#8c95ab',
  textMuted: '#6b7d9b',
  textDisabled: '#4d5f7a',
  textInverse: '#0b0d12',
  accent: '#54d2a1',
  accentHover: '#6fd3af',
  accentMuted: '#1d3f34',
  accentSubtle: '#0f2a22',
  danger: '#f16d7e',
  dangerHover: '#ff9bb0',
  dangerMuted: '#7a2a35',
  warning: '#f4d68c',
  info: '#75a7f0',
  success: '#54d2a1',
  focusRing: 'rgba(84, 210, 161, 0.5)',
  topbarBg: 'linear-gradient(180deg, #1a1f2b 0%, #151b26 100%)',
  statusbarBg: '#111317',
  statusbarFg: '#6b7d9b',
  panelBg: '#111317',
  panelBorder: '#2d3447',
  searchBg: 'rgba(15, 18, 28, 0.95)',
  searchBorder: '#3b4a63',
  inputBg: '#0b0d12',
  inputBorder: '#2d3447',
  inputFg: '#d7deef',
  inputPlaceholder: '#4d5f7a',
  tabBgIdle: '#151b26',
  tabBgActive: '#1a1f2b',
  tabBgHover: '#1f2736',
  tabFgIdle: '#8c95ab',
  tabFgActive: '#d7deef',
  tabBorderIdle: '#252e3f',
  tabBorderActive: '#3b4a63',
  tabIndicator: '#54d2a1'
};

type CatppuccinFlavorName =
  | 'catppuccin-latte'
  | 'catppuccin-frappe'
  | 'catppuccin-macchiato'
  | 'catppuccin-mocha';

interface CatppuccinPalette {
  rosewater: string;
  flamingo: string;
  pink: string;
  mauve: string;
  red: string;
  maroon: string;
  peach: string;
  yellow: string;
  green: string;
  teal: string;
  sky: string;
  sapphire: string;
  blue: string;
  lavender: string;
  text: string;
  subtext1: string;
  subtext0: string;
  overlay2: string;
  overlay1: string;
  surface2: string;
  surface1: string;
  surface0: string;
  base: string;
  mantle: string;
  crust: string;
}

const CATPPUCCIN_FLAVORS: Record<CatppuccinFlavorName, CatppuccinPalette> = {
  'catppuccin-latte': {
    rosewater: '#dc8a78',
    flamingo: '#dd7878',
    pink: '#ea76cb',
    mauve: '#8839ef',
    red: '#d20f39',
    maroon: '#e64553',
    peach: '#fe640b',
    yellow: '#df8e1d',
    green: '#40a02b',
    teal: '#179299',
    sky: '#04a5e5',
    sapphire: '#209fb5',
    blue: '#1e66f5',
    lavender: '#7287fd',
    text: '#4c4f69',
    subtext1: '#5c5f77',
    subtext0: '#6c6f85',
    overlay2: '#7c7f93',
    overlay1: '#8c8fa1',
    surface2: '#acb0be',
    surface1: '#bcc0cc',
    surface0: '#ccd0da',
    base: '#eff1f5',
    mantle: '#e6e9ef',
    crust: '#dce0e8'
  },
  'catppuccin-frappe': {
    rosewater: '#f2d5cf',
    flamingo: '#eebebe',
    pink: '#f4b8e4',
    mauve: '#ca9ee6',
    red: '#e78284',
    maroon: '#ea999c',
    peach: '#ef9f76',
    yellow: '#e5c890',
    green: '#a6d189',
    teal: '#81c8be',
    sky: '#99d1db',
    sapphire: '#85c1dc',
    blue: '#8caaee',
    lavender: '#babbf1',
    text: '#c6d0f5',
    subtext1: '#b5bfe2',
    subtext0: '#a5adce',
    overlay2: '#949cbb',
    overlay1: '#838ba7',
    surface2: '#626880',
    surface1: '#51576d',
    surface0: '#414559',
    base: '#303446',
    mantle: '#292c3c',
    crust: '#232634'
  },
  'catppuccin-macchiato': {
    rosewater: '#f4dbd6',
    flamingo: '#f0c6c6',
    pink: '#f5bde6',
    mauve: '#c6a0f6',
    red: '#ed8796',
    maroon: '#ee99a0',
    peach: '#f5a97f',
    yellow: '#eed49f',
    green: '#a6da95',
    teal: '#8bd5ca',
    sky: '#91d7e3',
    sapphire: '#7dc4e4',
    blue: '#8aadf4',
    lavender: '#b7bdf8',
    text: '#cad3f5',
    subtext1: '#b8c0e0',
    subtext0: '#a5adcb',
    overlay2: '#939ab7',
    overlay1: '#8087a2',
    surface2: '#5b6078',
    surface1: '#494d64',
    surface0: '#363a4f',
    base: '#24273a',
    mantle: '#1e2030',
    crust: '#181926'
  },
  'catppuccin-mocha': {
    rosewater: '#f5e0dc',
    flamingo: '#f2cdcd',
    pink: '#f5c2e7',
    mauve: '#cba6f7',
    red: '#f38ba8',
    maroon: '#eba0ac',
    peach: '#fab387',
    yellow: '#f9e2af',
    green: '#a6e3a1',
    teal: '#94e2d5',
    sky: '#89dceb',
    sapphire: '#74c7ec',
    blue: '#89b4fa',
    lavender: '#b4befe',
    text: '#cdd6f4',
    subtext1: '#bac2de',
    subtext0: '#a6adc8',
    overlay2: '#9399b2',
    overlay1: '#7f849c',
    surface2: '#585b70',
    surface1: '#45475a',
    surface0: '#313244',
    base: '#1e1e2e',
    mantle: '#181825',
    crust: '#11111b'
  }
};

function alphaHex(hex: string, alpha: number): string {
  const normalized = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return hex;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function catppuccinTone(
  palette: CatppuccinPalette,
  appearance: AppearanceMode,
  tone: 'black' | 'white' | 'brightBlack' | 'brightWhite'
): string {
  if (appearance === 'light') {
    if (tone === 'black') {
      return palette.subtext1;
    }
    if (tone === 'white') {
      return palette.surface2;
    }
    if (tone === 'brightBlack') {
      return palette.subtext0;
    }
    return palette.surface1;
  }

  if (tone === 'black') {
    return palette.surface1;
  }
  if (tone === 'white') {
    return palette.subtext0;
  }
  if (tone === 'brightBlack') {
    return palette.surface2;
  }
  return palette.subtext1;
}

function catppuccinTheme(flavor: CatppuccinFlavorName): FullTheme {
  const palette = CATPPUCCIN_FLAVORS[flavor];
  const appearance = THEME_META[flavor].appearance;
  const whiteTone = catppuccinTone(palette, appearance, 'white');
  const brightWhiteTone = catppuccinTone(palette, appearance, 'brightWhite');

  return {
    terminal: {
      background: palette.base,
      foreground: palette.text,
      cursor: palette.rosewater,
      selectionBackground: palette.overlay2,
      black: catppuccinTone(palette, appearance, 'black'),
      red: palette.red,
      green: palette.green,
      yellow: palette.yellow,
      blue: palette.blue,
      magenta: palette.pink,
      cyan: palette.teal,
      white: whiteTone,
      brightBlack: catppuccinTone(palette, appearance, 'brightBlack'),
      brightRed: palette.flamingo,
      brightGreen: palette.green,
      brightYellow: palette.peach,
      brightBlue: palette.sapphire,
      brightMagenta: palette.mauve,
      brightCyan: palette.sky,
      brightWhite: brightWhiteTone
    },
    chrome: {
      ...defaultChrome,
      bgBase: palette.base,
      bgSurface: appearance === 'light' ? palette.base : palette.mantle,
      bgElevated: palette.surface0,
      bgOverlay: alphaHex(palette.mantle, 0.95),
      bgInset: palette.crust,
      borderDefault: palette.surface1,
      borderSubtle: palette.surface0,
      borderStrong: palette.surface2,
      borderAccent: alphaHex(palette.mauve, 0.35),
      textPrimary: palette.text,
      textSecondary: palette.subtext1,
      textMuted: palette.subtext0,
      textDisabled: palette.overlay1,
      textInverse: palette.crust,
      accent: palette.mauve,
      accentHover: palette.lavender,
      accentMuted: alphaHex(palette.mauve, 0.2),
      accentSubtle: alphaHex(palette.mauve, 0.12),
      danger: palette.red,
      dangerHover: palette.maroon,
      dangerMuted: alphaHex(palette.red, 0.22),
      warning: palette.yellow,
      info: palette.blue,
      success: palette.green,
      focusRing: alphaHex(palette.mauve, 0.5),
      topbarBg: `linear-gradient(180deg, ${palette.surface0} 0%, ${palette.mantle} 100%)`,
      statusbarBg: palette.mantle,
      statusbarFg: palette.subtext0,
      panelBg: palette.mantle,
      panelBorder: palette.surface1,
      searchBg: alphaHex(palette.mantle, 0.95),
      searchBorder: palette.surface2,
      inputBg: palette.base,
      inputBorder: palette.surface1,
      inputFg: palette.text,
      inputPlaceholder: palette.overlay1,
      tabBgIdle: appearance === 'light' ? palette.mantle : palette.base,
      tabBgActive: palette.surface0,
      tabBgHover: palette.surface1,
      tabFgIdle: palette.subtext1,
      tabFgActive: palette.text,
      tabBorderIdle: palette.surface0,
      tabBorderActive: palette.surface2,
      tabIndicator: palette.mauve
    },
    electronBgColor: THEME_META[flavor].electronBgColor,
    appearance
  };
}

const THEMES: Record<ThemeName, FullTheme> = {
  graphite: {
    terminal: {
      background: '#101319',
      foreground: '#dce3f2',
      cursor: '#6fd3af',
      selectionBackground: '#324154',
      black: '#191d27',
      red: '#ec7890',
      green: '#7cd3a6',
      yellow: '#f4d68c',
      blue: '#75a7f0',
      magenta: '#b89bf6',
      cyan: '#72d4e5',
      white: '#eaf0ff',
      brightBlack: '#4d586e',
      brightRed: '#ff9bb0',
      brightGreen: '#97ecc0',
      brightYellow: '#ffe6ad',
      brightBlue: '#94bbff',
      brightMagenta: '#cab3ff',
      brightCyan: '#94ecfc',
      brightWhite: '#ffffff'
    },
    chrome: {
      ...defaultChrome
    },
    electronBgColor: THEME_META.graphite.electronBgColor,
    appearance: THEME_META.graphite.appearance
  },
  midnight: {
    terminal: {
      background: '#090d16',
      foreground: '#cfe5ff',
      cursor: '#7ae0ff',
      selectionBackground: '#2f496e',
      black: '#111826',
      red: '#ff7892',
      green: '#6de0a0',
      yellow: '#f8d66c',
      blue: '#71a0ff',
      magenta: '#b193ff',
      cyan: '#68d5ff',
      white: '#dce6ff',
      brightBlack: '#3f5375',
      brightRed: '#ff9ab0',
      brightGreen: '#95f5bd',
      brightYellow: '#ffe892',
      brightBlue: '#9ebfff',
      brightMagenta: '#c9b3ff',
      brightCyan: '#9decff',
      brightWhite: '#ffffff'
    },
    chrome: {
      ...defaultChrome,
      bgBase: '#070b13',
      bgSurface: '#0c111b',
      bgElevated: '#111826',
      bgInset: '#0f1520',
      borderDefault: '#23324c',
      borderSubtle: '#1c263a',
      borderStrong: '#2f496e',
      textPrimary: '#cfe5ff',
      textSecondary: '#a0b9d8',
      textMuted: '#6f87a8',
      accent: '#68d5ff',
      accentHover: '#7ae0ff',
      topbarBg: 'linear-gradient(180deg, #111826 0%, #0f1520 100%)',
      statusbarBg: '#0c111b',
      statusbarFg: '#7f93af',
      inputBg: '#0a0f18',
      inputBorder: '#23324c',
      tabBgIdle: '#0f1520',
      tabBgActive: '#111826',
      tabBgHover: '#152136',
      tabFgIdle: '#8ca2bf',
      tabFgActive: '#d5e6ff',
      tabBorderIdle: '#1c263a',
      tabBorderActive: '#2f496e',
      tabIndicator: '#7ae0ff'
    },
    electronBgColor: THEME_META.midnight.electronBgColor,
    appearance: THEME_META.midnight.appearance
  },
  'solarized-dark': {
    terminal: {
      background: '#002b36',
      foreground: '#93a1a1',
      cursor: '#93a1a1',
      selectionBackground: '#194550',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#586e75',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3'
    },
    chrome: {
      ...defaultChrome,
      bgBase: '#00232d',
      bgSurface: '#002b36',
      bgElevated: '#073642',
      bgInset: '#01303a',
      borderDefault: '#2b4e57',
      borderSubtle: '#1f444d',
      borderStrong: '#496d76',
      textPrimary: '#93a1a1',
      textSecondary: '#839496',
      textMuted: '#6c7f7f',
      accent: '#2aa198',
      accentHover: '#3cb7ad',
      accentMuted: '#124f4c',
      accentSubtle: '#0a3a37',
      danger: '#dc322f',
      dangerHover: '#e05755',
      warning: '#b58900',
      info: '#268bd2',
      topbarBg: 'linear-gradient(180deg, #073642 0%, #01303a 100%)',
      statusbarBg: '#002b36',
      statusbarFg: '#6f8080',
      panelBg: '#002b36',
      panelBorder: '#2b4e57',
      searchBg: 'rgba(0, 43, 54, 0.96)',
      searchBorder: '#496d76',
      inputBg: '#00232d',
      inputBorder: '#2b4e57',
      inputFg: '#93a1a1',
      inputPlaceholder: '#586e75',
      tabBgIdle: '#01303a',
      tabBgActive: '#073642',
      tabBgHover: '#0d4250',
      tabFgIdle: '#839496',
      tabFgActive: '#d7deef',
      tabBorderIdle: '#1f444d',
      tabBorderActive: '#496d76',
      tabIndicator: '#2aa198'
    },
    electronBgColor: THEME_META['solarized-dark'].electronBgColor,
    appearance: THEME_META['solarized-dark'].appearance
  },
  paper: {
    terminal: {
      background: '#f6f3ea',
      foreground: '#2d2b28',
      cursor: '#4e5551',
      selectionBackground: '#d6e0e5',
      black: '#1f1d1b',
      red: '#b5434a',
      green: '#5f7f4b',
      yellow: '#9a7b3e',
      blue: '#406d92',
      magenta: '#88649e',
      cyan: '#3e8588',
      white: '#f6f3ea',
      brightBlack: '#77716a',
      brightRed: '#cb6971',
      brightGreen: '#7b9a64',
      brightYellow: '#b49355',
      brightBlue: '#688eb0',
      brightMagenta: '#a286b8',
      brightCyan: '#64a2a5',
      brightWhite: '#fffef8'
    },
    chrome: {
      ...defaultChrome,
      bgBase: '#f0ede4',
      bgSurface: '#f6f3ea',
      bgElevated: '#ffffff',
      bgOverlay: 'rgba(246, 243, 234, 0.97)',
      bgInset: '#ece7dc',
      borderDefault: '#d4cfc3',
      borderSubtle: '#e2ddd2',
      borderStrong: '#c6bfb3',
      borderAccent: 'rgba(62, 133, 88, 0.35)',
      textPrimary: '#2d2b28',
      textSecondary: '#5c5a54',
      textMuted: '#8a867c',
      textDisabled: '#aaa397',
      textInverse: '#ffffff',
      accent: '#3e8558',
      accentHover: '#4a9d68',
      accentMuted: '#d4e8db',
      accentSubtle: '#e6f2ea',
      danger: '#b5434a',
      dangerHover: '#cb6971',
      dangerMuted: '#f6d9dd',
      warning: '#9a7b3e',
      info: '#406d92',
      success: '#3e8558',
      focusRing: 'rgba(74, 157, 104, 0.4)',
      topbarBg: 'linear-gradient(180deg, #ffffff 0%, #f2efe6 100%)',
      statusbarBg: '#f6f3ea',
      statusbarFg: '#7a766d',
      panelBg: '#f6f3ea',
      panelBorder: '#d4cfc3',
      searchBg: 'rgba(246, 243, 234, 0.97)',
      searchBorder: '#c6bfb3',
      inputBg: '#ffffff',
      inputBorder: '#d4cfc3',
      inputFg: '#2d2b28',
      inputPlaceholder: '#9a958b',
      tabBgIdle: '#ece7dc',
      tabBgActive: '#ffffff',
      tabBgHover: '#f3efe6',
      tabFgIdle: '#5c5a54',
      tabFgActive: '#2d2b28',
      tabBorderIdle: '#e2ddd2',
      tabBorderActive: '#c6bfb3',
      tabIndicator: '#3e8558'
    },
    electronBgColor: THEME_META.paper.electronBgColor,
    appearance: THEME_META.paper.appearance
  },
  aurora: {
    terminal: {
      background: '#0a0e1a',
      foreground: '#d7ddff',
      cursor: '#77f0de',
      selectionBackground: '#2f3056',
      black: '#111427',
      red: '#ff7c9c',
      green: '#69e8b2',
      yellow: '#ffd178',
      blue: '#72a5ff',
      magenta: '#bf9cff',
      cyan: '#77f0de',
      white: '#e8edff',
      brightBlack: '#4d5679',
      brightRed: '#ffa3bb',
      brightGreen: '#95f7c9',
      brightYellow: '#ffe39b',
      brightBlue: '#9fc2ff',
      brightMagenta: '#d5beff',
      brightCyan: '#a4fff0',
      brightWhite: '#ffffff'
    },
    chrome: {
      ...defaultChrome,
      bgBase: '#0a0e1a',
      bgSurface: '#0e1323',
      bgElevated: '#141b30',
      bgInset: '#10172a',
      borderDefault: '#2b3557',
      borderSubtle: '#202948',
      borderStrong: '#3b4e7f',
      borderAccent: 'rgba(119, 240, 222, 0.35)',
      textPrimary: '#d7ddff',
      textSecondary: '#a7b2de',
      textMuted: '#7682b1',
      accent: '#77f0de',
      accentHover: '#93f7e8',
      accentMuted: '#1d4152',
      accentSubtle: '#132d38',
      info: '#72a5ff',
      topbarBg: 'linear-gradient(180deg, #161b34 0%, #10172a 100%)',
      statusbarBg: '#0e1323',
      statusbarFg: '#7481b0',
      tabBgIdle: '#10172a',
      tabBgActive: '#141b30',
      tabBgHover: '#1b2440',
      tabFgIdle: '#98a5d3',
      tabFgActive: '#e3e8ff',
      tabBorderIdle: '#202948',
      tabBorderActive: '#3b4e7f',
      tabIndicator: 'linear-gradient(90deg, #77f0de 0%, #bf9cff 100%)'
    },
    electronBgColor: THEME_META.aurora.electronBgColor,
    appearance: THEME_META.aurora.appearance
  },
  noir: {
    terminal: {
      background: '#000000',
      foreground: '#ffffff',
      cursor: '#00ff88',
      selectionBackground: '#1a1a1a',
      black: '#000000',
      red: '#ff5f5f',
      green: '#00ff88',
      yellow: '#ffd000',
      blue: '#66b3ff',
      magenta: '#ff8cff',
      cyan: '#52ffff',
      white: '#ffffff',
      brightBlack: '#555555',
      brightRed: '#ff9090',
      brightGreen: '#66ffb3',
      brightYellow: '#ffe680',
      brightBlue: '#99ccff',
      brightMagenta: '#ffb8ff',
      brightCyan: '#9fffff',
      brightWhite: '#ffffff'
    },
    chrome: {
      ...defaultChrome,
      bgBase: '#000000',
      bgSurface: '#050505',
      bgElevated: '#101010',
      bgOverlay: 'rgba(0, 0, 0, 0.94)',
      bgInset: '#0a0a0a',
      borderDefault: '#333333',
      borderSubtle: '#2a2a2a',
      borderStrong: '#444444',
      borderAccent: 'rgba(0, 255, 136, 0.45)',
      textPrimary: '#ffffff',
      textSecondary: '#d2d2d2',
      textMuted: '#9c9c9c',
      textDisabled: '#6f6f6f',
      textInverse: '#000000',
      accent: '#00ff88',
      accentHover: '#66ffb3',
      accentMuted: '#0e3b26',
      accentSubtle: '#092117',
      danger: '#ff5f5f',
      dangerHover: '#ff9090',
      dangerMuted: '#472020',
      warning: '#ffd000',
      info: '#66b3ff',
      success: '#00ff88',
      focusRing: 'rgba(0, 255, 136, 0.55)',
      topbarBg: 'linear-gradient(180deg, #0f0f0f 0%, #090909 100%)',
      statusbarBg: '#050505',
      statusbarFg: '#9c9c9c',
      panelBg: '#050505',
      panelBorder: '#333333',
      searchBg: 'rgba(0, 0, 0, 0.94)',
      searchBorder: '#444444',
      inputBg: '#000000',
      inputBorder: '#333333',
      inputFg: '#ffffff',
      inputPlaceholder: '#6f6f6f',
      tabBgIdle: '#0a0a0a',
      tabBgActive: '#101010',
      tabBgHover: '#161616',
      tabFgIdle: '#d2d2d2',
      tabFgActive: '#ffffff',
      tabBorderIdle: '#2a2a2a',
      tabBorderActive: '#444444',
      tabIndicator: '#00ff88'
    },
    electronBgColor: THEME_META.noir.electronBgColor,
    appearance: THEME_META.noir.appearance
  },
  fog: {
    terminal: {
      background: '#1c1b1f',
      foreground: '#c8c3d4',
      cursor: '#a89ed0',
      selectionBackground: '#3a3543',
      black: '#1a181d',
      red: '#d08da0',
      green: '#93b79f',
      yellow: '#c7b07f',
      blue: '#8da5d3',
      magenta: '#a893cf',
      cyan: '#84b8c6',
      white: '#d7d2e4',
      brightBlack: '#5e576d',
      brightRed: '#e1a9b9',
      brightGreen: '#aed0b6',
      brightYellow: '#d8c194',
      brightBlue: '#a6bbe2',
      brightMagenta: '#bca9de',
      brightCyan: '#a4cfda',
      brightWhite: '#f0ebff'
    },
    chrome: {
      ...defaultChrome,
      bgBase: '#1c1b1f',
      bgSurface: '#222026',
      bgElevated: '#2a2731',
      bgInset: '#24212b',
      borderDefault: '#423c50',
      borderSubtle: '#373143',
      borderStrong: '#5a536b',
      borderAccent: 'rgba(139, 123, 181, 0.35)',
      textPrimary: '#c8c3d4',
      textSecondary: '#aaa3bd',
      textMuted: '#8a829f',
      textDisabled: '#6a637b',
      accent: '#8b7bb5',
      accentHover: '#9d8bc6',
      accentMuted: '#3b3252',
      accentSubtle: '#2b243d',
      danger: '#d08da0',
      dangerHover: '#e1a9b9',
      dangerMuted: '#553945',
      warning: '#c7b07f',
      info: '#8da5d3',
      success: '#93b79f',
      focusRing: 'rgba(139, 123, 181, 0.5)',
      topbarBg: 'linear-gradient(180deg, #2a2731 0%, #24212b 100%)',
      statusbarBg: '#222026',
      statusbarFg: '#8a829f',
      panelBg: '#222026',
      panelBorder: '#423c50',
      searchBg: 'rgba(34, 32, 38, 0.95)',
      searchBorder: '#5a536b',
      inputBg: '#1c1b1f',
      inputBorder: '#423c50',
      inputFg: '#c8c3d4',
      inputPlaceholder: '#6a637b',
      tabBgIdle: '#24212b',
      tabBgActive: '#2a2731',
      tabBgHover: '#332f3c',
      tabFgIdle: '#aaa3bd',
      tabFgActive: '#d8d3e5',
      tabBorderIdle: '#373143',
      tabBorderActive: '#5a536b',
      tabIndicator: '#8b7bb5'
    },
    electronBgColor: THEME_META.fog.electronBgColor,
    appearance: THEME_META.fog.appearance
  },
  'catppuccin-latte': catppuccinTheme('catppuccin-latte'),
  'catppuccin-frappe': catppuccinTheme('catppuccin-frappe'),
  'catppuccin-macchiato': catppuccinTheme('catppuccin-macchiato'),
  'catppuccin-mocha': catppuccinTheme('catppuccin-mocha')
};

const chromeVarMap: Record<keyof ThemeChrome, string> = {
  bgBase: '--color-bg-base',
  bgSurface: '--color-bg-surface',
  bgElevated: '--color-bg-elevated',
  bgOverlay: '--color-bg-overlay',
  bgInset: '--color-bg-inset',
  borderDefault: '--color-border-default',
  borderSubtle: '--color-border-subtle',
  borderStrong: '--color-border-strong',
  borderAccent: '--color-border-accent',
  textPrimary: '--color-text-primary',
  textSecondary: '--color-text-secondary',
  textMuted: '--color-text-muted',
  textDisabled: '--color-text-disabled',
  textInverse: '--color-text-inverse',
  accent: '--color-accent',
  accentHover: '--color-accent-hover',
  accentMuted: '--color-accent-muted',
  accentSubtle: '--color-accent-subtle',
  danger: '--color-danger',
  dangerHover: '--color-danger-hover',
  dangerMuted: '--color-danger-muted',
  warning: '--color-warning',
  info: '--color-info',
  success: '--color-success',
  focusRing: '--color-focus-ring',
  topbarBg: '--topbar-bg',
  statusbarBg: '--statusbar-bg',
  statusbarFg: '--statusbar-fg',
  panelBg: '--panel-bg',
  panelBorder: '--panel-border',
  searchBg: '--search-bg',
  searchBorder: '--search-border',
  inputBg: '--input-bg',
  inputBorder: '--input-border',
  inputFg: '--input-fg',
  inputPlaceholder: '--input-placeholder',
  tabBgIdle: '--tab-bg-idle',
  tabBgActive: '--tab-bg-active',
  tabBgHover: '--tab-bg-hover',
  tabFgIdle: '--tab-fg-idle',
  tabFgActive: '--tab-fg-active',
  tabBorderIdle: '--tab-border-idle',
  tabBorderActive: '--tab-border-active',
  tabIndicator: '--tab-indicator'
};

export interface ResolvedThemeState {
  themeName: ThemeName;
  appearance: AppearanceMode;
  theme: FullTheme;
}

export function getTheme(name: ThemeName): FullTheme {
  return THEMES[name];
}

export function resolveThemeState(
  settings: Pick<AppSettings, 'theme' | 'appearancePreference'>,
  systemAppearance: AppearanceMode
): ResolvedThemeState {
  const appearance = resolveAppearance(settings.appearancePreference, systemAppearance);
  const themeName = resolveThemeName(settings.theme, appearance);
  const theme = getTheme(themeName);

  return {
    themeName,
    appearance: theme.appearance,
    theme
  };
}

export function applyThemeChrome(state: ResolvedThemeState, vibrancy: boolean): void {
  const root = document.documentElement;

  for (const [key, value] of Object.entries(state.theme.chrome) as [keyof ThemeChrome, string][]) {
    root.style.setProperty(chromeVarMap[key], value);
  }

  root.dataset.theme = state.themeName;
  root.dataset.appearance = state.appearance;
  root.dataset.vibrancy = vibrancy ? 'true' : 'false';
}
