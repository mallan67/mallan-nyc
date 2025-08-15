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
