'use client';

import React, { useMemo, useState, CSSProperties } from 'react';

/**
 * Mallan Real Estate Inc — Home (no Tailwind, all inline CSS)
 * - Luxury hero with centered translucent search card
 * - Separate inputs for Residential vs Commercial (beds/baths vs rooms)
 * - Minimal, fast, and responsive
 */

// -------- Mock data (tiny) --------
type Listing = {
  id: string;
  address: string;
  neighborhood: string;
  borough: string;
  price: number;
  rent?: boolean;
  beds?: number; // residential
  baths?: number;
  rooms?: number; // commercial
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
    id: 'rent1',
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
    id: 'com1',
    address: '200 Madison Ave, Suite 14F',
    neighborhood: 'Murray Hill',
    borough: 'Manhattan',
    price: 2500000,
    rooms: 6,
    baths: 2,
    media: ['https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1600&q=80&auto=format&fit=crop'],
  },
];

const usd = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// -------- Inline styles --------
const container: CSSProperties = { maxWidth: 1120, margin: '0 auto', padding: '0 16px' };

const heroWrap: CSSProperties = { position: 'relative', height: '64vh', minHeight: 420, width: '100%' };
const heroImg: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
const heroOverlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(to top, rgba(0,0,0,.6), rgba(0,0,0,.18) 45%, rgba(0,0,0,0) 100%)',
};
const centerBoxWrap: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};
const card: CSSProperties = {
  width: '100%',
  maxWidth: 860,
  borderRadius: 20,
  background: 'rgba(255,255,255,0.85)',
  boxShadow: '0 20px 50px rgba(0,0,0,.25)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  padding: 20,
};

const row4: CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr 1fr 1fr', marginTop: 10 };
const chipRow: CSSProperties = { marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' };

const chip = (active: boolean): CSSProperties => ({
  border: '1px solid #cbd5e1',
  padding: '6px 12px',
  borderRadius: 999,
  fontSize: 13,
  background: active ? '#111' : '#fff',
  color: active ? '#fff' : '#111',
  cursor: 'pointer',
});

const submitRow: CSSProperties = { display: 'flex', justifyContent: 'center', marginTop: 12 };

const buttonPrimary: CSSProperties = {
  background: '#111',
  color: '#fff',
  padding: '10px 18px',
  borderRadius: 12,
  border: '1px solid #111',
  cursor: 'pointer',
};

const input: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 12,
  padding: '10px 12px',
  width: '100%',
  background: '#fff',
};

const select = input;

// -------- Filter bar --------
type UseClass = 'res' | 'com' | 'intl';
type Tenure = 'sale' | 'rent';

function FilterBar({ onApply }: { onApply: (f: Record<string, any>) => void }) {
  const [useClass, setUseClass] = useState<UseClass>('res');
  const [tenure, setTenure] = useState<Tenure>('sale');

  // residential
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');

  // commercial
  const [rooms, setRooms] = useState('');

  // shared
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [borough, setBorough] = useState('Manhattan');
  const [neighborhood, setNeighborhood] = useState('Midtown East');

  const [amenities, setAmenities] = useState<string[]>([]);
  const toggleAmenity = (a: string) =>
    setAmenities((arr) => (arr.includes(a) ? arr.filter((x) => x !== a) : [...arr, a]));

  return (
    <div>
      <div style={row4}>
        <select value={useClass} onChange={(e) => setUseClass(e.target.value as UseClass)} style={select}>
          <option value="res">Residential</option>
          <option value="com">Commercial</option>
          <option value="intl">USA & International</option>
        </select>
        <select value={tenure} onChange={(e) => setTenure(e.target.value as Tenure)} style={select}>
          <option value="sale">Buy / For Sale</option>
          <option value="rent">Rent</option>
        </select>

        {/* Beds/Baths (res) or Rooms (com) */}
        {useClass === 'res' ? (
          <>
            <select value={beds} onChange={(e) => setBeds(e.target.value)} style={select}>
              <option value="">Beds</option>
              <option value="0">Studio</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4plus">4+</option>
            </select>
            <select value={baths} onChange={(e) => setBaths(e.target.value)} style={select}>
              <option value="">Baths</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
            </select>
          </>
        ) : (
          <>
            <select value={rooms} onChange={(e) => setRooms(e.target.value)} style={select}>
              <option value="">Rooms</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
              <option value="6">6+</option>
            </select>
            <input style={{ ...input, background: '#f5f7fb', color: '#8b8fa3' }} placeholder="Baths (N/A)" disabled />
          </>
        )}
      </div>

      <div style={row4}>
        <input placeholder="Min $" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} style={input} />
        <input placeholder="Max $" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} style={input} />
        <select value={borough} onChange={(e) => setBorough(e.target.value)} style={select}>
          <option>Manhattan</option>
          <option>Brooklyn</option>
          <option>Queens</option>
          <option>Bronx</option>
          <option>Staten Island</option>
        </select>
        <input
          placeholder="Neighborhood"
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          style={input}
        />
      </div>

      <div style={chipRow}>
        {['roof deck', 'recreation room', 'business center', 'Land-Lease: Allowed'].map((a) => (
          <button key={a} type="button" style={chip(amenities.includes(a))} onClick={() => toggleAmenity(a)}>
            {a}
          </button>
        ))}
      </div>

      <div style={submitRow}>
        <button
          style={buttonPrimary}
          onClick={() =>
            onApply({
              useClass,
              tenure,
              beds,
              baths,
              rooms,
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

// -------- Card --------
function Card({ l }: { l: Listing }) {
  const cardBox: CSSProperties = { borderRadius: 18, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#fff' };
  const img: CSSProperties = { width: '100%', height: 180, objectFit: 'cover' };
  const body: CSSProperties = { padding: 14 };
  const tag: CSSProperties = { fontSize: 11, border: '1px solid #111', padding: '2px 8px', borderRadius: 999 };

  return (
    <div style={cardBox}>
      <img src={l.media[0]} alt={l.address} style={img} />
      <div style={body}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 600, fontSize: 18 }}>
            {usd(l.price)} {l.rent ? '/ mo' : ''}
          </div>
          {l.exclusive && <span style={tag}>Exclusive</span>}
        </div>
        <div style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>{l.address}</div>
        <div style={{ color: '#64748b', fontSize: 14 }}>{l.neighborhood} • {l.borough}</div>
        <div style={{ fontSize: 14, marginTop: 4 }}>
          {typeof l.rooms === 'number' ? `${l.rooms} rooms` : (typeof l.beds === 'number' ? (l.beds === 0 ? 'Studio' : `${l.beds} bd`) : '—')}
          {typeof l.baths === 'number' ? ` • ${l.baths} ba` : ''}
        </div>
      </div>
    </div>
  );
}

// -------- Page --------
export default function Page() {
  const [filters, setFilters] = useState<Record<string, any>>({});

  const results = useMemo(() => {
    let arr = [...MOCK];
    if (filters.tenure === 'rent') arr = arr.filter((l) => l.rent);
    if (filters.tenure === 'sale') arr = arr.filter((l) => !l.rent);

    if (filters.useClass === 'com') {
      arr = arr.filter((l) => typeof l.rooms === 'number' || l.address.toLowerCase().includes('suite'));
    } else if (filters.useClass === 'res') {
      arr = arr.filter((l) => typeof l.beds !== 'undefined');
    }

    if (filters.borough) arr = arr.filter((l) => l.borough === filters.borough);
    if (filters.neighborhood) {
      const needle = String(filters.neighborhood).toLowerCase().trim();
      if (needle) arr = arr.filter((l) => l.neighborhood.toLowerCase().includes(needle));
    }
    if (filters.minPrice) arr = arr.filter((l) => l.price >= Number(filters.minPrice || 0));
    if (filters.maxPrice) arr = arr.filter((l) => l.price <= Number(filters.maxPrice || Infinity));

    arr.sort((a, b) => Number(b.exclusive) - Number(a.exclusive));
    return arr;
  }, [filters]);

  const sectionTitle: CSSProperties = { fontSize: 22, fontWeight: 600, marginBottom: 12 };

  return (
    <div>
      {/* Simple header */}
      <div style={{ borderBottom: '1px solid #e5e7eb', background: 'rgba(255,255,255,.85)' }}>
        <div style={{ ...container, padding: '12px 16px' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Mallan Real Estate Inc</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Maya Allan — Licensed Real Estate Broker • (Mb) 646-258-4460 • maya@mallan.nyc • mallan.nyc
          </div>
        </div>
      </div>

      {/* Hero with centered search */}
      <section style={heroWrap}>
        <img
          src="/hero.jpg"
          alt="Luxury Manhattan living room with skyline view"
          style={heroImg}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=2000&q=80&auto=format&fit=crop';
          }}
        />
        <div style={heroOverlay} />
        <div style={centerBoxWrap}>
          <div style={card}>
            <div style={{ fontWeight: 700, letterSpacing: '.04em', marginBottom: 6 }}>SEARCH</div>
            <FilterBar onApply={setFilters} />
          </div>
        </div>
      </section>

      {/* Featured */}
      <section style={{ ...container, padding: '40px 16px' }}>
        <div style={sectionTitle}>Mallan Real Estate Featured</div>
        <style>{`
          .grid { display:grid; grid-template-columns:1fr; gap:16px; }
          @media (min-width: 768px) { .grid { grid-template-columns: repeat(3, 1fr); } }
        `}</style>
        <div className="grid">
          {results.map((l) => (
            <Card key={l.id} l={l} />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: '#f8fafc', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ ...container, padding: '24px 16px', fontSize: 14, color: '#475569' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Mallan Real Estate Inc</div>
          <div>Fair Housing • Privacy • SOP • Wire Fraud Warning</div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
            © {new Date().getFullYear()} Mallan Real Estate Inc
          </div>
        </div>
      </footer>
    </div>
  );
}
