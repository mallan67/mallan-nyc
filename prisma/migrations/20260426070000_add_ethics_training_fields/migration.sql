-- Migration: add ethics training fields to Agent (Workstream C4 — UCBA Art. III §6)
--
-- UCBA 2026 Art. III §6 (new in 2026): ethics training is mandatory for RLS
-- access. Brokers verify each agent's completion + 2-year expiry. Once C4b
-- lands, lib/auth/session.ts will block issuing agent-role tokens when
-- ethics_training_expires_at < now().
--
-- Both columns nullable per NEON.md §4 — existing agent rows pre-date the
-- rule. The auth-gate logic in C4b interprets `ethics_training_expires_at IS
-- NULL` as "training never recorded" (treat as expired).
--
-- Apply manually to Neon prod BEFORE merging the code PR.

ALTER TABLE "agents" ADD COLUMN "ethics_training_completed_at" TIMESTAMP(3);
ALTER TABLE "agents" ADD COLUMN "ethics_training_expires_at" TIMESTAMP(3);
