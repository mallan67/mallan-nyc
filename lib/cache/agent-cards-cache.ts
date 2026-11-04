/**
 * How long the agent pages' listing cards may be stale (Maya, 2026-11-04: "the cards have to auto update when listings update").
 *
 * The cards of an agent's page (Active Sales / Rentals, the Exclusives) come from GET /api/agents/[slug]/listings. That answer was cached for 5 minutes at the CDN plus 10 more
 * while it revalidated, and each agent page kept its own copy of it for another 5: a saved change took up to ~20 minutes to show (observed on production: Age 612 s, STALE).
 * The agent cards now live 60 s at the CDN and are never served stale past that (no stale-while-revalidate: a stale-while-revalidate window would serve the old cards for up to 120 s more,
 * and a CRM save does not purge a CDN copy of the endpoint). The agent pages tag their own copy with SEARCH_CACHE_TAG, which a save in the CRM revalidates, so the page's copy is dropped at
 * once and the next view fetches an answer at most 60 s old. That refill is itself cached, and a view in the last seconds of the endpoint's 60 s can refill it with the OLD cards (Codex, review
 * of #689: for another 300 s), so the page's copy lives 60 s as well: the worst case after a save is about two minutes (60 s of CDN copy + 60 s of the page's refill), and a change usually shows
 * within a minute. Featured and Company Exclusives read /api/listings, whose own window (60 s + 120 s stale-while-revalidate) is unchanged: up to ~3 minutes.
 */
import { SEARCH_CACHE_TAG } from "@/lib/cache/public-cache";

/** 60 s at the CDN, and nothing served stale beyond it. */
export const AGENT_CARDS_CACHE_CONTROL = "public, s-maxage=60";

/** The agent pages' fetch of that answer: dropped at once when a listing is saved, and never older than 60 s (a refill with the endpoint's old copy cannot outlive the endpoint's window). */
export const AGENT_CARDS_FETCH: { revalidate: number; tags: string[] } = { revalidate: 60, tags: [SEARCH_CACHE_TAG] };
