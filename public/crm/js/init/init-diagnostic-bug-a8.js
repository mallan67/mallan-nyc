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
                            // condensed counts to the operator so they have visual
                            // confirmation without needing the console.
                            var b = result.body || {};
                            var countsLines = Object.keys(b.counts || {}).map(function(k) {
                                var v = b.counts[k] || {};
                                return '  ' + k + ': ' + (v.count != null ? v.count : 'n/a') + (v.error ? ' (err: ' + v.error.slice(0, 80) + ')' : '');
                            }).join('\n');
                            var ptRows = ((b.distribution_by_property_type || {}).rows || [])
                                .map(function(r) { return '  ' + (r.PropertyType || '?') + ': ' + r.Count; })
                                .join('\n');
                            var pstRows = ((b.distribution_by_property_subtype || {}).rows || [])
                                .map(function(r) { return '  ' + (r.PropertySubType || '?') + ': ' + r.Count; })
                                .join('\n');
                            var msg = 'Bug A8 diagnostic — ' + (b.ts || '') + '\n\n' +
                                'Inputs: ' + JSON.stringify(b.inputs) + '\n\n' +
                                'Counts:\n' + countsLines + '\n\n' +
                                'PropertyType distribution (current filter):\n' + ptRows + '\n\n' +
                                'PropertySubType distribution (Residential only):\n' + pstRows;
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
