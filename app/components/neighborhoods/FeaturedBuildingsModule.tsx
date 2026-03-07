import type { FeaturedBuilding } from '@/lib/types/neighborhood';

interface FeaturedBuildingsModuleProps {
  name: string;
  buildings: FeaturedBuilding[];
}

export default function FeaturedBuildingsModule({
  name,
  buildings,
}: FeaturedBuildingsModuleProps) {
  if (!buildings.length) return null;

  return (
    <section
      aria-label={`Featured Buildings in ${name}`}
      className="py-10 sm:py-14 bg-gray-50/50"
    >
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl font-display font-semibold text-brand-dark mb-6">
          Featured Buildings in {name}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 overflow-x-auto sm:overflow-visible">
          {buildings.map((bldg) => (
            <div
              key={bldg.slug}
              className="glass-card rounded-3xl p-5 min-w-[280px]"
            >
              <h3 className="text-lg font-display font-semibold text-brand-dark">
                {bldg.name}
              </h3>
              {bldg.nickname && (
                <p className="text-sm text-brand-dark/85 italic">{bldg.nickname}</p>
              )}

              <dl className="mt-3 space-y-1.5 text-sm text-brand-dark/90">
                {bldg.architect && (
                  <div className="flex justify-between">
                    <dt className="text-brand-dark/85">Architect</dt>
                    <dd className="font-medium text-right">{bldg.architect}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-brand-dark/85">Built</dt>
                  <dd className="font-medium">{bldg.yearBuilt}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brand-dark/85">Type</dt>
                  <dd className="font-medium">{bldg.type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brand-dark/85">Units</dt>
                  <dd className="font-medium">{bldg.units}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brand-dark/85">Price Range</dt>
                  <dd className="font-medium">{bldg.priceRange}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
