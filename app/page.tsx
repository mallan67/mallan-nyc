// app/page.tsx — Classic Luxury Rail homepage (clean, no Tailwind)
const HERO_IMG =
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2000&auto=format&fit=crop";

export default function Home() {
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
          <div className="muted small">RSVP to receive reminders and directions.</div>
        </div>
      </section>
      <ComplianceFooter />
    </>
  );
}

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
          {[
            ["Buy", "#buy"],
            ["Rent", "#rent"],
            ["Commercial", "#commercial"],
            ["New Dev", "#newdev"],
            ["Open Houses", "#open"],
            ["Guides", "#guides"],
            ["Agents", "#agents"],
            ["Sell", "#sell"],
            ["Contact", "#contact"],
          ].map(([t, h]) => (
            <a key={t} href={h} className="nav-link">{t}</a>
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
        <select defaultValue=""><option value="">Buy / Rent</option><option value="buy">Buy</option><option value="rent">Rent</option></select>
        <select defaultValue=""><option value="">Type</option><option>Co-op</option><option>Condo</option><option>Condop</option><option>Townhouse</option><option>Multi-family</option><option>Loft</option><option>New Construction</option><option>Land</option></select>
        <select defaultValue=""><option value="">Beds</option><option>Studio</option><option>Alcove Studio</option><option>1</option><option>2</option><option>3</option><option>4+</option></select>
        <input placeholder="Min $" inputMode="numeric" />
        <input placeholder="Max $" inputMode="numeric" />
        <input placeholder="Neighborhood / Zip" />
        <button className="btn-primary">Search</button>
      </div>
      <div className="amenities">
        {["Balcony","Washer/Dryer","Sponsor / No Board","Doorman","Elevator","Gym","Pool","Children’s Room","Pet Friendly"].map((a) => (
          <button key={a} className="chip">{a}</button>
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
            <img alt="" className="card-img" src={`https://picsum.photos/seed/mallan_${i}/640/420`} />
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
            <li><a href="#buy">Buy</a> • <a href="#rent">Rent</a> • <a href="#commercial">Commercial</a></li>
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
