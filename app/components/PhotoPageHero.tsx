import Image from 'next/image';

/**
 * PhotoPageHero — short photo banner for content pages (Sell, About, Agents).
 * Photo-forward, not a flat dark block. Headline pinned to bottom-left.
 * Height is clamped so it's never too tall on 13" or too short on 4K.
 */

interface PhotoPageHeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  image?: string;
  focus?: string;
}

export default function PhotoPageHero({
  eyebrow,
  title,
  subtitle,
  image = '/images/hero.jpg',
  focus = 'center 35%',
}: PhotoPageHeroProps) {
  return (
    <section
      className="relative overflow-hidden"
      style={{ height: 'clamp(200px, 36vh, 360px)' }}
    >
      {/* Photo with Ken Burns — inside overflow:hidden so scale stays clipped */}
      <div className="absolute inset-[-5%] animate-ken-burns">
        <Image
          src={image}
          alt=""
          fill
          className="object-cover"
          style={{
            objectPosition: focus,
            filter: 'saturate(1.1) contrast(1.05)',
          }}
          priority
          quality={92}
          unoptimized
        />
      </div>

      {/* Dark gradient overlay */}
      <div
        className="absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0.5) 100%)',
        }}
      />

      {/* Content pinned to bottom-left */}
      <div className="absolute bottom-0 left-0 right-0 z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 sm:pb-8">
        {eyebrow && (
          <p className="text-[10px] font-black tracking-[0.3em] uppercase text-[#C4A052] mb-2">
            {eyebrow}
          </p>
        )}
        <h1
          className="font-sans font-black text-3xl sm:text-4xl md:text-5xl text-white leading-none tracking-tight"
          style={{ textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm text-white/55 max-w-xl">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
