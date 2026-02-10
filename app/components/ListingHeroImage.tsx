'use client';

import { useState } from 'react';
import Image from 'next/image';

const PLACEHOLDER = '/images/listing-placeholder.svg';

interface ListingHeroImageProps {
  src: string;
  alt: string;
  children?: React.ReactNode;
}

/**
 * Hero image for listing detail pages.
 *
 * Real listing photos (IDX/Trestle or R2) use native <img> to avoid
 * Vercel Image Optimization costs — both sources are pre-optimized.
 * Only the local SVG placeholder uses next/image.
 */
export default function ListingHeroImage({ src, alt, children }: ListingHeroImageProps) {
  const isPlaceholder = !src || src === PLACEHOLDER;
  const [failed, setFailed] = useState(false);
  const showPlaceholder = isPlaceholder || failed;

  return (
    <section className={showPlaceholder ? 'bg-gray-100' : 'bg-gray-200'}>
      <div className="max-w-7xl mx-auto">
        <div className="relative aspect-[16/9] md:aspect-[21/9]">
          {showPlaceholder ? (
            <Image
              src={PLACEHOLDER}
              alt={alt}
              fill
              className="object-contain p-8"
              priority
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={src}
              alt={alt}
              loading="eager"
              decoding="sync"
              onError={() => setFailed(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {children}
        </div>
      </div>
    </section>
  );
}
