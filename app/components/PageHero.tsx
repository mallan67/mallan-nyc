/**
 * PageHero — banner for inner pages.
 * compact = lean strip above search filters (buy/rent)
 * default = generous section for content pages (about/sell/agents)
 */

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
  compact?: boolean;
}

export default function PageHero({
  eyebrow,
  title,
  subtitle,
  align = 'left',
  compact = false,
}: PageHeroProps) {
  const center = align === 'center';

  if (compact) {
    return (
      <section className={`bg-gray-900 px-4 pt-24 pb-5 sm:pt-28 sm:pb-6 ${center ? 'text-center' : ''}`}>
        <div className="max-w-7xl mx-auto">
          <h1 className="font-sans font-black text-2xl sm:text-3xl md:text-4xl text-white leading-none tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm text-white/50 max-w-xl">
              {subtitle}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={`bg-gray-900 px-4 pt-32 sm:pt-36 md:pt-40 pb-14 sm:pb-16 md:pb-20 ${center ? 'text-center' : ''}`}>
      <div className="max-w-7xl mx-auto">
        {eyebrow && (
          <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-4">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-white leading-none tracking-tight max-w-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-5 text-base sm:text-lg text-white/50 max-w-xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
