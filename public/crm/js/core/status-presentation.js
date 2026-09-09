        // ═══════════════════════════════════════════════════════════════════════════════════════════════
        // THE ONE BROWSER STATUS PRESENTATION AUTHORITY — public/crm/js/core/status-presentation.js
        //
        // A status becomes display text in exactly ONE place in this browser: here. Every grid cell, card
        // badge, map pin, drawer, print sheet, report, email body and compliance gate asks this module and
        // renders what it returns. No renderer keeps a status list, a colour map or a label of its own.
        //
        // Owner rulings (Maya, 2026-09-08 / 2026-09-09):
        //   1. A STATUS IS A LIVE COTALITY StandardStatus TOKEN. The eleven live members are Active,
        //      ActiveUnderContract, Canceled (ONE L), Closed, ComingSoon, Delete, Expired, Hold, Incomplete,
        //      Pending, Withdrawn. `MlsStatus` is provider-suppressed and not filterable — it is never a
        //      status fact and is never named here.
        //   2. BROKER LANGUAGE IS A LABEL, APPLIED PER TRANSACTION — never a stored token. A sale's Closed
        //      reads "Sold" and a rental's reads "Rented"; a sale's Pending reads "In Contract" and a
        //      rental's reads "Pending". The sale and rental vocabularies are separate and never drift into
        //      each other.
        //   3. AN UNRESOLVABLE STATUS IS "Status unavailable" — NEVER "Active". Defaulting a blank status
        //      advertises an off-market or unknown row as live inventory (fail closed).
        //   4. ActiveUnderContract and Pending are two distinct live members and are never collapsed.
        //   5. 'Cancelled' (two L), 'Sold', 'Rented', 'Leased', 'Draft' and the retired uppercase words
        //      ('ACTIVE', 'COMING_SOON', 'CANCELLED', 'DELETED' …) are READ-compatible inputs only. Nothing
        //      writes them and nothing displays them.
        //   6. 'OFF_MARKET' and 'UNKNOWN' are NOT statuses. Off Market is Mallan's presence state
        //      (lib/listings/canonical-lifecycle.ts); it reaches the browser as a server-supplied
        //      `status_label`, never as a token.
        //
        // WHERE THE VOCABULARY COMES FROM
        //   Runtime authority: `window.SEARCH_CONTRACT` — the executor contract served by
        //   GET /api/idx/search/contract (lib/search/engine/contract.ts), loaded by search-engine.js. Its
        //   `members.StandardStatus` is the live token list and its `statusChoices.sale` /
        //   `statusChoices.rental` are the server's own per-transaction labels, derived from
        //   lib/crm/status-mapping.ts.
        //
        //   Offline fallback: `_FALLBACK` below. The CRM page renders before (and sometimes without) the
        //   contract fetch — print sheets, saved report HTML and the offline test harness have no network —
        //   so a copy is unavoidable. It is NOT hand-maintained drift: `tests/runtime/
        //   crm-status-presentation-helper.test.ts` RATCHETS every entry against the server authority
        //   (`searchContract().members.StandardStatus`, `SALE_STATUS_MAPPING.canonicalLabels`,
        //   `RENTAL_STATUS_MAPPING.canonicalLabels`, `MALLAN_TERMINAL_STATUSES`). Change the server and
        //   that test fails until this file follows. The served contract always wins at runtime.
        //
        //   `statusChoices` deliberately omits Incomplete and Delete (a draft and a removed record are not
        //   searchable inventory), so those two labels can only come from the fallback — which is exactly
        //   why the ratchet covers the full canonical map and not just the searchable subset.
        // ═══════════════════════════════════════════════════════════════════════════════════════════════
        var MallanStatus = (function () {
            'use strict';

            /** Fail-closed display text for any row whose status cannot be resolved. Never "Active". */
            var UNAVAILABLE = 'Status unavailable';

            // ── The offline copy of the server authority (ratcheted; see the header) ──────────────────
            var _FALLBACK = {
                // = searchContract().members.StandardStatus
                tokens: [
                    'Active', 'ActiveUnderContract', 'Canceled', 'Closed', 'ComingSoon',
                    'Delete', 'Expired', 'Hold', 'Incomplete', 'Pending', 'Withdrawn'
                ],
                // = SALE_STATUS_MAPPING.canonicalLabels / RENTAL_STATUS_MAPPING.canonicalLabels
                labels: {
                    sale: {
                        Incomplete: 'Incomplete',
                        ComingSoon: 'Coming Soon',
                        Active: 'Active',
                        ActiveUnderContract: 'Active Under Contract',
                        Pending: 'In Contract',
                        Closed: 'Sold',
                        Withdrawn: 'Withdrawn',
                        Expired: 'Expired',
                        Hold: 'Hold',
                        Canceled: 'Canceled'
                    },
                    rental: {
                        Incomplete: 'Incomplete',
                        Active: 'Active',
                        ActiveUnderContract: 'Active Under Contract',
                        Pending: 'Pending',
                        Closed: 'Rented',
                        Withdrawn: 'Withdrawn',
                        Expired: 'Expired',
                        Hold: 'Hold',
                        Canceled: 'Canceled'
                    }
                },
                // = MALLAN_TERMINAL_STATUSES + the provider's Hold. This is the REBNY RLS off-market set:
                // an off-market listing may show its PRIMARY PHOTO ONLY (rule Feb 2025).
                offMarket: ['Canceled', 'Closed', 'Delete', 'Expired', 'Hold', 'Withdrawn'],
                // The market clock partition of that set — paused ∪ stopped = offMarket, and disjoint.
                // Hold and Withdrawn are reversible (the clock resumes); the other four are final.
                clockPaused: ['Hold', 'Withdrawn'],
                clockStopped: ['Canceled', 'Closed', 'Delete', 'Expired']
            };

            /**
             * READ-compatibility only: spellings written before the 2026-09-08 token correction, and the
             * uppercase presentation words the retired DTO mapper emitted before 2026-09-09. Resolving them
             * is how an old saved report, a cached payload or a legacy Mallan row still renders correctly.
             * Nothing writes any of these.
             */
            var _LEGACY = {
                // Legacy Mallan storage spellings (lib/listings/mallan-status.ts LEGACY_STORAGE_ALIASES)
                'Draft': 'Incomplete',
                'Sold': 'Closed',
                'Rented': 'Closed',
                'Leased': 'Closed',
                'Cancelled': 'Canceled',
                // The retired browser presentation vocabulary (lib/search/crm-idx-mapper.ts, pre-2026-09-09)
                'ACTIVE': 'Active',
                'ACTIVE_UNDER_CONTRACT': 'ActiveUnderContract',
                'COMING_SOON': 'ComingSoon',
                'PENDING': 'Pending',
                'CLOSED': 'Closed',
                'EXPIRED': 'Expired',
                'WITHDRAWN': 'Withdrawn',
                'HOLD': 'Hold',
                'INCOMPLETE': 'Incomplete',
                'CANCELED': 'Canceled',
                'CANCELLED': 'Canceled',
                'DELETED': 'Delete',
                'DELETE': 'Delete',
                'SOLD': 'Closed',
                'RENTED': 'Closed',
                'LEASED': 'Closed',
                'DRAFT': 'Incomplete',
                // RESO display spellings the provider occasionally sends
                'Coming Soon': 'ComingSoon',
                'Active Under Contract': 'ActiveUnderContract'
            };

            /**
             * Words that are NOT statuses and must never resolve to one. 'OFF_MARKET' / 'UNKNOWN' were
             * sentinels invented by the retired mapper; Off Market is a PRESENCE state, not a status.
             */
            var _NOT_A_STATUS = { 'UNKNOWN': 1, 'OFF_MARKET': 1, 'OFF MARKET': 1, 'OFF-MARKET': 1, 'OFFMARKET': 1, 'DELISTED': 1, 'NONE': 1, 'N/A': 1 };

            // ── Presentation, keyed by the live token (the ONLY colour/class decision in the browser) ──
            var _STYLE = {
                Active:              { classes: 'bg-green-100 text-green-700',   bg: '#dcfce7', fg: '#15803d', pin: '#16a34a' },
                ComingSoon:          { classes: 'bg-purple-100 text-purple-700', bg: '#f5f3ff', fg: '#7c3aed', pin: '#7c3aed' },
                ActiveUnderContract: { classes: 'bg-amber-100 text-amber-800',   bg: '#fef3c7', fg: '#92400e', pin: '#d97706' },
                Pending:             { classes: 'bg-orange-100 text-orange-700', bg: '#ffedd5', fg: '#c2410c', pin: '#ea580c' },
                Closed:              { classes: 'bg-blue-100 text-blue-700',     bg: '#dbeafe', fg: '#1d4ed8', pin: '#1d4ed8' },
                Hold:                { classes: 'bg-yellow-100 text-yellow-800', bg: '#fef9c3', fg: '#854d0e', pin: '#ca8a04' },
                Withdrawn:           { classes: 'bg-red-100 text-red-600',       bg: '#fee2e2', fg: '#dc2626', pin: '#dc2626' },
                Expired:             { classes: 'bg-red-100 text-red-700',       bg: '#fee2e2', fg: '#b91c1c', pin: '#b91c1c' },
                Canceled:            { classes: 'bg-rose-100 text-rose-700',     bg: '#ffe4e6', fg: '#be123c', pin: '#be123c' },
                Incomplete:          { classes: 'bg-slate-100 text-slate-600',   bg: '#f1f5f9', fg: '#475569', pin: '#64748b' },
                Delete:              { classes: 'bg-gray-300 text-gray-700',     bg: '#d1d5db', fg: '#374151', pin: '#374151' }
            };
            var _UNKNOWN_STYLE = { classes: 'bg-gray-100 text-gray-600', bg: '#f3f4f6', fg: '#6b7280', pin: '#6b7280' };

            // ── Runtime authority resolution ───────────────────────────────────────────────────────────
            function _contract() {
                return (typeof window !== 'undefined' && window.SEARCH_CONTRACT) ? window.SEARCH_CONTRACT : null;
            }

            /** The live token list: the served contract when present, the ratcheted copy otherwise. */
            function tokens() {
                var c = _contract();
                var members = c && c.members && c.members.StandardStatus;
                if (members && members.length) {
                    var out = [];
                    for (var i = 0; i < members.length; i++) if (members[i] && members[i].token) out.push(members[i].token);
                    if (out.length) return out;
                }
                return _FALLBACK.tokens.slice();
            }

            /**
             * The transaction's token → broker label map. The served contract's `statusChoices` OVERRIDE the
             * offline copy entry by entry (the server always wins); the copy supplies only what the contract
             * deliberately omits (Incomplete / Delete are never searchable, so they are never offered).
             * The `backOnMarket` choice is skipped: Back On Market is a refinement OF Active, not a status.
             */
            function labels(transaction) {
                var key = transaction === 'rental' || transaction === 'rent' ? 'rental' : 'sale';
                var base = _FALLBACK.labels[key];
                var out = {};
                for (var t in base) if (Object.prototype.hasOwnProperty.call(base, t)) out[t] = base[t];
                var c = _contract();
                var choices = c && c.statusChoices && c.statusChoices[key];
                if (choices && choices.length) {
                    for (var i = 0; i < choices.length; i++) {
                        var ch = choices[i];
                        if (!ch || !ch.token || ch.refine) continue;
                        out[ch.token] = ch.label;
                    }
                }
                return out;
            }

            // ── Input readers ──────────────────────────────────────────────────────────────────────────
            function _rawStatus(input) {
                if (input == null) return '';
                if (typeof input === 'string') return input.trim();
                if (typeof input !== 'object') return '';
                var v = input.status != null ? input.status
                    : (input.standardStatus != null ? input.standardStatus : input.StandardStatus);
                return typeof v === 'string' ? v.trim() : '';
            }

            /**
             * The row's transaction: 'sale' | 'rental'. `status_transaction` (shipped by the DTO mapper and by
             * transformAPIListing) is authoritative; `listingCategory` is the legacy DTO shape, where a sale
             * carries `undefined`. PropertyType is the provider's own sale/rental fact (*Lease = rental).
             */
            function transaction(input) {
                if (!input || typeof input !== 'object') return 'sale';
                var t = input.status_transaction;
                if (t === 'rent' || t === 'rental') return 'rental';
                if (t === 'sale') return 'sale';
                if (input.listingCategory === 'rental' || input.listing_type === 'rent' || input.listing_type === 'rental') return 'rental';
                var pt = input.propertyType || input.PropertyType || input.property_type;
                if (typeof pt === 'string' && /lease|rental/i.test(pt)) return 'rental';
                return 'sale';
            }

            /**
             * THE exact live Cotality StandardStatus token for a row (or a bare status string), or null.
             * Null is the honest answer for a blank, a sentinel or an unrecognised value — never a default.
             */
            function token(input) {
                var raw = _rawStatus(input);
                if (!raw) return null;
                if (_NOT_A_STATUS[raw.toUpperCase()]) return null;

                var live = tokens();
                var i;
                for (i = 0; i < live.length; i++) if (live[i] === raw) return live[i];
                if (Object.prototype.hasOwnProperty.call(_LEGACY, raw)) return _LEGACY[raw];

                var lower = raw.toLowerCase();
                for (i = 0; i < live.length; i++) if (live[i].toLowerCase() === lower) return live[i];
                for (var k in _LEGACY) if (Object.prototype.hasOwnProperty.call(_LEGACY, k) && k.toLowerCase() === lower) return _LEGACY[k];
                return null;
            }

            /**
             * The broker label for a row, in ITS transaction's language.
             *   - a server-supplied `status_label` wins: it is the server's own projection
             *     (lib/compliance/dto.ts / lib/crm/status-mapping.ts statusPresentation) and it alone knows
             *     the Mallan presence state ("Off Market — reason unknown");
             *   - otherwise the transaction's canonical label for the token;
             *   - a token outside this transaction's canonical set is NOT relabelled into the other
             *     transaction's language (a rental has no Coming Soon) — it reads "Status unavailable";
             *   - no token at all reads "Status unavailable". Never "Active".
             */
            function label(input) {
                if (input && typeof input === 'object' && typeof input.status_label === 'string' && input.status_label.trim()) {
                    return input.status_label.trim();
                }
                var t = token(input);
                if (!t) return UNAVAILABLE;
                return labels(transaction(input))[t] || UNAVAILABLE;
            }

            function _style(input) {
                var t = token(input);
                return (t && _STYLE[t]) || _UNKNOWN_STYLE;
            }

            /** Tailwind badge classes for the row's status. */
            function classes(input) { return _style(input).classes; }

            /** Inline-style colours for print / email / PDF consumers that cannot use Tailwind. */
            function colors(input) { var s = _style(input); return { bg: s.bg, fg: s.fg }; }

            /** Map-pin colour for the row's status. */
            function pinColor(input) { return _style(input).pin; }

            /**
             * Coming Soon (UCBA Art. I §5(C) / §16 — no showings, open houses or negotiations).
             * Deliberately NOT gated on transaction: Coming Soon is a sales-only state at listing creation
             * (the rental mapping has no such canonical status), but a SHOWING RESTRICTION must never fail
             * open. If the token arrives on a rental the restriction still renders.
             */
            function isComingSoon(input) { return token(input) === 'ComingSoon'; }

            /**
             * REBNY RLS off-market rule (Feb 2025): an off-market listing displays its PRIMARY PHOTO ONLY.
             * Closed · Withdrawn · Hold · Canceled · Expired · Delete.
             */
            function isOffMarket(input) {
                var t = token(input);
                return !!t && _FALLBACK.offMarket.indexOf(t) !== -1;
            }

            /**
             * The Mallan market clock for a row: 'exempt' | 'paused' | 'stopped' | 'accruing'.
             * Participant Only is DOM-exempt (UCBA Rule A4) and so is Coming Soon; Hold and Withdrawn pause
             * the clock (reversible); Closed / Canceled / Expired / Delete stop it for good.
             */
            function domClock(input) {
                if (input && typeof input === 'object' && input.permissions && input.permissions.participantOnly) return 'exempt';
                var t = token(input);
                if (t === 'ComingSoon') return 'exempt';
                if (t && _FALLBACK.clockPaused.indexOf(t) !== -1) return 'paused';
                if (t && _FALLBACK.clockStopped.indexOf(t) !== -1) return 'stopped';
                return 'accruing';
            }

            return {
                UNAVAILABLE: UNAVAILABLE,
                tokens: tokens,
                labels: labels,
                transaction: transaction,
                token: token,
                label: label,
                classes: classes,
                colors: colors,
                pinColor: pinColor,
                isComingSoon: isComingSoon,
                isOffMarket: isOffMarket,
                domClock: domClock,
                // Exposed for the ratchet test ONLY — no renderer may read it.
                _FALLBACK: _FALLBACK
            };
        })();

        if (typeof window !== 'undefined') window.MallanStatus = MallanStatus;
