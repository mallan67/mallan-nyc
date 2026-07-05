/**
 * Normalize a YouTube/Vimeo share URL to its embeddable form. The live REBNY IDX Plus feed
 * delivers video as `VirtualTourURLUnbranded` YouTube links in `watch?v=` / `youtu.be` /
 * `shorts/` form, which YouTube refuses to render in an <iframe> (X-Frame-Options). Convert
 * to the `/embed/` form so it actually plays. Non-YouTube/Vimeo URLs pass through unchanged.
 */
export function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (host.endsWith('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return url;
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      const shorts = u.pathname.match(/^\/shorts\/([^/]+)/);
      if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    /* not a parseable URL — leave as-is */
  }
  return url;
}
