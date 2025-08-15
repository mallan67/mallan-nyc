// app/commercial/page.tsx — Dedicated commercial search
const HERO = "https://images.unsplash.com/photo-1497215842964-222b430dc094?q=80&w=2000&auto=format&fit=crop";

export default function CommercialPage() {
  return (
    <>
      <Header />
      <section className="hero" style={{ backgroundImage: `url(${HERO})` }}>
        <div className="overlay" />
        <div className="hero-inner container">
          <CommercialSearch />
        </div>
      </section>
      <SectionAbout />
    </>
  );
}

function Header() {
  return (
    <header className="site-header">
      <div className="container row">
        <div className="brand"><div className="brand-title">Mallan Real Estate Inc</div></div>
        <nav className="nav">
          <a className="nav-link" href="/">Residential (NYC)</a>
          <a className="nav-link" href="/commercial">Commercial</a>
          <a className="nav-link" href="/national">USA</a>
          <a className="nav-link" href="/international">International</a>
        </nav>
      </div>
    </header>
  );
}

function CommercialSearch() {
  return (
    <div className="glass tabs">
      <div className="tab-row">
        <button className="tab active">Commercial</button>
        <a className="tab" href="/">Residential (NYC)</a>
        <a className="tab" href="/national">USA</a>
        <a className="tab" href="/international">International</a>
      </div>

      <div className="filters">
        <select aria-label="Buy or Rent" defaultValue="">
          <option value="">Buy / Rent</option>
          <option value="buy">Buy</option>
          <option value="rent">Rent</option>
        </select>

        <select aria-label="Commercial Type" defaultValue="">
          <option value="">Type (Commercial)</option>
          <optgroup label="Office">
            <option>Office</option><option>Medical</option>
            <option>Loft/Creative Space</option><option>Office/Storefront Retail</option>
            <option>Office Live/Work Unit</option><option>Office/Residential</option>
            <option>Telecom/Data</option>
          </optgroup>
          <optgroup label="Industrial">
            <option>Industrial</option><option>Flex</option><option>Distribution</option>
            <option>Manufacturing</option><option>R&amp;D</option>
            <option>Cold Storage</option><option>Showroom</option><option>Warehouse</option>
          </optgroup>
          <optgroup label="Retail">
            <option>Retail</option><option>Storefront</option><option>Freestanding</option>
            <option>Showroom</option><option>Bank</option>
            <option>Day Care</option><option>Grocery/Convenience</option>
          </optgroup>
          <optgroup label="Restaurant"><option>Restaurant</option></optgroup>
          <optgroup label="Multifamily">
            <option>Multifamily</option><option>Garden</option><option>Low-Rise</option>
            <option>Mid-Rise</option><option>High-Rise</option><option>Dormitory</option>
          </optgroup>
          <optgroup label="Health Care"><option>Health Care</option></optgroup>
          <optgroup label="Hospitality">
            <option>Hospitality</option><option>Hotel</option><option>Bed & Breakfast</option>
            <option>Hostel</option><option>Serviced Apartment</option>
          </optgroup>
          <optgroup label="Land">
            <option>Land</option><option>Residential/Multifamily</option>
            <option>Commercial</option><option>Industrial</option><option>Agricultural</option>
          </optgroup>
        </select>

        <select aria-label="Rooms" defaultValue="">
          <option value="">Rooms</option>
          <option>1</option><option>2</option><option>3</option>
          <option>4</option><option>5+</option>
        </select>

        <select aria-label="Restrooms" defaultValue="">
          <option value="">Restrooms</option>
          <option>1</option><option>2</option><option>3+</option>
        </select>

        <input placeholder="Sq Ft (min)" inputMode="numeric" />
        <input placeholder="Min $" inputMode="numeric" />
        <input placeholder="Max $" inputMode="numeric" />
        <input placeholder="Neighborhood / Zip" />

        <button className="btn-primary">Search</button>
      </div>

      <div className="amenities">
        {[
          "Corner","Venting","24/7 Access","High Ceilings","Freight Elevator",
          "Loading Dock","Built/Plug & Play","Furnished","Outdoor Space","Signage"
        ].map(a => <button key={a} className="chip">{a}</button>)}
      </div>

      <details className="drawer">
        <summary>Expanded Search (Commercial)</summary>
        <div className="subgrid">
          <label> Floor <input placeholder="Ground / 2 / PH" /></label>
          <label> Ceiling Height <input placeholder="12’+" /></label>
          <label> Power/Gas <input placeholder="200A / ConEd / NatGas" /></label>
          <label> Term (lease) <input placeholder="5–10 yrs" /></label>
          <label> Key Money <select defaultValue=""><option value="">Any</option><option>Yes</option><option>No</option></select></label>
          <label> Frontage/Depth <input placeholder="e.g., 25' x 80'" /></label>
        </div>
      </details>
    </div>
  );
}

function SectionAbout() {
  return (
    <section className="container section">
      <div className="glass block">
        <div className="h3">Commercial at Mallan</div>
        <div className="muted small">Retail • Office • Industrial • Hospitality • Medical • Multifamily • Land</div>
      </div>
    </section>
  );
}
