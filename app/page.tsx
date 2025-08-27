'use client';

import React, { useMemo, useState } from 'react';

/**
 * Mallan Real Estate Inc — Home
 * - Luxury hero with translucent centered search
 * - Clean, responsive filter card
 * - Lightweight demo listings (replace with live feed later)
 */

// ---------------------------------------------------------
// Minimal demo data so the page renders something useful
// ---------------------------------------------------------
type Listing = {
  id: string;
  address: string;
  neighborhood: string;
  borough: string;
  price: number;
  rent?: boolean;
  beds?: number;
  baths?: number;
  media: string[];
  exclusive?: boolean;
};

const MOCK: Listing[] = [
  {
    id: 'in1',
    address: '333 E 46th St #12A',
    neighborhood: 'Midtown East',
    borough: 'Manhattan',
    price: 799000,
    beds: 1,
    baths: 1,
    media: ['https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1600&q=80&auto=format&fit=crop'],
    exclusive: true,
  },
  {
    id: 'in2',
    address: '301 E 48th St #5C',
    neighborhood: 'Turtle Bay',
    borough: 'Manhattan',
    price: 4200,
    rent: true,
    beds: 0,
    baths: 1,
    media: ['https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1600&q=80&auto=format&fit=crop'],
    exclusive: true,
  },
  {
    id: 'ex1',
    address: '245 E 47th St #9F',
    neighborhood: 'Midtown East',
    borough: 'Manhattan',
    price: 725000,
    beds: 1,
    baths: 1,
    media: ['https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1600&q=80&auto=format&fit=crop'],
  },
];

function usd(n: number) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// ---------------------------------------------------------
// FilterBar — translucent, centered, responsive
// ---------------------------------------------------------
function FilterBar({ onApply }: { onApply: (f: Record<string, any>) => void }) {
  const [useClass, setUseClass] = useState<'res' | 'com' | 'intl'>('res'); // default Residential
  const [tenure, setTenure] = useState<'sale' | 'rent'>('sale');
  const [beds, setBeds] = useState<string>('');  // res only
  const [baths, setBaths] = useState<string>(''); // res only
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [borough, setBorough] = useState<string>('Manhattan');
  const [neighborhood, setNeighborhood] = useState<string>('Midtown East');
  const [amenities, setAmenities] = useState<string[]>([]); // roof deck, rec room, business center etc.

  const toggle = (v: string) =>
    setAmenities((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]));

  return (
    <div className="space-y-3">
      {/* top row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <select value={useClass} onChange={(e) => setUseClass(e.target.value as any)} className="border rounded-xl p-2">
          <option value="res">Residential</option>
          <option value="com">Commercial</option>
          <option value="intl">USA & International</option>
        </select>

        <select value={tenure} onChange={(e) => setTenure(e.target.value as any)} className="border rounded-xl p-2">
          <option value="sale">Buy / For Sale</option>
          <option value="rent">Rent</option>
        </select>

        {useClass === 'res' ? (
          <>
            <select value={beds} onChange={(e) => setBeds(e.target.value)} className="border rounded-xl p-2">
              <option value="">Beds</option>
              <option value="0">Studio</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4plus">4+</option>
            </select>
            <select value={baths} onChange={(e) => setBaths(e.target.value)} className="border rounded-xl p-2">
              <option value="">Baths</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
            </select>
          </>
        ) : (
          <>
            <input disabled className="border rounded-xl p-2 bg-slate-100 text-slate-400" placeholder="Beds (N/A)" />
            <input disabled className="border rounded-xl p-2 bg-slate-100 text-slate-400" placeholder="Baths (N/A)" />
          </>
        )}
      </div>

      {/* price + location */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <input
          placeholder="Min $"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          className="border rounded-xl p-2"
        />
        <input
          placeholder="Max $"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          className="border rounded-xl p-2"
        />
        <select value={borough} onChange={(e) => setBorough(e.target.value)} className="border rounded-xl p-2">
          <option>Manhattan</option>
          <option>Brooklyn</option>
          <option>Queens</option>
          <option>Bronx</option>
          <option>Staten Island</option>
        </select>
        <input
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          placeholder="Neighborhood"
          className="border rounded-xl p-2"
        />
      </div>

      {/* amenity chips */}
      <div className="flex flex-wrap gap-2">
        {['roof deck', 'recreation room', 'business center', 'Land-Lease: Allowed'].map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => toggle(a)}
            className={`px-3 py-1 rounded-full border text-sm ${
              amenities.includes(a) ? 'bg-black text-white' : 'bg-white'
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <button
          className="px-5 py-2 rounded-xl bg-black text-white"
          onClick={() =>
            onApply({
              useClass,
              tenure,
              beds,
              baths,
              minPrice,
              maxPrice,
              borough,
              neighborhood,
              amenities,
            })
          }
        >
          Search
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Listing card (simple, clean)
// ---------------------------------------------------------
function Card({ l }: { l: Listing }) {
  return (
    <div className="rounded-2xl border overflow-hidden bg-white">
      <img src={l.media[0]} alt={l.address} className="w-full h-44 object-cover" />
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">
            {usd(l.price)} {l.rent ? '/ mo' : ''}
          </div>
          {l.exclusive && <span className="text-xs border rounded px-2 py-0.5">Exclusive</span>}
        </div>
        <div className="text-sm text-slate-600 mt-1">{l.address}</div>
        <div className="text-sm text-slate-600">
          {l.neighborhood} • {l.borough}
        </div>
        {typeof l.beds === 'number' && typeof l.baths === 'number' && (
          <div className="text-sm mt-1">
            {l.beds === 0 ? 'Studio' : `${l.beds} bd`} • {l.baths} ba
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Page
// ---------------------------------------------------------
export default function Page() {
  const [filters, setFilters] = useState<Record<string, any>>({});

  const results = useMemo(() => {
    let arr = [...MOCK];

    if (filters.tenure === 'rent') arr = arr.filter((l) => l.rent);
    if (filters.tenure === 'sale') arr = arr.filter((l) => !l.rent);

    if (filters.borough) arr = arr.filter((l) => l.borough === filters.borough);
    if (filters.neighborhood) {
      const needle = String(filters.neighborhood || '').toLowerCase().trim();
      if (needle) arr = arr.filter((l) => l.neighborhood.toLowerCase().includes(needle));
    }

    if (filters.minPrice) arr = arr.filter((l) => l.price >= Number(filters.minPrice || 0));
    if (filters.maxPrice) arr = arr.filter((l) => l.price <= Number(filters.maxPrice || Infinity));

    // In-house boost (exclusive first)
    arr.sort((a, b) => Number(b.exclusive) - Number(a.exclusive));

    return arr;
  }, [filters]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Top brand header (kept minimal) */}
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="text-xl font-semibold tracking-tight">Mallan Real Estate Inc</div>
          <div className="text-xs text-slate-600">
            Maya Allan — Licensed Real Estate Broker • (Mb) 646-258-4460 • maya@mallan.nyc • mallan.nyc
          </div>
        </div>
      </header>

      {/* HERO with translucent, centered search */}
      <section id="home" className="relative">
        <div className="relative h-[56vh] md:h-[64vh]">
          <img
            src="/hero.jpg"
            onError={(e) => {
              e.currentTarget.src =
                'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=2000&q=80&auto=format&fit=crop';
            }}
            alt="Luxury Manhattan living room with skyline view"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="w-full max-w-3xl">
              <div className="rounded-3xl bg-white/80 backdrop-blur ring-1 ring-black/5 shadow-2xl px-4 py-4 md:px-6 md:py-6">
                <FilterBar onApply={setFilters} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="max-w-7xl mx-auto px-4 py-10">
        <h2 className="text-xl font-medium">Mallan Real Estate Featured</h2>
        <div className="grid md:grid-cols-3 gap-4 mt-3">
          {results.map((l) => (
            <Card key={l.id} l={l} />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-50 border-t py-10">
        <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-3 gap-6 text-sm">
          <div>
            <div className="font-semibold">Mallan Real Estate Inc</div>
            <div className="text-slate-600">Fair Housing • Privacy • SOP • Wire Fraud Warning</div>
          </div>
          <div>
            <div className="font-medium">Quick Links</div>
            <ul className="mt-2 space-y-1">
              <li><a className="underline" href="#home">Home</a></li>
              <li><a className="underline" href="#">Buy</a> / <a className="underline" href="#">Rent</a> / <a className="underline" href="#">Commercial</a></li>
              <li><a className="underline" href="#">Open Houses</a></li>
              <li><a className="underline" href="#">Guides</a></li>
            </ul>
          </div>
          <div>
            <div className="font-medium">Branding</div>
            <div className="text-xs text-slate-600">
              Maya Allan — Licensed Real Estate Broker<br />
              (Mb) 646-258-4460<br />
              maya@mallan.nyc<br />
              mallan.nyc
            </div>
          </div>
        </div>
        <div className="text-xs text-center text-slate-500 mt-8">
          © {new Date().getFullYear()} Mallan Real Estate Inc
        </div>
      </footer>
    </div>
  );
}
