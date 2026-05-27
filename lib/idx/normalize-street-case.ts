const DIRECTION_ABBRS = new Set(['E', 'W', 'N', 'S', 'NE', 'NW', 'SE', 'SW']);

export function normalizeStreetCase(s: string): string {
  if (!s) return s;
  return s.split(' ').map(w => {
    const upper = w.toUpperCase();
    if (DIRECTION_ABBRS.has(upper)) return upper;
    if (/^\d+(ST|ND|RD|TH)$/i.test(w)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}
