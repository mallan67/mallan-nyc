'use client';

import { useState, useEffect } from 'react';

/**
 * SchoolInfo — Nearby Schools section for listing detail pages.
 *
 * FAIR HOUSING COMPLIANCE: Displays factual data only (name, grades, district, distance).
 * NO ratings, rankings, quality descriptors, or subjective language.
 * Data source: NYC DOE School Directory via NYC OpenData.
 */

interface School {
  name: string;
  grades: string;
  level: string;
  address: string;
  zip: string;
  district: string;
  distance: number;
}

interface SchoolGroup {
  level: string;
  schools: School[];
}

interface SchoolInfoProps {
  latitude: number;
  longitude: number;
}

/** Level icon SVGs */
function LevelIcon({ level }: { level: string }) {
  if (level === 'Elementary') {
    return (
      <svg className="w-4 h-4 text-brand-gold-deep flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    );
  }
  if (level === 'Middle') {
    return (
      <svg className="w-4 h-4 text-brand-gold-deep flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    );
  }
  // High School
  return (
    <svg className="w-4 h-4 text-brand-gold-deep flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
    </svg>
  );
}

export default function SchoolInfo({ latitude, longitude }: SchoolInfoProps) {
  const [groups, setGroups] = useState<SchoolGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchSchools() {
      try {
        const res = await fetch(
          `/api/schools/nearby?lat=${latitude}&lng=${longitude}&radius=1600`
        );
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (!cancelled) {
          setGroups(data.groups || []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    fetchSchools();
    return () => { cancelled = true; };
  }, [latitude, longitude]);

  // Don't render if no data or error
  if (error || (!loading && groups.length === 0)) return null;

  // Count total schools
  const totalSchools = groups.reduce((sum, g) => sum + g.schools.length, 0);

  return (
    <section className="py-6 border-t border-black/[0.06]">
      {/* Header — always visible, clickable to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between group cursor-pointer"
        aria-expanded={expanded}
      >
        <h2 className="font-display font-semibold text-lg text-brand-dark">
          Nearby Schools
        </h2>
        <div className="flex items-center gap-2">
          {!loading && (
            <span className="text-xs text-brand-dark/50">
              {totalSchools} {totalSchools === 1 ? 'school' : 'schools'} within 1 mile
            </span>
          )}
          <svg
            className={`w-5 h-5 text-brand-dark/40 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse flex gap-3 items-center">
                  <div className="w-4 h-4 bg-black/5 rounded" />
                  <div className="h-4 bg-black/5 rounded w-48" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.level}>
                  {/* Level header */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <LevelIcon level={group.level} />
                    <h3 className="text-[13px] font-semibold text-brand-dark/70 uppercase tracking-wide">
                      {group.level}
                    </h3>
                  </div>

                  {/* Schools list */}
                  <div className="space-y-1.5 ml-6">
                    {group.schools.map((school, idx) => (
                      <div
                        key={`${school.name}-${idx}`}
                        className="flex items-start justify-between gap-3 py-2 px-3 rounded-lg bg-black/[0.02] hover:bg-black/[0.04] transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-brand-dark truncate">
                            {school.name}
                          </p>
                          <p className="text-[11px] text-brand-dark/50 mt-0.5">
                            {school.grades && `Grades ${school.grades}`}
                            {school.grades && school.district && ' · '}
                            {school.district}
                          </p>
                        </div>
                        <span className="text-[11px] text-brand-dark/40 whitespace-nowrap flex-shrink-0 pt-0.5">
                          {school.distance < 0.1
                            ? '< 0.1 mi'
                            : `${school.distance.toFixed(1)} mi`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Disclaimer — REQUIRED for compliance */}
              <p className="text-[10px] text-brand-dark/40 mt-4 leading-relaxed">
                School assignments are determined by the NYC Department of Education and
                may change. Verify current zoning at{' '}
                <a
                  href="https://schoolsearch.schools.nyc/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-brand-dark/60"
                >
                  schools.nyc.gov
                </a>
                . Data from NYC OpenData DOE School Directory.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
