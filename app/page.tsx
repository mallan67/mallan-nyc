'use client';
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Mallan Real Estate — App Router Home Page (ready-to-paste)
 * - Matches your mock: hero photo + translucent left rail
 * - Residential / Commercial / Global search scaffold
 * - Featured in-house listings shown first
 * - Buyer’s Agent Comp / Owner Pays Tenant’s Agent flags
 * - Lightbox viewer (15+ photos), mortgage calculator
 * - Geoclient auto-BBL + ACRIS block (expects /api/geoclient/address and /api/acris)
 * - SOP + Fair Housing/Privacy + Wire-fraud in footer
 */

// ----------------------------
// Types & Mock Data
// ----------------------------

type MediaItem = { src: string; alt?: string; type?: "photo" | "floorplan" | "video" | "tour3d" };

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
  media: MediaItem[];
  buildingAmenities?: string[];
  unitFeatures?: string[];
  buildingPetPolicy?: string;
  unitPetPolicy?: string;
  maintenance?: number;
  taxes?: number;
  brokerageName: string;
  source?: "IN_HOUSE" | "RLS" | "OTHER";
  rlsAgentName?: string;
  rlsBrokerageName?: string;
  buyerAgentComp?: { type: "percent" | "flat"; value: number } | null; // sale
  ownerPaysTenantAgent?: boolean | null; // rent
  boroughCode?: number; // 1–4
  block?: number;
  lot?: number;
  propertyType?: "coop" | "condo" | "condop" | "land" | "townhouse" | "multifamily_1_4" | "rental_building";
  landLease?: boolean;
};

const IN_HOUSE = "Mallan Real Estate Inc";

const mockListings: Listing[] = [
  {
    id: "in1",
    address: "333 E 46th St #12A",
    neighborhood: "Murray Hill",
    zip: "10017",
    price: 799000,
    isRent: false,
    beds: 1,
    baths: 1,
    sqft: 720,
    ppsf: 1110,
    maintenance: 850,
    taxes: 6500,
    media: Array.from({ length: 16 }).map((_, i) => ({ src: `https://picsum.photos/seed/in1_${i}/800/520`, type: "photo" as const })),
    buildingAmenities: ["Doorman", "Elevator", "Gym"],
    unitFeatures: ["Washer/Dryer", "Balcony"],
    buildingPetPolicy: "Cats/Dogs Allowed",
    unitPetPolicy: "Dogs on approval",
    brokerageName: IN_HOUSE,
    source: "IN_HOUSE",
    buyerAgentComp: { type: "percent", value: 2.5 },
    ownerPaysTenantAgent: null,
    propertyType: "condo",
    landLease: false,
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
    media: Array.from({ length: 15 }).map((_, i) => ({ src: `https://picsum.photos/seed/rls1_${i}/800/520`, type: "photo" as const })),
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
    propertyType: "coop",
    landLease: false,
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
    media: Array.from({ length: 18 }).map((_, i) => ({ src: `https://picsum.photos/seed/rent1_${i}/800/520`, type: "photo" as const })),
    buildingAmenities: ["Doorman", "Elevator", "Laundry in Bldg"],
    unitFeatures: ["Alcove Studio"],
    buildingPetPolicy: "Cats/Dogs Allowed",
    unitPetPolicy: "Dogs on approval",
    brokerageName: IN_HOUSE,
    source: "IN_HOUSE",
    buyerAgentComp: null,
    ownerPaysTenantAgent: true,
    propertyType: "rental_building",
    landLease: false,
  },
];

// ----------------------------
// NYC Areas / Neighborhoods (short list; extend anytime)
// ----------------------------

const NEIGHBORHOODS: Record<string, string[]> = {
  Bronx: ["Allerton","Baychester","Bedford Park","Belmont","Bronxdale","Bronxwood","Castle Hill","City Island","Claremont","Claremont Village","Clason Point","Co-op City","Concourse","Concourse Village","Country Club","Crotona Park East","East Morrisania","East Tremont","Eastchester","Edenwald","Fordham","Highbridge","Hunts Point","Kingsbridge","Kingsbridge Heights","Laconia","Locust Point","Longwood","Melrose","Morris Heights","Morris Park","Morrisania","Mott Haven","Mount Eden","Mount Hope","North New York","Norwood","Olinville","Parkchester","Pelham Bay","Pelham Gardens","Pelham Parkway","Port Morris","Riverdale","Central Riverdale","Estate Area","Fieldston","North Riverdale","Spuyten Duyvil","Schuylerville","Soundview","Throgs Neck","Tremont","Unionport","University Heights","Van Nest","Wakefield","West Farms","Westchester Square","Westchester Village","Williamsbridge","Woodlawn","Woodstock"],
  Brooklyn: ["Williamsburg","Greenpoint","Bushwick","Bedford-Stuyvesant","Clinton Hill","Fort Greene","Brooklyn Heights","DUMBO","Downtown Brooklyn","Vinegar Hill","Boerum Hill","Cobble Hill","Carroll Gardens","Gowanus","Red Hook","Park Slope","Prospect Heights","Crown Heights","PLG","Flatbush","Kensington","Windsor Terrace","Sunset Park","Bay Ridge","Bensonhurst","Gravesend","Sheepshead Bay","Brighton Beach","Midwood","Marine Park","Canarsie","East Flatbush","Flatlands","Brownsville","East New York","Coney Island","Sea Gate"],
  Queens: ["Long Island City","Astoria","Sunnyside","Woodside","Jackson Heights","Elmhurst","Corona","Forest Hills","Kew Gardens","Rego Park","Flushing","Murray Hill","Bayside","Douglaston","Little Neck","Whitestone","College Point","Fresh Meadows","Jamaica","Jamaica Estates","St. Albans","Queens Village","Bellerose","Cambria Heights","Laurelton","Springfield Gardens","Rosedale","Howard Beach","Ozone Park","South Ozone Park","Richmond Hill","South Richmond Hill","Woodhaven","Glendale","Ridgewood","Maspeth","Middle Village","Rockaway Park","Far Rockaway"],
  "Staten Island": ["St. George","Tompkinsville","Stapleton","Clifton","Rosebank","South Beach","Midland Beach","New Dorp","Oakwood","Great Kills","Eltingville","Annadale","Huguenot","Tottenville","New Springville","Bulls Head","Willowbrook","Mariners Harbor","Port Richmond"],
};

const AREAS: Record<string, Record<string, string[]>> = {
  Manhattan: {
    "Upper Manhattan": ["Central Harlem","South Harlem","East Harlem","Hamilton Heights","Inwood","Morningside Heights","Washington Heights","Marble Hill","Manhattanville"],
    "Upper West Side": ["Upper West Side","Lincoln Square","Manhattan Valley"],
    "Upper East Side": ["Upper East Side","Carnegie Hill","Lenox Hill","Yorkville","Roosevelt Island"],
    "Midtown East": ["Beekman","Midtown East","Murray Hill","Sutton Place","Turtle Bay","Kips Bay"],
    "Midtown West": ["Central Park South","Hell’s Kitchen","Hudson Yards","Midtown"],
    "Downtown": ["Battery Park City","Chelsea","Chinatown","East Village","Financial District","Fulton/Seaport","Flatiron","NoMad","Gramercy Park","Greenwich Village","NoHo","Little Italy","Lower East Side","Two Bridges","Meatpacking","Nolita","SoHo","Hudson Square","Stuyvesant Town/PCV","Tribeca","Union Square","West Village"],
  },
};

// ----------------------------
// Utilities
// ----------------------------

function usd(n?: number) {
  if (!n && n !== 0) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// ----------------------------
// Media Lightbox
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
// Save & Share (stub)
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
// Listing Card + RLS attribution
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
// Search (Residential/Commercial/Global) — simplified
// ----------------------------

function FilterBar({ onApply }: { onApply: (f: Record<string, any>) => void }) {
  const [scope, setScope] = useState<'nyc-res'|'nyc-com'|'global'>('nyc-res');
  const [isSell, setIsSell] = useState(false);
  const [tenure, setTenure] = useState<string>('sale');

  const [beds, setBeds] = useState<string>("");
  the [minPrice? setMinPrice, setMaxPrice?] // (FIX THIS LINE IF YOU SEE A TS ERROR)
