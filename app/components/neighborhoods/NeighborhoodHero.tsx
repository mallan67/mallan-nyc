import SubwayBadge from './SubwayBadge';

interface NeighborhoodHeroProps {
  name: string;
  tagline: string;
  heroImage: string;
  transit: string[];
}

export default function NeighborhoodHero({
  name,
  tagline,
  heroImage,
  transit,
}: NeighborhoodHeroProps) {
  return (
    <section className="relative h-[340px] sm:h-[400px] md:h-[460px] overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />

      {/* Content */}
      <div className="relative h-full flex flex-col justify-end max-w-7xl mx-auto px-4 pb-8 sm:pb-12">
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
    </section>
  );
}
