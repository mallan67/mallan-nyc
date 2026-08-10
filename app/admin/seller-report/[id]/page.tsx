// /admin/seller-report/[id] — SELLER-001 Phase 1 internal report page.
// Broker/agent-only server component. Renders the truth-labeled seller
// listing intelligence report from EXISTING data via lib/seller-report.
// noindex via app/admin/layout.tsx (robots: { index: false, follow: false }).
// Spec: docs/architecture/SELLER-001-SPEC-2026-07-03.md
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { validateSession } from '@/lib/auth/session';
import { loadSellerReport } from '@/lib/seller-report/load-report';
import type { SellerReport } from '@/lib/seller-report/build-report';
import { listingCapabilities } from '@/lib/auth/listing-capabilities';

export const dynamic = 'force-dynamic';

const TRUTH_BADGE_LABELS: Record<string, string> = {
  VERIFIED_MALLAN_TRAFFIC: 'Verified Mallan traffic',
  TRACKED_CAMPAIGN: 'Tracked campaign',
  PORTAL_REPORTED: 'Portal-reported (manual entry)',
  EXTERNAL_PRESENCE: 'External presence',
  MARKET_PROXY: 'Market proxy',
};

function TruthBadge({ level }: { level: string }) {
  return (
    <span className="inline-block rounded-full bg-[#141B2D] text-[#C4A052] text-[10px] tracking-widest uppercase px-3 py-1 ml-2 align-middle">
      {TRUTH_BADGE_LABELS[level] ?? level}
    </span>
  );
}

function Section({
  title,
  truthLevel,
  children,
}: {
  title: string;
  truthLevel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 rounded-2xl border border-[#1a1a1a]/10 p-6">
      <h2 className="text-base font-semibold text-[#1a1a1a] mb-4">
        {title}
        {truthLevel ? <TruthBadge level={truthLevel} /> : null}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-[#1a1a1a]/[0.03] p-4">
      <div className="text-2xl font-semibold text-[#1a1a1a]">{value}</div>
      <div className="text-xs text-[#1a1a1a]/50 mt-1">{label}</div>
    </div>
  );
}

function CountTable({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return <p className="text-sm text-[#1a1a1a]/40">None recorded yet.</p>;
  }
  return (
    <table className="text-sm">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <td className="pr-6 py-1 text-[#1a1a1a]/70">{k}</td>
            <td className="py-1 font-medium text-[#1a1a1a]">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function money(n: number | null): string {
  if (n === null) return '—';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

async function requireAgentOrBrokerPage(currentPath: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  const user = token ? await validateSession(token) : null;
  const role = user?.role?.toUpperCase();
  // Codex #472 r4: /admin/login only admits BROKER sessions, so an
  // agent-or-broker gate here made the page unreachable for agents (login
  // bounce loop). Phase 1 scopes this /admin page to BROKER; agents consume
  // the same data via GET /api/crm/listings/[id]/seller-report (ownership-
  // scoped) — an agent-facing UI ships with the SELLER-001 Phase-2 portal.
  if (!user || user.userType !== 'agent' || role !== 'BROKER') {
    redirect(`/admin/login?redirect=${encodeURIComponent(currentPath)}`);
  }
  return user!;
}

export default async function SellerReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAgentOrBrokerPage(`/admin/seller-report/${id}`);

  const numericId = parseInt(id);
  let listing = !isNaN(numericId)
    ? await prisma.listing.findUnique({ where: { id: BigInt(numericId) } })
    : null;
  if (!listing) {
    listing = await prisma.listing.findUnique({ where: { listing_id: id } });
  }
  if (!listing) notFound();

  // Seller-side authority, not association — identical rule to the
  // /api/crm/listings/[id]/seller-report route so the page and the API cannot
  // diverge. Keeps notFound() (not 403) so the page does not confirm the
  // existence of a listing the viewer has no authority over.
  if (!listingCapabilities(user, listing).mayViewSellerReport) {
    notFound();
  }

  const report: SellerReport = await loadSellerReport(listing);

  return (
    <main className="min-h-screen bg-white font-sans">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <header className="mb-8">
          <p className="text-[10px] tracking-widest uppercase text-[#1a1a1a]/40 mb-1">
            Internal seller report — broker use only
          </p>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">
            {report.listing.address_display}
          </h1>
          <p className="text-sm text-[#1a1a1a]/60 mt-1">
            {report.listing.listing_id} · {report.listing.status} ·{' '}
            {report.listing.listing_type === 'sale' ? 'For sale' : 'For rent'} ·{' '}
            {money(report.listing.list_price)} · {report.listing.days_on_market} days on market
          </p>
          <p className="text-xs text-[#1a1a1a]/40 mt-2">
            Generated {new Date(report.generated_at).toLocaleString('en-US')} — every metric below
            is labeled with its truth level. {report.known_vs_anonymous_policy}
          </p>
        </header>

        <Section title="Exposure" truthLevel={report.exposure.truth_level}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Tracked views (total)" value={report.exposure.total_views} />
            <Stat label="Unique viewers" value={report.exposure.unique_viewers} />
            <Stat label="Known viewers (self-identified)" value={report.exposure.known_viewers} />
            <Stat label="Returning viewers" value={report.exposure.returning_viewers} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Views, last 7 days" value={report.exposure.views_last_7_days} />
            <Stat label="Views, last 30 days" value={report.exposure.views_last_30_days} />
            <Stat
              label="First tracked view"
              value={
                report.exposure.first_view_at
                  ? new Date(report.exposure.first_view_at).toLocaleDateString('en-US')
                  : '—'
              }
            />
            <Stat
              label="Latest tracked view"
              value={
                report.exposure.last_view_at
                  ? new Date(report.exposure.last_view_at).toLocaleDateString('en-US')
                  : '—'
              }
            />
          </div>
          <h3 className="text-xs uppercase tracking-wide text-[#1a1a1a]/40 mb-2">
            Device breakdown
          </h3>
          <CountTable counts={report.exposure.device_breakdown} />
        </Section>

        <Section title="Engagement" truthLevel={report.engagement.truth_level}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Showings (total)" value={report.engagement.showings.total} />
            <Stat label="Showings completed" value={report.engagement.showings.completed} />
            <Stat
              label="Upcoming / requested"
              value={report.engagement.showings.upcoming_or_requested}
            />
            <Stat label="Open-house RSVPs" value={report.engagement.open_house_rsvps} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-[#1a1a1a]/40 mb-2">
                Showings by type
              </h3>
              <CountTable counts={report.engagement.showings.by_type} />
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-wide text-[#1a1a1a]/40 mb-2">
                Client actions (CRM-tracked)
              </h3>
              <CountTable counts={report.engagement.client_actions} />
            </div>
          </div>
        </Section>

        <Section title="Inquiries" truthLevel={report.inquiries.truth_level}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Inquiries (total)" value={report.inquiries.total} />
            <Stat label="Last 30 days" value={report.inquiries.last_30_days} />
            <Stat label="With a written message" value={report.inquiries.with_message} />
          </div>
          <h3 className="text-xs uppercase tracking-wide text-[#1a1a1a]/40 mb-2">By source</h3>
          <CountTable counts={report.inquiries.by_source} />
        </Section>

        <Section title="Market context (proxy)" truthLevel={report.market_context.truth_level}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat
              label="Similar active listings"
              value={report.market_context.similar_active_count}
            />
            <Stat
              label="Median asking price"
              value={money(report.market_context.median_list_price)}
            />
            <Stat
              label="Median days on market"
              value={report.market_context.median_days_on_market ?? '—'}
            />
            <Stat
              label="This listing: days on market"
              value={report.market_context.subject_days_on_market}
            />
          </div>
          <p className="text-xs text-[#1a1a1a]/50">
            Comparison band: {money(report.market_context.price_band.min)} –{' '}
            {money(report.market_context.price_band.max)} (±20% of asking).
          </p>
          <p className="text-xs text-[#1a1a1a]/50 mt-2 italic">
            {report.market_context.disclaimer}
          </p>
        </Section>

        <Section title="Campaign links" truthLevel={report.campaigns.truth_level}>
          <p className="text-sm text-[#1a1a1a]/60">{report.campaigns.note}</p>
        </Section>

        <Section title="Portal-reported metrics" truthLevel={report.portal_reported.truth_level}>
          <p className="text-sm text-[#1a1a1a]/60">{report.portal_reported.note}</p>
        </Section>

        <Section title="External presence" truthLevel={report.external_presence.truth_level}>
          <p className="text-sm text-[#1a1a1a]/60">{report.external_presence.note}</p>
        </Section>

        <Section title="Data gaps (what this report does NOT include yet)">
          <ul className="list-disc pl-5 space-y-2 text-sm text-[#1a1a1a]/70">
            {report.data_gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </Section>

        <footer className="text-[10px] text-[#1a1a1a]/30 mt-10">
          Mallan Real Estate Inc. · Broker License #10991205323 · Internal document — not for
          public distribution. SELLER-001 Phase 1.
        </footer>
      </div>
    </main>
  );
}
