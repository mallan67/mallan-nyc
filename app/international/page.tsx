// app/international/page.tsx — Dedicated international search
const HERO = "https://images.unsplash.com/photo-1491884662610-dfcd28f30cf5?q=80&w=2000&auto=format&fit=crop";

export default function InternationalPage() {
  return (
    <>
      <Header />
      <section className="hero" style={{ backgroundImage: `url(${HERO})` }}>
        <div className="overlay" />
        <div className="hero-inner container">
          <IntlSearch />
        </div>
      </section>
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

function IntlSearch() {
  return (
    <div className="glass tabs">
      <div className="tab-row">
        <button className="tab active">International</button>
        <a className="tab" href="/">Residential (NYC)</a>
        <a className="tab" href="/commercial">Commercial</a>
        <a className="tab" href="/national">USA</a>
      </div>

      <div className="filters">
        <select defaultValue=""><option value="">Buy / Rent</option><option>Buy</option><option>Rent</option></select>
        <input placeholder="Country" />
        <input placeholder="City" />
        <select defaultValue="">
          <option value="">Type</option>
          <option>Condo</option><option>House</option><option>Villa</option>
          <option>Townhouse</option><option>Land</option>
        </select>
        <select defaultValue=""><option value="">Currency</option><option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AED</option><option>ILS</option></select>
        <input placeholder="Min $" inputMode="numeric" />
        <input placeholder="Max $" inputMode="numeric" />
        <button className="btn-primary">Search</button>
      </div>

      <div className="amenities">
        {["Beachfront","City Center","New Build","Furnished","Gated Community"].map(a => <button key={a} className="chip">{a}</button>)}
      </div>

      <details className="drawer">
        <summary>Expanded Search (International)</summary>
        <div className="subgrid">
          <label> Visa/Residency <select defaultValue=""><option value="">Any</option><option>Golden Visa Eligible</option><option>Non-eligible</option></select></label>
          <label> Language Support <input placeholder="Spanish, Hebrew, French…" /></label>
          <label> HOA/Condo Fees (max) <input inputMode="numeric" placeholder="$" /></label>
        </div>
      </details>
    </div>
  );
}
