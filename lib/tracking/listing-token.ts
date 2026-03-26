import { createHmac } from 'crypto';

function getSecret(): string {
  const secret = process.env.TRACKING_SECRET || process.env.CRON_SECRET;
  if (!secret) throw new Error('TRACKING_SECRET or CRON_SECRET env var required');
  return secret;
}

/**
 * Generate a deterministic, URL-safe tracking token for a lead + listing pair.
 * HMAC-SHA256(lead_id:listing_id, secret) truncated to 16 chars base64url.
 * No DB lookup needed to generate.
 */
export function generateTrackingToken(leadId: bigint, listingId: string): string {
  const hmac = createHmac('sha256', getSecret());
  hmac.update(`${leadId}:${listingId}`);
  return hmac.digest('base64url').slice(0, 16);
}

/**
 * Validate a tracking token by regenerating for each candidate until match.
 * Candidates are recent listing sends for the given listing_id.
 * Returns { leadId, listingId } on match, null otherwise.
 */
export function validateTrackingToken(
  token: string,
  listingId: string,
  candidates: Array<{ lead_id: bigint; listing_id: string }>
): { leadId: bigint; listingId: string } | null {
  for (const c of candidates) {
    const expected = generateTrackingToken(c.lead_id, c.listing_id);
    if (token === expected) {
      return { leadId: c.lead_id, listingId: c.listing_id };
    }
  }
  return null;
}
