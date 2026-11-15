import type { ThoughtKind } from '@/db/types';

/**
 * Engram's palette is "night water": a deep indigo field with four soft
 * signal colours, one per kind of thought. The graph is the only loud thing
 * on screen; every other surface stays quiet.
 */
export const colors = {
  ink: '#0A0E1F',
  inkRaised: '#121733',
  inkLifted: '#1A2147',
  line: 'rgba(160, 172, 255, 0.14)',
  lineStrong: 'rgba(160, 172, 255, 0.28)',
  text: '#E9ECFF',
  textSoft: '#A3ABD6',
  textFaint: '#6B739E',
  halo: '#1B2350',
  danger: '#FF8A8A',
} as const;

export const kindColor: Record<ThoughtKind, string> = {
  text: '#9AA8FF',
  voice: '#5FE3D0',
  link: '#FFC46B',
  image: '#F08BD0',
};

export const kindLabel: Record<ThoughtKind, string> = {
  text: 'Note',
  voice: 'Voice',
  link: 'Link',
  image: 'Image',
};

export const KINDS: ThoughtKind[] = ['text', 'voice', 'link', 'image'];

export const font = {
  regular: 'Sora_400Regular',
  medium: 'Sora_500Medium',
  semibold: 'Sora_600SemiBold',
} as const;

export const type = {
  display: { fontFamily: font.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  title: { fontFamily: font.semibold, fontSize: 19, lineHeight: 25, letterSpacing: -0.3 },
  body: { fontFamily: font.regular, fontSize: 15.5, lineHeight: 23 },
  bodyStrong: { fontFamily: font.medium, fontSize: 15.5, lineHeight: 23 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
} as const;

export const radius = { pill: 999, sheet: 28, card: 20, chip: 12 } as const;
export const space = { xs: 6, sm: 10, md: 16, lg: 24, xl: 36 } as const;
