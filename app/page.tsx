// app/page.tsx — Home style switcher (3 layouts)
// Switch here: 'classic' | 'map' | 'data'
const STYLE: 'classic' | 'map' | 'data' = 'classic';

const HERO_IMG =
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2000&auto=format&fit=crop';

export default function Home() {
  if (STYLE === 'map') return <HomeMap />;
  if (STYLE === 'data') return <HomeData />;
  return <HomeClassic />;
}

/* ------------------ Shared UI bits ------------------ */

function Header() {
  return (
    <header className="site-header">
      <div className="container row">
        <div className="brand">
          <div className="brand-title">Mallan Real Estate Inc</div>
          <div className="brand-sub">
            Maya Allan — Licensed Real Estate Broker • (Mb) 646-258-4460 •
            maya@mallan.nyc
          </div>
        </div>
        <nav className="nav">
          {[
            ['Buy', '#buy'],
            ['Rent', '#rent'],
            ['Commercial', '#commercial'],
            ['New Dev', '#newdev'],
            ['Open Houses', '#open'],
            ['Guides', '#guides'],
            ['Agents', '#agents'],
            ['Sell', '#sell'],
            ['Contact', '#contact'],
          ].map(([t, h]) => (
            <a key={t} href={h} className="nav-link">
              {t}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

function TabbedSearch() {
  return (
    <div className="glass tabs">
      <div className="tab-row">
        <button className="tab active">Residential</button>
        <button className="tab">Commercial</button>
        <button className="tab">New Development</button>
        <button className="tab">International</button>
      </div>
      <div className="filters">
        <select aria-label="Buy or Rent" defaultValue="">
          <option value="">Buy / Rent</option>
          <option value="buy">Buy</option>
          <option value="rent">Rent</option>
        </select>
        <select aria-label="Property Type" defaultValue="">
          <option value="">Type</option>
          <option>Co-op</option>
          <option>Condo</option>
          <option>Condop</option>
          <option>Townhouse</option>
          <option>Multi-family</option>
          <option>Loft</option>
          <option>New Construction</option>
          <option>Land</option>
        </select>
        <select aria-label="Beds" defaultValue="">
          <option value="">Beds</option>
          <option>Studio</option>
          <option>Alcove Studio</option>
          <option>1</option>
          <option>2</option>
          <option>3</option>
          <option>4+</option>
        </select>
        <input placeholder="Min $" inputMode="numeric" />
        <input placeholder="Max $" inputMode="numeric" />
        <input placeholder="Neighborhood / Zip" />
        <button className="btn-primary">Search</button>
      </div>
      <div className="amenities">
        {[
          'Balcony',
          'Washer/Dryer',
          'Sponsor / No Board',
          'Doorman',
          'Elevator',
          'Gym',
          'Pool',
          'Children’s Room',
          'Pet Friendly',
        ].map((a) => (
          <button key={a} className="chip">
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

function FeaturedStrip() {
  return (
    <section className="container section" aria-label="Featured Listings">
      <h2 className="h2">Mallan Exclusives</h2>
      <div className="cards">
        {[1, 2, 3].map((i) => (
          <article className="card" key={i}>
            <img
              alt=""
              className="card-img"
              src={`https://picsum.photos/seed/mallan_${i}/640/420`}
            />
            <div className="card-body">
              <div className="price">$1,995,000</div>
              <div className="meta">2 bd • 2 ba • 1,250 sf</div>
              <div className="addr">123 E 54th St #12A, Midtown East</div>
              <div className="note">Buyer’s Agent Comp: 2.5%</div>
              <div className="actions">
                <button className="pill">View</button>
                <button className="pill">Save</button>
                <button className="pill">Share</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function UtilityTiles() {
  const tiles = [
    ['Closing Costs (NYC)', '#closing'],
    ['Rent vs Buy', '#rentvbuy'],
    ['Sponsor / No-Board', '#sponsor'],
    ['ACRIS Closings', '#acris'],
    ['DOB Snapshot', '#dob'],
    ['Luxury (2–10M)', '/luxury'],
  ];
  return (
    <section className="container section">
      <div className="tiles">
        {tiles.map(([t, h]) => (
          <a key={t} href={h} className="tile glass">
            {t}
          </a>
        ))}
      </div>
    </section>
  );
}

function ComplianceFooter() {
  return (
    <footer className="footer">
      <div className="container grid3">
        <div>
          <div className="brand-title">Mallan Real Estate Inc</div>
          <div className="muted">
            Fair Housing • Privacy • Standardized Operating Procedures
          </div>
          <details>
            <summary>Standardized Operating Procedures (NY State)</summary>
            <div className="sop">
              <p>
                1. No general requirement to provide photo ID prior to a
                showing. Individual owners/buildings/brokers may request it for
                security; we’ll communicate requirements in advance.
              </p>
              <p>2. No exclusive buyer representation agreement required.</p>
              <p>
                3. No mortgage pre-approval required to start; some owners or
                agents may require one at offer time. We’ll communicate as
                applicable.
              </p>
            </div>
          </details>
          <div className="muted small">
            Wire-Fraud Warning: Always verify wiring instructions by phone using
            a known number. We never change wiring instructions by email.
          </div>
        </div>
        <div>
          <div className="h3">Quick Links</div>
          <ul className="links">
            <li>
              <a href="#buy">Buy</a> • <a href="#rent">Rent</a> •{' '}
              <a href="#commercial">Commercial</a>
            </li>
            <li>
              <a href="#guides">Guides</a> • <a href="#open">Open Houses</a>
            </li>
            <li>
              <a href="#agents">Agents</a> • <a href="#sell">Sell</a>
            </li>
            <li>
              <a href="#contact">Contact</a>
            </li>
          </ul>
        </div>
        <div>
          <div className="h3">Branding</div>
          <div className="muted small">
            Maya Allan — Licensed Real Estate Broker
            <br />
            (Mb) 646-258-4460
            <br />
            maya@mallan.nyc
            <br />
            mallan.nyc
          </div>
        </div>
      </div>
      <div className="copyright">
        © {new Date().getFullYear()} Mallan Real Estate Inc
      </div>
    </footer>
  );
}

/* ------------------ Style 1: Classic Luxury Rail ------------------ */

function HomeClassic() {
  return (
    <>
      <Header />
      <section className="hero" style={{ backgroundImage: `url(${HERO_IMG})` }}>
        <div className="overlay" />
        <div className="hero-inner container">
          <TabbedSearch />
        </div>
      </section>
      <FeaturedStrip />
      <UtilityTiles />
      <section id="open" className="container section">
        <div className="glass block">
          <div className="h3">Open Houses</div>
          <div className="muted small">
            RSVP to receive reminders and directions.
          </div>
        </div>
      </section>
      <ComplianceFooter />
    </>
  );
}

/* ------------------ Style 2: Map-First Power Search ------------------ */

function HomeMap() {
  return (
    <>
      <Header />
      <section className="map-wrap">
        <aside className="map-left">
          <div className="sticky">
            <div className="glass block">
              <div className="h3">Search</div>
              <TabbedSearch />
            </div>
            <div className="list">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="list-item glass">
                  Result #{n} — Midtown East • $1.8M • 2 bd
                </div>
              ))}
            </div>
          </div>
        </aside>
        <div className="map-right">
          <div className="map-placeholder">Map area</div>
        </div>
      </section>
      <ComplianceFooter />
    </>
  );
}

/* ------------------ Style 3: Data/Dossier First ------------------ */

function HomeData() {
  const cards = [
    ['The Carlton at 301', 'Condo • Doorman • W/D • Balcony', 'Midtown East'],
    ['Park View Tower', 'Co-op • Prewar • Elevator', 'Upper East Side'],
    ['Tribeca Glass Lofts', 'Condo • New Dev • Gym/Pool', 'Tribeca'],
    ['Beekman Court', 'Co-op • Sponsor Friendly', 'Beekman/Sutton'],
  ];
  return (
    <>
      <Header />
      <section className="hero slim" style={{ backgroundImage: `url(${HERO_IMG})` }}>
        <div className="overlay" />
        <div className="hero-inner container">
          <TabbedSearch />
        </div>
      </section>

      <section className="container section">
        <h2 className="h2">Building & New Development Dossiers</h2>
        <div className="cards">
          {cards.map(([t, s, n]) => (
            <article key={t} className="card card-data">
              <div className="card-body">
                <div className="h3">{t}</div>
                <div className="muted">{n}</div>
                <ul className="metrics">
                  <li>PPSF (12-mo): $1,825</li>
                  <li>Closings (12-mo): 14</li>
                  <li>Amenities: {s}</li>
                </ul>
                <div className="actions">
                  <button className="pill">See listings</button>
                  <button className="pill">ACRIS</button>
                  <button className="pill">DOB</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <UtilityTiles />
      <ComplianceFooter />
    </>
  );
}
/* --- Basic Layout --- */
:root { --bg: #ffffff; --ink: #0f172a; --muted:#64748b; --line:#e2e8f0; }
* { box-sizing: border-box; }
body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; color: var(--ink); background: var(--bg); }
.container { max-width: 1160px; margin: 0 auto; padding: 0 16px; }
.row { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.section { padding: 40px 0; }
.h2 { font-size: 22px; font-weight: 600; }
.h3 { font-size: 18px; font-weight: 600; }
.small { font-size: 12px; }

/* --- Header --- */
.site-header { position: sticky; top:0; z-index:50; backdrop-filter: blur(8px); background: rgba(255,255,255,0.85); border-bottom:1px solid var(--line); }
.brand-title { font-weight:700; letter-spacing:.2px; }
.brand-sub { color: var(--muted); font-size: 12px; margin-top: 2px; }
.nav { display:none; gap:14px; }
.nav-link { color: inherit; text-decoration:none; opacity:.9; }
.nav-link:hover { text-decoration: underline; }
@media (min-width: 900px) { .nav { display:flex; } }

/* --- Hero with translucent tabs --- */
.hero { position: relative; min-height: 54vh; background-size: cover; background-position: center; }
.hero.slim { min-height: 36vh; }
.hero .overlay { position:absolute; inset:0; background: linear-gradient(to top, rgba(0,0,0,.45), rgba(0,0,0,.15)); }
.hero-inner { position: relative; padding: 18vh 0 24px; }
.glass { background: rgba(255,255,255,0.85); backdrop-filter: blur(8px); border:1px solid var(--line); border-radius: 16px; }
.tabs { padding: 12px; }
.tab-row { display:flex; gap:8px; padding:6px; }
.tab { border:none; background: transparent; padding:10px 12px; border-radius: 12px; cursor:pointer; }
.tab.active, .tab:hover { background: rgba(0,0,0,0.06); }
.filters { display:grid; grid-template-columns: repeat(6, 1fr); gap:8px; padding: 8px; }
.filters select, .filters input { width:100%; padding:10px 12px; border:1px solid var(--line); border-radius: 10px; }
.btn-primary { padding:10px 14px; border-radius:10px; border:1px solid var(--line); background:#0f172a; color:#fff; }
.amenities { display:flex; flex-wrap:wrap; gap:8px; padding: 6px 8px 8px; }
.chip { border:1px solid var(--line); border-radius: 999px; padding:6px 10px; background:#fff; cursor:pointer; }
.chip:hover { background:#f8fafc; }

/* --- Cards / Tiles --- */
.cards { display:grid; gap:16px; grid-template-columns: repeat(1, minmax(0,1fr)); }
@media (min-width: 720px) { .cards { grid-template-columns: repeat(3, minmax(0,1fr)); } }
.card { border:1px solid var(--line); border-radius:16px; overflow:hidden; background:#fff; }
.card-img { width:100%; height:220px; object-fit:cover; display:block; }
.card-body { padding:12px; }
.price { font-weight:700; }
.meta, .addr, .note { color: var(--muted); font-size: 13px; margin-top: 2px; }
.actions { display:flex; gap:8px; margin-top:8px; }
.pill { padding:6px 10px; border-radius: 999px; border:1px solid var(--line); background:#fff; cursor:pointer; }
.pill:hover { background:#f1f5f9; }

.tiles { display:grid; gap:12px; grid-template-columns: repeat(2, minmax(0,1fr)); }
@media (min-width: 720px) { .tiles { grid-template-columns: repeat(6, minmax(0,1fr)); } }
.tile { text-align:center; padding:16px; border-radius:12px; text-decoration:none; color:inherit; }
.tile:hover { background:#fff; }

/* --- Map layout --- */
.map-wrap { display:grid; grid-template-columns: 420px 1fr; min-height: calc(100vh - 64px); }
.map-left { border-right:1px solid var(--line); background:#fafafa; }
.sticky { position: sticky; top: 64px; padding: 16px; height: calc(100vh - 64px); overflow:auto; }
.map-right { position:relative; }
.map-placeholder { position:absolute; inset:0; background:
  radial-gradient(circle at 20% 30%, #e2e8f0 0 200px, transparent 200px),
  radial-gradient(circle at 70% 60%, #cbd5e1 0 240px, transparent 240px),
  #e5e7eb; display:flex; align-items:center; justify-content:center; color:#475569; font-weight:600; }

/* --- Data cards --- */
.card-data .metrics { list-style:none; padding:0; margin:10px 0 0; }
.card-data .metrics li { font-size:13px; color:var(--muted); margin:2px 0; }

/* --- Footer --- */
.footer { margin-top: 40px; border-top:1px solid var(--line); background:#f8fafc; }
.grid3 { display:grid; gap:20px; grid-template-columns: 1fr; padding: 24px 0; }
@media (min-width: 900px) { .grid3 { grid-template-columns: 2fr 1fr 1fr; } }
.muted { color: var(--muted); }
.links { list-style:none; padding:0; margin:6px 0; }
.links a { color: inherit; text-decoration: underline; }
.sop { color: var(--muted); font-size: 12px; margin-top: 8px; }
.block { padding: 16px; border-radius: 16px; }
.copyright { text-align:center; padding: 12px; color: var(--muted); border-top:1px solid var(--line); }
