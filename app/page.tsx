'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * app/page.tsx — Mallan Real Estate Inc
 * Home page with hero image, translucent left rail, NYC search, featured listings.
 * Vanilla CSS (no Tailwind) so it renders nicely out of the box.
 */

/* ===========================
   Basic Types & Mock Data
   =========================== */

type MediaItem = { src: string; alt?: string; type?: 'photo' | 'floorplan' | 'video' | 'tour3d' };

type Listing = {
  id: string;
  address: string;
  neighborhood: string;
  borough?: 'Manhattan' | 'Bronx' | 'Brooklyn' | 'Queens' | 'Staten Island';
  zip: string;
  price: number; // sale price or monthly rent
  isRent: boolean;
  beds: number;
  baths: number;
  sqft?: number;
  media: MediaItem[];
  buildingAmenities?: string[];
  unitFeatures?: string[];
  buildingPetPolicy?: string;
  unitPetPolicy?: string;
  maintenance?: number;
  taxes?: number;
  brokerageName: string;
  source?: 'IN_HOUSE' | 'RLS' | 'OTHER';
  rlsAgentName?: string;
  rlsBrokerageName?: string;
  buyerAgentComp?: { type: 'percent' | 'flat'; value: number } | null; // sale
  ownerPaysTenantAgent?: boolean | null; // rent
  propertyType?: 'coop' | 'condo' | 'condop' | 'land' | 'townhouse' | 'multifamily_1_4' | 'rental_building';
  landLease?: boolean;
};

const IN_HOUSE = 'Mallan Real Estate Inc';

const mockListings: Listing[] = [
  {
    id: 'in1',
    address: '333 E 46th St #12A',
    borough: 'Manhattan',
    neighborhood: 'Murray Hill',
    zip: '10017',
    price: 799000,
    isRent: false,
    beds: 1,
    baths: 1,
    sqft: 720,
    maintenance: 850,
    taxes: 6500,
    media: Array.from({ length: 16 }).map((_, i) => ({
      src: `https://picsum.photos/seed/in1_${i}/1024/680`,
      type: 'photo' as const,
    })),
    buildingAmenities: ['Doorman', 'Elevator', 'Gym'],
    unitFeatures: ['Washer/Dryer', 'Balcony'],
    buildingPetPolicy: 'Cats/Dogs Allowed',
    unitPetPolicy: 'Dogs on approval',
    brokerageName: IN_HOUSE,
    source: 'IN_HOUSE',
    buyerAgentComp: { type: 'percent', value: 2.5 },
    ownerPaysTenantAgent: null,
    propertyType: 'condo',
    landLease: false,
  },
  {
    id: 'rls1',
    address: '245 E 47th St #9F',
    borough: 'Manhattan',
    neighborhood: 'Midtown East',
    zip: '10017',
    price: 725000,
    isRent: false,
    beds: 1,
    baths: 1,
    sqft: 700,
    maintenance: 910,
    taxes: 5980,
    media: Array.from({ length: 15 }).map((_, i) => ({
      src: `https://picsum.photos/seed/rls1_${i}/1024/680`,
      type: 'photo' as const,
    })),
    buildingAmenities: ['Elevator', 'Laundry in Bldg'],
    unitFeatures: ['Renovated'],
    buildingPetPolicy: 'Cats/Dogs Case by Case',
    unitPetPolicy: 'Cats ok',
    brokerageName: 'External Brokerage',
    source: 'RLS',
    rlsAgentName: 'Alex Example',
    rlsBrokerageName: 'External Brokerage',
    buyerAgentComp: { type: 'flat', value: 5000 },
    ownerPaysTenantAgent: null,
    propertyType: 'coop',
    landLease: false,
  },
  {
    id: 'rent1',
    address: '301 E 48th St #5C',
    borough: 'Manhattan',
    neighborhood: 'Turtle Bay',
    zip: '10017',
    price: 4200,
    isRent: true,
    beds: 0,
    baths: 1,
    sqft: 550,
    maintenance: 0,
    taxes: 0,
    media: Array.from({ length: 18 }).map((_, i) => ({
      src: `https://picsum.photos/seed/rent1_${i}/1024/680`,
      type: 'photo' as const,
    })),
    buildingAmenities: ['Doorman', 'Elevator', 'Laundry in Bldg'],
    unitFeatures: ['Alcove Studio'],
    buildingPetPolicy: 'Cats/Dogs Allowed',
    unitPetPolicy: 'Dogs on approval',
    brokerageName: IN_HOUSE,
    source: 'IN_HOUSE',
    buyerAgentComp: null,
    ownerPaysTenantAgent: true,
    propertyType: 'rental_building',
    landLease: false,
  },
];

/* Manhattan areas -> neighborhoods (for your Murray Hill in Midtown East selection) */
const MANHATTAN_AREAS: Record<string, string[]> = {
  'Upper Manhattan': ['Central Harlem','South Harlem','East Harlem','Hamilton Heights','Inwood','Morningside Heights','Washington Heights','Marble Hill','Manhattanville'],
  'Upper West Side': ['Upper West Side','Lincoln Square','Manhattan Valley'],
  'Upper East Side': ['Upper East Side','Carnegie Hill','Lenox Hill','Yorkville','Roosevelt Island'],
  'Midtown East': ['Beekman','Midtown East','Murray Hill','Sutton Place','Turtle Bay','Kips Bay'],
  'Midtown West': ['Central Park South','Hell’s Kitchen','Hudson Yards','Midtown'],
  'Downtown': ['Battery Park City','Chelsea','Chinatown','East Village','Financial District','Fulton/Seaport','Flatiron','NoMad','Gramercy Park','Greenwich Village','NoHo','Little Italy','Lower East Side','Two Bridges','Meatpacking','Nolita','SoHo','Hudson Square','Stuyvesant Town/PCV','Tribeca','Union Square','West Village'],
};

/* Bronx neighborhoods (your provided list, de-duplicated) */
const BRONX_NEIGHBORHOODS = [
  'Allerton','Baychester','Bedford Park','Belmont','Bronxdale','Bronxwood','Castle Hill','City Island','Claremont','Claremont Village','Clason Point','Co-op City','Concourse','Concourse Village','Country Club','Crotona Park East','East Morrisania','East Tremont','Eastchester','Edenwald','Fordham','Highbridge','Hunts Point','Kingsbridge','Kingsbridge Heights','Laconia','Locust Point','Longwood','Melrose','Morris Heights','Morris Park','Morrisania','Mott Haven','Mount Eden','Mount Hope','North New York','Norwood','Olinville','Parkchester','Pelham Bay','Pelham Gardens','Pelham Parkway','Port Morris','Riverdale','Central Riverdale','Estate Area','Fieldston','North Riverdale','Spuyten Duyvil','Schuylerville','Soundview','Throgs Neck','Tremont','Unionport','University Heights','Van Nest','Wakefield','West Farms','Westchester Square','Westchester Village','Williamsbridge','Woodlawn','Woodstock',
];

/* Basic helpers */
const usd = (n?: number) => (n || n === 0 ? n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—');

/* Global CSS for this page */
const GlobalStyles = () => (
  <style jsx global>{`
    :root { --ink:#0b0b0c; --ink-2:#5b6270; --bg:#ffffff; --accent:rgba(255,255,255,0.85); }
    * { box-sizing: border-box; }
    body { margin:0; color:var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; background:var(--bg); }
    a { color: inherit; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 16px; }
    header.site { position: sticky; top:0; z-index: 50; backdrop-filter: blur(8px); background: rgba(255,255,255,0.7); border-bottom: 1px solid #eee; }
    .brand { font-weight: 700; letter-spacing: .2px; }
    .hero { position: relative; height: 52vh; min-height: 420px; overflow: hidden; }
    .hero img { width: 100%; height: 100%; object-fit: cover; display:block; }
    .hero .scrim { position:absolute; inset:0; background: linear-gradient(0deg, rgba(0,0,0,0.55), transparent 40%); }
    .rail { position:absolute; top: 60px; left: 24px; width: 320px; max-width: calc(100% - 48px); background: rgba(255,255,255,0.75); border: 1px solid rgba(0,0,0,0.06); border-radius: 16px; padding: 16px; backdrop-filter: blur(10px); }
    .rail h3 { margin: 8px 0 12px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--ink-2); }
    .field { display:flex; gap:8px; margin-bottom:8px; }
    .field > * { flex:1; }
    select, input, button, textarea { font: inherit; }
    select, input { width: 100%; border: 1px solid #ddd; border-radius: 10px; padding: 8px 10px; background: white; }
    .chiprow { display:flex; flex-wrap: wrap; gap:8px; margin: 6px 0 2px; }
    .chip { border:1px solid #ddd; border-radius:20px; padding:6px 10px; font-size: 12px; cursor:pointer; background:#fff; }
    .chip.sel { background:#0b0b0c; color:#fff; border-color:#0b0b0c; }
    .btn { padding:10px 12px; border-radius:10px; border:1px solid #111; background:#111; color:#fff; cursor:pointer; }
    .btn.secondary { background:#fff; color:#111; }
    .grid { display:grid; gap:16px; }
    @media (min-width: 900px){ .grid.cols-3 { grid-template-columns: repeat(3, 1fr); } }
    .card { border: 1px solid #eee; border-radius: 18px; overflow:hidden; background:#fff; }
    .card img { width:100%; height:180px; object-fit:cover; display:block; }
    .card .pad { padding:14px; }
    .muted { color: var(--ink-2); }
    footer.site { border-top:1px solid #eee; background:#f8f9fb; padding:28px 0; margin-top: 40px; }
    details summary { cursor: pointer; }
  `}</style>
);
/* ===========================
   Lightbox & Listing UI
   =========================== */

function Lightbox({ items, startIndex = 0, onClose }: { items: { src: string; alt?: string }[]; startIndex?: number; onClose: () => void }) {
  const [i, setI] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI(v => (v + 1) % items.length);
      if (e.key === 'ArrowLeft') setI(v => (v - 1 + items.length) % items.length);
      if (e.key === '+') setScale(s => Math.min(6, s + 0.25));
      if (e.key === '-') setScale(s => Math.max(1, s - 0.25));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length, onClose]);
  const openFs = () => (ref.current as any)?.requestFullscreen?.();
  return (
    <div role="dialog" aria-modal className="fixed inset-0" style={{background:'rgba(0,0,0,0.9)', zIndex:9999}} ref={ref}>
      <div className="container" style={{display:'flex', alignItems:'center', justifyContent:'space-between', color:'#fff', padding:'8px 0'}}>
        <div style={{fontSize:12}}>{i+1}/{items.length}</div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn secondary" onClick={()=>setScale(s=>Math.max(1,s-0.25))}>−</button>
          <button className="btn secondary" onClick={()=>setScale(s=>Math.min(6,s+0.25))}>+</button>
          <button className="btn secondary" onClick={()=>setScale(1)}>Reset</button>
          <button className="btn secondary" onClick={openFs}>Fullscreen</button>
          <button className="btn secondary" onClick={onClose}>Close ✕</button>
        </div>
      </div>
      <div style={{height:'calc(100% - 120px)', display:'flex', alignItems:'center', justifyContent:'center'}}>
        <img src={items[i].src} alt={items[i].alt||''} style={{maxHeight:'100%', maxWidth:'100%', transform:`scale(${scale})`}} />
      </div>
      <div style={{overflowX:'auto', whiteSpace:'nowrap', padding:'8px 0'}} className="container">
        {items.map((it, idx)=>(
          <button key={idx} onClick={()=>setI(idx)} style={{display:'inline-block', marginRight:8, border: idx===i ? '2px solid #fff' : '2px solid transparent'}}>
            <img src={it.src} alt="" style={{height:64, width:100, objectFit:'cover', display:'block'}} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ExpandableMedia({ items }: { items: { src: string; alt?: string }[] }) {
  const [open, setOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  return (
    <div>
      <div className="grid cols-3">
        {items.slice(0, 6).map((m, idx) => (
          <button key={idx} className="card" onClick={() => { setStartIndex(idx); setOpen(true); }}>
            <img src={m.src} alt={m.alt || 'Listing media'} />
          </button>
        ))}
      </div>
      <div style={{marginTop:8}}>
        <button className="btn secondary" onClick={()=>{ setStartIndex(0); setOpen(true); }}>View all media</button>
      </div>
      {open && <Lightbox items={items} startIndex={startIndex} onClose={() => setOpen(false)} />}
    </div>
  );
}

function SaveShareBar({ listing, onSelect, selected }: { listing: Listing; onSelect?: (id: string, next: boolean) => void; selected?: boolean }) {
  return (
    <div style={{marginTop:8, display:'flex', gap:8, flexWrap:'wrap'}}>
      <button className={`btn ${selected ? '' : 'secondary'}`} onClick={() => onSelect?.(listing.id, !selected)}>{selected ? 'Selected' : 'Select'}</button>
      <button className="btn secondary">❤ Save</button>
      <button className="btn secondary">Share</button>
    </div>
  );
}

function MortgageCalculator({ price, taxes = 0, maint = 0 }: { price: number; taxes?: number; maint?: number }) {
  const [down, setDown] = useState(20);
  const [rate, setRate] = useState(6.5);
  const [term, setTerm] = useState(30);
  const loan = useMemo(() => Math.max(0, price * (1 - down / 100)), [price, down]);
  const monthly = useMemo(() => {
    const r = rate / 100 / 12; const n = term * 12;
    const pmt = r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
    return pmt + (taxes / 12) + maint;
  }, [loan, rate, term, taxes, maint]);
  return (
    <div className="card" style={{marginTop:12}}>
      <div className="pad">
        <div style={{fontWeight:600}}>Monthly Estimate</div>
        <div style={{fontSize:24, marginTop:6}}>{usd(Math.round(monthly))}</div>
        <div className="grid" style={{gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:10}}>
          <label className="muted" style={{display:'flex', flexDirection:'column'}}>Down %<input value={down} onChange={e=>setDown(Number(e.target.value))} type="number" /></label>
          <label className="muted" style={{display:'flex', flexDirection:'column'}}>Rate %<input value={rate} onChange={e=>setRate(Number(e.target.value))} type="number" /></label>
          <label className="muted" style={{display:'flex', flexDirection:'column'}}>Term (yrs)<input value={term} onChange={e=>setTerm(Number(e.target.value))} type="number" /></label>
        </div>
      </div>
    </div>
  );
}

function RLSAttribution({ listing }: { listing: Listing }) {
  const isInHouse = listing.brokerageName === IN_HOUSE;
  const isExternalRLS = listing.source === 'RLS' && !isInHouse;
  if (!isExternalRLS) return null;
  return <p className="muted" style={{fontSize:12, marginTop:6}}>Listing courtesy of {listing.rlsAgentName || 'Agent'}, {listing.rlsBrokerageName || listing.brokerageName} · <span style={{border:'1px solid #ddd', borderRadius:6, padding:'0 4px'}}>RLS</span></p>;
}

function ListingCard({ listing, onSelect, selected }: { listing: Listing; onSelect?: (id: string, next: boolean) => void; selected?: boolean }) {
  const media = listing.media.slice(0, 1);
  return (
    <div className="card">
      <img src={media[0]?.src} alt={media[0]?.alt || listing.address} />
      <div className="pad">
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
          <div style={{fontWeight:700}}>{usd(listing.price)} {listing.isRent ? '/ mo' : ''}</div>
          {listing.brokerageName === IN_HOUSE && <span className="muted" style={{fontSize:12, border:'1px solid #ddd', borderRadius:8, padding:'2px 6px'}}>Exclusive</span>}
        </div>
        <div className="muted" style={{marginTop:4, fontSize:14}}>{listing.address}</div>
        <div className="muted" style={{fontSize:13}}>{listing.neighborhood}{listing.zip ? ` • ${listing.zip}` : ''}</div>
        <div style={{fontSize:14, marginTop:4}}>{listing.beds} bd • {listing.baths} ba • {listing.sqft ? `${listing.sqft} sf` : '—'}</div>
        {!listing.isRent && listing.buyerAgentComp && (
          <div className="muted" style={{fontSize:12, marginTop:6}}>Buyer’s Agent Compensation: {listing.buyerAgentComp.type === 'percent' ? `${listing.buyerAgentComp.value}%` : usd(listing.buyerAgentComp.value)}</div>
        )}
        {listing.isRent && listing.ownerPaysTenantAgent != null && (
          <div className="muted" style={{fontSize:12, marginTop:6}}>Owner Pays Tenant’s Agent: {listing.ownerPaysTenantAgent ? 'Yes' : 'No'}</div>
        )}
        <RLSAttribution listing={listing} />
        <SaveShareBar listing={listing} onSelect={onSelect} selected={!!selected} />
      </div>
    </div>
  );
}

/* ===========================
   Search Filters (NYC/Global)
   =========================== */

type Scope = 'nyc-res' | 'nyc-com' | 'global';

function FilterBar({ onApply }: { onApply: (f: Record<string, any>) => void }) {
  const [scope, setScope] = useState<Scope>('nyc-res'); // nyc-res | nyc-com | global
  const [tenure, setTenure] = useState<'sale'|'rent'>('sale');

  // property types (Residential focus per your list)
  const [types, setTypes] = useState<string[]>([]);
  const toggleType = (t: string) => setTypes(arr => arr.includes(t) ? arr.filter(x=>x!==t) : [...arr, t]);

  // land-lease (Include/Exclude/Any)
  const [landLease, setLandLease] = useState<'any'|'include'|'exclude'>('any');

  // price/beds
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [beds, setBeds] = useState<string>('');

  // area -> neighborhood (Manhattan example + Bronx full)
  const [borough, setBorough] = useState<string>('Manhattan');
  const [manArea, setManArea] = useState<string>('Midtown East');
  const [neighborhood, setNeighborhood] = useState<string>('');

  const manAreas = Object.keys(MANHATTAN_AREAS);
  const manNeighborhoods = (MANHATTAN_AREAS[manArea] || []);
  const bronxNeighborhoods = BRONX_NEIGHBORHOODS;

  function apply() {
    onApply({ scope, tenure, types, landLease, minPrice, maxPrice, beds, borough, manArea, neighborhood });
  }

  return (
    <div>
      <h3>Search</h3>

      <div className="field">
        <select value={scope} onChange={e=>setScope(e.target.value as Scope)}>
          <option value="nyc-res">Residential • NYC</option>
          <option value="nyc-com">Commercial • NYC</option>
          <option value="global">Global / USA</option>
        </select>
        <select value={tenure} onChange={e=>setTenure(e.target.value as any)}>
          <option value="sale">Buy / For Sale</option>
          <option value="rent">Rent</option>
        </select>
      </div>

      {/* Property type chips */}
      <div className="chiprow" aria-label="Property types">
        {['coop','condo','condop','land','townhouse','multifamily_1_4','rental_building'].map(t=>(
          <button key={t} type="button" className={`chip ${types.includes(t)?'sel':''}`} onClick={()=>toggleType(t)}>
            {t === 'multifamily_1_4' ? 'Multi-family (1–4)' : t.replace('_',' ')}
          </button>
        ))}
      </div>

      <div className="field">
        <select value={landLease} onChange={e=>setLandLease(e.target.value as any)}>
          <option value="any">Land-Lease: Any</option>
          <option value="include">Include Only</option>
          <option value="exclude">Exclude</option>
        </select>
        <select value={beds} onChange={e=>setBeds(e.target.value)}>
          <option value="">Beds</option>
          <option value="0">Studio</option>
          <option value="alcove">Alcove Studio</option>
          <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4+">4+</option>
        </select>
      </div>

      <div className="field">
        <input placeholder="Min $" value={minPrice} onChange={e=>setMinPrice(e.target.value)} />
        <input placeholder="Max $" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} />
      </div>

      {/* Manhattan / Bronx visual selectors */}
      <div className="field">
        <select value={borough} onChange={e=>setBorough(e.target.value)}>
          <option>Manhattan</option>
          <option>Bronx</option>
          <option>Brooklyn</option>
          <option>Queens</option>
          <option>Staten Island</option>
        </select>
        {borough === 'Manhattan' ? (
          <select value={manArea} onChange={e=>{ setManArea(e.target.value); setNeighborhood(''); }}>
            {manAreas.map(a => <option key={a}>{a}</option>)}
          </select>
        ) : (
          <select disabled><option>Area</option></select>
        )}
      </div>

      <div className="field">
        {borough === 'Manhattan' ? (
          <select value={neighborhood} onChange={e=>setNeighborhood(e.target.value)}>
            <option value="">Neighborhood</option>
            {manNeighborhoods.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : borough === 'Bronx' ? (
          <select value={neighborhood} onChange={e=>setNeighborhood(e.target.value)}>
            <option value="">Neighborhood</option>
            {bronxNeighborhoods.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : (
          <select disabled><option>Neighborhood</option></select>
        )}
        <button className="btn" onClick={apply}>Search</button>
      </div>
    </div>
  );
}
/* ===========================
   Main Page
   =========================== */

export default function Page() {
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = (ids: string[]) => mockListings.filter(l => ids.includes(l.id));

  // Filter + in-house boost (Mallan first)
  const results = useMemo(() => {
    let list = [...mockListings];

    if (filters.tenure) list = list.filter(l => filters.tenure === 'rent' ? l.isRent : !l.isRent);
    if (filters.types?.length) list = list.filter(l => filters.types.includes(l.propertyType || ''));
    if (filters.landLease === 'include') list = list.filter(l => l.landLease === true);
    if (filters.landLease === 'exclude') list = list.filter(l => l.landLease !== true);
    if (filters.minPrice) list = list.filter(l => l.price >= Number(filters.minPrice));
    if (filters.maxPrice) list = list.filter(l => l.price <= Number(filters.maxPrice));
    if (filters.beds) {
      list = list.filter(l => {
        if (filters.beds === '0') return l.beds === 0;
        if (filters.beds === 'alcove') return l.beds === 0 && (l.unitFeatures || []).includes('Alcove Studio');
        if (filters.beds === '4+') return l.beds >= 4;
        return String(l.beds) === String(filters.beds);
      });
    }
    if (filters.borough) list = list.filter(l => !filters.borough || l.borough === filters.borough);
    if (filters.neighborhood) list = list.filter(l => l.neighborhood === filters.neighborhood);

    list.sort((a,b) => (b.brokerageName === IN_HOUSE ? 1 : 0) - (a.brokerageName === IN_HOUSE ? 1 : 0));
    return list;
  }, [filters]);

  const toggleSelect = (id: string, next: boolean) => setSelectedIds(arr => next ? [...new Set([...arr, id])] : arr.filter(x=>x!==id));
  const primary = results[0];

  const heroImg = 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=1920';

  return (
    <>
      <GlobalStyles />

      {/* Header */}
      <header className="site">
        <div className="container" style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0'}}>
          <div>
            <div className="brand">Mallan Real Estate Inc</div>
            <div className="muted" style={{fontSize:12}}>Maya Allan — Licensed Real Estate Broker • (Mb) 646-258-4460 • maya@mallan.nyc • mallan.nyc</div>
          </div>
          <nav className="muted" style={{display:'flex', gap:16, fontSize:14}}>
            <a href="#home">Home</a>
            <a href="#buy">Buy</a>
            <a href="#rent">Rent</a>
            <a href="#commercial">Commercial</a>
            <a href="#newdev">New Dev</a>
            <a href="#open">Open Houses</a>
            <a href="#guides">Guides</a>
            <a href="#agents">Agents</a>
            <a href="#sell">Sell</a>
            <a href="#contact">Contact</a>
          </nav>
        </div>
      </header>

      {/* Hero with translucent rail */}
      <section id="home" className="hero">
        <img src={heroImg} alt="NYC skyline" />
        <div className="scrim" />
        <div className="rail">
          <FilterBar onApply={setFilters} />
          <div className="muted" style={{fontSize:12, marginTop:6}}>Tip: Mallan exclusives appear first by default. Sort by price / newest / PPSF / distance.</div>
        </div>
      </section>

      {/* Featured in-house */}
      <section className="container" style={{padding:'22px 0'}}>
        <h2 style={{margin:'8px 0 14px'}}>Mallan Real Estate Featured</h2>
        <div className="grid cols-3">
          {results.filter(l => l.brokerageName === IN_HOUSE).slice(0,3).map(l => (
            <ListingCard key={l.id} listing={l} onSelect={toggleSelect} selected={selectedIds.includes(l.id)} />
          ))}
        </div>
      </section>

      {/* Results */}
      <section id="results" className="container" style={{padding:'6px 0 24px'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <h3>Results</h3>
          <div style={{display:'flex', gap:8}}>
            <button className="btn" disabled={!selectedIds.length}>Send Selected ({selectedIds.length})</button>
            <a className="muted" style={{textDecoration:'underline', fontSize:14}} href="#open">See Open Houses</a>
          </div>
        </div>
        <div className="grid cols-3" style={{marginTop:12}}>
          {results.map(l => (
            <ListingCard key={l.id} listing={l} onSelect={toggleSelect} selected={selectedIds.includes(l.id)} />
          ))}
        </div>
      </section>

      {/* Listing detail preview */}
      {primary && (
        <section className="container" style={{padding:'10px 0 30px'}}>
          <div className="card">
            <div className="pad" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
              <div>
                <ExpandableMedia items={primary.media} />
              </div>
              <div>
                <div style={{fontSize:24, fontWeight:700}}>{usd(primary.price)} {primary.isRent ? '/ mo' : ''}</div>
                <div className="muted" style={{marginTop:6, fontSize:14}}>{primary.address}</div>
                <div className="muted" style={{fontSize:13}}>{primary.neighborhood} • {primary.zip}</div>
                <div style={{fontSize:14, marginTop:6}}>{primary.beds} bd • {primary.baths} ba • {primary.sqft ? `${primary.sqft} sf` : '—'}</div>
                <div className="muted" style={{fontSize:12, marginTop:6}}>Building pets: {primary.buildingPetPolicy || '—'}</div>
                <div className="muted" style={{fontSize:12}}>Unit pets: {primary.unitPetPolicy || '—'}</div>
                {!primary.isRent && primary.buyerAgentComp && (
                  <div className="muted" style={{fontSize:12, marginTop:6}}>Buyer’s Agent Compensation: {primary.buyerAgentComp.type === 'percent' ? `${primary.buyerAgentComp.value}%` : usd(primary.buyerAgentComp.value)}</div>
                )}
                {primary.isRent && primary.ownerPaysTenantAgent != null && (
                  <div className="muted" style={{fontSize:12, marginTop:6}}>Owner Pays Tenant’s Agent: {primary.ownerPaysTenantAgent ? 'Yes' : 'No'}</div>
                )}
                <div style={{marginTop:8}}>
                  <a className="btn secondary" href="mailto:inquiries@mallan.nyc">Email Agent</a>{' '}
                  <a className="btn secondary" href="sms:+16462584460">Text Agent</a>
                </div>
                <MortgageCalculator price={primary.price} taxes={primary.taxes} maint={primary.maintenance} />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Open Houses teaser */}
      <section id="open" className="container" style={{padding:'16px 0 26px'}}>
        <div className="card">
          <div className="pad" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div style={{fontWeight:600}}>Open Houses</div>
            <a className="muted" style={{textDecoration:'underline'}} href="#">View calendar →</a>
          </div>
          <div className="pad" style={{paddingTop:0}}><span className="muted" style={{fontSize:14}}>Mallan open houses are pinned first. RSVP to receive reminders and directions.</span></div>
        </div>
      </section>

      {/* Guides */}
      <section id="guides" className="container" style={{padding:'10px 0 26px'}}>
        <h3>Guides & Education</h3>
        <div className="grid cols-3" style={{marginTop:12}}>
          {[
            ['Buyer’s Guide', '#guide-buyers'],
            ['International Buyer’s Guide', '#guide-international'],
            ['Investor’s Guide', '#guide-investors'],
          ].map(([t, h]) => (
            <a key={h} className="card" href={h}>
              <div className="pad">
                <div style={{fontWeight:600}}>{t}</div>
                <div className="muted" style={{fontSize:13, marginTop:4}}>Interactive tools + PDF downloads</div>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Footer with SOP + legal */}
      <footer className="site">
        <div className="container" style={{display:'grid', gap:18, gridTemplateColumns:'2fr 1fr 1fr'}}>
          <div>
            <div style={{fontWeight:700}}>Mallan Real Estate Inc</div>
            <div className="muted">Fair Housing • Privacy • Standardized Operating Procedures</div>
            <details style={{marginTop:8}}>
              <summary>Standardized Operating Procedures (NY State)</summary>
              <div className="muted" style={{fontSize:12, marginTop:8, lineHeight:1.4}}>
                <p>1. There is no general requirement to provide photo identification prior to a property showing. However, on occasion individual property owners, buildings or certain listing brokers may require photo identification for security or similar purposes prior to a showing, we will communicate this information to buyers/ tenants in prior to showings.</p>
                <p>2. An exclusive buyer representation agreement is not required.</p>
                <p>3. A pre-approval for a mortgage loan is not required to work with us, however at the time of an offer individual property owners, listing brokers or managing agents may require one – and if so, we will communicate this to buyers as applicable for any properties buyers may wish to view.</p>
              </div>
            </details>
            <div className="muted" style={{fontSize:12, marginTop:8}}>Wire Fraud Warning: Always confirm wiring instructions by phone using a known, trusted number. We will never change wiring instructions by email.</div>
          </div>
          <div>
            <div style={{fontWeight:600}}>Quick Links</div>
            <ul className="muted" style={{fontSize:14, marginTop:6, lineHeight:1.9}}>
              <li><a href="#home">Home</a></li>
              <li><a href="#buy">Buy</a> / <a href="#rent">Rent</a> / <a href="#commercial">Commercial</a></li>
              <li><a href="#open">Open Houses</a></li>
              <li><a href="#guides">Guides</a></li>
              <li><a href="#agents">Agents</a></li>
              <li><a href="#sell">Sell</a></li>
              <li><a href="#contact">Contact</a></li>
            </ul>
          </div>
          <div>
            <div style={{fontWeight:600}}>Branding</div>
            <div className="muted" style={{fontSize:13}}>Maya Allan — Licensed Real Estate Broker<br/>(Mb) 646-258-4460<br/>maya@mallan.nyc<br/>mallan.nyc</div>
          </div>
        </div>
        <div className="muted" style={{textAlign:'center', fontSize:12, marginTop:16}}>© {new Date().getFullYear()} Mallan Real Estate Inc</div>
      </footer>
    </>
  );
}
