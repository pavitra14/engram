import { useSQLiteContext } from 'expo-sqlite';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, AppState } from 'react-native';

import * as repo from '@/db/repo';
import type { ThoughtKind } from '@/db/types';

/**
 * Two themes share one set of token names. Light is cool paper with ink and a
 * cobalt accent. Black is true black for AMOLED screens, with an off-white
 * text colour and a lighter accent that keeps its contrast on black.
 * See docs/DESIGN.md.
 */
export type Palette = {
  bg: string;
  bgClear: string;
  surface: string;
  ink: string;
  soft: string;
  faint: string;
  line: string;
  rule: string;
  accent: string;
  onAccent: string;
  onInk: string;
  danger: string;
  highlight: string;
  scrim: string;
  groupFill: string[];
  groupLine: string[];
  groupText: string;
  connector: string;
};

const light: Palette = {
  bg: '#F3F4F1',
  bgClear: 'rgba(243,244,241,0)',
  surface: '#FFFFFF',
  ink: '#15171A',
  soft: '#5A5F66',
  faint: '#7A8088',
  line: '#D5D8D2',
  rule: '#DADDD6',
  accent: '#1F3FBF',
  onAccent: '#FFFFFF',
  onInk: '#FFFFFF',
  danger: '#B3261E',
  highlight: '#C7DEFF',
  scrim: 'rgba(21,23,26,0.45)',
  groupFill: ['#F8E5CB', '#E4E5FF', '#CBF1EB', '#FFDEDD', '#DAEFD6', '#D1ECFF', '#F8DFF5', '#EBEACC'],
  groupLine: ['#C69D63', '#9E9DDB', '#5BB7AC', '#D78E8D', '#86B37D', '#6EACD7', '#C590C0', '#ADA864'],
  groupText: '#3F444B',
  connector: '#9EA39B',
};

const black: Palette = {
  bg: '#000000',
  bgClear: 'rgba(0,0,0,0)',
  surface: '#111312',
  ink: '#E8EAE4',
  soft: '#A3A8A0',
  faint: '#7E847C',
  line: '#2A2D2B',
  rule: '#1F2220',
  accent: '#8FA6FF',
  onAccent: '#000000',
  onInk: '#000000',
  danger: '#F2B8B5',
  highlight: '#233971',
  scrim: 'rgba(0,0,0,0.6)',
  groupFill: ['#2F1E02', '#1F1E38', '#002925', '#361717', '#14270F', '#062437', '#2F182D', '#252302'],
  groupLine: ['#876125', '#64619B', '#087970', '#965253', '#4C7643', '#316F97', '#865582', '#716C26'],
  groupText: '#C9CEC6',
  connector: '#4A4E4B',
};

export const palettes = { light, black };

export const font = {
  serif: 'Newsreader_400Regular',
  serifMedium: 'Newsreader_500Medium',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

export const type = {
  display: { fontFamily: font.serifMedium, fontSize: 38, lineHeight: 44, letterSpacing: -0.8 },
  title: { fontFamily: font.serifMedium, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  thought: { fontFamily: font.serif, fontSize: 22, lineHeight: 30, letterSpacing: -0.1 },
  thoughtSmall: { fontFamily: font.serif, fontSize: 20, lineHeight: 27, letterSpacing: -0.1 },
  thoughtLarge: { fontFamily: font.serif, fontSize: 27, lineHeight: 36, letterSpacing: -0.3 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: font.medium, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: font.medium, fontSize: 15, lineHeight: 20 },
  labelStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
  small: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  smallStrong: { fontFamily: font.medium, fontSize: 14, lineHeight: 20 },
  meta: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
} as const;

export const space = { xs: 6, sm: 8, md: 16, lg: 24, xl: 36 } as const;

export const kindLabel: Record<ThoughtKind, string> = {
  text: 'Note',
  voice: 'Voice',
  link: 'Link',
  image: 'Image',
  video: 'Video',
  file: 'File',
};
export const KINDS: ThoughtKind[] = ['text', 'voice', 'link', 'image', 'video', 'file'];

export type AppearanceSetting = 'system' | 'light' | 'black';

type ThemeValue = {
  c: Palette;
  dark: boolean;
  appearance: AppearanceSetting;
  setAppearance: (a: AppearanceSetting) => void;
};

const ThemeContext = createContext<ThemeValue>({ c: light, dark: false, appearance: 'system', setAppearance: () => {} });

/**
 * The phone's light/dark setting, read fresh.
 *
 * React Native caches the colour scheme in JS and only updates it from a
 * change event. If the setting changes while the app has no activity (after
 * leaving through the share sheet, say), no event arrives and the cache goes
 * stale. Resetting the override makes React Native re-read the real value.
 */
function readSystemScheme(): 'light' | 'dark' {
  Appearance.setColorScheme('unspecified');
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [system, setSystem] = useState<'light' | 'dark'>(readSystemScheme);
  const [appearance, setState] = useState<AppearanceSetting>('system');

  useEffect(() => {
    const scheme = Appearance.addChangeListener((p) => setSystem(p.colorScheme === 'dark' ? 'dark' : 'light'));
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') setSystem(readSystemScheme());
    });
    return () => {
      scheme.remove();
      app.remove();
    };
  }, []);

  useEffect(() => {
    repo.getMeta(db, 'appearance').then((v) => {
      if (v === 'light' || v === 'black' || v === 'system') setState(v);
    });
  }, [db]);

  const setAppearance = useCallback(
    (a: AppearanceSetting) => {
      setState(a);
      repo.setMeta(db, 'appearance', a).catch(() => {});
    },
    [db],
  );

  const value = useMemo<ThemeValue>(() => {
    const dark = appearance === 'black' || (appearance === 'system' && system === 'dark');
    return { c: dark ? black : light, dark, appearance, setAppearance };
  }, [appearance, system, setAppearance]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
