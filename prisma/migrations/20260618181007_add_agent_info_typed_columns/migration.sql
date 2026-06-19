-- listings: complete the agent_info typed-column set (NEON-safe additive)
--
-- Phase A1 of the agent_info JSON-drop track per
-- docs/superpowers/plans/2026-06-18-agent-info-normalization.md (spec #410).
--
-- Context: the 2026-05-10 migration (20260510095000_add_listing_agent_typed_columns)
-- promoted the two display keys (list_agent_full_name, list_office_name). The #409
-- audit (docs/audits/legacy-json-dependency-audit-2026-06-18.md §2.5) showed readers
-- consume EIGHT agent_info keys, so six more typed homes are required before the JSON
-- can be dropped (Phase D). This migration adds those six.
--
-- NEON.md §4 conformance:
--   - All six columns nullable TEXT. No NOT NULL DEFAULT (forbidden pattern).
--   - A single ALTER TABLE covers all six ADD COLUMNs to minimize the metadata-lock
--     window. ADD COLUMN of a nullable text without default is metadata-only on
--     Postgres — it does NOT rewrite existing rows; completes in tens of ms even on
--     the ~109K-row listings table.
--   - No index in this migration (matches the existing typed-column migration).
--   - One logical change (one column set) per PR (NEON.md §4 "one change per PR").
--
-- PII boundary (spec §4): list_agent_email + list_agent_direct_phone are PRIVATE.
-- Adding the typed columns does NOT change exposure — the DTO/portal-mask layer still
-- gates them (office/name public; agent PII only on the exclusive card + CRM; portal
-- fail-closed). The four MLS-ID columns feed syndication eligibility gates, not display.
--
-- Backfill (DO NOT INCLUDE HERE — runs separately, Phase A6): the columns populate
-- from existing agent_info JSON via an operator-run UPDATE during a 3-5am ET window
-- (NEON.md §6). Long data updates inside Prisma's migration runner can time out on
-- Neon, so they live outside the migration boundary.
--
-- Boundaries this migration explicitly does NOT cross:
--   - The `agent_info` JSON column is UNCHANGED (still NOT NULL DEFAULT '{}'::jsonb).
--     Writers continue dual-writing JSON after this migration; reader migration is
--     Phase B, write removal Phase C, column drop Phase D.
--   - No other JSON column on Listing is touched (compliance/media/address/features/raw_data).
--   - No reader path changes; production traffic shape is identical before/after.
--   - The `listings_archive` table is unchanged.
ALTER TABLE "listings"
  ADD COLUMN "list_agent_email"        TEXT,
  ADD COLUMN "list_agent_direct_phone" TEXT,
  ADD COLUMN "list_office_mls_id"      TEXT,
  ADD COLUMN "list_agent_mls_id"       TEXT,
  ADD COLUMN "co_list_office_mls_id"   TEXT,
  ADD COLUMN "co_list_agent_mls_id"    TEXT;
