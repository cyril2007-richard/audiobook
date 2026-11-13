/**
 * Lumen Design System — single source of truth for every screen.
 *
 * Import T from here instead of repeating raw hex strings.
 */

import '@/global.css';

import { Platform } from 'react-native';

// ─── Palette ────────────────────────────────────────────────────────────────
/** All dark-mode surface / text colours used across screens. */
export const C = {
  // Backgrounds (darkest → lightest)
  bg:          '#000000',   // pure AMOLED background (tabs, library)
  bgDeep:      '#000000',   // deep surface (player, book, settings)
  bgCard:      '#0F1014',   // card background (home hero, search)
  bgElevated:  '#131519',   // slightly lifted card (book detail, chapter rows)
  bgSheet:     '#131519',   // bottom-sheet / modal background
  bgOption:    '#1A1C22',   // option pill / speed button background

  // Borders
  border:      'rgba(255,255,255,0.08)',
  borderFaint: 'rgba(255,255,255,0.05)',

  // Text
  textPrimary:   '#FFFFFF',
  textSecondary: '#8E8E93',
  textTertiary:  '#6B7280',
  textMuted:     '#D1D5DB',

  // Accent (amber — overridden per-screen by extracted palette colour)
  accent:      '#F59E0B',
  accentDim:   'rgba(245,158,11,0.15)',
  accentBorder:'rgba(245,158,11,0.30)',

  // Status
  success:     '#10B981',
  danger:      '#F87171',
  dangerBg:    '#261517',
  dangerBorder:'#542025',
} as const;

// ─── Radius ─────────────────────────────────────────────────────────────────
/** Consistent corner-radius scale. */
export const R = {
  xs:   8,
  sm:   10,
  md:   14,
  lg:   16,
  xl:   18,
  xxl:  22,
  pill: 999,
} as const;

// ─── Spacing ────────────────────────────────────────────────────────────────
export const S = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  h:   18,   // standard horizontal page padding
} as const;

// ─── Typography ─────────────────────────────────────────────────────────────
export const T = {
  heroTitle:   { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.8 },
  screenTitle: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.4 },
  title:       { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2 },
  body:        { fontSize: 15, fontWeight: '500' as const },
  bodyStrong:  { fontSize: 15, fontWeight: '700' as const },
  label:       { fontSize: 13, fontWeight: '500' as const },
  labelStrong: { fontSize: 13, fontWeight: '700' as const },
  caption:     { fontSize: 12, fontWeight: '500' as const },
  captionStrong:{ fontSize: 12, fontWeight: '700' as const },
  micro:       { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.2, textTransform: 'uppercase' as const },
} as const;

// ─── Misc ────────────────────────────────────────────────────────────────────
/** Space to add at the bottom of scroll views so content clears the mini-player + tab bar. */
export const SCROLL_BOTTOM_INSET = 130;

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
