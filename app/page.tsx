import { useState } from "react";
// app/page.tsx — Clean homepage with Baths + new amenities
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

/* ------------------ Header ------------------ */
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

/* ------------------ Translucent tabbed search ------------------ */
function TabbedSearch() {
  const [tab, setTab] = useState<'res' | 'com' | 'new' | 'intl'>('res');
  const [open, setOpen] = useState(false);

  return (
    <div className="glass tabs">
      {/* Tabs */}
      <div className="tab-row">
        <button className={`tab ${tab==='res'?'active':''}`} onClick={() => setTab('res')}>Residential</button>
        <button className={`tab ${tab==='com'?'active':''}`} onClick={() => setTab('com')}>Commercial</button>
        <button className={`tab ${tab==='new'?'active':''}`} onClick={() => setTab('new')}>New Development</button>
        <button className={`tab ${tab==='intl'?'active':''}`} onClick={() => setTab('intl')}>International</button>
      </div>

      {/* Primary filters — change per tab */}
      <div className="filters">
        {/* Tenure */}
        <select aria-label="Buy or Rent" defaultValue="">
          <option value="">Buy / Rent</option>
          <option value="buy">Buy</option>
          <option value="rent">Rent</option>
        </select>

        {/* Residential vs Commercial vs New Dev vs International */}
        {tab === 'res' && (
          <>
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
          </>
        )}

        {tab === 'com' && (
          <>
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
                <option>Hospitality</option><option>Hotel</option>
                <option>Bed & Breakfast</option><option>Hostel</option><option>Serviced Apartment</option>
              </optgroup>
              <optgroup label="Land">
                <option>Land</option><option>Residential/Multifamily</option>
                <option>Commercial</option><option>Industrial</option><option>Agricultural</option>
              </optgroup>
            </select>

            {/* NEW: Rooms for commercial */}
            <select aria-label="Rooms" defaultValue="">
              <option value="">Rooms</option>
              <option>1</option><option>2</option><option>3</option>
              <option>4</option><option>5+</option>
            </select>

            {/* Baths for commercial (e.g., restrooms) */}
            <select aria-label="Baths" defaultValue="">
              <option value="">Baths</option>
              <option>1</option><option>2</option><option>3+</option>
            </select>
          </>
        )}

        {tab === 'new' && (
          <>
            <select aria-label="Status" defaultValue="">
              <option value="">Status</option>
              <option>Pre-sales</option><option>Under Construction</option><option>Recently Completed</option>
            </select>
            <select aria-label="Occupancy" defaultValue="">
              <option value="">Occupancy</option>
              <option>Now</option><option>Next 6 mo</option><option>12 mo</option><option>18+ mo</option>
            </select>
            <select aria-label="Unit Type" defaultValue="">
              <option value="">Unit Type</option>
              <option>Studio</option><option>1</option><option>2</option><option>3</option><option>4+</option>
            </select>
          </>
        )}

        {tab === 'intl' && (
          <>
            <input placeholder="Country" />
            <input placeholder="City" />
            <select aria-label="Property Type" defaultValue="">
              <option value="">Type</option>
              <option>Condo</option><option>House</option><option>Villa</option>
              <option>Townhouse</option><option>Land</option>
            </select>
            <select aria-label="Currency" defaultValue="">
              <option value="">Currency</option>
              <option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AED</option>
            </select>
          </>
        )}

        {/* Always show price + area */}
        <input placeholder="Min $" inputMode="numeric" />
        <input placeholder="Max $" inputMode="numeric" />
        <input placeholder="Neighborhood / Zip" />

        <button className="btn-primary">Search</button>
      </div>

      {/* Amenities / Advanced — tailored per tab */}
      <div className="amenities">
        {(tab === 'res') && [
          "Balcony","Washer/Dryer","Sponsor / No Board","Doorman","Elevator",
          "Gym","Pool","Children’s Room","Pet Friendly","Roof Deck","Recreation Room","Business Center"
        ].map(a => <button key={a} className="chip">{a}</button>)}

        {(tab === 'com') && [
          "Corner","Venting","24/7 Access","High Ceilings","Freight Elevator",
          "Loading Dock","Built/Plug & Play","Furnished","Outdoor Space","Signage"
        ].map(a => <button key={a} className="chip">{a}</button>)}

        {(tab === 'new') && [
          "Sponsor Units","421-a/Abatement","Doorman","Pool","Gym","Roof Deck","Children’s Room"
        ].map(a => <button key={a} className="chip">{a}</button>)}

        {(tab === 'intl') && [
          "Beachfront","City Center","New Build","Furnished","Gated Community"
        ].map(a => <button key={a} className="chip">{a}</button>)}
      </div>

      {/* Expandable: more filters per tab */}
      <details className="drawer" open={open} onToggle={(e:any)=>setOpen(e.currentTarget.open)}>
        <summary>{open ? "Hide" : "Expanded Search"} filters</summary>

        {tab === 'res' && (
          <div className="subgrid">
            <label> Sq Ft (min) <input placeholder="e.g. 800" inputMode="numeric" /></label>
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
        )}

        {tab === 'com' && (
          <div className="subgrid">
            <label> Sq Ft (min) <input placeholder="e.g. 1,500" inputMode="numeric" /></label>
            <label> Floor <input placeholder="e.g. Ground/2/PH" /></label>
            <label> Ceiling Height <input placeholder="e.g. 12’+" /></label>
            <label> Venting <select defaultValue=""><option value="">Any</option><option>Yes</option><option>No</option></select></label>
            <label> Term (lease) <input placeholder="e.g. 5–10 yrs" /></label>
            <label> Key Money <select defaultValue=""><option value="">Any</option><option>Yes</option><option>No</option></select></label>
          </div>
        )}

        {tab === 'new' && (
          <div className="subgrid">
            <label> Developer <input placeholder="Name" /></label>
            <label> Architect <input placeholder="Name" /></label>
            <label> #Units (min) <input inputMode="numeric" placeholder="e.g. 50" /></label>
            <label> Amenities Count (min) <input inputMode="numeric" placeholder="e.g. 5" /></label>
          </div>
        )}

        {tab === 'intl' && (
          <div className="subgrid">
            <label> Visa/Residency <select defaultValue=""><option value="">Any</option><option>Golden Visa Eligible</option><option>Non-eligible</option></select></label>
            <label> Language Support <input placeholder="e.g. Spanish, Hebrew, French" /></label>
            <label> HOA/Condo Fees (max) <input inputMode="numeric" placeholder="$" /></label>
          </div>
        )}
      </details>
    </div>
  );
}

/* ------------------ Featured strip (placeholder) ------------------ */
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

/* ------------------ Utility tiles ------------------ */
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
