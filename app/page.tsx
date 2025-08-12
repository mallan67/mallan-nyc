'use client';
export default function HomePage() {
  return (
    <main style={{ padding: 24, maxWidth: 1120, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>MAllan Real Estate Inc</h1>
      <p style={{ color: "#475569" }}>
        Maya Allan — Licensed Real Estate Broker • (Mb) 646-258-4460 • maya@mallan.nyc • mallan.nyc
      </p>

      <nav style={{ marginTop: 12 }}>
        <a href="#buy">Buy</a> · <a href="#rent">Rent</a> · <a href="#commercial">Commercial</a> ·{" "}
        <a href="#open">Open Houses</a> · <a href="#guides">Guides</a> · <a href="#agents">Agents</a>
      </nav>

      <section style={{ marginTop: 24 }}>
        <h2>Search</h2>
        <p style={{ color: "#475569" }}>
          Advanced search, media lightbox, calculators, ACRIS & DOB tabs are coming next.
        </p>
      </section>

      <footer style={{ marginTop: 40, borderTop: "1px solid #e5e7eb", paddingTop: 16, fontSize: 12, color: "#64748b" }}>
        Fair Housing • Privacy • Standardized Operating Procedures
        <details style={{ marginTop: 8 }}>
          <summary>Standardized Operating Procedures (NY State)</summary>
          <div style={{ marginTop: 8 }}>
            <p>
              1. There is no general requirement to provide photo identification prior to a property showing. However, on
              occasion individual property owners, buildings or certain listing brokers may require photo identification for
              security or similar purposes prior to a showing, we will communicate this information to buyers/ tenants in prior
              to showings.
            </p>
            <p>2. An exclusive buyer representation agreement is not required.</p>
            <p>
              3. A pre-approval for a mortgage loan is not required to work with us, however at the time of an offer individual
              property owners, listing brokers or managing agents may require one – and if so, we will communicate this to
              buyers as applicable for any properties buyers may wish to view.
            </p>
          </div>
        </details>
        <div style={{ marginTop: 8 }}>
          Wire Fraud Warning: Always confirm wiring instructions by phone using a known, trusted number. We will never
          change wiring instructions by email.
        </div>
      </footer>
    </main>
  );
}
