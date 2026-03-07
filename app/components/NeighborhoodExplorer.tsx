'use client';

import { useState, useEffect, useMemo } from 'react';

interface POIItem {
  id: number;
  name: string;
  lat: number;
  lng: number;
  category: string;
}

interface CategoryData {
  category: string;
  group: string;
  icon: string;
  count: number;
  items: POIItem[];
}

interface NeighborhoodExplorerProps {
  latitude: number;
  longitude: number;
  address: string;
  borough?: string;
}

// Category icons (matching Corcoran/Local Logic style)
const CATEGORY_ICONS: Record<string, JSX.Element> = {
  shopping: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  ),
  groceries: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
    </svg>
  ),
  restaurants: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.379a48.474 48.474 0 00-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265z" />
    </svg>
  ),
  cafes: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21h7.5M12 3v.75m0 0c-3.038 0-5.878 1.262-7.5 3.374C6.122 4.012 8.962 3.75 12 3.75c3.038 0 5.878.262 7.5-2.376C17.878 4.012 15.038 3.75 12 3.75zM3 10.5h13.5a3 3 0 013 0v0a3 3 0 01-3 3H3v-3z" />
    </svg>
  ),
  daycares: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  schools: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
    </svg>
  ),
  health: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  ),
  banks: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
    </svg>
  ),
  parks: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  ),
  transit: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 17l-2 4m10-4l2 4M12 2v2m-4 0h8a3 3 0 013 3v8a3 3 0 01-3 3H8a3 3 0 01-3-3V7a3 3 0 013-3z" />
    </svg>
  ),
};

// Group order matching the screenshot
const GROUP_ORDER = ['Amenities', 'Education', 'Services', 'Lifestyle', 'Transport'];

// Marker colors per category
const MARKER_COLORS: Record<string, string> = {
  'Shopping': '#8B5CF6',
  'Groceries': '#10B981',
  'Restaurants': '#EF4444',
  'Cafes': '#F59E0B',
  'Daycares': '#EC4899',
  'Schools': '#3B82F6',
  'Health & Medical': '#EF4444',
  'Banks': '#6366F1',
  'Parks & Fitness': '#22C55E',
  'Transit': '#0EA5E9',
};

export default function NeighborhoodExplorer({
  latitude,
  longitude,
  address,
  borough,
}: NeighborhoodExplorerProps) {
  const [activeTab, setActiveTab] = useState<'poi' | 'community'>('poi');
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch(`/api/nearby-poi?lat=${latitude}&lng=${longitude}&radius=800`)
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [latitude, longitude]);

  const selectedItems = selectedCategory
    ? categories.find((c) => c.category === selectedCategory)?.items || []
    : [];

  const destination = encodeURIComponent(address + (borough ? `, ${borough}, NY` : ', New York, NY'));

  // Group categories for sidebar
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: categories.filter((c) => c.group === group),
  })).filter((g) => g.items.length > 0);

  // Community portrait scores (computed from POI density)
  const totalPOIs = categories.reduce((sum, c) => sum + c.count, 0);
  const transitCount = categories.find((c) => c.category === 'Transit')?.count || 0;
  const diningCount = (categories.find((c) => c.category === 'Restaurants')?.count || 0) +
    (categories.find((c) => c.category === 'Cafes')?.count || 0);
  const shoppingCount = (categories.find((c) => c.category === 'Shopping')?.count || 0) +
    (categories.find((c) => c.category === 'Groceries')?.count || 0);
  const schoolCount = (categories.find((c) => c.category === 'Schools')?.count || 0) +
    (categories.find((c) => c.category === 'Daycares')?.count || 0);

  // Simple walkability heuristic (0-10 based on POI density within 800m)
  const walkScore = Math.min(10, Math.round((totalPOIs / 15) * 10) / 10);
  const transitScore = Math.min(10, Math.round((transitCount / 3) * 10) / 10);
  const diningScore = Math.min(10, Math.round((diningCount / 10) * 10) / 10);
  const shoppingScore = Math.min(10, Math.round((shoppingCount / 8) * 10) / 10);

  if (!loading && categories.length === 0) return null;

  // Free Google Maps embed (no API key needed)
  const mapUrl = useMemo(
    () => `https://www.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`,
    [latitude, longitude]
  );

  return (
    <section>
      {/* Tab bar */}
      <div className="flex items-center border-b border-black/10 mb-0">
        <button
          onClick={() => setActiveTab('poi')}
          className={`px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.15em] transition-colors relative ${
            activeTab === 'poi'
              ? 'text-brand-dark'
              : 'text-brand-dark/40 hover:text-brand-dark/60'
          }`}
        >
          Points of Interest
          {activeTab === 'poi' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-gold" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('community')}
          className={`px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.15em] transition-colors relative ${
            activeTab === 'community'
              ? 'text-brand-dark'
              : 'text-brand-dark/40 hover:text-brand-dark/60'
          }`}
        >
          Community Portrait
          {activeTab === 'community' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-gold" />
          )}
        </button>
      </div>

      {/* ── POI Tab ── */}
      {activeTab === 'poi' && (
        <div className="flex flex-col md:flex-row border border-t-0 border-black/10 rounded-b-2xl overflow-hidden bg-white" style={{ minHeight: 420 }}>
          {/* Left: Categories sidebar */}
          <div className="w-full md:w-[260px] md:border-r border-black/10 overflow-y-auto" style={{ maxHeight: 420 }}>
            <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-brand-dark">Categories</span>
              {selectedCategory && (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="text-[11px] text-brand-gold-deep font-medium hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-8 bg-gray-50 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="py-1">
                {grouped.map(({ group, items }) => (
                  <div key={group}>
                    <p className="px-4 pt-3 pb-1 text-[11px] font-medium text-brand-dark/40 uppercase tracking-wider">
                      {group}
                    </p>
                    {items.map((cat) => (
                      <button
                        key={cat.category}
                        onClick={() => setSelectedCategory(
                          selectedCategory === cat.category ? null : cat.category
                        )}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          selectedCategory === cat.category
                            ? 'bg-brand-gold/10 text-brand-dark'
                            : 'text-brand-dark/70 hover:bg-black/[0.02]'
                        }`}
                      >
                        <span className={`flex-shrink-0 ${selectedCategory === cat.category ? 'text-brand-gold-deep' : 'text-brand-dark/40'}`}>
                          {CATEGORY_ICONS[cat.icon] || CATEGORY_ICONS.shopping}
                        </span>
                        <span className="text-[13px] font-medium flex-1">{cat.category}</span>
                        <span className="text-[11px] text-brand-dark/40 font-medium">{cat.count}</span>
                        <svg className="w-3.5 h-3.5 text-brand-dark/25 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Map + POI list */}
          <div className="flex-1 relative flex flex-col">
            {/* Map */}
            <div className="flex-1 relative" style={{ minHeight: 300 }}>
              <iframe
                src={mapUrl}
                width="100%"
                height="100%"
                style={{ border: 0, position: 'absolute', inset: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={`Neighborhood map near ${address}`}
              />
              {/* Calculate commute button */}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=transit`}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-3 right-3 z-10 inline-flex items-center gap-2 px-4 py-2 bg-brand-gold text-white text-[12px] font-semibold rounded-lg shadow-md hover:bg-brand-gold-deep transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Calculate Commute
              </a>
            </div>

            {/* Selected POI list (slides up when category selected) */}
            {selectedCategory && selectedItems.length > 0 && (
              <div className="border-t border-black/10 bg-white max-h-[160px] overflow-y-auto">
                <div className="px-4 py-2 bg-gray-50 border-b border-black/5 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-brand-dark">
                    {selectedCategory} <span className="text-brand-dark/40">({selectedItems.length})</span>
                  </span>
                </div>
                {selectedItems.map((item) => (
                  <a
                    key={item.id}
                    href={`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-black/5 hover:bg-black/[0.02] transition-colors group"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: MARKER_COLORS[selectedCategory] || '#C4A052' }}
                    />
                    <span className="text-[13px] text-brand-dark/80 group-hover:text-brand-dark flex-1 truncate">
                      {item.name}
                    </span>
                    <svg className="w-3 h-3 text-brand-dark/20 group-hover:text-brand-dark/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Community Portrait Tab ── */}
      {activeTab === 'community' && (
        <div className="border border-t-0 border-black/10 rounded-b-2xl overflow-hidden bg-white p-6">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-gray-50 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-[13px] text-brand-dark/60 leading-relaxed">
                Neighborhood profile based on {totalPOIs} nearby points of interest within a 10-minute walk.
              </p>

              {/* Score bars */}
              <div className="space-y-4">
                <ScoreBar label="Overall Walkability" score={walkScore} color="#C4A052" description={`${totalPOIs} nearby amenities`} />
                <ScoreBar label="Transit Access" score={transitScore} color="#0EA5E9" description={`${transitCount} transit stops nearby`} />
                <ScoreBar label="Dining & Cafes" score={diningScore} color="#EF4444" description={`${diningCount} restaurants & cafes`} />
                <ScoreBar label="Shopping & Groceries" score={shoppingScore} color="#8B5CF6" description={`${shoppingCount} shops & markets`} />
              </div>

              {/* Quick stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {categories.slice(0, 8).map((cat) => (
                  <div key={cat.category} className="text-center p-3 rounded-xl bg-black/[0.02]">
                    <span className="text-xl font-display font-bold text-brand-dark">{cat.count}</span>
                    <p className="text-[11px] text-brand-dark/50 mt-0.5">{cat.category}</p>
                  </div>
                ))}
              </div>

              {/* Direction links */}
              <div className="flex flex-wrap gap-2 pt-2">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=transit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded-xl hover:bg-blue-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 17l-2 4m10-4l2 4M12 2v2m-4 0h8a3 3 0 013 3v8a3 3 0 01-3 3H8a3 3 0 01-3-3V7a3 3 0 013-3z" />
                  </svg>
                  Transit Directions
                </a>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-50 text-green-700 text-xs font-medium rounded-xl hover:bg-green-100 transition-colors"
                >
                  Walking Directions
                </a>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 text-xs font-medium rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Driving Directions
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-brand-dark/30 mt-2">
        Points of interest data from OpenStreetMap contributors. Distances are approximate.
      </p>
    </section>
  );
}

/** Score bar component for Community Portrait */
function ScoreBar({ label, score, color, description }: {
  label: string;
  score: number;
  color: string;
  description: string;
}) {
  const pct = Math.min(100, (score / 10) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] font-medium text-brand-dark">{label}</span>
        <span className="text-[13px] font-display font-bold text-brand-dark">{score.toFixed(1)}<span className="text-brand-dark/40 font-normal">/10</span></span>
      </div>
      <div className="h-2 bg-black/[0.04] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[11px] text-brand-dark/40 mt-1">{description}</p>
    </div>
  );
}
