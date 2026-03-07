import type { StreetGuidance } from '@/lib/types/neighborhood';

interface StreetGuidanceSectionProps {
  name: string;
  guidance: StreetGuidance;
}

export default function StreetGuidanceSection({
  name,
  guidance,
}: StreetGuidanceSectionProps) {
  const hasContent =
    guidance.bestBlocksForParks.length > 0 ||
    guidance.bestBlocksForNightlife.length > 0 ||
    guidance.quietStreets.length > 0;

  if (!hasContent && !guidance.description) return null;

  return (
    <section
      aria-label={`${name} Street Guide`}
      className="py-10 sm:py-14"
    >
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl font-display font-semibold text-brand-dark mb-2">
          Broker&rsquo;s Street Guide
        </h2>
        <p className="text-brand-dark/90 mb-6 max-w-3xl">{guidance.description}</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {guidance.bestBlocksForParks.length > 0 && (
            <div className="bg-blue-50 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide mb-3">
                Near Parks &amp; Schools
              </h3>
              <ul className="space-y-1.5 text-sm text-blue-800">
                {guidance.bestBlocksForParks.map((block) => (
                  <li key={block}>{block}</li>
                ))}
              </ul>
            </div>
          )}

          {guidance.bestBlocksForNightlife.length > 0 && (
            <div className="bg-purple-50 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-purple-900 uppercase tracking-wide mb-3">
                Best for Nightlife
              </h3>
              <ul className="space-y-1.5 text-sm text-purple-800">
                {guidance.bestBlocksForNightlife.map((block) => (
                  <li key={block}>{block}</li>
                ))}
              </ul>
            </div>
          )}

          {guidance.quietStreets.length > 0 && (
            <div className="bg-green-50 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-green-900 uppercase tracking-wide mb-3">
                Quiet Streets
              </h3>
              <ul className="space-y-1.5 text-sm text-green-800">
                {guidance.quietStreets.map((street) => (
                  <li key={street}>{street}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
