'use client';
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Mallan Real Estate — Vision Implementation Sketch
 * Single-file React app preview that stitches together the major UX elements we planned:
 * - Global nav + branding (Maya Allan / MAllan Real Estate Inc)
 * - Residential / Commercial search (separate paths)
 * - In-house listings boosted/pinned first; RLS attribution for external feeds
 * - Listing media standards + lightbox (15+ photos, floorplans, video/3D placeholders)
 * - Mortgage calculator on every listing
 * - Save & Share, Boards (simplified), Multi-send selector
 * - Similar & Nearby listings (stub)
 * - Open Houses teaser
 * - Guides (Buyers / International / Investors / First-time)
 * - Location-based suggestions
 * - Footer with Fair Housing, Privacy, SOP (NY law), and Wire Fraud warning
 *
 * NOTE: This is a preview scaffold (front-end only). API endpoints, RLS/ACRIS/DOB integrations,
 * CRM, Universal Inbox, and Admin dashboard live server-side; we expose hooks/stubs here.
 */

// ----------------------------
// Mock data (replace w/ live API later)
// ----------------------------

type Listing = {
  id: string;
  address: string;
  neighborhood: string;
  zip: string;
  price: number; // sale price or monthly rent
  isRent: boolean;
  beds: number;
  baths: number;
  sqft?: number;
  ppsf?: number;
  media: { src: string; alt?: string; type?: "photo" | "floorplan" | "video" | "tour3d" }[];
  buildingAmenities?: string[];
  unitFeatures?: string[];
  buildingPetPolicy?: string; // e.g., "Cats/Dogs Allowed"
  unitPetPolicy?: string; // e.g., "Dogs on approval"
  maintenance?: number; // maint/common charges
  taxes?: number;
  brokerageName: string; // for attribution & boosting
  source?: "IN_HOUSE" | "RLS" | "OTHER";
  rlsAgentName?: string;
  rlsBrokerageName?: string;
  buyerAgentComp?: { type: "percent" | "flat"; value: number } | null; // sale side
  ownerPaysTenantAgent?: boolean | null; // rental side
  // --- ACRIS hook ---
  boroughCode?: number; // 1=Manhattan,2=Bronx,3=Brooklyn,4=Queens
  block?: number;
  lot?: number;
};

const IN_HOUSE = "MAllan Real Estate Inc";

const mockListings: Listing[] = [
  {
    id: "in1",
    address: "333 E 46th St #12A",
    neighborhood: "Midtown East",
    zip: "10017",
    price: 799000,
    isRent: false,
    beds: 1,
    baths: 1,
    sqft: 720,
    ppsf: 1110,
    maintenance: 850,
    taxes: 6500,
    media: Array.from({ length: 16 }).map((_, i) => ({ src: `https://picsum.photos/seed/in1_${i}/800/520`, type: "photo" })),
    buildingAmenities: ["Doorman", "Elevator", "Gym"],
    unitFeatures: ["Washer/Dryer", "Balcony"],
    buildingPetPolicy: "Cats/Dogs Allowed",
    unitPetPolicy: "Dogs on approval",
    brokerageName: IN_HOUSE,
    source: "IN_HOUSE",
    buyerAgentComp: { type: "percent", value: 2.5 },
    ownerPaysTenantAgent: null,
  },
  {
    id: "rls1",
    address: "245 E 47th St #9F",
    neighborhood: "Midtown East",
    zip: "10017",
    price: 725000,
    isRent: false,
    beds: 1,
    baths: 1,
    sqft: 700,
    ppsf: 1036,
    maintenance: 910,
    taxes: 5980,
    media: Array.from({ length: 15 }).map((_, i) => ({ src: `https://picsum.photos/seed/rls1_${i}/800/520`, type: "photo" })),
    buildingAmenities: ["Elevator", "Laundry in Bldg"],
    unitFeatures: ["Renovated"],
    buildingPetPolicy: "Cats/Dogs Case by Case",
    unitPetPolicy: "Cats ok",
    brokerageName: "Example External Brokerage",
    source: "RLS",
    rlsAgentName: "Alex Example",
    rlsBrokerageName: "Example External Brokerage",
    buyerAgentComp: { type: "flat", value: 5000 },
    ownerPaysTenantAgent: null,
  },
  {
    id: "rent1",
    address: "301 E 48th St #5C",
    neighborhood: "Turtle Bay",
    zip: "10017",
    price: 4200,
    isRent: true,
    beds: 0,
    baths: 1,
    sqft: 550,
    ppsf: 91,
    maintenance: 0,
    taxes: 0,
    media: Array.from({ length: 18 }).map((_, i) => ({ src: `https://picsum.photos/seed/rent1_${i}/800/520`, type: "photo" })),
    buildingAmenities: ["Doorman", "Elevator", "Laundry in Bldg"],
    unitFeatures: ["Alcove Studio"],
    buildingPetPolicy: "Cats/Dogs Allowed",
    unitPetPolicy: "Dogs on approval",
    brokerageName: IN_HOUSE,
    source: "IN_HOUSE",
    buyerAgentComp: null,
    ownerPaysTenantAgent: true,
  },
];

// ----------------------------
// Utility helpers
// ----------------------------

function usd(n?: number) {
  if (!n && n !== 0) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// ----------------------------
// Media: Lightbox & Floorplan Viewer
// ----------------------------

function Lightbox({ items, startIndex = 0, onClose }: { items: { src: string; alt?: string }[]; startIndex?: number; onClose: () => void }) {
  const [i, setI] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => (v + 1) % items.length);
      if (e.key === "ArrowLeft") setI((v) => (v - 1 + items.length) % items.length);
      if (e.key === "+") setScale((s) => Math.min(6, s + 0.25));
      if (e.key === "-") setScale((s) => Math.max(1, s - 0.25));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, onClose]);
  function openFs() {
    const el = ref.current as any;
    if (el?.requestFullscreen) el.requestFullscreen();
  }
  return (
    <div role="dialog" aria-modal className="fixed inset-0 bg-black/90 z-50 flex flex-col" ref={ref}>
      <div className="flex justify-between items-center p-3 text-white text-sm">
        <div>{i + 1}/{items.length}</div>
        <div className="flex gap-2">
          <button className="border px-2 py-1" onClick={() => setScale((s) => Math.max(1, s - 0.25))}>−</button>
          <button className="border px-2 py-1" onClick={() => setScale((s) => Math.min(6, s + 0.25))}>+</button>
          <button className="border px-2 py-1" onClick={() => setScale(1)}>Reset</button>
          <button className="border px-2 py-1" onClick={openFs}>Fullscreen</button>
          <button className="border px-2 py-1" onClick={onClose}>Close ✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden flex items-center justify-center">
        <img src={items[i].src} alt={items[i].alt || ""} style={{ transform: `scale(${scale})` }} className="max-h-full max-w-full select-none" />
      </div>
      <div className="p-3 overflow-x-auto whitespace-nowrap bg-black/60">
        {items.map((it, idx) => (
          <button key={idx} onClick={() => setI(idx)} className={`inline-block mr-2 ${idx === i ? "ring-2 ring-white" : ""}`}>
            <img src={it.src} alt="" className="h-16 w-24 object-cover" />
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {items.slice(0, 6).map((m, idx) => (
          <button key={idx} className="relative group" onClick={() => { setStartIndex(idx); setOpen(true); }}>
            <img src={m.src} alt={m.alt || "Listing media"} className="rounded-xl w-full h-40 object-cover" />
            <span className="absolute bottom-2 right-2 text-xs bg-black/70 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100">Expand 🔍</span>
          </button>
        ))}
      </div>
      <button className="mt-2 text-sm underline" onClick={() => { setStartIndex(0); setOpen(true); }}>View all media</button>
      {open && <Lightbox items={items} startIndex={startIndex} onClose={() => setOpen(false)} />}
    </div>
  );
}

// ----------------------------
// Save & Share (simplified UI)
// ----------------------------

function SaveShareBar({ listing, onSelect, selected }: { listing: Listing; onSelect?: (id: string, next: boolean) => void; selected?: boolean }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <button className={`border rounded-full px-3 py-1 text-sm ${selected ? "bg-black text-white" : ""}`} onClick={() => onSelect?.(listing.id, !selected)}>Select</button>
      <button className="border rounded-full px-3 py-1 text-sm">❤ Save</button>
      <button className="border rounded-full px-3 py-1 text-sm">Share</button>
    </div>
  );
}

// ----------------------------
// Mortgage Calculator (inline)
// ----------------------------

function MortgageCalculator({ price, taxes = 0, maint = 0 }: { price: number; taxes?: number; maint?: number }) {
  const [down, setDown] = useState(20);
  const [rate, setRate] = useState(6.5);
  const [term, setTerm] = useState(30);
  const loan = useMemo(() => Math.max(0, price * (1 - down / 100)), [price, down]);
  const monthly = useMemo(() => {
    const r = rate / 100 / 12;
    const n = term * 12;
    const pmt = r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
    return pmt + (taxes / 12) + maint;
  }, [loan, rate, term, taxes, maint]);
  return (
    <div className="rounded-2xl border p-4 mt-4">
      <div className="font-medium">Monthly Estimate</div>
      <div className="text-2xl mt-1">{usd(Math.round(monthly))}</div>
      <div className="grid grid-cols-3 gap-2 text-sm mt-3">
        <label className="flex flex-col">Down %<input value={down} onChange={(e) => setDown(Number(e.target.value))} type="number" className="border rounded p-2" /></label>
        <label className="flex flex-col">Rate %<input value={rate} onChange={(e) => setRate(Number(e.target.value))} type="number" className="border rounded p-2" /></label>
        <label className="flex flex-col">Term (yrs)<input value={term} onChange={(e) => setTerm(Number(e.target.value))} type="number" className="border rounded p-2" /></label>
      </div>
    </div>
  );
}

// ----------------------------
// Contact bar (email/text) — stub UI
// ----------------------------

function ContactAgentBar() {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <a className="border rounded-full px-3 py-1 text-sm" href="mailto:inquiries@mallan.nyc">Email Agent</a>
      <a className="border rounded-full px-3 py-1 text-sm" href="sms:+16462584460">Text Agent</a>
      <button className="border rounded-full px-3 py-1 text-sm">Send via Site</button>
    </div>
  );
}

// ----------------------------
// Listing Card with RLS attribution & media
// ----------------------------

function RLSAttribution({ listing }: { listing: Listing }) {
  const isInHouse = listing.brokerageName === IN_HOUSE;
  const isExternalRLS = listing.source === "RLS" && !isInHouse;
  if (!isExternalRLS) return null;
  return (
    <p className="text-xs text-slate-500 mt-1">Listing courtesy of {listing.rlsAgentName || "Agent"}, {listing.rlsBrokerageName || listing.brokerageName} · <span className="inline-block border rounded px-1">RLS</span></p>
  );
}

function ListingCard({ listing, onSelect, selected }: { listing: Listing; onSelect?: (id: string, next: boolean) => void; selected?: boolean }) {
  const media = listing.media.slice(0, 1);
  return (
    <div className="rounded-2xl border overflow-hidden">
      <img src={media[0]?.src} alt={media[0]?.alt || listing.address} className="w-full h-44 object-cover" />
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">{usd(listing.price)} {listing.isRent ? "/ mo" : ""}</div>
          {listing.brokerageName === IN_HOUSE && <span className="text-xs border rounded px-2 py-0.5">Exclusive</span>}
        </div>
        <div className="text-sm text-slate-600 mt-1">{listing.address}</div>
        <div className="text-sm text-slate-600">{listing.neighborhood} {listing.zip ? `• ${listing.zip}` : ""}</div>
        <div className="text-sm mt-1">{listing.beds} bd • {listing.baths} ba • {listing.sqft ? `${listing.sqft} sf` : "—"}</div>
        {/* Compensation flags */}
        {!listing.isRent && listing.buyerAgentComp && (
          <div className="text-xs text-slate-600 mt-1">Buyer’s Agent Compensation: {listing.buyerAgentComp.type === "percent" ? `${listing.buyerAgentComp.value}%` : usd(listing.buyerAgentComp.value)}</div>
        )}
        {listing.isRent && listing.ownerPaysTenantAgent != null && (
          <div className="text-xs text-slate-600 mt-1">Owner Pays Tenant’s Agent: {listing.ownerPaysTenantAgent ? "Yes" : "No"}</div>
        )}
        <RLSAttribution listing={listing} />
        <SaveShareBar listing={listing} onSelect={onSelect} selected={!!selected} />
      </div>
    </div>
  );
}

// ----------------------------
// Search (Residential/Commercial toggle) — simplified
// ----------------------------

function FilterBar({ onApply }: { onApply: (f: Record<string, any>) => void }) {
  const [tenure, setTenure] = useState<string>(""); // sale|rent
  const [useClass, setUseClass] = useState<string>("res"); // res|com
  const [beds, setBeds] = useState<string>("");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [amenities, setAmenities] = useState<string[]>([]);
  function apply() {
    onApply({ tenure, useClass, beds, minPrice, maxPrice, amenities });
  }
  const toggle = (v: string) => setAmenities((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]));
  return (
    <div className="grid gap-2 md:grid-cols-6 p-3 border rounded-2xl bg-white/70">
      <select value={useClass} onChange={(e) => setUseClass(e.target.value)} className="border rounded p-2">
        <option value="res">Residential</option>
        <option value="com">Commercial</option>
      </select>
      <select value={tenure} onChange={(e) => setTenure(e.target.value)} className="border rounded p-2">
        <option value="">Sale/Rent</option>
        <option value="sale">For Sale</option>
        <option value="rent">For Rent</option>
      </select>
      <select value={beds} onChange={(e) => setBeds(e.target.value)} className="border rounded p-2">
        <option value="">Beds</option>
        <option value="studio">Studio</option>
        <option value="alcove_studio">Alcove Studio</option>
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4plus">4+</option>
      </select>
      <input placeholder="Min $" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="border rounded p-2" />
      <input placeholder="Max $" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="border rounded p-2" />
      <div className="md:col-span-6 flex flex-wrap gap-2 text-xs">
        {["Washer/Dryer", "Balcony", "Doorman", "Elevator", "Gym", "Pool", "Children’s Room"].map((a) => (
          <button key={a} type="button" onClick={() => toggle(a)} className={`border rounded-full px-3 py-1 ${amenities.includes(a) ? "bg-black text-white" : ""}`}>{a}</button>
        ))}
      </div>
      <button className="border rounded px-4 py-2 bg-black text-white" onClick={apply}>Search</button>
    </div>
  );
}

// ----------------------------
// Similar Listings (stub)
// ----------------------------

function SimilarListings({ subject }: { subject: Listing }) {
  // Demo: filter by same zip and +/- 15% price
  const near = mockListings.filter((l) => l.id !== subject.id && l.zip === subject.zip && Math.abs(l.price - subject.price) / subject.price <= 0.15);
  if (!near.length) return null;
  return (
    <div className="mt-6">
      <div className="font-medium">Similar Nearby</div>
      <div className="grid md:grid-cols-3 gap-3 mt-2">
        {near.map((l) => <ListingCard key={l.id} listing={l} />)}
      </div>
    </div>
  );
}

// ----------------------------
// Geoclient (auto-BBL from address) — uses server proxy to v2 API
// ----------------------------

function boroughFromZip(zip?: string) {
  if (!zip) return undefined as undefined | string;
  const z3 = Number(String(zip).slice(0, 3));
  if (Number.isNaN(z3)) return undefined;
  // NYC ZIP leading ranges (approximate, safer mapping)
  if (z3 >= 100 && z3 <= 102) return 'Manhattan';
  if (z3 === 103) return 'Staten Island';
  if (z3 === 104) return 'Bronx';
  if (z3 === 112) return 'Brooklyn';
  if (z3 >= 111 && z3 <= 116 && z3 !== 112) return 'Queens';
  return undefined;
}

function parseHouseAndStreet(addr: string) {
  if (!addr) return { houseNumber: undefined, street: undefined } as any;
  const parts = addr.split(' ');
  const houseNumber = parts.shift();
  const street = parts.join(' ').split('#')[0].trim();
  return { houseNumber, street } as any;
}

function useAutoBBL(listing?: Listing | null) {
  const [state, setState] = useState<{ borough?: number, block?: number, lot?: number, bin?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function resolveViaGeoclient(addr: string, zip?: string, neighborhood?: string) {
    const { houseNumber, street } = parseHouseAndStreet(addr);
    const boroughName = boroughFromZip(zip) || (neighborhood?.includes('Brooklyn') ? 'Brooklyn' : undefined);
    if (!houseNumber || !street || !boroughName) return null;
    const qs = new URLSearchParams({ houseNumber: String(houseNumber), street: String(street), borough: String(boroughName) });
    const res = await fetch(`/api/geoclient/address?${qs.toString()}`);
    if (!res.ok) throw new Error(`geoclient ${res.status}`);
    const data = await res.json();
    const node = data?.address || data?.result || {};
    const bbl = String(node.bbl || '').replace(/[^0-9]/g, '');
    const borough = Number(node.boroughCode1In) || Number(bbl?.slice(0,1));
    const block = Number(node.block) || Number(bbl?.slice(1,6));
    const lot = Number(node.lot) || Number(bbl?.slice(6));
    const bin = node.buildingIdentificationNumber || node.bin;
    if (borough && block && lot) return { borough, block, lot, bin } as const;
    return null;
  }

  async function resolveViaGeoSearch(addr: string, zip?: string, neighborhood?: string) {
    // Public fallback (no key). May include BBL/BIN in properties.addendum.pad.*
    const q = encodeURIComponent(`${addr}${zip ? ' ' + zip : ''}`);
    const r = await fetch(`https://geosearch.planninglabs.nyc/v2/search?size=1&text=${q}`);
    if (!r.ok) throw new Error(`geosearch ${r.status}`);
    const j = await r.json();
    const p = j?.features?.[0]?.properties;
    const add = p?.addendum || {};
    const pad = add?.pad || add?.PAD || {};
    const bblRaw = pad?.bbl || p?.bbl || pad?.BBL || '';
    const binRaw = pad?.bin || p?.bin || pad?.BIN || '';
    const bbl = String(bblRaw).replace(/[^0-9]/g, '');
    const bin = String(binRaw).replace(/[^0-9]/g, '');
    const borough = Number(bbl?.slice(0,1));
    const block = Number(bbl?.slice(1,6));
    const lot = Number(bbl?.slice(6));
    if (borough && block && lot) return { borough, block, lot, bin } as const;
    return null;
  }

  useEffect(() => {
    (async () => {
      if (!listing) return;
      // if listing already has BBL, use it
      if (listing.boroughCode && listing.block && listing.lot) {
        setState({ borough: listing.boroughCode, block: listing.block, lot: listing.lot });
        return;
      }
      try {
        setLoading(true);
        setError(null);
        // Try Geoclient (proxied)
        const viaGc = await resolveViaGeoclient(listing.address, listing.zip, listing.neighborhood);
        if (viaGc) { setState(viaGc); return; }
        // Fallback: NYC GeoSearch (public, keyless)
        const viaGs = await resolveViaGeoSearch(listing.address, listing.zip, listing.neighborhood);
        if (viaGs) { setState(viaGs); return; }
        throw new Error('Could not resolve BBL automatically');
      } catch (e: any) {
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [listing?.address, listing?.zip, listing?.neighborhood]);

  return { ...(state || {}), error, loading };
}

// ----------------------------
// ACRIS (closing history) — live NYC Open Data
// ----------------------------

function AcrisHistory({ borough, block, lot }: { borough?: number; block?: number; lot?: number }) {
  const [b, setB] = useState<string>(borough ? String(borough) : "");
  const [bl, setBl] = useState<string>(block ? String(block) : "");
  const [lt, setLt] = useState<string>(lot ? String(lot) : "");
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fetchAcris() {
    if (!b || !bl || !lt) return;
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams({ "$limit": "25", "$order": "recorded_datetime DESC", borough: b, block: bl, lot: lt });
      async function tryFetch(url: string) {
        const r = await fetch(`${url}?${params.toString()}`, { headers: { 'accept': 'application/json' } });
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }
      let data: any[] = [];
      try { data = await tryFetch('/api/acris'); } catch {}
      if (!Array.isArray(data) || !data.length) {
        data = await tryFetch('https://data.cityofnewyork.us/resource/bnx9-e6tj.json');
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (e:any) {
      setErr(e.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (borough && block && lot) {
      setB(String(borough)); setBl(String(block)); setLt(String(lot));
      fetchAcris();
    }
  }, [borough, block, lot]);

  return (
    <div className="mt-6 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">Recorded Sales & Mortgages (ACRIS)</div>
        <div className="text-xs text-slate-500">Powered by NYC Open Data</div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <label className="flex flex-col">Borough (1–4)<input value={b} onChange={(e)=>setB(e.target.value)} placeholder="1=Manhattan, 4=Queens" className="border rounded p-2"/></label>
        <label className="flex flex-col">Block<input value={bl} onChange={(e)=>setBl(e.target.value)} className="border rounded p-2"/></label>
        <label className="flex flex-col">Lot<input value={lt} onChange={(e)=>setLt(e.target.value)} className="border rounded p-2"/></label>
      </div>
      <div className="mt-2">
        <button className="border rounded px-3 py-2 text-sm" onClick={fetchAcris} disabled={!b||!bl||!lt||loading}>{loading? 'Loading…':'Lookup'}</button>
      </div>
      {err && <div className="mt-3 text-xs text-red-600">{err}</div>}
      {rows && (
        rows.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1 pr-4">Recorded</th>
                  <th className="py-1 pr-4">Doc Type</th>
                  <th className="py-1 pr-4">Amount</th>
                  <th className="py-1 pr-4">Doc ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r:any, idx:number)=>{
                  const recorded = r.recorded_datetime || r.recorded_date || r.doc_date || r.modified_date || '';
                  const docType = r.doc_type || r.document_type || r.type || '';
                  const amount = r.consideration_amount || r.document_amount || r.amount || '';
                  const docId = r.document_id || r.doc_id || '';
                  return (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="py-1 pr-4 whitespace-nowrap">{String(recorded).slice(0,10)}</td>
                      <td className="py-1 pr-4">{docType}</td>
                      <td className="py-1 pr-4">{amount ? usd(Number(amount)) : '—'}</td>
                      <td className="py-1 pr-4 font-mono text-xs">{docId}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-2 text-xs text-slate-500">Tip: Enter Borough/Block/Lot for the property to see filings. Auto-BBL will fill these when possible.</div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-600">No ACRIS records found for that BBL.</div>
        )
      )}
    </div>
  );
}

// ----------------------------

function NearbyPrompt() {
  const [enabled, setEnabled] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    navigator.geolocation?.getCurrentPosition((p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }));
  }, [enabled]);
  return (
    <div className="rounded-2xl border p-4">
      {!enabled ? (
        <button className="border rounded px-3 py-2" onClick={() => setEnabled(true)}>Use my location to find nearby listings</button>
      ) : (
        <div className="text-sm">Location captured. We’ll filter to your vicinity and your saved criteria. {position ? `(${position.lat.toFixed(4)}, ${position.lng.toFixed(4)})` : "Detecting…"}</div>
      )}
    </div>
  );
}

// ----------------------------
// Multi-send compose modal (stub)
// ----------------------------

function ComposeModal({ selected, onClose }: { selected: Listing[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-6 max-w-xl w-full">
        <div className="text-lg font-semibold">Send {selected.length} listing{selected.length > 1 ? "s" : ""}</div>
        <div className="mt-3 grid gap-2 text-sm">
          <input className="border rounded p-2" placeholder="Client email or phone" />
          <textarea className="border rounded p-2" placeholder="Add a quick note (optional)" />
          <div className="flex gap-2">
            <button className="border rounded px-3 py-2">Send Email</button>
            <button className="border rounded px-3 py-2">Send SMS</button>
            <button className="border rounded px-3 py-2">Copy Share Link</button>
          </div>
        </div>
        <div className="mt-4 text-right">
          <button className="text-sm underline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------
// Main App (Landing + Search + Listing detail preview)
// ----------------------------

export default function MallanApp() {
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);

  // Default ranking: in-house boost first
  const results = useMemo(() => {
    let list = [...mockListings];
    // apply tiny subset of filters for preview
    if (filters.tenure) list = list.filter((l) => (filters.tenure === "rent" ? l.isRent : !l.isRent));
    if (filters.beds) list = list.filter((l) => {
      if (filters.beds === "studio") return l.beds === 0;
      if (filters.beds === "alcove_studio") return l.beds === 0 && (l.unitFeatures || []).includes("Alcove Studio");
      if (filters.beds === "4plus") return l.beds >= 4;
      return String(l.beds) === String(filters.beds);
    });
    if (filters.minPrice) list = list.filter((l) => l.price >= Number(filters.minPrice));
    if (filters.maxPrice) list = list.filter((l) => l.price <= Number(filters.maxPrice));
    // in-house boost
    list.sort((a, b) => {
      const ai = a.brokerageName === IN_HOUSE ? 1 : 0;
      const bi = b.brokerageName === IN_HOUSE ? 1 : 0;
      return bi - ai; // put in-house first
    });
    return list;
  }, [filters]);

  const selected = results.filter((r) => selectedIds.includes(r.id));
  const toggleSelect = (id: string, next: boolean) => setSelectedIds((arr) => (next ? [...new Set([...arr, id])] : arr.filter((x) => x !== id)));

  const primary = results[0] || null;
  const auto = useAutoBBL(primary);

  const heroMedia = "https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=1740";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Top brand header */}
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold tracking-tight">MAllan Real Estate Inc</div>
            <div className="text-xs text-slate-600">Maya Allan — Licensed Real Estate Broker • (Mb) 646-258-4460 • maya@mallan.nyc • mallan.nyc</div>
          </div>
          <nav className="hidden md:flex gap-4 text-sm">
            {[["Home", "#home"], ["Buy", "#buy"], ["Rent", "#rent"], ["Commercial", "#commercial"], ["New Dev", "#newdev"], ["Open Houses", "#open"], ["Guides", "#guides"], ["Agents", "#agents"], ["Sell", "#sell"], ["Contact", "#contact"]].map(([t, h]) => (
              <a key={t} href={h} className="hover:underline">{t}</a>
            ))}
          </nav>
        </div>
      </header>

      {/* Hero with search */}
      <section id="home" className="relative">
        <img src={heroMedia} alt="NYC skyline" className="w-full h-[42vh] object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute inset-0 flex items-end">
          <div className="max-w-5xl mx-auto w-full px-4 pb-6">
            <div className="rounded-2xl p-4 bg-white/95 shadow-xl">
              <FilterBar onApply={setFilters} />
              <div className="mt-2 text-xs text-slate-600">Tip: Your exclusives appear first by default. Users can sort by price/newest/PPSF/distance.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured in-house listings */}
      <section className="max-w-7xl mx-auto px-4 py-10" aria-label="Featured Listings">
        <h2 className="text-xl font-medium">Mallan Real Estate Featured</h2>
        <div className="grid md:grid-cols-3 gap-4 mt-3">
          {results.filter((l) => l.brokerageName === IN_HOUSE).slice(0, 3).map((l) => (
            <ListingCard key={l.id} listing={l} onSelect={toggleSelect} selected={selectedIds.includes(l.id)} />
          ))}
        </div>
      </section>

      {/* Search results */}
      <section className="max-w-7xl mx-auto px-4 py-6" id="results">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Results</h3>
          <div className="flex items-center gap-2">
            <button className="border rounded px-3 py-2" onClick={() => setComposeOpen(true)} disabled={!selected.length}>Send Selected ({selected.length})</button>
            <a href="#open" className="underline text-sm">See Open Houses</a>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mt-3">
          {results.map((l) => (
            <ListingCard key={l.id} listing={l} onSelect={toggleSelect} selected={selectedIds.includes(l.id)} />
          ))}
        </div>
      </section>

      {/* Listing detail preview (first result) */}
      {primary && (
        <section className="max-w-5xl mx-auto px-4 py-10" aria-label="Listing Detail Preview">
          <div className="rounded-2xl border overflow-hidden">
            <div className="grid md:grid-cols-2">
              <div className="p-4">
                <ExpandableMedia items={primary.media} />
              </div>
              <div className="p-4">
                <div className="text-2xl font-semibold">{usd(primary.price)} {primary.isRent ? "/ mo" : ""}</div>
                <div className="text-sm text-slate-600 mt-1">{primary.address}</div>
                <div className="text-sm text-slate-600">{primary.neighborhood} • {primary.zip}</div>
                <div className="text-sm mt-1">{primary.beds} bd • {primary.baths} ba • {primary.sqft ? `${primary.sqft} sf` : "—"}</div>
                {/* Pet policies */}
                <div className="text-xs text-slate-600 mt-1">Building pets: {primary.buildingPetPolicy || "—"}</div>
                <div className="text-xs text-slate-600">Unit pets: {primary.unitPetPolicy || "—"}</div>
                {/* BBL/BIN from Geoclient (auto) */}
                <div className="text-xs text-slate-600 mt-2">BBL: {(auto?.borough && auto?.block && auto?.lot) ? `${auto?.borough}-${auto?.block}-${auto?.lot}` : (auto?.loading ? 'Resolving…' : '—')}</div>
                {auto && (auto as any).error && <div className="text-xs text-red-600">Geoclient: {(auto as any).error}</div>}
                {/* Comp flags */}
                {!primary.isRent && primary.buyerAgentComp && (
                  <div className="text-xs text-slate-600 mt-1">Buyer’s Agent Compensation: {primary.buyerAgentComp.type === "percent" ? `${primary.buyerAgentComp.value}%` : usd(primary.buyerAgentComp.value)}</div>
                )}
                {primary.isRent && primary.ownerPaysTenantAgent != null && (
                  <div className="text-xs text-slate-600 mt-1">Owner Pays Tenant’s Agent: {primary.ownerPaysTenantAgent ? "Yes" : "No"}</div>
                )}
                <ContactAgentBar />
                <MortgageCalculator price={primary.price} taxes={primary.taxes} maint={primary.maintenance} />
              </div>
            </div>
            <div className="p-4">
              <SimilarListings subject={primary} />
              {(() => { const boro = auto?.borough ?? primary.boroughCode; const blk = auto?.block ?? primary.block; const lt = auto?.lot ?? primary.lot; return (
                <AcrisHistory borough={boro as any} block={blk as any} lot={lt as any} />
              ); })()}
            </div>
          </div>
        </section>
      )}

      {/* Open Houses teaser */}
      <section id="open" className="max-w-7xl mx-auto px-4 py-10">
        <div className="rounded-2xl border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Open Houses</h3>
            <a className="underline" href="#">View calendar →</a>
          </div>
          <p className="text-sm text-slate-600 mt-2">Mallan Real Estate open houses are pinned first. RSVP to receive reminders and directions.</p>
        </div>
      </section>

      {/* Guides */}
      <section id="guides" className="max-w-7xl mx-auto px-4 py-10">
        <h3 className="text-lg font-medium">Guides & Education</h3>
        <div className="grid md:grid-cols-4 gap-3 mt-3 text-sm">
          {[
            ["Buyer’s Guide", "buyers"],
            ["International Buyer’s Guide", "international-buyers"],
            ["Investor’s Guide", "investors"],
            ["First-Time Home Buyer’s", "first-time"],
          ].map(([t, s]) => (
            <a key={s} href={`#guide-${s}`} className="border rounded-2xl p-4 hover:bg-slate-50">
              <div className="font-medium">{t}</div>
              <div className="text-slate-600 mt-1">Interactive tools + PDF downloads</div>
            </a>
          ))}
        </div>
      </section>

      {/* Location-based recommendation prompt */}
      <section className="max-w-7xl mx-auto px-4 pb-12">
        <NearbyPrompt />
      </section>

      {/* Footer with compliance + SOP + wire fraud */}
      <footer className="bg-slate-50 border-t py-10">
        <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-3 gap-6 text-sm">
          <div>
            <div className="font-semibold">MAllan Real Estate Inc</div>
            <div className="text-slate-600">Fair Housing • Privacy • Standardized Operating Procedures</div>
            <details className="mt-2">
              <summary className="cursor-pointer">Standardized Operating Procedures (NY State)</summary>
              <div className="mt-2 text-xs text-slate-600 space-y-2">
                <p>1. There is no general requirement to provide photo identification prior to a property showing. However, on occasion individual property owners, buildings or certain listing brokers may require photo identification for security or similar purposes prior to a showing, we will communicate this information to buyers/ tenants in prior to showings.</p>
                <p>2. An exclusive buyer representation agreement is not required.</p>
                <p>3. A pre-approval for a mortgage loan is not required to work with us, however at the time of an offer individual property owners, listing brokers or managing agents may require one – and if so, we will communicate this to buyers as applicable for any properties buyers may wish to view.</p>
              </div>
            </details>
            <div className="mt-3 text-xs text-slate-600">Wire Fraud Warning: Always confirm wiring instructions by phone using a known, trusted number. We will never change wiring instructions by email.</div>
          </div>
          <div>
            <div className="font-medium">Quick Links</div>
            <ul className="mt-2 space-y-1">
              <li><a className="underline" href="#home">Home</a></li>
              <li><a className="underline" href="#buy">Buy</a> / <a className="underline" href="#rent">Rent</a> / <a className="underline" href="#commercial">Commercial</a></li>
              <li><a className="underline" href="#open">Open Houses</a></li>
              <li><a className="underline" href="#guides">Guides</a></li>
              <li><a className="underline" href="#agents">Agents</a></li>
              <li><a className="underline" href="#sell">Sell</a></li>
              <li><a className="underline" href="#contact">Contact</a></li>
            </ul>
          </div>
          <div>
            <div className="font-medium">Branding</div>
            <div className="text-xs text-slate-600">Maya Allan — Licensed Real Estate Broker<br/>(Mb) 646-258-4460<br/>maya@mallan.nyc<br/>mallan.nyc</div>
          </div>
        </div>
        <div className="text-xs text-center text-slate-500 mt-8">© {new Date().getFullYear()} MAllan Real Estate Inc</div>
      </footer>

      {composeOpen && <ComposeModal selected={selected} onClose={() => setComposeOpen(false)} />}
    </div>
  );
}

// ensure TS treats this file as a module (belt & suspenders)
export {};
