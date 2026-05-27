export function avatarStyle(
  pubkey: string,
  name?: string | null
): { bg: string; fg: string; initial: string } {
  const hex = pubkey.slice(0, 6).padEnd(6, '0');
  const bg = `#${hex}`;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const fg = luminance > 0.5 ? '#1a1a1a' : '#ffffff';

  const initial = name
    ? ((name.startsWith('npub1') ? name[5] : name[0])?.toUpperCase() ?? '')
    : '';
  return { bg, fg, initial };
}
