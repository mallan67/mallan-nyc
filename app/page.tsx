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

      {/* Filters row */}
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

        {/* NEW — Baths */}
        <select aria-label="Baths" defaultValue="">
          <option value="">Baths</option>
          <option>1</option>
          <option>1.5+</option>
          <option>2</option>
          <option>2.5+</option>
          <option>3</option>
          <option>4+</option>
        </select>

        <input placeholder="Min $" inputMode="numeric" />
        <input placeholder="Max $" inputMode="numeric" />
        <input placeholder="Neighborhood / Zip" />

        <button className="btn-primary">Search</button>
      </div>

      {/* Amenities chips (added Roof Deck, Recreation Room, Business Center) */}
      <div className="amenities">
        {[
          "Balcony",
          "Washer/Dryer",
          "Sponsor / No Board",
          "Doorman",
          "Elevator",
          "Gym",
          "Pool",
          "Children’s Room",
          "Pet Friendly",
          "Roof Deck",
          "Recreation Room",
          "Business Center",
        ].map((a) => (
          <button key={a} className="chip">{a}</button>
        ))}
      </div>
    </div>
  );
}
