        // ═══════════════════════════════════════════════════════════════════
        // TEMPORARY — Bug A8 diagnostic launcher
        // Adds a small fixed-position button (broker/agent only) that fires
        // a same-origin authenticated fetch to /api/idx/diagnostic-distribution.
        //
        // Why this exists (and why it's temporary):
        //   The diagnostic endpoint requires the broker/agent session cookie.
        //   The cookie is SameSite=Strict for broker logins (per
        //   lib/auth/cookie-config.ts:14), which means pasting the diagnostic
        //   URL into a fresh browser tab does NOT send the cookie — the user
        //   gets 401 even though they're logged in. A same-origin fetch from
        //   inside the already-authenticated CRM page DOES send the cookie.
        //   Pasting into DevTools console isn't usable for the operator, so
        //   this small button bridges the gap with one click.
        //
        // Removable in the same cleanup commit that removes
        //   app/api/idx/diagnostic-distribution/route.ts
        //   public/crm/js/init/init-diagnostic-bug-a8.js
        //   <script> reference in public/crm/index.html
        // ═══════════════════════════════════════════════════════════════════

        (function() {
            var BUTTON_ID = '__bugA8DiagnosticButton';
            var DIAGNOSTIC_URL = '/api/idx/diagnostic-distribution?type=sale&status=Active&borough=Manhattan&minBeds=1&maxBeds=1';

            function isAgentOrBroker() {
                if (typeof MallanAPI === 'undefined' || !MallanAPI || !MallanAPI.getContext) return false;
                var ctx = MallanAPI.getContext();
                if (!ctx || !ctx.authenticated) return false;
                var role = (ctx.role || '').toUpperCase();
                return role === 'BROKER' || role === 'AGENT';
            }

            function injectButton() {
                if (document.getElementById(BUTTON_ID)) return;
                if (!isAgentOrBroker()) return;

                var btn = document.createElement('button');
                btn.id = BUTTON_ID;
                btn.type = 'button';
                btn.textContent = 'Run Bug A8 diagnostic';
                btn.style.cssText = [
                    'position:fixed',
                    'bottom:16px',
                    'right:16px',
                    'z-index:99999',
                    'padding:10px 14px',
                    'background:#7c3aed',
                    'color:#fff',
                    'border:0',
                    'border-radius:8px',
                    'box-shadow:0 4px 12px rgba(0,0,0,0.2)',
                    'font:600 12px system-ui,sans-serif',
                    'cursor:pointer'
                ].join(';');
                btn.title = 'Fires /api/idx/diagnostic-distribution from same-origin (cookie sent). Result is logged server-side; counts also shown in alert.';

                btn.addEventListener('click', function() {
                    btn.disabled = true;
                    btn.textContent = 'Running…';
                    fetch(DIAGNOSTIC_URL, { credentials: 'include' })
                        .then(function(res) {
                            return res.json().then(function(body) { return { status: res.status, body: body }; });
                        })
                        .then(function(result) {
                            btn.disabled = false;
                            btn.textContent = 'Run Bug A8 diagnostic';
                            if (result.status !== 200) {
                                window.alert('Diagnostic HTTP ' + result.status + '\n' + JSON.stringify(result.body, null, 2).slice(0, 1500));
                                return;
                            }
                            // Success — server has already logged full JSON. Show
                            // condensed counts to the operator. Round 2 schema:
                            //   total_count, property_subtype_distribution,
                            //   mls_status_distribution, common_interest_distribution,
                            //   internet_entire_listing_display_yn,
                            //   internet_address_display_yn, listing_contract_date_age_buckets,
                            //   compliance_gate_aggregate.
                            var b = result.body || {};
                            function listFmt(arr, keyName) {
                                if (!arr || !arr.length) return '  (none)';
                                return arr.map(function(r) {
                                    var label = r[keyName] != null ? r[keyName] : (r.bucket != null ? r.bucket : '?');
                                    return '  ' + label + ': ' + (r.count != null ? r.count : '?') + (r.error ? ' [err]' : '');
                                }).join('\n');
                            }
                            var gate = b.compliance_gate_aggregate || {};
                            var gateBlockedReasons = Object.keys(gate.blocked_by_reason || {}).map(function(k) {
                                return '    ' + k + ': ' + gate.blocked_by_reason[k];
                            }).join('\n') || '    (none)';
                            var gateIE = ((gate.display_yn_distribution || {}).internet_entire_listing) || {};
                            var gateIA = ((gate.display_yn_distribution || {}).internet_address) || {};
                            var msg =
                                'Bug A8 diagnostic round ' + (b.round || 1) + ' — ' + (b.ts || '') + '\n' +
                                'Inputs: ' + JSON.stringify(b.inputs) + '\n' +
                                '─────────────────────────────────────\n' +
                                'Total count (BASE filter): ' + (b.total_count != null ? b.total_count : '?') + '\n\n' +
                                'PropertySubType (non-zero):\n' + listFmt(b.property_subtype_distribution, 'value') + '\n\n' +
                                'MlsStatus (non-zero, within Active=BASE):\n' + listFmt(b.mls_status_distribution, 'value') + '\n\n' +
                                'CommonInterest (non-zero):\n' + listFmt(b.common_interest_distribution, 'value') + '\n\n' +
                                'InternetEntireListingDisplayYN:\n' + listFmt(b.internet_entire_listing_display_yn, 'bucket') + '\n\n' +
                                'InternetAddressDisplayYN:\n' + listFmt(b.internet_address_display_yn, 'bucket') + '\n\n' +
                                'Days since ListingContractDate:\n' + listFmt(b.listing_contract_date_age_buckets, 'bucket') + '\n\n' +
                                'Compliance gate (running checkDistributionGates on every record):\n' +
                                '  records_scanned: ' + (gate.records_scanned || 0) + '\n' +
                                '  pages_fetched:   ' + (gate.pages_fetched || 0) + '\n' +
                                '  gate_passed:     ' + (gate.gate_passed || 0) + '\n' +
                                '  gate_blocked:    ' + (gate.gate_blocked || 0) + '\n' +
                                '  blocked_by_reason:\n' + gateBlockedReasons + '\n' +
                                '  IE display YN: t=' + (gateIE.true || 0) + ' f=' + (gateIE.false || 0) + ' null=' + (gateIE.null || 0) + '\n' +
                                '  IA display YN: t=' + (gateIA.true || 0) + ' f=' + (gateIA.false || 0) + ' null=' + (gateIA.null || 0) + '\n' +
                                (gate.error ? '  ERROR: ' + gate.error : '');
                            window.alert(msg);
                        })
                        .catch(function(err) {
                            btn.disabled = false;
                            btn.textContent = 'Run Bug A8 diagnostic';
                            window.alert('Diagnostic fetch failed: ' + (err && err.message ? err.message : String(err)));
                        });
                });

                document.body.appendChild(btn);
            }

            // Inject as soon as MallanAPI says we're authenticated. Polling
            // because MallanAPI.init may complete after DOMContentLoaded.
            function tryInject() {
                if (isAgentOrBroker()) { injectButton(); return; }
                setTimeout(tryInject, 500);
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', tryInject);
            } else {
                tryInject();
            }
        })();
