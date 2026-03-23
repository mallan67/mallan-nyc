'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';
import { getAllNeighborhoods } from '@/lib/neighborhoods/boroughs';

function getNeighborhoodHref(slug: string, borough: string): string {
  const boroughSlug = borough.toLowerCase().replace(/\s+/g, '-');
  return `/${boroughSlug}/${slug}`;
}

/** Featured neighborhoods for the homepage (curated order) */
const FEATURED_SLUGS = [
  'upper-east-side',
  'upper-west-side',
  'tribeca',
  'soho',
  'chelsea',
  'greenwich-village',
];

function NeighborhoodCard({
  neighborhood,
}: {
  neighborhood: { slug: string; name: string; tagline: string; heroImage: string; inventory: number; borough: string };
}) {
  return (
    <Link
      href={getNeighborhoodHref(neighborhood.slug, neighborhood.borough)}
      className="hood-card group block relative overflow-hidden rounded-3xl aspect-[3/4] cursor-pointer"
    >
      <div className="absolute inset-0 bg-gray-300">
        <Image
          src={neighborhood.heroImage}
          alt={neighborhood.name}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 16vw"
          loading="lazy"
          style={{
            animation: 'liquidMotion 14s ease-in-out infinite',
            transformOrigin: '50% 50%',
          }}
        />
      </div>
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <p className="font-display font-semibold text-white text-sm">{neighborhood.name}</p>
        <p className="text-white/40 text-[11px] font-light">
          {neighborhood.inventory} listings
        </p>
      </div>
    </Link>
  );
}

export default function ExploreNeighborhoods() {
  const gridRef = useGsapReveal<HTMLDivElement>({
    children: true,
    y: 40,
    scale: 0.96,
    ease: 'back.out(1.4)',
    stagger: 0.06,
  });

  const allNeighborhoods = getAllNeighborhoods();
  const featured = FEATURED_SLUGS.map((slug) => {
    const n = allNeighborhoods.find((nb) => nb.slug === slug);
    return n
      ? {
          slug: n.slug,
          name: n.name,
          tagline: n.tagline,
          heroImage: n.heroImage,
          inventory: n.marketStats?.inventory ?? 0,
          borough: n.borough ?? 'Manhattan',
        }
      : null;
  }).filter(Boolean) as { slug: string; name: string; tagline: string; heroImage: string; inventory: number; borough: string }[];

  return (
    <section className="px-6 md:px-12 lg:px-20 py-16 md:py-20 lg:py-24">
      <div className="max-w-[1440px] mx-auto">
        {/* Section header */}
        <div className="flex items-end justify-between mb-12 md:mb-16">
          <div>
            <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">Explore</p>
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
              Neighborhoods
            </h2>
          </div>
          <Link
            href="/neighborhoods"
            className="text-[13px] font-light text-brand-dark/85 hover:text-brand-dark transition-all duration-500 hidden sm:block"
          >
            All 59 &rarr;
          </Link>
        </div>

        {/* Portrait card grid */}
        <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
          {featured.map((neighborhood) => (
            <NeighborhoodCard key={neighborhood.slug} neighborhood={neighborhood} />
          ))}
        </div>

        <div className="mt-10 sm:mt-12 text-center sm:hidden">
          <Link
            href="/neighborhoods"
            className="text-[13px] font-light text-brand-dark/85 hover:text-brand-dark transition-all duration-500"
          >
            All 59 &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
