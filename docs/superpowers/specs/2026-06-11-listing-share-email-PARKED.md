# PARKED — Listing share-by-email rich HTML (2026-06-11)

**Status: PARKED by Maya ("do not sway from the current work... this can wait"). Do NOT implement.**
Resume only on explicit Maya GO, after the media program Phase-1 work and per the queue.

## Captured state (so the brainstorm isn't lost)
- **Request:** sharing a listing to brokers/customers by email should carry rich listing HTML
  (photo, price, beds/baths, address) + the link — today it's subject + bare URL (screenshot,
  333 East 46th St #2G / SL-0004).
- **Hard constraint found:** the current flow is `app/components/ShareButton.tsx:116` (+
  `SocialShareBar.tsx:125`) → `mailto:` — mailto bodies are plain-text by spec; rich HTML cannot
  ride that path. The fix is a new path, not an upgrade.
- **Infrastructure found:** `lib/email/sendgrid.ts` is production-real (`sendEmail`/`sendBulkEmail`;
  callers: cma, contact, inquiries, sign-up routes; unsubscribe handling exists).
- **Maya's direction (AskUserQuestion, 2026-06-11):** **BOTH** — (1) a "Copy listing card" button
  that puts a rich HTML card on the clipboard for pasting into her own Outlook compose
  (ship first; simplest; she remains the sender), and (2) a platform-send form via the existing
  SendGrid pipeline (tracked, branded, CAN-SPAM footer automated).
- **Compliance notes for the eventual design (§D applies):** a listing email is advertising →
  NY DOS §175.25 (brokerage name + address/phone in the card/footer) · IDX attribution if the
  listing is RLS (exclusives show Mallan attribution) · Fair Housing scan on any free-text note ·
  CAN-SPAM footer/unsubscribe on the platform-send path · FARE Act fee line for rentals ·
  email templates are a tristle-gated surface.
- **Open questions for resume:** card contents (which fields/photo count) · who can use it
  (agent/broker only?) · whether the platform-send logs an AuditEvent + contact consent check.

Next step on resume: continue brainstorming (remaining clarifying questions) → design → spec →
plan, per superpowers flow.
