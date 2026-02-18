import SubwayBadge from './SubwayBadge';

interface NeighborhoodHeroProps {
  name: string;
  tagline: string;
  heroImage: string;
  transit: string[];
  children?: React.ReactNode;
}

export default function NeighborhoodHero({
  name,
  tagline,
  heroImage,
  transit,
  children,
}: NeighborhoodHeroProps) {
  return (
    <section className="relative h-[380px] sm:h-[440px] md:h-[500px] overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

      {/* Content */}
      <div className="relative h-full flex flex-col justify-between max-w-7xl mx-auto px-4">
        {/* Breadcrumb at top */}
        <div className="pt-20 sm:pt-24">
          {children}
        </div>

        {/* Title at bottom */}
        <div className="pb-8 sm:pb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-sans font-semibold text-white tracking-tight">
            {name}
          </h1>
          <p className="mt-2 text-lg sm:text-xl text-white/80 font-light">
            {tagline}
          </p>
          {transit.length > 0 && (
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              {transit.map((line) => (
                <SubwayBadge key={line} line={line} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
