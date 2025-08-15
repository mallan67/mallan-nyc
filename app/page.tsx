// app/page.tsx — Home = NYC Residential (Buy/Rent). Featured shows Mallan exclusives (res + commercial).
const HERO_IMG = "https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2000&auto=format&fit=crop";

export default function Page() {
  return (
    <>
      <Header />
      <section className="hero" style={{ backgroundImage: `url(${HERO_IMG})` }}>
        <div className="overlay" />
        <div className="hero-inner container">
          <ResidentialSearchNYC />
        </div>
      </section>
      <FeaturedStrip />
      <UtilityTiles />
      <ComplianceFooter />
    </>
  );
}

function Header() {
  return (
    <header className="site-header">
      <div className="container row">
        <div>
          <div className="brand-title">Mallan Real Estate Inc</div>
          <div className="brand-sub">Maya Allan — Licensed Real Estate Broker • (Mb) 646-258-4460 • maya@mallan.nyc</div>
        </div>
        <nav className="nav">
          <a className="nav-link" href="/">Residential (NYC)</a>
          <a className="nav-link" href="/commercial">Commercial</a>
          <a className="nav-link" href="/global">Global</a>
          <a className="nav-link" href="/client-access">Private Client</a>
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

function ResidentialSearchNYC() {
  return (
    <div className="glass tabs">
      <div className="tab-row">
        <button className="tab active">Residential (NYC)</button>
        <a className="tab" href="/commercial">Commercial</a>
        <a className="tab" href="/global">Global</a>
      </div>

      <div className="filters">
        <select defaultValue=""><option value="">Buy / Rent</option><option>Buy</option><option>Rent</option></select>
        <select defaultValue="">
          <option value="">Type (Residential)</option>
          <option>Co-op</option><option>Condo</option><option>Condop</option>
          <option>Townhouse</option><option>Multi-family</option>
          <option>Loft</option><option>New Construction</option><option>Land</option>
        </select>
        <select defaultValue=""><option value="">Beds</option><option>Studio</option><option>Alcove Studio</option><option>1</option><option>2</option><option>3</option><option>4+</option></select>
        <select defaultValue=""><option value="">Baths</option><option>1</option><option>1.5+</option><option>2</option><option>2.5+</option><option>3</option><option>4+</option></select>
        <input placeholder="Min $" inputMode="numeric" />
        <input placeholder="Max $" inputMode="numeric" />
        <input placeholder="Neighborhood / Zip (NYC)" />
        <button className="btn-primary">Search</button>
      </div>

      <div className="amenities">
        {["Balcony","Washer/Dryer","Sponsor / No Board","Doorman","Elevator","Gym","Pool","Children’s Room","Pet Friendly","Roof Deck","Recreation Room","Business Center"].map(a=>(
          <button className="chip" key={a}>{a}</button>
        ))}
      </div>

      <details className="drawer">
        <summary>Expanded Search (NYC Residential)</summary>
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

function FeaturedStrip() {
  const items = [
    { id: "ex1", img: "https://picsum.photos/seed/mallan_1/640/420", price: "$1,995,000", meta: "2 bd • 2 ba • 1,250 sf", addr: "Midtown East • Condo", tag: "Residential" },
    { id: "ex2", img: "https://picsum.photos/seed/mallan_2/640/420", price: "$45,000/mo", meta: "3,800 sf • Corner • High Ceilings", addr: "SoHo • Storefront", tag: "Commercial" },
    { id: "ex3", img: "https://picsum.photos/seed/mallan_3/640/420", price: "$2,750,000", meta: "3 bd • 3 ba • 1,600 sf", addr: "Upper West Side • Co-op", tag: "Residential" },
  ];
  return (
    <section className="container section" aria-label="Featured Listings">
      <h2 className="brand-title">Mallan Exclusives — Residential & Commercial</h2>
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
      <div className="cards">
        {tiles.map(([t, h]) => (
          <a key={t} href={h} className="pill">{t}</a>
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
          <div className="muted">Fair Housing • Privacy • Standardized Operating Procedures</div>
          <details>
            <summary>Standardized Operating Procedures (NY State)</summary>
            <div className="small muted">
              <p>1. No general requirement to provide photo ID prior to a showing. We’ll communicate any building-specific policies in advance.</p>
              <p>2. No exclusive buyer representation agreement required.</p>
              <p>3. No mortgage pre-approval required to begin; some owners/agents may require one at offer time.</p>
            </div>
          </details>
          <div className="muted small">Wire-Fraud Warning: Always verify wiring instructions by phone using a known number. We never change wiring instructions by email.</div>
        </div>
        <div>
          <div className="brand-title">Quick Links</div>
          <ul className="small muted" style={{listStyle:"none",padding:0,margin:0}}>
            <li><a href="/">Residential (NYC)</a> • <a href="/commercial">Commercial</a> • <a href="/global">Global</a> • <a href="/client-access">Private Client</a></li>
            <li><a href="#guides">Guides</a> • <a href="#open">Open Houses</a></li>
            <li><a href="#agents">Agents</a> • <a href="#sell">Sell</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
        </div>
        <div className="small muted">
          Maya Allan — Licensed Real Estate Broker<br/>(Mb) 646-258-4460<br/>maya@mallan.nyc<br/>mallan.nyc
        </div>
      </div>
      <div className="copyright">© {new Date().getFullYear()} Mallan Real Estate Inc</div>
    </footer>
  );
}
