// /crm/system-status — protected (agent/broker) live Cotality sync status page.
// Read-only. Renders target vs configured cadence, drift, last runs, cursor lag,
// health, Neon pooled/direct, and preview-vs-production environment.
import type { CSSProperties } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSession } from '@/lib/auth/session';
import { getCotalitySystemStatus, type PipelineStatus, type Health, type ConnMode, type MonitoringState } from '@/lib/cotality/system-status';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cotality Sync — System Status', robots: { index: false, follow: false } };

const HEALTH_COLOR: Record<Health, string> = {
  healthy: '#15803d',
  warning: '#b45309',
  critical: '#b91c1c',
  unknown: '#6b7280',
};

// pooled = green, direct = amber (a serverless app should pool), unknown = gray.
function connColor(c: ConnMode): string {
  return c === 'pooled' ? HEALTH_COLOR.healthy : c === 'direct' ? HEALTH_COLOR.warning : HEALTH_COLOR.unknown;
}
// ok = green, unauthorized = red (grant problem), unreachable/data_missing = amber,
// not_configured = gray.
function monColor(s: MonitoringState): string {
  if (s === 'ok') return HEALTH_COLOR.healthy;
  if (s === 'unauthorized') return HEALTH_COLOR.critical;
  if (s === 'unreachable' || s === 'data_missing') return HEALTH_COLOR.warning;
  return HEALTH_COLOR.unknown;
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ background: color, color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
      {text}
    </span>
  );
}

function fmtAge(min: number | null): string {
  if (min == null) return '—';
  if (min < 60) return `${min} min ago`;
  if (min < 1440) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} d ago`;
}

function PipelineCard({ name, refreshMin, p }: { name: string; refreshMin: number; p: PipelineStatus }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>{name}</h2>
        {p.poll_drift ? <Badge text="CADENCE DRIFT" color={HEALTH_COLOR.warning} /> : <Badge text="ALIGNED" color={HEALTH_COLOR.healthy} />}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <tbody>
          <tr><td style={cellL}>Cotality refresh target</td><td style={cellR}>≤ {refreshMin} min (provider-side; not a poll interval)</td></tr>
          <tr><td style={cellL}>Mallan target poll</td><td style={cellR}><b>{p.target_poll_min} min</b></td></tr>
          <tr><td style={cellL}>Currently configured poll</td><td style={cellR}>
            <code>{p.configured_cron ?? '—'}</code>{' '}
            {p.configured_poll_min != null ? `(${p.configured_poll_min} min)` : ''}{' '}
            {p.poll_drift ? <Badge text="DRIFT" color={HEALTH_COLOR.warning} /> : null}
          </td></tr>
          <tr><td style={cellL}>Last recorded run</td><td style={cellR}>
            {fmtAge(p.last_run_age_min)} {p.last_run_status ? `· status: ${p.last_run_status}` : ''}{' '}
            <Badge text={p.run_health.toUpperCase()} color={HEALTH_COLOR[p.run_health]} />
          </td></tr>
          <tr><td style={cellL}>Observed cadence</td><td style={cellR}>Not available — needs run history (precise interval is in Vercel cron logs)</td></tr>
          <tr><td style={cellL}>Cursor watermark</td><td style={cellR}>{p.cursor_watermark ?? '—'}</td></tr>
          <tr><td style={cellL}>Cursor lag</td><td style={cellR}>
            {fmtAge(p.cursor_lag_min)}{' '}
            <Badge text={p.cursor_health.toUpperCase()} color={HEALTH_COLOR[p.cursor_health]} />
          </td></tr>
        </tbody>
      </table>
    </div>
  );
}

const cellL: CSSProperties = { padding: '6px 8px', color: '#6b7280', width: '38%', verticalAlign: 'top', borderTop: '1px solid #f3f4f6' };
const cellR: CSSProperties = { padding: '6px 8px', borderTop: '1px solid #f3f4f6' };

export default async function SystemStatusPage() {
  const token = (await cookies()).get('session_token')?.value;
  const user = token ? await validateSession(token) : null;
  if (!user || user.userType !== 'agent') {
    redirect('/admin/login?next=/crm/system-status');
  }

  const s = await getCotalitySystemStatus();
  const isProd = s.application_environment === 'production';

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: 24, fontFamily: 'Inter, Arial, sans-serif', color: '#111827' }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Cotality Sync — System Status</h1>
      <p style={{ color: '#6b7280', marginTop: 0, fontSize: 13 }}>
        Canonical standard: <code>lib/cotality/sync-standard.json</code> · Generated {s.generated_at}
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0 20px' }}>
        <Badge text={`APP ENV: ${s.application_environment.toUpperCase()}`} color={isProd ? '#1d4ed8' : '#6b7280'} />
        <Badge text={`APP DB: ${s.app_db.connection.toUpperCase()}`} color={connColor(s.app_db.connection)} />
        <Badge text={`MONITORING: ${s.monitoring.state.replace(/_/g, ' ').toUpperCase()}`} color={monColor(s.monitoring.state)} />
        <Badge text={`MONITORING DB: ${s.monitoring.connection.toUpperCase()}`} color={connColor(s.monitoring.connection)} />
        <Badge text={`ENFORCEMENT: ${s.enforcement.toUpperCase()}`} color="#374151" />
      </div>

      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
        <div><b>Application environment:</b> {isProd ? 'Production' : s.application_environment[0].toUpperCase() + s.application_environment.slice(1)}</div>
        <div><b>Monitoring data source:</b> {s.monitoring.source}</div>
        <div style={{ color: '#6b7280', marginTop: 4 }}>Connection modes are booleans only (pooled / direct / unknown) — no hostnames or connection strings are shown. <code>unknown</code> = the env var is absent (never rendered as &quot;direct&quot;).</div>
      </div>

      {!s.monitoring.available && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>
          <b>Production monitoring unavailable — {s.monitoring.state.replace(/_/g, ' ')}.</b>{' '}
          {s.monitoring.state === 'not_configured'
            ? <><code>MONITORING_DATABASE_URL</code> (a read-only production role) is not set.</>
            : s.monitoring.state === 'unauthorized'
              ? <>The monitoring role connected but was denied SELECT on the status tables — check the grants.</>
              : s.monitoring.state === 'data_missing'
                ? <>The monitoring role connected, but one or both required status rows (Property / Media) are absent — the sync jobs may not have written a row yet.</>
                : <>The monitoring database could not be reached (connection/timeout).</>}{' '}
          Live run/cursor values are hidden (only a successful read counts as available). Cadence drift below is still accurate; preview values are never substituted as production.
        </div>
      )}

      <PipelineCard name="Property / Listing (IDX)" refreshMin={s.cotality_refresh_targets.property_min} p={s.property} />
      <PipelineCard name="Media / Images" refreshMin={s.cotality_refresh_targets.image_min} p={s.media} />

      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
        <p style={{ margin: '4px 0' }}>
          <b>Health legend:</b>{' '}
          <span style={{ color: HEALTH_COLOR.healthy }}>healthy</span> ·{' '}
          <span style={{ color: HEALTH_COLOR.warning }}>warning</span> ·{' '}
          <span style={{ color: HEALTH_COLOR.critical }}>critical</span> ·{' '}
          <span style={{ color: HEALTH_COLOR.unknown }}>unknown</span>
        </p>
        <p style={{ margin: '4px 0' }}>{s.note}</p>
        <p style={{ margin: '4px 0' }}>
          Refresh targets (5 min listings / 15 min images) are Cotality provider-side figures, not poll intervals.
          Mallan polling cadence is an internal operational choice. Total staleness = Cotality ingestion + poll interval + job time + cache.
        </p>
      </div>
    </main>
  );
}
