// app/page.tsx
import React from "react";

type Listing = {
  id: string;
  price: number;
  address: string;
  neighborhood: string;
  beds: number;
  baths: number;
  image: string;
  exclusive?: boolean;
};

// TODO: Replace these with your real, in-house listings.
// (You can add as many as you want)
const MY_LISTINGS: Listing[] = [
  {
    id: "m1",
    price: 1795000,
    address: "333 E 46th St, #12A",
    neighborhood: "Murray Hill",
    beds: 2,
    baths: 2,
    image:
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?q=80&w=1600&auto=format&fit=crop",
    exclusive: true,
  },
  {
    id: "m2",
    price: 4295000,
    address: "245 E 47th St, #PH",
    neighborhood: "Midtown East",
    beds: 3,
    baths: 3,
    image:
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?q=80&w=1600&auto=format&fit=crop",
  },
  {
    id: "m3",
    price: 3495000,
    address: "301 W 13th St, #7C",
    neighborhood: "West Village",
    beds: 2,
    baths: 2,
    image:
      "https://images.unsplash.com/photo-1505691723518-36a5ac3b2a9b?q=80&w=1600&auto=format&fit=crop",
  },
];

function usd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function ListingCard({ l }: { l: Listing }) {
  return (
    <article className="card">
      <img src={l.image} alt={l.address} />
      <div className="cardBody">
        <div className="row">
          <h4>{usd(l.price)}</h4>
          {l.exclusive && <span className="pill">Exclusive</span>}
        </div>
        <div className="muted">{l.address}</div>
        <div className="muted">{l.neighborhood}</div>
        <div className="muted">{l.beds} bd • {l.baths} ba</div>
      </div>
      <style jsx>{`
        .card {
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          overflow: hidden;
          background: #fff;
        }
        .card img {
          width: 100%;
          height: 180px;
          object-fit: cover;
        }
        .cardBody { padding: 14px; }
        .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        h4 { margin: 0; font-size: 18px; }
        .muted { color: #6b7280; font-size: 14px; margin-top: 2px; }
        .pill {
          border: 1px solid #111827;
          border-radius: 9999px;
          font-size: 11px;
          padding: 2px 8px;
        }
      `}</style>
    </article>
  );
}

export default function Page() {
  return (
    <main>
      {/* TOP BAR */}
      <div className="topbar">
        <div className="wrap">
          <div className="brand">
            <div className="title">Mallan Real Estate Inc</div>
            <div className="sub">Maya Allan — Licensed Real Estate Broker</div>
          </div>
          <nav className="nav">
            {["Buy","Rent","Sell","Open Houses","Commercial","International","Agents","About Us"].map(label => (
              <a key={label} href="#">{label}</a>
            ))}
          </nav>
        </div>
        <div className="subnav">
          <a href="#">Buyers</a> · <a href="#">Sellers</a> · <a href="#">Investors</a> · <a href="#">List Your Property With Us</a>
        </div>
      </div>

      {/* HERO */}
      <section className="hero">
        <img
          className="heroImg"
          src="https://images.unsplash.com/photo-1493809842364-78817add7ffb?q=80&w=2400&auto=format&fit=crop"
          alt="Luxury living room overlooking NYC"
        />
        {/* Title */}
        <h1 className="heroTitle">WEST VILLAGE MANHATTAN PROPERTIES</h1>

        {/* LEFT RAIL (translucent tabs) */}
        <aside className="leftRail">
          {["BUY","RENT","LUXURY","NEW CONSTRUCTION","COMMERCIAL","ALL LISTINGS"].map((t, i) => (
            <a className={`railItem ${i === 0 ? "first" : ""}`} href="#" key={t}>
              {t}
            </a>
          ))}
        </aside>
      </section>

      {/* MY LISTINGS */}
      <section className="wrap section">
        <h2 className="h2">My Listings</h2>
        <div className="grid">
          {MY_LISTINGS.map((l) => <ListingCard key={l.id} l={l} />)}
        </div>
      </section>

      <style jsx>{`
        :global(html, body) { margin: 0; color: #0f172a; background: #fff; }
        .wrap { max-width: 1140px; margin: 0 auto; padding: 0 16px; }
        .section { padding: 48px 0; }

        /* Top bar */
        .topbar {
          position: sticky;
          top: 0;
          z-index: 30;
          backdrop-filter: saturate(1.2) blur(10px);
          background: rgba(255,255,255,0.78);
          border-bottom: 1px solid #e5e7eb;
        }
        .brand .title { font-weight: 600; font-size: 18px; }
        .brand .sub { font-size: 12px; color: #64748b; }
        .topbar .wrap {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 16px;
        }
        .nav { display: none; gap: 20px; }
        .nav a { color: #0f172a; text-decoration: none; font-size: 14px; }
        .nav a:hover { text-decoration: underline; }
        @media (min-width: 900px) { .nav { display: flex; } }

        .subnav {
          font-size: 12px; color: #475569; padding: 0 16px 10px;
        }
        .subnav a { color: #334155; text-decoration: none; }
        .subnav a:hover { text-decoration: underline; }

        /* Hero */
        .hero { position: relative; height: 70vh; min-height: 520px; }
        .heroImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .heroTitle {
          position: absolute; left: 24px; top: -18px;
          font-family: ui-serif, Georgia, "Times New Roman", Times, serif;
          font-weight: 600; letter-spacing: .02em;
          font-size: clamp(20px, 2.7vw, 32px);
          color: #0f172a;
          background: transparent;
          margin: 0; padding: 16px 0;
        }

        /* Left rail (translucent menu) */
        .leftRail {
          position: absolute; left: 24px; top: 100px; width: 260px;
          background: rgba(0,0,0,.65); color: #fff;
          border-top-right-radius: 14px; border-bottom-right-radius: 14px;
          box-shadow: 0 10px 30px rgba(0,0,0,.3);
          overflow: hidden;
        }
        .railItem {
          display: block; padding: 18px 22px;
          border-top: 1px solid rgba(255,255,255,.12);
          color: #fff; text-decoration: none; letter-spacing: .02em;
        }
        .railItem.first { border-top: 0; }
        .railItem:hover { background: rgba(255,255,255,.08); }

        /* Headings & grid */
        .h2 { font-size: 20px; margin: 0 0 12px 0; }
        .grid {
          display: grid; grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 16px;
        }
        @media (min-width: 700px) {
          .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
    </main>
  );
}
