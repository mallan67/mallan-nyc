// Home = NYC Residential (Buy/Rent) with translucent tabs, hero image,
// featured Mallan exclusives, and compliance footer.
// No imports, no client JS — this renders even if nothing else is configured.

export const metadata = {
  title: "Mallan Real Estate Inc — NYC Residential",
  description: "NYC residential search (buy/rent), Mallan exclusives, and tools.",
};

const HERO_IMG =
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2000&auto=format&fit=crop";

export default function Page() {
  return (
    <>
      <Header />
      <Hero />
      <FeaturedStrip />
      <UtilityTiles />
      <ComplianceFooter />
    </>
  );
}

function Header() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "rgba(255,255,255,.9)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 800 }}>Mallan Real Estate Inc</div>
          <div style={{ color: "#64748b", fontSize: 12 }}>
            Maya Allan — Licensed Real Estate Broker • (Mb) 646-258-4460 •
            maya@mallan.nyc
          </div>
        </div>
        <nav
          style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
        >
          {[
            ["Residential (NYC)", "/"],
            ["Commercial", "/commercial"],
            ["Global", "/global"],
            ["Private Client", "/client-access"],
            ["Open Houses", "#open"],
            ["Guides", "#guides"],
            ["Agents", "#agents"],
            ["Sell", "#sell"],
            ["Contact", "#contact"],
          ].map(([t, h]) => (
            <a
              key={t}
              href={h}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 999,
                padding: "8px 12px",
                background: "#fff",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              {t}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section
      style={{
        position: "relative",
        minHeight: "44vh",
        backgroundImage: `url(${HERO_IMG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,.45), rgba(0,0,0,0))",
        }}
      />
      <div
        style={{
          position: "relative",
          maxWidth: 1200,
          margin: "0 auto",
          padding: "16px 16px 24px",
          display: "flex",
          alignItems: "end",
          minHeight: "44vh",
        }}
      >
        <ResidentialSearchNYC />
      </div>
    </section>
  );
}

function tagChip(text: string) {
  return (
    <button
      key={text}
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 999,
        padding: "8px 12px",
        background: "#fff",
        marginRight: 8,
        marginTop: 8,
        fontSize: 13,
      }}
    >
      {text}
    </button>
  );
}

function inputStyle() {
  return {
    padding: "10px 12px",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    background: "#fff",
    color: "#0f172a",
    width: "100%",
  } as const;
}

function gridCols() {
  return {
    display: "grid",
    gap: 8,
    gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
  } as const;
}

function ResidentialSearchNYC() {
  return (
    <div
      style={{
        width: "100%",
        background: "rgba(255,255,255,.92)",
        backdropFilter: "blur(8px)",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: 12,
      }}
    >
      {/* Tabs (translucent) */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <button
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 999,
            padding: "8px 12px",
            background: "#000",
            color: "#fff",
          }}
        >
          Residential (NYC)
        </button>
        <a
          href="/commercial"
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 999,
            padding: "8px 12px",
            background: "#fff",
            color: "#0f172a",
            textDecoration: "none",
          }}
        >
          Commercial
        </a>
        <a
          href="/global"
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 999,
            padding: "8px 12px",
            background: "#fff",
            color: "#0f172a",
            textDecoration: "none",
          }}
        >
          Global
        </a>
      </div>

      {/* Filters */}
      <div style={gridCols()}>
        <select defaultValue="" style={inputStyle()}>
          <option value="">Buy / Rent</option>
          <option>Buy</option>
          <option>Rent</option>
        </select>

        <select defaultValue="" style={inputStyle()}>
          <option value="">Type (Residential)</option>
          <option>Co-op</option>
          <option>Condo</option>
          <option>Condop</option>
          <option>Townhouse</option>
          <option>Multi-family</option>
          <option>Loft</option>
          <option>New Construction</option>
          <option>Land</option>
        </select>

        <select defaultValue="" style={inputStyle()}>
          <option value="">Beds</option>
          <option>Studio</option>
          <option>Alcove Studio</option>
          <option>1</option>
          <option>2</option>
          <option>3</option>
          <option>4+</option>
        </select>

        <select defaultValue="" style={inputStyle()}>
          <option value="">Baths</option>
          <option>1</option>
          <option>1.5+</option>
          <option>2</option>
          <option>2.5+</option>
          <option>3</option>
          <option>4+</option>
        </select>

        <input placeholder="Min $" inputMode="numeric" style={inputStyle()} />
        <input placeholder="Max $" inputMode="numeric" style={inputStyle()} />
        <input placeholder="Neighborhood / Zip (NYC)" style={inputStyle()} />

        <button
          style={{
            border: "1px solid #000",
            borderRadius: 999,
            padding: "10px 14px",
            background: "#000",
            color: "#fff",
          }}
        >
          Search
        </button>
      </div>

      {/* Amenities */}
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap" }}>
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
        ].map(tagChip)}
      </div>

      {/* Expanded drawer (no JS needed) */}
      <details
        style={{
          margin: "10px 2px 0",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            padding: "10px 12px",
            fontWeight: 600,
            listStyle: "none",
          }}
        >
          Expanded Search (NYC Residential)
        </summary>
        <div
          style={{
            display: "grid",
            gap: 10,
            padding: 12,
            gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#64748b" }}>
            Sq Ft (min)
            <input placeholder="800" inputMode="numeric" style={inputStyle()} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#64748b" }}>
            Maint/Common (max)
            <input placeholder="$" inputMode="numeric" style={inputStyle()} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#64748b" }}>
            Taxes (max)
            <input placeholder="$" inputMode="numeric" style={inputStyle()} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#64748b" }}>
            Building Age
            <select defaultValue="" style={inputStyle()}>
              <option value="">Any</option>
              <option>Prewar</option>
              <option>Postwar</option>
              <option>New</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#64748b" }}>
            Outdoor
            <select defaultValue="" style={inputStyle()}>
              <option value="">Any</option>
              <option>Balcony</option>
              <option>Terrace</option>
              <option>Garden</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#64748b" }}>
            Board Policy
            <select defaultValue="" style={inputStyle()}>
              <option value="">Any</option>
              <option>Sponsor/No Board</option>
              <option>Pied-à-terre</option>
              <option>Investor OK</option>
            </select>
          </label>
        </div>
      </details>
    </div>
  );
}

function FeaturedStrip() {
  const items = [
    {
      id: "ex1",
      img: "https://picsum.photos/seed/mallan_1/640/420",
      price: "$1,995,000",
      meta: "2 bd • 2 ba • 1,250 sf",
      addr: "Midtown East • Condo",
      tag: "Residential",
    },
    {
      id: "ex2",
      img: "https://picsum.photos/seed/mallan_2/640/420",
      price: "$45,000/mo",
      meta: "3,800 sf • Corner • High Ceilings",
      addr: "SoHo • Storefront",
      tag: "Commercial",
    },
    {
      id: "ex3",
      img: "https://picsum.photos/seed/mallan_3/640/420",
      price: "$2,750,000",
      meta: "3 bd • 3 ba • 1,600 sf",
      addr: "Upper West Side • Co-op",
      tag: "Residential",
    },
  ];
  return (
    <section aria-label="Featured Listings">
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 16px" }}>
        <h2 style={{ fontWeight: 800, margin: "0 0 12px" }}>
          Mallan Exclusives — Residential & Commercial
        </h2>
        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
          }}
        >
          {items.map((it) => (
            <article
              key={it.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <img
                alt=""
                src={it.img}
                style={{ width: "100%", height: 180, objectFit: "cover" }}
              />
              <div style={{ padding: 12 }}>
                <div style={{ fontWeight: 700 }}>{it.price}</div>
                <div style={{ color: "#64748b", fontSize: 13 }}>{it.meta}</div>
                <div style={{ color: "#64748b", fontSize: 13 }}>{it.addr}</div>
                <div style={{ color: "#64748b", fontSize: 13 }}>{it.tag}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button style={pillStyle()}>View</button>
                  <button style={pillStyle()}>Save</button>
                  <button style={pillStyle()}>Share</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function pillStyle() {
  return {
    border: "1px solid #e2e8f0",
    borderRadius: 999,
    padding: "8px 12px",
    background: "#fff",
  } as const;
}

function UtilityTiles() {
  const tiles: [string, string][] = [
    ["Closing Costs (NYC)", "#closing"],
    ["Rent vs Buy", "#rentvbuy"],
    ["Sponsor / No-Board", "#sponsor"],
    ["ACRIS Closings", "#acris"],
    ["DOB Snapshot", "#dob"],
    ["Luxury (2–10M)", "/luxury"],
  ];
  return (
    <section>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {tiles.map(([t, h]) => (
            <a key={t} href={h} style={pillStyle()}>
              {t}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComplianceFooter() {
  return (
    <footer
      style={{
        borderTop: "1px solid #e2e8f0",
        background: "#f8fafc",
        padding: "32px 0",
        marginTop: 24,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 16px",
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
        }}
      >
        <div>
          <div style={{ fontWeight: 800 }}>Mallan Real Estate Inc</div>
          <div style={{ color: "#64748b" }}>
            Fair Housing • Privacy • Standardized Operating Procedures
          </div>
          <details style={{ marginTop: 8 }}>
            <summary>Standardized Operating Procedures (NY State)</summary>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
              <p>
                1. No general requirement to provide photo ID prior to a
                showing. We’ll communicate any building-specific policies in
                advance.
              </p>
              <p>2. No exclusive buyer representation agreement required.</p>
              <p>
                3. No mortgage pre-approval required to begin; some
                owners/agents may require one at offer time.
              </p>
            </div>
          </details>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>
            Wire-Fraud Warning: Always verify wiring instructions by phone using
            a known number. We never change wiring instructions by email.
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 800 }}>Quick Links</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, color: "#64748b", fontSize: 13 }}>
            <li>
              <a href="/">Residential (NYC)</a> • <a href="/commercial">Commercial</a> •{" "}
              <a href="/global">Global</a> • <a href="/client-access">Private Client</a>
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
        <div style={{ color: "#64748b", fontSize: 12 }}>
          Maya Allan — Licensed Real Estate Broker
          <br />
          (Mb) 646-258-4460
          <br />
          maya@mallan.nyc
          <br />
          mallan.nyc
        </div>
      </div>
      <div
        style={{
          color: "#64748b",
          fontSize: 12,
          textAlign: "center",
          marginTop: 18,
        }}
      >
        © {new Date().getFullYear()} Mallan Real Estate Inc
      </div>
    </footer>
  );
}
