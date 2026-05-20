const PALETTES = [
  { bg: '#fef9c3', fg: '#a16207' },
  { bg: '#ffe4e6', fg: '#be123c' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#f3e8ff', fg: '#7e22ce' },
  { bg: '#dbeafe', fg: '#1d4ed8' }
] as const;

export function avatarStyle(pubkey: string): { bg: string; fg: string; initial: string } {
  const idx = parseInt(pubkey[0] ?? '0', 16) % PALETTES.length;
  const palette = PALETTES[idx];
  return { bg: palette.bg, fg: palette.fg, initial: pubkey[0]?.toUpperCase() ?? '?' };
}
