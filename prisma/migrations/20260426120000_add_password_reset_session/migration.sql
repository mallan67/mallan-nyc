-- PasswordResetSession — SMS-code challenge for password reset.
--
-- Mirrors mfa_sessions but covers both Agent and Lead users, and is
-- created BEFORE password verification (vs. MFA which runs after).
--
-- Row lifecycle:
--   1. /api/auth/forgot-password creates row with code_hash, expires_at +5min
--   2. SMS code delivered to user's phone via Twilio
--   3. /api/auth/reset-password validates code+token, sets new password,
--      stamps verified_at, creates session
--   4. Cleanup job deletes rows where expires_at < now() OR verified_at IS NOT NULL
--
-- Additive only — no impact on existing rows.

CREATE TABLE "password_reset_sessions" (
  "id"          TEXT PRIMARY KEY,
  "token"       TEXT NOT NULL,
  "user_id"     BIGINT NOT NULL,
  "user_type"   TEXT NOT NULL,
  "code_hash"   TEXT NOT NULL,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "verified_at" TIMESTAMP(3),
  "expires_at"  TIMESTAMP(3) NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address"  TEXT,
  "user_agent"  TEXT
);

CREATE UNIQUE INDEX "password_reset_sessions_token_key" ON "password_reset_sessions"("token");
CREATE INDEX "password_reset_sessions_expires_at_idx" ON "password_reset_sessions"("expires_at");
