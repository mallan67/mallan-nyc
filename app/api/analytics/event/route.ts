import { NextRequest, NextResponse } from 'next/server';

/**
 * First-party analytics event receiver — /api/analytics/event
 *
 * Restored 2026-05-30: this route was deleted in the "98 zombie routes" cleanup
 * (commit 0f0859cd) but is still the endpoint app/components/Analytics.tsx —
 * mounted site-wide in app/layout.tsx — POSTs every pageview + CTA click to.
 * Its removal silently broke ALL first-party pageview/CTA tracking. It logs to
 * Vercel's backend logs (visible in the dashboard › Logs), which is the tracking
 * signal the brokerage/owner reviews.
 *
 * Privacy guarantees (unchanged from the original Phase-1 receiver):
 * - No IP / user-agent persistence, no query params, no PII fields accepted
 * - Strict whitelists for event type and CTA label (unknown labels → "other")
 * - No database write — log-only (DB persistence remains a future, gated step)
 */

// Receiving POST data — never statically optimized.
export const dynamic = 'force-dynamic';

// Allowed event types — strict whitelist.
const ALLOWED_EVENT_TYPES = ['pageview', 'cta_click'] as const;
type EventType = (typeof ALLOWED_EVENT_TYPES)[number];

// CTA labels we recognize — prevents arbitrary data injection.
// Naming convention: cta_{action} or {action}_{location}.
const ALLOWED_CTA_LABELS = [
  // Hero / search
  'hero_search',
  // Service CTAs
  'cta_buy',
  'cta_rent',
  'cta_sell',
  // Contact CTAs
  'cta_contact_primary',
  'cta_contact_footer',
  'cta_phone',
  'contact_form',
  'email_agent',
  // Listing interactions
  'view_listing',
  'schedule_showing',
  'request_info',
  // Other
  'newsletter_signup',
] as const;

interface AnalyticsEvent {
  type: EventType;
  path: string;
  label?: string;
  timestamp: string;
}

function isValidEvent(data: unknown): data is AnalyticsEvent {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;

  // Type must be in the whitelist.
  if (!ALLOWED_EVENT_TYPES.includes(obj.type as EventType)) return false;

  // Path must be a string, start with "/", max 200 chars (no absolute URLs).
  if (typeof obj.path !== 'string' || !obj.path.startsWith('/') || obj.path.length > 200) {
    return false;
  }

  // Label is optional; unknown labels are sanitized to "other" (not rejected).
  if (obj.label !== undefined) {
    if (
      typeof obj.label !== 'string' ||
      !ALLOWED_CTA_LABELS.includes(obj.label as (typeof ALLOWED_CTA_LABELS)[number])
    ) {
      obj.label = 'other';
    }
  }

  // Timestamp must be a valid ISO string within a sane window (anti-forgery).
  if (typeof obj.timestamp !== 'string') return false;
  const ts = Date.parse(obj.timestamp);
  if (isNaN(ts)) return false;
  const now = Date.now();
  if (ts > now + 5 * 60 * 1000 || ts < now - 60 * 60 * 1000) return false;

  return true;
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    if (!isValidEvent(data)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    // Log to Vercel's built-in logging (dashboard › Logs).
    // Format: [ANALYTICS] type | path | label | timestamp
    console.log(
      `[ANALYTICS] ${data.type} | ${data.path} | ${data.label || '-'} | ${data.timestamp}`,
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

// POST-only receiver.
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
