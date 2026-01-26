import { NextRequest, NextResponse } from 'next/server';

/**
 * Phase 1 Analytics Event Receiver
 *
 * Minimal, privacy-safe event logging.
 * Currently logs to Vercel's built-in logging (visible in Vercel dashboard).
 * Can be extended to persist to database in Phase 2.
 *
 * Privacy guarantees:
 * - No IP address logging (Vercel may log, but we don't persist)
 * - No user agent fingerprinting
 * - No query parameters captured
 * - No PII fields accepted
 */

// Mark as dynamic since we're receiving POST data
export const dynamic = 'force-dynamic';

// Allowed event types - strict whitelist
const ALLOWED_EVENT_TYPES = ['pageview', 'cta_click'] as const;
type EventType = (typeof ALLOWED_EVENT_TYPES)[number];

// CTA labels we recognize - prevents arbitrary data injection
// Naming convention: cta_{action} or cta_{action}_{location}
const ALLOWED_CTA_LABELS = [
  // Hero section
  'hero_search',
  // Service CTAs (standardized)
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

  // Type must be in whitelist
  if (!ALLOWED_EVENT_TYPES.includes(obj.type as EventType)) return false;

  // Path must be string, start with /, max 200 chars
  if (
    typeof obj.path !== 'string' ||
    !obj.path.startsWith('/') ||
    obj.path.length > 200
  )
    return false;

  // Label is optional but must be in whitelist if provided
  if (obj.label !== undefined) {
    if (
      typeof obj.label !== 'string' ||
      !ALLOWED_CTA_LABELS.includes(obj.label as (typeof ALLOWED_CTA_LABELS)[number])
    ) {
      // For unknown labels, sanitize to 'other'
      obj.label = 'other';
    }
  }

  // Timestamp must be valid ISO string
  if (typeof obj.timestamp !== 'string') return false;
  const ts = Date.parse(obj.timestamp);
  if (isNaN(ts)) return false;

  // Reject timestamps more than 5 minutes in the future or 1 hour in the past
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

    // Log to Vercel's built-in logging (visible in dashboard > Logs)
    // Format: [ANALYTICS] type | path | label | timestamp
    console.log(
      `[ANALYTICS] ${data.type} | ${data.path} | ${data.label || '-'} | ${data.timestamp}`
    );

    // Return minimal response
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

// Reject non-POST methods
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
