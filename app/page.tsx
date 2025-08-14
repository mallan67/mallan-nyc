'use client';
import React, { useMemo, useState } from 'react';

/**
 * Home page (visuals to match your mock):
 * - Full-bleed hero photo
 * - Left translucent panel with brand + nav + search scope (Residential / Commercial / Global)
 * - Area → Neighborhood cascade (includes Murray Hill under Midtown East)
 * - Buy/Rent toggle
 * - Featured in-house listings below hero
 *
 * NOTE: This is front-end only. It doesn’t require any API to render.
 * It won’t break your ACRIS/DOB endpoints and can be extended later.
 */

/* --------------------------
   Types & Simple Mock Data
--------------------------- */
type Listing = {
  id: string;
  address: string;
  neighborhood: string;
  borough: 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx';
  zip: string;
  price: number; // sale price or monthly rent
  isRent: boolean;
  beds: number;
  baths: number;
  sqft?: number;
  brokerageName: string;
  source?: 'IN_HOUSE' | 'RLS' | 'OTHER';
  media: { src: string; alt?: string }[];
};

const IN_HOUSE = 'Mallan Real Estate Inc';

const mockListings: Listing[] = [
  {
    id: 'in1',
    address: '333 E 46th St #12A',
    neighborhood: 'Murray Hill',
    borough: 'Manhattan',
    zip: '10017',
    price: 799000,
    isRent: false,
    beds: 1,
    baths: 1,
    sqft: 720,
    brokerageName: IN_HOUSE,
    source: 'IN_HOUSE',
    media: [{ src: 'https://picsum.photos/seed/in1_0/1200/800' }],
  },
  {
    id: 'in2',
    address: '301 E 48th St #5C',
    neighborhood: 'Turtle Bay',
    borough: 'Manhattan',
    zip: '10017',
    price: 4200,
    isRent: true,
    beds: 0,
    baths: 1,
    sqft: 550,
    brokerageName: IN_HOUSE,
    source: 'IN_HOUSE',
    media: [{ src: 'https://picsum.photos/seed/rent1_0/1200/800' }],
  },
  {
    id: 'rls1',
    address: '245 E 47th St #9F',
    neighborhood: 'Midtown East',
    borough: 'Manhattan',
    zip: '10017',
    price: 725000,
    isRent: false,
    beds: 1,
    baths: 1,
    sqft: 700,
    brokerageName: 'Example External Brokerage',
    source: 'RLS',
    media: [{ src: 'https://picsum.photos/seed/rls1_0/1200/800' }],
  },
];

/* -----------------------------------
   Areas → Neighborhoods (NYC subset)
   (Extend anytime; Murray Hill included)
------------------------------------ */
const AREAS: Record<
  'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx',
  Record<string, string[]>
> = {
  Manhattan: {
    'Upper Manhattan': ['Central Harlem', 'South Harlem', 'East Harlem', 'Hamilton Heights', 'Inwood', 'Morningside Heights', 'Washington Heights', 'Marble Hill', 'Manhattanville'],
    'Upper West Side': ['Upper West Side', 'Lincoln Square', 'Manhattan Valley'],
    'Upper East Side': ['Upper East Side', 'Carnegie Hill', 'Lenox Hill', 'Yorkville', 'Roosevelt Island'],
    'Midtown East': ['Beekman', 'Midtown East', 'Murray Hill', 'Sutton Place', 'Turtle Bay', 'Kips Bay'],
    'Midtown West': ['Central Park South', 'Hell’s Kitchen', 'Hudson Yards', 'Midtown'],
    Downtown: [
      'Battery Park City', 'Chelsea', 'Chinatown', 'East Village', 'Financial District', 'Fulton/Seaport',
      'Flatiron', 'NoMad', 'Gramercy Park', 'Greenwich Village', 'NoHo', 'Little Italy',
      'Lower East Side', 'Two Bridges', 'Meatpacking', 'Nolita', 'SoHo', 'Hudson Square',
      'Stuyvesant Town/PCV', 'Tribeca', 'Union Square', 'West Village'
    ],
  },
  Brooklyn: {
    'North Brooklyn': ['Williamsburg', 'Greenpoint', 'Bushwick'],
    'Brownstone BK': ['Bedford-Stuyvesant', 'Clinton Hill', 'Fort Greene', 'Brooklyn Heights', 'DUMBO', 'Vinegar Hill', 'Cobble Hill', 'Carroll Gardens', 'Boerum Hill', 'Gowanus', 'Red Hook', 'Park Slope', 'Prospect Heights'],
  },
  Queens: {
    Core: ['Long Island City', 'Astoria', 'Sunnyside', 'Woodside', 'Jackson Heights', 'Elmhurst', 'Forest Hills', 'Flushing'],
  },
  Bronx: {
    Core: ['Allerton','Baychester','Bedford Park','Belmont','Bronxdale','Bronxwood','Castle Hill','City Island','Claremont','Claremont Village','Clason Point','Co-op City','Concourse','Concourse Village','Country Club','Crotona Park East','East Morrisania','East Tremont','Eastchester','Edenwald','Fordham','Highbridge','Hunts Point','Kingsbridge','Kingsbridge Heights','Laconia','Locust Point','Longwood','Melrose','Morris Heights','Morris Park','Morrisania','Mott Haven','Mount Eden','Mount Hope','North New York','Norwood','Olinville','Parkchester','Pelham Bay','Pelham Gardens','Pelham Parkway','Port Morris','Riverdale','Central Riverdale','Estate Area','Fieldston','North Riverdale','Spuyten Duyvil','Schuylerville','Soundview','Throgs Neck','Tremont','Unionport','University Heights','Van Nest','Wakefield','West Farms','Westchester Square','Westchester Village','Williamsbridge','Woodlawn','Woodstock'],
  },
};

/* --------------------------
   Small utilities
--------------------------- */
function usd(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/* --------------------------
   Listing card (simple)
--------------------------- */
function ListingCard({ l }: { l: Listing }) {
  const img = l.media[0]?.src;
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: 16,
      overflow: 'hidden',
      background: '#fff'
    }}>
      {img && (
        <img
          src={img}
          alt={l.address}
          style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }}
        />
      )}
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700 }}>{usd(l.price)}{l.isRent ? ' / mo' : ''}</div>
          {l.brokerageName === IN_HOUSE && (
            <span style={{ fontSize: 12, border: '1px solid #111', borderRadius: 999, padding: '2px 8px' }}>
              Exclusive
            </span>
          )}
        </div>
        <div style={{ color: '#475569', marginTop: 4, fontSize: 14 }}>{l.address}</div>
        <div style={{ color: '#475569', fontSize: 13 }}>{l.neighborhood} • {l.borough} {l.zip ? `• ${l.zip}` : ''}</div>
        <div style={{ marginTop: 4, fontSize: 13 }}>{l.beds} bd • {l.baths} ba • {l.sqft ? `${l.sqft} sf` : '—'}</div>
        {l.source === 'RLS' && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
            <span style={{ border: '1px solid #94a3b8', borderRadius: 4, padding: '0 4px' }}>RLS</span>{' '}
            Listing courtesy of external brokerage
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------
   Left translucent rail
--------------------------- */
function LeftRail({
  scope, setScope,
  mode, setMode,
  borough, setBorough,
  area, setArea,
  hood, setHood
}: {
  scope: 'res' | 'com' | 'global';
  setScope: (v: 'res' | 'com' | 'global') => void;
  mode: 'buy' | 'rent';
  setMode: (v: 'buy' | 'rent') => void;
  borough: keyof typeof AREAS;
  setBorough: (b: keyof typeof AREAS) => void;
  area: string | '';
  setArea: (a: string | '') => void;
  hood: string | '';
  setHood: (h: string | '') => void;
}) {
  const areaOptions = useMemo(() => Object.keys(AREAS[borough] || {}), [borough]);
  const hoodOptions = useMemo(() => (area ? (AREAS[borough]?.[area] || []) : []), [borough, area]);

  return (
    <div
      style={{
        width: 360,
        maxWidth: '90vw',
        background: 'rgba(255,255,255,0.82)',
        backdropFilter: 'blur(10px)',
        borderRadius: 20,
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        padding: 20
      }}
    >
      {/* Brand */}
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.15 }}>Mallan Real Estate Inc</div>
      <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
        Maya Allan — Licensed Real Estate Broker
      </div>

      {/* Nav (translucent pills) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {['Home','Buy','Rent','Commercial','New Dev','Open Houses','Agents','Guides','Sell','Contact'].map((t) => (
          <a
            key={t}
            href="#"
            style={{
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid rgba(0,0,0,0.12)',
              background: 'rgba(255,255,255,0.6)'
            }}
          >
            {t}
          </a>
        ))}
      </div>

      {/* Scope */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {([
          ['res','Residential'],
          ['com','Commercial'],
          ['global','Global'],
        ] as const).map(([val, label])=>(
          <button
            key={val}
            onClick={()=>setScope(val)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: scope===val ? '#111' : '#fff',
              color: scope===val ? '#fff' : '#111',
              fontSize: 13
            }}
          >{label}</button>
        ))}
      </div>

      {/* Buy / Rent */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {(['buy','rent'] as const).map(val=>(
          <button
            key={val}
            onClick={()=>setMode(val)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: mode===val ? '#111' : '#fff',
              color: mode===val ? '#fff' : '#111',
              fontSize: 13,
              textTransform: 'capitalize'
            }}
          >{val}</button>
        ))}
      </div>

      {/* Location selectors */}
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {/* Borough */}
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span>Borough</span>
          <select
            value={borough}
            onChange={(e)=>{ setBorough(e.target.value as keyof typeof AREAS); setArea(''); setHood(''); }}
            style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }}
          >
            {(['Manhattan','Brooklyn','Queens','Bronx'] as const).map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>

        {/* Area */}
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span>Area</span>
          <select
            value={area}
            onChange={(e)=>{ setArea(e.target.value); setHood(''); }}
            style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }}
          >
            <option value="">— Select area —</option>
            {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>

        {/* Neighborhood */}
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span>Neighborhood</span>
          <select
            value={hood}
            onChange={(e)=>setHood(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }}
            disabled={!area}
          >
            <option value="">{area ? '— Select neighborhood —' : 'Pick an area first'}</option>
            {hoodOptions.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>

        <button
          style={{ marginTop: 6, padding: '10px 14px', borderRadius: 10, border: '1px solid #111', background: '#111', color: '#fff', fontSize: 14 }}
          onClick={()=>{ /* no-op demo submit */ }}
        >
          Search
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: '#475569' }}>
        Tip: Murray Hill is under <b>Midtown East</b>.
      </div>
    </div>
  );
}
/* --------------------------
   Main page component
--------------------------- */
export default function Page() {
  // Left-rail UI state
  const [scope, setScope] = useState<'res'|'com'|'global'>('res');
  const [mode, setMode] = useState<'buy'|'rent'>('buy');

  const [borough, setBorough] = useState<keyof typeof AREAS>('Manhattan');
  const [area, setArea] = useState<string | ''>('');
  const [hood, setHood] = useState<string | ''>('');

  // Very basic filtering demo (in-house first)
  const results = useMemo(() => {
    let list = [...mockListings];

    // scope/mode
    if (scope === 'res' || scope === 'global') {
      // keep all for demo
    } else if (scope === 'com') {
      // no commercial mock yet → keep all for preview
    }
    if (mode === 'rent') list = list.filter(l => l.isRent);
    if (mode === 'buy') list = list.filter(l => !l.isRent);

    // borough/area/hood filters (hood beats area; area beats borough)
    if (hood) list = list.filter(l => l.neighborhood === hood);
    else if (area) {
      const all = AREAS[borough]?.[area] || [];
      list = list.filter(l => all.includes(l.neighborhood));
    } else if (borough) list = list.filter(l => l.borough === borough);

    // in-house first
    list.sort((a,b) => {
      const ai = a.brokerageName === IN_HOUSE ? 1 : 0;
      const bi = b.brokerageName === IN_HOUSE ? 1 : 0;
      return bi - ai;
    });
    return list;
  }, [scope, mode, borough, area, hood]);

  const heroUrl = 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2000&auto=format&fit=crop';

  return (
    <main style={{ minHeight: '100vh', background: '#fff', color: '#0f172a' }}>
      {/* HERO */}
      <section style={{ position: 'relative', height: '60vh', minHeight: 420, overflow: 'hidden'
