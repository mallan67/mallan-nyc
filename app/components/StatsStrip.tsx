/**
 * StatsStrip — credibility numbers between hero and listings
 * Signals scale, expertise, and legitimacy at a glance
 */
export default function StatsStrip() {
  const stats = [
    { value: '5', label: 'Boroughs', sub: 'All of NYC covered' },
    { value: '46+', label: 'Active Listings', sub: 'Sales & rentals' },
    { value: 'REBNY', label: 'Licensed', sub: 'RLS participant' },
    { value: '100%', label: 'Boutique', sub: 'Broker-direct service' },
  ];

  return (
    <section className="bg-[#1a1a1a] py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 rounded-2xl overflow-hidden">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="bg-[#1a1a1a] px-8 py-8 text-center"
            >
              <p className="font-display text-4xl sm:text-5xl font-bold text-[#C4A052] leading-none mb-2">
                {stat.value}
              </p>
              <p className="text-white font-bold text-sm tracking-wide uppercase mb-1">
                {stat.label}
              </p>
              <p className="text-white/40 text-xs">
                {stat.sub}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
