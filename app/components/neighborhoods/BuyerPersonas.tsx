import type { BuyerPersona } from '@/lib/types/neighborhood';

interface BuyerPersonasProps {
  name: string;
  personas: BuyerPersona[];
}

export default function BuyerPersonas({ name, personas }: BuyerPersonasProps) {
  if (!personas.length) return null;

  return (
    <section
      aria-label={`Buying in ${name}`}
      className="py-10 sm:py-14 bg-stone-50/50"
    >
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl font-display font-semibold text-brand-dark mb-6">
          Buying in {name}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {personas.map((persona) => (
            <div
              key={persona.type}
              className="glass-card rounded-3xl p-5"
            >
              <h3 className="text-base font-display font-semibold text-brand-dark mb-2">
                {persona.type}
              </h3>
              <p className="text-sm text-brand-dark/60 mb-3">{persona.description}</p>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-brand-dark/50">Budget</dt>
                  <dd className="font-medium text-brand-dark">
                    {persona.budgetRange}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brand-dark/50">Looking for</dt>
                  <dd className="font-medium text-brand-dark">
                    {persona.propertyType}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        {/* Fair Housing Disclaimer - REQUIRED per UCBA Exhibit C / C18 */}
        <p className="mt-6 text-xs text-brand-dark/50 max-w-3xl">
          Neighborhood profiles are for informational purposes only and do not
          represent or target any protected class under Fair Housing law.
          Lifestyle descriptions are based on market and financial
          characteristics, not demographic attributes.
        </p>
      </div>
    </section>
  );
}
