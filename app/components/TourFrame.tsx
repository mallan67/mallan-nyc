import type { TourPresentation } from '@/lib/media/tour-presentation';

// The body of the Video and 3D Tour tabs on a listing page: an embedded player where the public policy allows framing the host, a video file the page plays itself, or a
// link that opens the host in a new tab (a blank iframe is what a host the policy blocks used to show). Renders nothing for an address that cannot be shown.
// The parent is `relative` and sized; the frame fills it.

const COPY = {
  video: { title: 'Video Tour', noun: 'video', allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' },
  '3d': { title: '3D Virtual Tour', noun: '3D tour', allow: 'fullscreen; xr-spatial-tracking' },
} as const;

function hostOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export default function TourFrame({ tour, variant }: { tour: TourPresentation; variant: 'video' | '3d' }) {
  const copy = COPY[variant];

  if (tour.kind === 'embed') {
    return <iframe src={tour.src} className="absolute inset-0 w-full h-full" allow={copy.allow} allowFullScreen title={copy.title} />;
  }

  if (tour.kind === 'file') {
    return <video src={tour.src} className="absolute inset-0 w-full h-full object-contain" controls playsInline preload="metadata" title={copy.title} />;
  }

  if (tour.kind === 'link') {
    const host = hostOf(tour.href);
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
        <p className="text-[13px] text-white/80">
          {host ? `This ${copy.noun} is hosted on ${host}.` : `This ${copy.noun} is hosted on its own site.`}
        </p>
        <a
          href={tour.href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-white px-4 py-2 text-[13px] font-medium text-brand-dark hover:bg-white/90"
        >
          Open the {copy.noun} in a new tab
        </a>
      </div>
    );
  }

  return null;
}
