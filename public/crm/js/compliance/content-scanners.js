        function scanAgentInfo(text) {
            var violations = [];
            AGENT_INFO_PATTERNS.forEach(rule => {
                var matches = text.match(rule.pattern);
                if (matches) {
                    matches.forEach(m => violations.push({ match: m, type: rule.type }));
                }
            });
            return violations;
        }

        // S3: Off-Market Language Scanner
        var OFF_MARKET_PATTERNS = [
            { pattern: /\boff[\s-]?market\b/gi, type: '"Off-Market" language' },
            { pattern: /\bpocket\s+listing\b/gi, type: '"Pocket listing" language' },
            { pattern: /\bwhisper\s+listing\b/gi, type: '"Whisper listing" language' },
            { pattern: /\bpre[\s-]?market\b/gi, type: '"Pre-market" language' },
            { pattern: /\bexclusive(?:ly)?\s+(?:available|offered)\b/gi, type: 'Exclusive availability language' },
        ];

        function scanOffMarketLanguage(text) {
            var violations = [];
            OFF_MARKET_PATTERNS.forEach(rule => {
                var matches = text.match(rule.pattern);
                if (matches) {
                    matches.forEach(m => violations.push({ match: m, type: rule.type }));
                }
            });
            return violations;
        }

        // S4: Compensation Language Scanner
        var COMPENSATION_PATTERNS = [
            { pattern: /\b\d+(\.\d+)?\s*%?\s*(?:commission|comp(?:ensation)?|co-?broke?|broker\s*fee|agent\s*fee)\b/gi, type: 'Commission Amount' },
            { pattern: /\b(?:commission|comp(?:ensation)?|co-?broke?|broker\s*fee)\s*[:=]?\s*\$?\d+/gi, type: 'Commission Amount' },
            { pattern: /\b(?:seller|buyer|tenant|landlord)\s+(?:pays?|covers?)\s+(?:commission|comp|fee|closing\s+costs?)\b/gi, type: 'Compensation Direction' },
            { pattern: /\b(?:bonus|incentive)\s+(?:to|for)\s+(?:agent|broker|co-?broke?)\b/gi, type: 'Bonus/Incentive' },
        ];

        function scanCompensation(text) {
            var violations = [];
            COMPENSATION_PATTERNS.forEach(rule => {
                var matches = text.match(rule.pattern);
                if (matches) {
                    matches.forEach(m => violations.push({ match: m, type: rule.type }));
                }
            });
            return violations;
        }

        // S5: Free Services Scanner
        var FREE_SERVICES_PATTERNS = [
            { pattern: /\b(?:free|no[\s-]?cost|no[\s-]?fee|complimentary|at\s+no\s+(?:additional\s+)?(?:cost|charge))\s+(?:services?|consultation|market\s+analysis|CMA|evaluation|appraisal|listing)\b/gi, type: '"Free services" claim' },
            { pattern: /\b(?:we\s+(?:don'?t|never)\s+charge|zero\s+(?:commission|fee))\b/gi, type: '"No charge" claim' },
        ];

        function scanFreeServices(text) {
            var violations = [];
            FREE_SERVICES_PATTERNS.forEach(rule => {
                var matches = text.match(rule.pattern);
                if (matches) {
                    matches.forEach(m => violations.push({ match: m, type: rule.type }));
                }
            });
            return violations;
        }

        // Master content scanner — runs all 4 scanners on description fields
        function scanAllContent(formType) {
            var descFields = formType === 'sale'
                ? ['saleDescription', 'saleTHDescription', 'saleTHLayout', 'saleTHFinancingNotes', 'saleShowingInstructions']
                : ['rentalDescription', 'rentalTHDescription', 'rentalTHLayout', 'rentalTHFinancingNotes', 'rentalShowingInstructions'];

            var allViolations = [];

            descFields.forEach(fieldId => {
                var el = document.getElementById(fieldId);
                if (!el || !el.value) return;
                var text = el.value;
                var agentV = scanAgentInfo(text);
                var offMarketV = scanOffMarketLanguage(text);
                var compV = scanCompensation(text);
                var freeV = scanFreeServices(text);
                [...agentV, ...offMarketV, ...compV, ...freeV].forEach(v => {
                    allViolations.push({ ...v, field: fieldId });
                });
            });

            // Display results
            var panelId = formType + 'ContentScanResults';
            var panel = document.getElementById(panelId);
            if (!panel) {
                // Create panel if it doesn't exist
                var descEl = document.getElementById(formType === 'sale' ? 'saleDescription' : 'rentalDescription');
                if (descEl) {
                    panel = document.createElement('div');
                    panel.id = panelId;
                    panel.className = 'mt-2';
                    descEl.parentNode.insertBefore(panel, descEl.nextSibling);
                }
            }

            if (panel) {
                if (allViolations.length === 0) {
                    panel.innerHTML = '<div class="flex items-center gap-2 text-green-600 text-xs mt-1"><i class="fas fa-check-circle"></i> Content compliance check passed (no agent info, off-market language, compensation, or free services detected)</div>';
                } else {
                    var html = '<div class="rounded-lg border bg-red-50 border-red-300 p-3 mt-2">';
                    html += '<div class="flex items-center gap-2 mb-2"><i class="fas fa-exclamation-triangle text-red-600"></i>';
                    html += '<span class="text-sm font-bold text-red-700">REBNY Content Violations (' + allViolations.length + ')</span></div>';
                    html += '<ul class="text-xs text-red-700 space-y-1 ml-4 list-disc">';
                    allViolations.forEach(v => {
                        html += '<li><strong>"' + escapeHtml(v.match) + '"</strong> — ' + v.type + ' (in ' + v.field + ')</li>';
                    });
                    html += '</ul>';
                    html += '<p class="text-xs text-red-600 mt-2 font-semibold">These violations will result in REBNY compliance review and potential fines ($0→$250→$250→termination).</p>';
                    html += '</div>';
                    panel.innerHTML = html;
                }
            }

            return allViolations;
        }

        // Wire content scanners to description textareas
        ['saleDescription', 'rentalDescription'].forEach(id => {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', function() {
                    var formType = id.startsWith('sale') ? 'sale' : 'rental';
                    clearTimeout(window['contentScanDebounce_' + formType]);
                    window['contentScanDebounce_' + formType] = setTimeout(() => scanAllContent(formType), 800);
                });
            }
        });

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  DISPLAY PERMISSION CASCADE (REBNY I29/I58-I61)               ║
        // ║  InternetEntireListingDisplayYN → IDX/Address/AVM/Comment     ║
        // ╚══════════════════════════════════════════════════════════════════╝

        function setupDisplayCascade(formType) {
            var prefix = formType === 'sale' ? 'sale' : 'rental';
            var entireEl = document.querySelector('input[name="' + prefix + 'InternetEntireListingDisplayYN"]') ||
                            document.getElementById(prefix + 'InternetEntireListingDisplayYN');

            if (!entireEl) return;

            var cascadeTargets = [
                prefix + 'Dist_IDX', // the Mallan IDX-display control (no provider field exists)
                prefix + 'InternetAddressDisplayYN',
            ];

            // For radio buttons
            var radioName = prefix + 'InternetEntireListingDisplayYN';
            document.querySelectorAll('input[name="' + radioName + '"]').forEach(radio => {
                radio.addEventListener('change', function() {
                    var isEnabled = this.value === 'Yes';
                    cascadeTargets.forEach(targetId => {
                        var targetEl = document.getElementById(targetId);
                        if (targetEl) {
                            if (!isEnabled) {
                                targetEl.checked = false;
                                targetEl.disabled = true;
                                targetEl.closest('label')?.classList.add('opacity-50');
                            } else {
                                targetEl.disabled = false;
                                targetEl.closest('label')?.classList.remove('opacity-50');
                            }
                        }
                    });
                    // Also cascade AVM radio
                    if (!isEnabled) {
                        var avmNo = document.querySelector('input[name="' + prefix + 'InternetAVMDisplayYN"][value="No"]');
                        if (avmNo) avmNo.checked = true;
                        document.querySelectorAll('input[name="' + prefix + 'InternetAVMDisplayYN"]').forEach(r => r.disabled = true);
                    } else {
                        document.querySelectorAll('input[name="' + prefix + 'InternetAVMDisplayYN"]').forEach(r => r.disabled = false);
                    }
                });
            });

            // For checkboxes
            if (entireEl.type === 'checkbox') {
                entireEl.addEventListener('change', function() {
                    cascadeTargets.forEach(targetId => {
                        var targetEl = document.getElementById(targetId);
                        if (targetEl) {
                            if (!entireEl.checked) {
                                targetEl.checked = false;
                                targetEl.disabled = true;
                            } else {
                                targetEl.disabled = false;
                            }
                        }
                    });
                });
            }
        }

        // Initialize display cascades
        setupDisplayCascade('sale');
        setupDisplayCascade('rental');

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  DATE CROSS-VALIDATION (REBNY / Trestle Requirements)         ║
        // ╚══════════════════════════════════════════════════════════════════╝

