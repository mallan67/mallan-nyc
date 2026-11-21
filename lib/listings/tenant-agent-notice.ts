/**
 * WHEN THE PUBLIC RENTAL PAGE MAY SAY "WE DO NOT REPRESENT THE OWNER".
 *
 * Maya, 2026-11-21: the rental fee disclosure on the public listing page tells a prospective tenant
 * to ask the listing agent for the actual final fees, and says Mallan does not represent the owner
 * but can act as the tenant's agent, for a fee (organizing showings, doing the search, negotiating
 * for the tenant).
 *
 * That second statement is true only when Mallan is NOT the listing broker. On a Mallan-authored
 * listing (`SL-` / `RL-`, `_source === 'exclusive'`) Mallan IS the owner's broker, and saying
 * otherwise would be a false advertising claim (19 NYCRR 175.25). So the statement is shown only
 * for a listing positively identified as another broker's, and every other source (exclusive,
 * manual, missing, unknown) leaves it out. A new `_source` value therefore stays silent until it is
 * added here on purpose.
 *
 * `_source` values: 'idx' (live Cotality read), 'db+idx' (stored Cotality row), 'exclusive'
 * (Mallan-authored, `buildSourceAndCompliance` in lib/idx/db-to-public-dto.ts), 'manual'.
 */
const THIRD_PARTY_LISTING_SOURCES: readonly string[] = ['idx', 'db+idx'];

export function showsTenantAgentNotice(source: string | null | undefined): boolean {
  return typeof source === 'string' && THIRD_PARTY_LISTING_SOURCES.includes(source);
}
