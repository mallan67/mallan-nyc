/**
 * Upstash Redis client singleton.
 *
 * Used for:
 * - Durable rate limiting (survives cold starts, shared across regions)
 * - Cron job distributed locks (prevent overlapping runs)
 * - Short-lived caching (session adjuncts, idempotency keys)
 *
 * Env vars (auto-detected by @upstash/redis):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Falls back gracefully: if env vars are missing, exports null.
 * Consumers must handle the null case (fail open).
 */
import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export default redis;
