/**
 * PageHero — dark typographic hero banner for all inner pages.
 * Replaces the bare "pt-20" gap that every inner page currently has.
 * Consistent with homepage dark sections. Font-black, confident, premium.
 */

interface PageHeroProps {
  /** Gold uppercase label above the headline */
  eyebrow?: string;
  /** Main headline — use a period at the end for confidence ("Buy in NYC.") */
  title: string;
  /** Optional second line in a lighter weight */
  subtitle?: string;
  /** Align content — left (default) or center */
  align?: 'left' | 'center';
  /** Extra bottom padding when search filters follow immediately */
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

  return (
    <section
      className={`bg-gray-950 px-4 ${
        compact
          ? 'pt-32 sm:pt-36 pb-10 sm:pb-12'
          : 'pt-36 sm:pt-40 md:pt-44 pb-16 sm:pb-20 md:pb-24'
      } ${center ? 'text-center' : ''}`}
    >
      <div className="max-w-7xl mx-auto">
        {eyebrow && (
          <p className="text-[11px] font-black tracking-[0.3em] uppercase text-[#C4A052] mb-4">
            {eyebrow}
          </p>
        )}
        {/* Gold rule */}
        <span className="gold-rule mb-6 block" style={{ marginLeft: center ? 'auto' : undefined, marginRight: center ? 'auto' : undefined }} />

        <h1 className="font-sans font-black text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-none tracking-tight max-w-4xl">
          {title}
        </h1>

        {subtitle && (
          <p className="mt-6 text-base sm:text-lg text-white/45 max-w-xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
