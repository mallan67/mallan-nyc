/**
 * How long the agent pages' listing cards may be stale (Maya, 2026-11-04: "the cards have to auto update when listings update").
 *
 * The cards of an agent's page (Active Sales / Rentals, the Exclusives) come from GET /api/agents/[slug]/listings. That answer was cached for 5 minutes at the CDN plus 10 more
 * while it revalidated, and each agent page kept its own copy of it for another 5: a saved change took up to ~20 minutes to show (observed on production: Age 612 s, STALE).
 * The Featured and Company Exclusives cards read /api/listings, which has a 60 s window. The agent cards now use that window, and the agent pages tag their copy with
 * SEARCH_CACHE_TAG, which a save in the CRM revalidates: the page's copy is dropped at once and the next view fetches a fresh answer, so a change shows within about a minute.
 * The 5-minute timer stays as the safety net, so an agent page that nobody saves a listing under costs the database nothing more than before.
 */
import { SEARCH_CACHE_TAG } from "@/lib/cache/public-cache";

/** Same window as /api/listings, which feeds Featured and Company Exclusives. */
export const AGENT_CARDS_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=120";

/** The agent pages' fetch of that answer: dropped at once when a listing is saved, and refreshed every 5 minutes regardless. */
export const AGENT_CARDS_FETCH: { revalidate: number; tags: string[] } = { revalidate: 300, tags: [SEARCH_CACHE_TAG] };
