// app/page.tsx — Home defaults to NYC Residential Buy/Rent. Commercial/USA/International are separate pages.
import { useState } from "react";

const HERO_IMG =
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2000&auto=format&fit=crop";

export default function Home() {
  return (
    <>
      <Header />
      <section className="hero" style={{ backgroundImage: `url(${HERO_IMG})` }}>
        <div className="overlay" />
        <div className="hero-inner container">
          <ResidentialSearchBar />
        </div>
      </section>
      <FeaturedStrip />
      <UtilityTiles />
      <section id="open" className="container section">
        <div className="glass block">
          <div className="h3">Open Houses</div>
          <div className="muted small">RSVP to receive reminders and directions.</div>
        </div>
      </section>
      <ComplianceFooter />
    </>
  );
}

/* ------------------ Header (links to separate pages) ------------------ */
function Header() {
  return (
    <header className="site-header">
      <div className="container row">
        <div className="brand">
          <div className="brand-title">Mallan Real Estate Inc</div>
          <div className="brand-sub">
            Maya Allan — Licensed Real Estate Broker • (Mb) 646-258-4460 • maya@mallan.nyc
          </div>
        </div>
        <nav className="nav">
          <a className="nav-link" href="/">Residential (NYC)</a>
          <a className="nav-link" href="/commercial">Commercial</a>
          <a className="nav-link" href="/national">USA</a>
          <a className="nav-link" href="/international">International</a>
          <a className="nav-link" href="#open">Open Houses</a>
          <a className="nav-link" href="#guides">Guides</a>
          <a className="nav-link" href="#agents">Agents</a>
          <a className="nav-link" href="#sell">Sell</a>
          <a className="nav-link" href="#contact">Contact</a>
        </nav>
      </div>
    </header>
  );
}

/* ------------------ NYC Residential Search (Buy/Rent) ------------------ */
function ResidentialSearchBar() {
  // purely visual for now (wiring to queries next)
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="glass tabs">
      {/* tabs act as LINKS, not mixed forms */}
      <div className="tab-row">
        <button className="tab active">Residential (NYC)</button>
        <a className="tab" href="/commercial">Commercial</a>
        <a className="tab" href="/national">USA</a>
        <a className="tab" href="/international">International</a>
      </div>

      <div className="filters">
        <select aria-label="Buy or Rent" defaultValue="">
          <option value="">Buy / Rent</option>
          <option value="buy">Buy</option>
          <option value="rent">Rent</option>
        </select>

        <select aria-label="Residential Type" defaultValue="">
          <option value="">Type (Residential)</option>
          <option>Co-op</option><option>Condo</option><option>Condop</option>
          <option>Townhouse</option><option>Multi-family</option>
          <option>Loft</option><option>New Construction</option><option>Land</option>
        </select>

        <select aria-label="Beds" defaultValue="">
          <option value="">Beds</option>
          <option>Studio</option><option>Alcove Studio</option>
          <option>1</option><option>2</option><option>3</option><option>4+</option>
        </select>

        <select aria-label="Baths" defaultValue="">
          <option value="">Baths</option>
          <option>1</option><option>1.5+</option><option>2</option>
          <option>2.5+</option><option>3</option><option>4+</option>
        </select>

        <input placeholder="Min $" inputMode="numeric" />
        <input placeholder="Max $" inputMode="numeric" />
        <input placeholder="Neighborhood / Zip (NYC)" />

        <button className="btn-primary">Search</button>
      </div>

      <div className="amenities">
        {[
          "Balcony","Washer/Dryer","Sponsor / No Board","Doorman","Elevator",
          "Gym","Pool","Children’s Room","Pet Friendly","Roof Deck","Recreation Room","Business Center"
        ].map(a => <button key={a} className="chip">{a}</button>)}
      </div>

      <details className="drawer" open={expanded} onToggle={(e:any)=>setExpanded(e.currentTarget.open)}>
        <summary>{expanded ? "Hide" : "Expanded Search"} (NYC Residential)</summary>
        <div className="subgrid">
          <label> Sq Ft (min) <input placeholder="800" inputMode="numeric" /></label>
          <label> Maint/Common (max) <input placeholder="$" inputMode="numeric" /></label>
          <label> Taxes (max) <input placeholder="$" inputMode="numeric" /></label>
          <label> Building Age
            <select defaultValue=""><option value="">Any</option><option>Prewar</option><option>Postwar</option><option>New</option></select>
          </label>
          <label> Outdoor
            <select defaultValue=""><option value="">Any</option><option>Balcony</option><option>Terrace</option><option>Garden</option></select>
          </label>
          <label> Board Policy
            <select defaultValue=""><option value="">Any</option><option>Sponsor/No Board</option><option>Pied-à-terre</option><option>Investor OK</option></select>
          </label>
        </div>
      </details>
    </div>
  );
}

/* ------------------ Featured includes ALL Mallan exclusives (res + commercial) ------------------ */
function FeaturedStrip() {
  const items = [
    { id: "ex1", img: "https://picsum.photos/seed/mallan_1/640/420", price: "$1,995,000", meta: "2 bd • 2 ba • 1,250 sf", addr: "Midtown East • Condo", tag: "Residential" },
    { id: "ex2", img: "https://picsum.photos/seed/mallan_2/640/420", price: "$45,000/mo", meta: "3,800 sf • Corner • High Ceilings", addr: "SoHo • Storefront", tag: "Commercial" },
    { id: "ex3", img: "https://picsum.photos/seed/mallan_3/640/420", price: "$2,750,000", meta: "3 bd • 3 ba • 1,600 sf", addr: "Upper West Side • Co-op", tag: "Residential" },
  ];
  return (
    <section className="container section" aria-label="Featured Listings">
      <h2 className="h2">Mallan Exclusives — Residential & Commercial</h2>
      <div className="cards">
        {items.map((it) => (
          <article className="card" key={it.id}>
            <img alt="" className="card-img" src={it.img} />
            <div className="card-body">
              <div className="price">{it.price}</div>
              <div className="meta">{it.meta}</div>
              <div className="addr">{it.addr}</div>
              <div className="note">{it.tag}</div>
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

/* ------------------ Tiles ------------------ */
function UtilityTiles() {
  const tiles = [
    ["Closing Costs (NYC)", "#closing"],
    ["Rent vs Buy", "#rentvbuy"],
    ["Sponsor / No-Board", "#sponsor"],
    ["ACRIS Closings", "#acris"],
    ["DOB Snapshot", "#dob"],
    ["Luxury (2–10M)", "/luxury"],
  ];
  return (
    <section className="container section">
      <div className="tiles">
        {tiles.map(([t, h]) => (
          <a key={t} href={h} className="tile glass">{t}</a>
        ))}
      </div>
    </section>
  );
}

/* ------------------ Footer ------------------ */
function ComplianceFooter() {
  return (
    <footer className="footer">
      <div className="container grid3">
        <div>
          <div className="brand-title">Mallan Real Estate Inc</div>
          <div className="muted">Fair Housing • Privacy • Standardized Operating Procedures</div>
          <details>
            <summary>Standardized Operating Procedures (NY State)</summary>
            <div className="sop">
              <p>1. No general requirement to provide photo ID prior to a showing. We’ll communicate any building-specific policies in advance.</p>
              <p>2. No exclusive buyer representation agreement required.</p>
              <p>3. No mortgage pre-approval required to begin; some owners/agents may require one at offer time.</p>
            </div>
          </details>
          <div className="muted small">Wire-Fraud Warning: Always verify wiring instructions by phone using a known number. We never change wiring instructions by email.</div>
        </div>
        <div>
          <div className="h3">Quick Links</div>
          <ul className="links">
            <li><a href="/">Residential (NYC)</a> • <a href="/commercial">Commercial</a> • <a href="/national">USA</a> • <a href="/international">International</a></li>
            <li><a href="#guides">Guides</a> • <a href="#open">Open Houses</a></li>
            <li><a href="#agents">Agents</a> • <a href="#sell">Sell</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
        </div>
        <div>
          <div className="h3">Branding</div>
          <div className="muted small">
            Maya Allan — Licensed Real Estate Broker<br/>(Mb) 646-258-4460<br/>maya@mallan.nyc<br/>mallan.nyc
          </div>
        </div>
      </div>
      <div className="copyright">© {new Date().getFullYear()} Mallan Real Estate Inc</div>
    </footer>
  );
}
