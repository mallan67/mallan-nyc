        var REBNY_REQUIRED_FIELDS = {
            sale: SALE_REQUIRED_FIELDS,
            rental: RENTAL_REQUIRED_FIELDS_LIST
        };

        // Validate required fields for a given form type ('sale' or 'rental')
        function validateREBNYRequired(formType) {
            var fields = REBNY_REQUIRED_FIELDS[formType] || [];
            var missing = [];
            fields.forEach(function(field) {
                if (formType === 'sale') {
                    if (!isFieldRelevant(field)) return;
                    if (!isStatusRelevant(field)) return;
                }
                if (formType === 'rental' && field.conditional) {
                    // Check if this conditional rental field is currently relevant
                    var ptEl = document.querySelector('input[name="rentalPropertyType"]:checked');
                    if (!ptEl) return; // No property type selected, skip conditional fields
                    var subtype = resolveRentalListingSubtype(ptEl.value);
                    if (!field.conditional.includes(subtype)) return; // Not relevant for this property type
                }
                if (!fieldHasValue(field)) {
                    missing.push(field.label);
                }
            });
            return missing;
        }

        // Handle status dropdown change — blocks Active if required fields missing
        function validateStatusChange(formType) {
            var statusEl = document.getElementById(formType === 'sale' ? 'saleStatus' : 'rentalStatus');
            var panelEl = document.getElementById(formType + 'ValidationPanel');
            var listEl = document.getElementById(formType + 'MissingFieldsList');
            var draftBadge = document.getElementById(formType + 'DraftBadge');
            if (!statusEl) return;

            var newStatus = statusEl.value;
            var prevStatus = statusEl.dataset.prevStatus || 'Draft';

            // Check valid transition per STATUS_TRANSITIONS state machine
            if (typeof STATUS_TRANSITIONS !== 'undefined' && prevStatus && STATUS_TRANSITIONS[prevStatus]) {
                var allowed = STATUS_TRANSITIONS[prevStatus];
                if (allowed.length > 0 && !allowed.includes(newStatus) && newStatus !== prevStatus) {
                    alert('Invalid status transition: ' + prevStatus + ' → ' + newStatus + '\n\nAllowed transitions from ' + prevStatus + ':\n• ' + allowed.join('\n• '));
                    statusEl.value = prevStatus;
                    return false;
                }
            }

            // Show warning for active/live statuses with missing required fields (does not block)
            if (REBNY_ACTIVE_STATUSES.includes(newStatus)) {
                var missing = validateREBNYRequired(formType);
                if (missing.length > 0) {
                    // Show warning panel but allow the status change
                    if (panelEl) {
                        panelEl.classList.remove('hidden');
                        listEl.innerHTML = missing.map(m => '<li>' + m + '</li>').join('');
                    }
                } else {
                    if (panelEl) panelEl.classList.add('hidden');
                }
            }

            // Update previous status tracking
            statusEl.dataset.prevStatus = newStatus;
            if (panelEl) panelEl.classList.add('hidden');

            // Update draft badge
            if (draftBadge) {
                if (newStatus === 'Draft' || newStatus === 'Future') {
                    draftBadge.style.display = '';
                    draftBadge.querySelector('i').className = 'fas fa-file-alt';
                    draftBadge.innerHTML = '<i class="fas fa-file-alt"></i> ' + (newStatus === 'Draft' ? 'DRAFT' : 'FUTURE');
                    draftBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-300';
                } else if (newStatus === 'Active' || newStatus === 'ComingSoon' || newStatus === 'BackOnMarket') {
                    draftBadge.innerHTML = '<i class="fas fa-broadcast-tower"></i> ' + newStatus.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
                    draftBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300';
                } else {
                    draftBadge.innerHTML = '<i class="fas fa-file-contract"></i> ' + newStatus.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
                    draftBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300';
                }
            }
            return true;
        }

        // ============================================================
        // FAIR HOUSING COMPLIANCE CHECKER
        // Real-time detection of prohibited language per:
        // - Federal Fair Housing Act (42 U.S.C. 3604(c))
        // - NY State Human Rights Law
        // - NY DOS Advertising Guidelines (19 NYCRR 175.29)
        // - REBNY RLS Policies
        // ============================================================

        var FAIR_HOUSING_VIOLATIONS = [
            // Race / Color / National Origin
            { pattern: /\b(white|caucasian|black|african[- ]?american|hispanic|latino|latina|asian|oriental|chinese|japanese|korean|indian|arab|jewish|irish|italian|russian)\s*(neighborhood|community|area|tenants?|residents?|buyers?|renters?|preferred|only|welcome)\b/gi, category: 'Race / National Origin', severity: 'high', suggestion: 'Remove racial/ethnic references. Describe property features instead.' },
            { pattern: /\b(no\s+(?:blacks|whites|hispanics|asians|foreigners|immigrants|minorities))\b/gi, category: 'Race / National Origin', severity: 'high', suggestion: 'Remove discriminatory language. All qualified applicants welcome.' },
            { pattern: /\b(exclusive\s+(?:neighborhood|community|enclave))\b/gi, category: 'Race / National Origin', severity: 'medium', suggestion: 'Replace with "desirable neighborhood" or describe specific amenities.' },
            { pattern: /\b(ethnic)\b/gi, category: 'Race / National Origin', severity: 'medium', suggestion: 'Avoid ethnic references. Describe the area amenities instead.' },

            // Religion
            { pattern: /\b(christian|catholic|protestant|muslim|islamic|mosque|synagogue|temple|church)\s*(neighborhood|community|area|district|preferred|only)\b/gi, category: 'Religion', severity: 'high', suggestion: 'Remove religious references. Describe neighborhood features instead.' },
            { pattern: /\b(near\s+(?:church|mosque|synagogue|temple))\b/gi, category: 'Religion', severity: 'low', suggestion: 'Consider using "near houses of worship" instead of specific religious institutions.' },

            // Familial Status
            { pattern: /\b(no\s+(?:children|kids|babies|families|pets))\b/gi, category: 'Familial Status', severity: 'high', suggestion: 'Remove restriction. Cannot discriminate based on familial status.' },
            { pattern: /\b(adults?\s+only|senior(?:s)?\s+only|no\s+children|child[- ]?free|55\s*\+|over\s+55|empty\s+nesters?\s+only|mature\s+(?:couple|person|individual|tenant)s?\s+(?:only|preferred))\b/gi, category: 'Familial Status / Age', severity: 'high', suggestion: 'Remove age/family restrictions unless legally exempt senior housing (Housing for Older Persons Act).' },
            { pattern: /\b(perfect\s+for\s+(?:singles?|couples?|young\s+professionals?|retirees?|students?|bachelor))\b/gi, category: 'Familial Status', severity: 'medium', suggestion: 'Avoid targeting specific demographics. Describe features instead: "one-bedroom layout" etc.' },
            { pattern: /\b(great\s+for\s+(?:families|singles?|couples?|young\s+professionals?|retirees?))\b/gi, category: 'Familial Status', severity: 'medium', suggestion: 'Avoid targeting demographics. Describe property features instead.' },
            { pattern: /\b(bachelor\s+pad|man\s+cave|she[- ]?shed)\b/gi, category: 'Sex / Familial Status', severity: 'medium', suggestion: 'Use gender-neutral terms: "private retreat", "bonus room", "home office".' },

            // Sex / Gender / Sexual Orientation
            { pattern: /\b(female\s+only|male\s+only|men\s+only|women\s+only|no\s+(?:men|women|males|females))\b/gi, category: 'Sex', severity: 'high', suggestion: 'Cannot restrict by sex. Remove gender-based preferences.' },
            { pattern: /\b(master\s+(?:bedroom|suite|bath))\b/gi, category: 'NY DOS Ad Guidelines', severity: 'low', suggestion: 'REBNY recommends "primary bedroom" or "primary suite" instead of "master".' },

            // Disability
            { pattern: /\b(no\s+(?:wheelchairs?|disabled|handicapped)|(?:handicapped|crippled|invalid|insane|retarded|crazy))\b/gi, category: 'Disability', severity: 'high', suggestion: 'Use person-first language. "Accessible" or "wheelchair-accessible" if describing features.' },
            { pattern: /\b(walking\s+distance)\b/gi, category: 'Disability', severity: 'low', suggestion: 'Consider "short distance to" or "close proximity to" as more inclusive alternatives.' },

            // Source of Income (NYC & NY State)
            { pattern: /\b(no\s+(?:section\s*8|vouchers?|subsidies|public\s+assistance|welfare|DSS|FHEPS|CityFHEPS))\b/gi, category: 'Source of Income (NYC Law)', severity: 'high', suggestion: 'NYC law prohibits discrimination based on lawful source of income including Section 8 and vouchers.' },
            { pattern: /\b(section\s*8\s*(?:not\s+)?accepted)\b/gi, category: 'Source of Income (NYC Law)', severity: 'high', suggestion: 'NYC law prohibits mentioning Section 8 acceptance status in advertising.' },

            // Immigration / Citizenship
            { pattern: /\b(citizens?\s+only|(?:no|must\s+be)\s+(?:citizen|legal\s+resident|documented|us\s+citizen|american\s+citizen))\b/gi, category: 'National Origin / Citizenship', severity: 'high', suggestion: 'Cannot require citizenship status. Income and credit verification are acceptable.' },

            // NY DOS Advertising Specific Rules (19 NYCRR 175.29)
            { pattern: /\b(prestigious|upscale|luxurious)\s*(neighborhood|community|area)\b/gi, category: 'NY DOS Ad Rules', severity: 'low', suggestion: 'Be specific about amenities rather than subjective characterizations of neighborhood.' },
            { pattern: /\b(integrated|segregated|transitional|changing)\s*(neighborhood|community|area)\b/gi, category: 'NY DOS Ad Rules', severity: 'high', suggestion: 'Remove references to neighborhood demographic composition.' },
            { pattern: /\b(safe\s+(?:neighborhood|area|community|street))\b/gi, category: 'NY DOS Ad Rules', severity: 'medium', suggestion: 'Avoid safety characterizations which may imply racial composition. Reference specific features instead.' },

            // REBNY Specific
            { pattern: /\b(will\s+not\s+last|won\'?t\s+last|hurry|act\s+fast|act\s+now|don\'?t\s+miss|limited\s+time)\b/gi, category: 'REBNY Ad Policy', severity: 'low', suggestion: 'Avoid high-pressure language per REBNY advertising standards.' },
        ];

        var fairHousingDebounce = { sale: null, rental: null };

        function checkFairHousing(formType) {
            clearTimeout(fairHousingDebounce[formType]);
            fairHousingDebounce[formType] = setTimeout(() => {
                performFairHousingCheck(formType);
            }, 500);
        }

        function performFairHousingCheck(formType) {
            var textarea = document.getElementById(formType === 'sale' ? 'saleDescription' : 'rentalDescription');
            var flagsContainer = document.getElementById(formType + 'FairHousingFlags');
            if (!textarea || !flagsContainer) return;

            var text = textarea.value;
            if (!text || text.trim().length < 3) {
                flagsContainer.classList.add('hidden');
                flagsContainer.innerHTML = '';
                textarea.classList.remove('border-red-400', 'border-orange-400');
                return;
            }

            var violations = [];
            FAIR_HOUSING_VIOLATIONS.forEach(rule => {
                var matches = text.match(rule.pattern);
                if (matches) {
                    matches.forEach(match => {
                        // Avoid duplicate matches
                        if (!violations.find(v => v.match.toLowerCase() === match.toLowerCase() && v.category === rule.category)) {
                            violations.push({
                                match: match,
                                category: rule.category,
                                severity: rule.severity,
                                suggestion: rule.suggestion
                            });
                        }
                    });
                }
            });

            if (violations.length === 0) {
                flagsContainer.classList.add('hidden');
                flagsContainer.innerHTML = '';
                textarea.classList.remove('border-red-400', 'border-orange-400');
                // Show compliance checkmark
                flagsContainer.classList.remove('hidden');
                flagsContainer.innerHTML = '<div class="flex items-center gap-2 text-green-600 text-xs"><i class="fas fa-check-circle"></i> Fair Housing compliance check passed</div>';
                return;
            }

            var hasHigh = violations.some(v => v.severity === 'high');
            var hasMedium = violations.some(v => v.severity === 'medium');

            // Highlight textarea border
            textarea.classList.remove('border-red-400', 'border-orange-400');
            if (hasHigh) {
                textarea.classList.add('border-red-400');
            } else if (hasMedium) {
                textarea.classList.add('border-orange-400');
            }

            // Build flags HTML
            var html = '<div class="rounded-lg border ' + (hasHigh ? 'bg-red-50 border-red-300' : 'bg-orange-50 border-orange-300') + ' p-3">';
            html += '<div class="flex items-center gap-2 mb-2">';
            html += '<i class="fas fa-exclamation-triangle ' + (hasHigh ? 'text-red-600' : 'text-orange-600') + '"></i>';
            html += '<span class="text-sm font-bold ' + (hasHigh ? 'text-red-700' : 'text-orange-700') + '">Fair Housing Compliance Issues (' + violations.length + ')</span>';
            html += '</div>';

            // Group by severity
            var highViolations = violations.filter(v => v.severity === 'high');
            var mediumViolations = violations.filter(v => v.severity === 'medium');
            var lowViolations = violations.filter(v => v.severity === 'low');

            if (highViolations.length > 0) {
                html += '<div class="mb-2"><span class="inline-block px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded mb-1">VIOLATION</span>';
                highViolations.forEach(v => {
                    html += '<div class="flex items-start gap-2 ml-2 mt-1 text-xs">';
                    html += '<i class="fas fa-times-circle text-red-500 mt-0.5"></i>';
                    html += '<div><strong class="text-red-800">"' + escapeHtml(v.match) + '"</strong>';
                    html += '<span class="text-red-600 ml-1">(' + v.category + ')</span>';
                    html += '<br><span class="text-gray-600">' + v.suggestion + '</span></div></div>';
                });
                html += '</div>';
            }

            if (mediumViolations.length > 0) {
                html += '<div class="mb-2"><span class="inline-block px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded mb-1">WARNING</span>';
                mediumViolations.forEach(v => {
                    html += '<div class="flex items-start gap-2 ml-2 mt-1 text-xs">';
                    html += '<i class="fas fa-exclamation-circle text-orange-500 mt-0.5"></i>';
                    html += '<div><strong class="text-orange-800">"' + escapeHtml(v.match) + '"</strong>';
                    html += '<span class="text-orange-600 ml-1">(' + v.category + ')</span>';
                    html += '<br><span class="text-gray-600">' + v.suggestion + '</span></div></div>';
                });
                html += '</div>';
            }

            if (lowViolations.length > 0) {
                html += '<div class="mb-1"><span class="inline-block px-2 py-0.5 bg-yellow-500 text-white text-xs font-bold rounded mb-1">ADVISORY</span>';
                lowViolations.forEach(v => {
                    html += '<div class="flex items-start gap-2 ml-2 mt-1 text-xs">';
                    html += '<i class="fas fa-info-circle text-yellow-600 mt-0.5"></i>';
                    html += '<div><strong class="text-yellow-800">"' + escapeHtml(v.match) + '"</strong>';
                    html += '<span class="text-yellow-700 ml-1">(' + v.category + ')</span>';
                    html += '<br><span class="text-gray-600">' + v.suggestion + '</span></div></div>';
                });
                html += '</div>';
            }

            html += '<div class="mt-2 pt-2 border-t text-xs text-gray-500"><i class="fas fa-balance-scale mr-1"></i>';
            html += 'Per Fair Housing Act 42 U.S.C. 3604(c), NY Human Rights Law, NY DOS 19 NYCRR 175.29, and REBNY RLS Advertising Standards.';
            if (hasHigh) html += ' <strong class="text-red-600">Listings with violations cannot be submitted for Active status.</strong>';
            html += '</div></div>';

            flagsContainer.classList.remove('hidden');
            flagsContainer.innerHTML = html;
        }

        function escapeHtml(text) {
            var div = document.createElement('div');
            div.appendChild(document.createTextNode(text));
            return div.innerHTML;
        }

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  CONTENT SCANNERS (REBNY COMPLIANCE — Rev 25 Tier 2)           ║
        // ║  S2: Agent Info  |  S3: Off-Market  |  S4: Compensation       ║
        // ║  S5: Free Services                                             ║
        // ╚══════════════════════════════════════════════════════════════════╝

