// app/national/page.tsx — USA/National search (Residential-first; add Commercial later if you want)
const HERO = "https://images.unsplash.com/photo-1523217582562-09d0def993a6?q=80&w=2000&auto=format&fit=crop";

export default function NationalPage() {
  return (
    <>
      <Header />
      <section className="hero" style={{ backgroundImage: `url(${HERO})` }}>
        <div className="overlay" />
        <div className="hero-inner container">
          <USASearch />
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

function USASearch() {
  return (
    <div className="glass tabs">
      <div className="tab-row">
        <button className="tab active">USA / National</button>
        <a className="tab" href="/">Residential (NYC)</a>
        <a className="tab" href="/commercial">Commercial</a>
        <a className="tab" href="/international">International</a>
      </div>

      <div className="filters">
        <select defaultValue=""><option value="">Buy / Rent</option><option>Buy</option><option>Rent</option></select>
        <select defaultValue="">
          <option value="">Type (Residential)</option>
          <option>Condo</option><option>House</option><option>Townhouse</option><option>Multi-family</option><option>Land</option>
        </select>
        <select defaultValue=""><option value="">Beds</option><option>Studio</option><option>1</option><option>2</option><option>3</option><option>4+</option></select>
        <select defaultValue=""><option value="">Baths</option><option>1</option><option>2</option><option>3</option><option>4+</option></select>
        <input placeholder="State (e.g., NY, FL, CA)" />
        <input placeholder="City" />
        <input placeholder="Min $" inputMode="numeric" />
        <input placeholder="Max $" inputMode="numeric" />
        <button className="btn-primary">Search</button>
      </div>

      <div className="amenities">
        {["Pool","Garage","Waterfront","New Build","Gated Community","HOA < $500"].map(a => <button key={a} className="chip">{a}</button>)}
      </div>
    </div>
  );
}
