/// <reference types="jest" />
/**
 * First-party analytics event receiver — /api/analytics/event.
 *
 * Regression guard: this route was deleted in the "98 zombie routes" cleanup
 * (commit 0f0859cd) while app/components/Analytics.tsx — mounted site-wide in
 * app/layout.tsx — still POSTs every pageview + CTA click to it. The result was
 * silent loss of ALL first-party pageview/CTA tracking (sendBeacon to a 404).
 *
 * Contract (privacy-safe, no PII, no DB write — logs to Vercel backend logs):
 *  - accepts type ∈ {pageview, cta_click}, path starting "/", optional label
 *    (whitelisted; unknown → "other"), ISO timestamp within sane bounds
 *  - rejects unknown type, non-"/" path, over-long path, bad/old/future timestamp
 *  - GET is 405 (POST-only receiver)
 */
import { POST, GET } from '@/app/api/analytics/event/route';

function req(body: unknown): Request {
  return new Request('https://mallan.nyc/api/analytics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const nowIso = () => new Date().toISOString();

describe('/api/analytics/event — first-party pageview/CTA receiver', () => {
  it('accepts a valid pageview', async () => {
    const res = await POST(req({ type: 'pageview', path: '/listing/x', timestamp: nowIso() }) as never);
    expect(res.status).toBe(200);
  });

  it('accepts a valid CTA click with a whitelisted label', async () => {
    const res = await POST(req({ type: 'cta_click', path: '/listing/x', label: 'schedule_showing', timestamp: nowIso() }) as never);
    expect(res.status).toBe(200);
  });

  it('accepts an unknown label (sanitized to "other", not rejected)', async () => {
    const res = await POST(req({ type: 'cta_click', path: '/x', label: 'totally-made-up', timestamp: nowIso() }) as never);
    expect(res.status).toBe(200);
  });

  it('rejects an unknown event type', async () => {
    const res = await POST(req({ type: 'keylogger', path: '/x', timestamp: nowIso() }) as never);
    expect(res.status).toBe(400);
  });

  it('rejects a path that does not start with "/"', async () => {
    const res = await POST(req({ type: 'pageview', path: 'https://evil.com', timestamp: nowIso() }) as never);
    expect(res.status).toBe(400);
  });

  it('rejects an over-long path (injection guard)', async () => {
    const res = await POST(req({ type: 'pageview', path: '/' + 'a'.repeat(300), timestamp: nowIso() }) as never);
    expect(res.status).toBe(400);
  });

  it('rejects a stale/forged timestamp', async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    const res = await POST(req({ type: 'pageview', path: '/x', timestamp: old }) as never);
    expect(res.status).toBe(400);
  });

  it('rejects a non-JSON / malformed body', async () => {
    const bad = new Request('https://mallan.nyc/api/analytics/event', { method: 'POST', body: '{not json' });
    const res = await POST(bad as never);
    expect(res.status).toBe(400);
  });

  it('GET is 405 (POST-only)', async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});
