// ─── 21: DESCRIPTION COMPLIANCE TESTS ─────────────────────────────────
// Fair Housing + REBNY description compliance scanner logic.
// Run inside form HTML context (requires DOM).
// ──────────────────────────────────────────────────────────────────────
(function() {
        // ── Fair Housing Violations (Federal + NY State + NYC Title 8) ──
        var FAIR_HOUSING_VIOLATIONS = [
            // Federal Protected Classes — Fair Housing Act 42 U.S.C. 3604(c)
            { pattern: /\b(white|caucasian|african.american|black|hispanic|latino|latina|asian|oriental|chinese|japanese|korean|indian|pakistani|arab|jewish|irish|italian|russian|polish|greek|caribbean|muslim|christian|hindu|buddhist|sikh)\b/gi, category: 'Race/Ethnicity/Religion (Federal)' },
            { pattern: /\b(no\s+(?:blacks|whites|hispanics|asians|foreigners|immigrants|minorities))\b/gi, category: 'Race / National Origin (Federal)' },
            { pattern: /\b(families|children|kids|no\s*kids|no\s*children|adults?\s*only|senior\s*only|elderly|mature|retiree|young\s+professional|over\s*55|55\+|no\s*strollers|baby[\s-]?proof|childless|newlywed|empty\s+nesters?)\b/gi, category: 'Familial Status/Age (Federal)' },
            { pattern: /\b(perfect\s+for\s+(?:singles?|couples?|young\s+professionals?|retirees?|students?|bachelor))\b/gi, category: 'Familial Status (Federal)' },
            { pattern: /\b(church|synagogue|mosque|temple|cathedral|parish)\s*(nearby|close|walking|near|district)/gi, category: 'Religion (Federal)' },
            { pattern: /\b(wheelchair|handicap|disabled|disability|able[\s-]?bodied|mobility\s*impair|hearing\s*impair|vision\s*impair|deaf[\s-]?friendly|sight[\s-]?impair|crippled|invalid)\b/gi, category: 'Disability (Federal)' },
            { pattern: /\b(male\s*only|female\s*only|gender|sex|bachelor\s*pad|bachelorette|couples?\s*only|single[s]?\s*only|men\s*only|women\s*only)\b/gi, category: 'Sex/Gender (Federal)' },
            { pattern: /\b(citizen|citizenship|immigration|immigrant|alien|visa\s*holder|undocumented|legal\s*status|native[\s-]born|foreign[\s-]born)\b/gi, category: 'National Origin (Federal)' },
            // NY State Human Rights Law (Executive Law Art. 15 Sec. 296)
            { pattern: /\b(creed|age\s*restriction|military|veteran|service\s*member|armed\s*forces|national\s*guard)\b/gi, category: 'Military Status / Creed (NY State)' },
            { pattern: /\b(marital\s*status|married|divorced|single|widowed|partnership|domestic\s*partner)\b/gi, category: 'Marital Status (NY State)' },
            { pattern: /\b(integrated|segregated|transitional|changing)\s*(neighborhood|community|area)\b/gi, category: 'Neighborhood Demographics (NY DOS Ad Rules)' },
            // NYC Human Rights Law Title 8 (Admin Code Sec. 8-107)
            { pattern: /\b(sexual\s*orientation|gay|lesbian|straight|heterosexual|homosexual|lgbtq?|bisexual|queer)\b/gi, category: 'Sexual Orientation (NYC Title 8)' },
            { pattern: /\b(gender\s*identity|gender\s*expression|transgender|trans|non[\s-]?binary|cisgender)\b/gi, category: 'Gender Identity/Expression (NYC Title 8)' },
            { pattern: /\b(no\s*section\s*8|no\s*voucher|no\s*housing\s*assistance|no\s*HCV|no\s*CityFHEPS|no\s*FHEPS|no\s*HASA|no\s*subsidy|no\s*public\s*assistance|no\s*benefits|wage\s*earner\s*only|full[\s-]?time\s*employment\s*required)\b/gi, category: 'Source of Income (NYC Title 8 — ILLEGAL to reject)' },
            { pattern: /\b(arrest|conviction|criminal|felon|background\s*check\s*required|criminal\s*record|ex[\s-]?con)\b/gi, category: 'Arrest/Conviction Record (NYC Title 8)' },
            { pattern: /\b(caregiver|caregiving\s*status)\b/gi, category: 'Caregiver Status (NYC Title 8)' },
            { pattern: /\b(domestic\s*violence|stalking\s*victim|sex\s*offense\s*victim)\b/gi, category: 'Victim Status (NYC Title 8)' },
            // Steering Language — HUD guidance
            { pattern: /\b(exclusive\s*neighborhood|prestigious\s*community|select\s*clientele|upscale\s*residents|gentrified|upscale\s*clientele|professional\s*neighborhood|quiet[\s,]\s*peaceful\s*types|neighborhood\s*type|mature\s*building)\b/gi, category: 'Steering / Discriminatory Preference' },
            { pattern: /\b(safe\s*neighborhood|low[\s-]?crime|quiet\s*community|desirable\s*area|good\s*schools|best\s*schools|family[\s-]?friendly)\b/gi, category: 'Steering (Implied — may indicate racial/ethnic preference)' },
            // Outdated Terms — NAR style guide
            { pattern: /\bmaster\s*(bedroom|bath|suite|closet)\b/gi, category: 'Outdated Term — use "primary" (industry standard)' },
            // High-pressure language — REBNY Ad Policy
            { pattern: /\b(will\s+not\s+last|won'?t\s+last|hurry|act\s+fast|act\s+now|don'?t\s+miss|limited\s+time)\b/gi, category: 'High-Pressure Language (REBNY Ad Policy)' },
        ];
        
        // ── REBNY RLS / UCBA 2026 Description Compliance Rules ──
        var REBNY_DESCRIPTION_VIOLATIONS = [
            // Off-Market / Private Listing Language — UCBA Art. I Sec. 5(D)
            { pattern: /\b(off[\s-]?market|pocket\s*listing|private\s*listing|whisper\s*listing|unlisted|not\s*on\s*MLS|not\s*on\s*RLS|not\s*on\s*market|pre[\s-]?market|quiet\s*sale|quiet\s*listing|exclusive\s*listing|secret\s*listing|hidden\s*from\s*public|private\s*showing\s*only|not\s*publicly\s*listed)\b/gi, category: 'Off-Market Language (UCBA Art. I Sec. 5(D) — PROHIBITED)' },
            // Agent/Broker Info in Description — UCBA Art. I Sec. 5(C)
            { pattern: /\b(call\s+\w+|contact\s+\w+\s+at|agent\s*:\s*\w+|broker\s*:\s*\w+|listed\s*by|presented\s*by|offered\s*by|brought\s*to\s*you\s*by|represented\s+by|for\s+(?:more\s+)?info(?:rmation)?\s+(?:call|contact|email))\b/gi, category: 'Agent Info in Description (UCBA Art. I Sec. 5(C) — PROHIBITED)' },
            { pattern: /\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/g, category: 'Phone Number in Description (UCBA Art. I Sec. 5(C) — PROHIBITED)' },
            { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, category: 'Email in Description (UCBA Art. I Sec. 5(C) — PROHIBITED)' },
            { pattern: /\b(https?:\/\/|www\.)\S+/gi, category: 'URL/Website in Description (UCBA Art. I Sec. 5(C) — PROHIBITED)' },
            { pattern: /\b(license\s*#?\s*\d+|MLS\s*ID\s*:?\s*\w+|agent\s*ID\s*:?\s*\w+)\b/gi, category: 'License/ID Number in Description (UCBA Art. I Sec. 5(C) — PROHIBITED)' },
            // Compensation / Commission Mentions — UCBA Art. I Sec. 5(E)
            { pattern: /\b(commission|compensation|co[\s-]?broke|co[\s-]?op\s*fee|broker\s*fee|finder'?s?\s*fee|referral\s*fee|bonus\s*to\s*agent|agent\s*bonus|incentive\s*to\s*broker|buyer\s*pays?\s*closing|seller\s*pays?\s*closing|percentage\s*split|rebate|discount\s*fee|reduced\s*fee)\b/gi, category: 'Compensation in Description (UCBA Art. I Sec. 5(E) — PROHIBITED)' },
            // Free Services Claims — UCBA Art. III Sec. 5
            { pattern: /\b(free\s*closing\s*costs?|complimentary\s*(?:inspection|appraisal|services?)|no\s*(?:broker\s*)?fee|at\s*no\s*cost|zero\s*(?:commission|fee))\b/gi, category: 'Free Services Claim (UCBA Art. III Sec. 5 — PROHIBITED unless unconditionally free)' },
            // Coming Soon Language — UCBA Art. I Sec. 16 (allowed for sales with restrictions, prohibited for rentals)
            { pattern: /\b(coming\s*soon|not\s*yet\s*available|pre[\s-]?listing|sneak\s*peek|first\s*look|early\s*access)\b/gi, category: 'Coming Soon Language (verify status permits this — see UCBA Art. I Sec. 16)' },
            // Discriminatory Income Requirements — NYC Title 8
            { pattern: /\b(income\s*(?:must\s*be|required|requirement|minimum)\s*(?:\d+)?\s*(?:x|times))\b/gi, category: 'Income Multiplier (verify complies with NYC income source protections)' },
            // Owner/Seller Identity — UCBA Art. III Sec. 2
            { pattern: /\b(owner\s*(?:is|name|contact)|seller\s*(?:is|name|contact)|landlord\s*(?:is|name|contact))\b/gi, category: 'Owner/Seller Identity in Description (UCBA Art. III Sec. 2 — PROHIBITED)' },
        ];
        
        // ── Unified real-time compliance scanner ──
        var _complianceDebounce = {};
        
        function checkDescriptionCompliance(textareaId, flagsDivId) {
            clearTimeout(_complianceDebounce[textareaId]);
            _complianceDebounce[textareaId] = setTimeout(() => {
                _performComplianceCheck(textareaId, flagsDivId);
            }, 300);
        }
        
        function _performComplianceCheck(textareaId, flagsDivId) {
            var textarea = document.getElementById(textareaId);
            var flagsDiv = document.getElementById(flagsDivId);
            if (!textarea || !flagsDiv) return;
            var text = textarea.value;
            if (!text.trim()) {
                flagsDiv.classList.add('hidden');
                flagsDiv.innerHTML = '';
                textarea.classList.remove('border-red-400', 'border-orange-400');
                return;
            }
        
            var fhViolations = [];
            var rebnyViolations = [];
        
            FAIR_HOUSING_VIOLATIONS.forEach(v => {
                var matches = text.match(v.pattern);
                if (matches) fhViolations.push({ category: v.category, words: [...new Set(matches)] });
            });
            REBNY_DESCRIPTION_VIOLATIONS.forEach(v => {
                var matches = text.match(v.pattern);
                if (matches) rebnyViolations.push({ category: v.category, words: [...new Set(matches)] });
            });
        
            if (fhViolations.length === 0 && rebnyViolations.length === 0) {
                textarea.classList.remove('border-red-400', 'border-orange-400');
                if (text.trim().length >= 20) {
                    flagsDiv.classList.remove('hidden');
                    flagsDiv.innerHTML = '<div class="flex items-center gap-2 text-green-600 text-xs"><i class="fas fa-check-circle"></i> No compliance violations detected</div>';
                } else {
                    flagsDiv.classList.add('hidden');
                    flagsDiv.innerHTML = '';
                }
                return;
            }
        
            var totalViolations = fhViolations.length + rebnyViolations.length;
            textarea.classList.remove('border-red-400', 'border-orange-400');
            if (fhViolations.length > 0) textarea.classList.add('border-red-400');
            else textarea.classList.add('border-orange-400');
        
            var html = '';
            html += '<div class="flex items-center gap-2 mb-2"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700"><i class="fas fa-exclamation-circle"></i> ' + totalViolations + ' violation' + (totalViolations > 1 ? 's' : '') + ' found — submission blocked</span></div>';
        
            if (fhViolations.length > 0) {
                html += '<div class="bg-red-50 border border-red-300 rounded-lg p-3 mb-2">';
                html += '<p class="text-sm font-bold text-red-700 mb-2"><i class="fas fa-gavel mr-1"></i> Fair Housing Violation — BLOCKED</p>';
                fhViolations.forEach(v => {
                    html += '<p class="text-xs text-red-600 mb-1"><i class="fas fa-times-circle mr-1"></i> <strong>' + v.category + ':</strong> "' + escapeHtml(v.words.join('", "')) + '"</p>';
                });
                html += '<p class="text-[10px] text-red-500 mt-2 leading-tight">Fair Housing Act (42 U.S.C. 3604(c)), NY Executive Law Art. 15 Sec. 296, NYC Admin Code Title 8 Sec. 8-107. Penalty: $250 first offense, $500 + RLS termination second offense (UCBA Exhibit C).</p>';
                html += '</div>';
            }
            if (rebnyViolations.length > 0) {
                html += '<div class="bg-orange-50 border border-orange-300 rounded-lg p-3">';
                html += '<p class="text-sm font-bold text-orange-700 mb-2"><i class="fas fa-exclamation-triangle mr-1"></i> REBNY RLS / UCBA 2026 Violation</p>';
                rebnyViolations.forEach(v => {
                    html += '<p class="text-xs text-orange-700 mb-1"><i class="fas fa-ban mr-1"></i> <strong>' + v.category + ':</strong> "' + escapeHtml(v.words.join('", "')) + '"</p>';
                });
                html += '<p class="text-[10px] text-orange-600 mt-2 leading-tight">UCBA violations: $500 first, $2,000 second, $10,000 third, suspension fourth (UCBA Art. IX). Incurable violations: $250 first, $500 subsequent.</p>';
                html += '</div>';
            }
        
            flagsDiv.classList.remove('hidden');
            flagsDiv.innerHTML = html;
        }
        
        // Backward-compatible wrapper for old checkFairHousing calls
        function checkFairHousing(formType) {
            var textareaId = formType === 'sale' ? 'saleDescription' : 'rentalDescription';
            var flagsDivId = formType + 'FairHousingFlags';
            checkDescriptionCompliance(textareaId, flagsDivId);
        }
        
        function escapeHtml(text) {
            var div = document.createElement('div');
            div.appendChild(document.createTextNode(text));
            return div.innerHTML;
        }
        
        // ══════════════════════════════════════════════════════
        // CHARACTER COUNT
        // ══════════════════════════════════════════════════════
        function updateSaleCharCount() {
            var textarea = document.getElementById('saleDescription');
            var counter = document.getElementById('saleDescCharCount');
            if (textarea && counter) {
                counter.textContent = textarea.value.length.toLocaleString() + ' / 5,000 characters';
            }
        }
        
        // ══════════════════════════════════════════════════════
        // TAB NAVIGATION HELPERS
        // ══════════════════════════════════════════════════════
        function navigateNextFromListingInfo(formType) {
            showSaleMainTab(2);
        }
        
        function validateSaleTab(tabNum) {
            var tabPanel = document.getElementById('saleMainTab' + tabNum);
            if (!tabPanel) return true;
            var requiredFields = tabPanel.querySelectorAll('[required]');
            var missing = [];
            var firstInvalid = null;
            requiredFields.forEach(function(field) {
                if (field.offsetParent === null) return;
                var isEmpty = !field.value || field.value.trim() === '';
                var isCheckbox = field.type === 'checkbox';
                if ((isCheckbox && !field.checked) || (!isCheckbox && isEmpty)) {
                    field.classList.add('border-red-500', 'bg-red-50');
                    var label = field.closest('div')?.querySelector('label, span.text-sm');
                    missing.push(label ? label.textContent.replace(/\s*\*\s*$/, '').trim() : field.id);
                    if (!firstInvalid) firstInvalid = field;
                } else {
                    field.classList.remove('border-red-500', 'bg-red-50');
                }
            });
            // (truncated — full implementation in form HTML)
            return missing.length === 0;
        }
})();
