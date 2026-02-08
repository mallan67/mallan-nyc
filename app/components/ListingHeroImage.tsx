'use client';

import { useState } from 'react';
import Image from 'next/image';

const PLACEHOLDER = '/images/listing-placeholder.svg';

interface ListingHeroImageProps {
  src: string;
  alt: string;
  children?: React.ReactNode;
}

export default function ListingHeroImage({ src, alt, children }: ListingHeroImageProps) {
  const isPlaceholder = !src || src === PLACEHOLDER;
  const [failed, setFailed] = useState(false);
  const showPlaceholder = isPlaceholder || failed;

  return (
    <section className={showPlaceholder ? 'bg-gray-100' : 'bg-gray-200'}>
      <div className="max-w-7xl mx-auto">
        <div className="relative aspect-[16/9] md:aspect-[21/9]">
          <Image
            src={failed ? PLACEHOLDER : src || PLACEHOLDER}
            alt={alt}
            fill
            className={showPlaceholder ? 'object-contain p-8' : 'object-cover'}
            priority
            onError={() => setFailed(true)}
          />
          {children}
        </div>
      </div>
    </section>
  );
}
