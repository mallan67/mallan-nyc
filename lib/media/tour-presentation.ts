/**
 * How the public site shows a listing's video or 3D tour address (the REBNY feed delivers both in VirtualTourURLUnbranded / VirtualTourURLBranded; Cotality has no
 * video field). The address is provider data, so it is treated as untrusted:
 *
 *  - only http(s) is ever shown (a javascript: or data: address is neither framed nor linked);
 *  - a host the public Content-Security-Policy `frame-src` allows (lib/middleware/security-headers.ts) is shown in place, over https;
 *  - any other host opens in a new tab, as the CRM already does (a tour on streeteasy.com or drive.google.com rendered a blank box before: 5 of 19 public 3D tours
 *    in the first 1,000 listings, live 2026-11-20);
 *  - an address without https:// ("youtube.com/watch?v=...": 2 of 178 public videos) or with text before it ("_https://youtu.be/...") is repaired, not rendered as a
 *    relative path.
 *
 * PUBLIC_EMBED_HOSTS must stay inside the public frame-src (tests/runtime/listing-media-presentation.test.ts pins it). Adding a host here without adding it to the
 * policy would blank the frame; adding it to the policy is a security decision.
 */
export const PUBLIC_EMBED_HOSTS = ['www.youtube.com', 'player.vimeo.com', 'my.matterport.com'] as const;

export type TourPresentation =
  | { kind: 'embed'; src: string }
  | { kind: 'file'; src: string }
  | { kind: 'link'; href: string }
  | { kind: 'none' };

const NONE: TourPresentation = { kind: 'none' };
const VIDEO_FILE = /\.(mp4|mov|webm|m4v)$/i;
const YOUTUBE_ID = /^[\w-]{6,}$/;

/** The web address inside the value, or null. */
function toUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const inside = /https?:\/\/\S+/i.exec(trimmed)?.[0];
  const candidate = inside ?? (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(trimmed) ? `https://${trimmed}` : trimmed);
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

export function presentTour(raw: string | null | undefined): TourPresentation {
  const url = raw ? toUrl(raw) : null;
  if (!url) return NONE;
  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (VIDEO_FILE.test(url.pathname)) return { kind: 'file', src: url.href };

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    const id = host === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0] ?? ''
      : url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] || '';
    return YOUTUBE_ID.test(id) ? { kind: 'embed', src: `https://www.youtube.com/embed/${id}` } : { kind: 'link', href: url.href };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = url.pathname.match(/^\/(?:video\/)?(\d{5,})(?:\/([0-9a-f]{6,}))?/i);
    if (!match) return { kind: 'link', href: url.href };
    const hash = match[2] ?? url.searchParams.get('h');
    return { kind: 'embed', src: `https://player.vimeo.com/video/${match[1]}${hash ? `?h=${hash}` : ''}` };
  }

  if (host === 'my.matterport.com') return { kind: 'embed', src: `https://my.matterport.com${url.pathname}${url.search}` };

  return { kind: 'link', href: url.href };
}
