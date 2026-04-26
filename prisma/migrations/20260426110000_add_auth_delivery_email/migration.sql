-- Add Agent.auth_delivery_email — per-agent override for password reset + MFA email delivery.
--
-- Why: M365 anti-loop drops mail when the recipient is an alias on the same
-- tenant mailbox as the SMTP sender. For agents on @mallan.nyc, this means
-- their auth-channel emails (password reset, MFA codes) silently never arrive.
-- This column lets each agent point auth-channel email at a reachable address
-- (e.g. their personal Gmail). Resolver priority used by the route handlers:
--   1. Agent.auth_delivery_email (this column) — per-agent
--   2. RESET_EMAIL_OVERRIDE env var (legacy, domain-scoped)
--   3. Agent.email (primary)
--
-- Nullable; existing rows keep current behavior (delivery to primary email).
-- Additive only — no data backfill required.

ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "auth_delivery_email" TEXT;
