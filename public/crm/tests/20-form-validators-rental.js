// ─── 20: RENTAL FORM VALIDATORS ───────────────────────────────────────
// Extracted rental form validation logic for browser-based testing.
// Run inside RENTAL-FORM-REDESIGN.html context (requires DOM + form globals).
// ──────────────────────────────────────────────────────────────────────
(function() {
        function validateStatusChange(prefix) {
            // Stub — full validation to be added
        }
        
        function manualSaveDraft(prefix) {
            var toast = document.createElement('div');
            toast.className = 'toast-notification';
            toast.innerHTML = '<i class="fas fa-check-circle mr-2"></i> Draft saved successfully';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
        
        function submitRentalListing() {
            alert('Submit functionality will be available in production.');
        }
        
        function toggleRentalRequiredFields() {
            // Stub — toggles required-only view
        }
        
        function navigateNextFromListingInfo(prefix) {
            showRentalMainTab(2);
        }
        
        // ══════════════════════════════════════════════════════
        // RENTAL DEAL FEES
        // ══════════════════════════════════════════════════════
        var rentalFeeRowCount = 6;
        function addRentalFeeRow() {
            rentalFeeRowCount++;
            var tbody = document.getElementById('rentalFeesTableBody');
            if (!tbody) return;
            var tr = document.createElement('tr');
            tr.className = 'border-t';
            tr.innerHTML = `
                <td class="py-2 pr-2">
                    <select class="w-full border rounded-lg px-3 py-2 text-sm field-input">
                        <option value="ApplicationFee">Application Fee</option>
                        <option value="MoveInFee">Move-In Fee</option>
                        <option value="MoveOutFee">Move-Out Fee</option>
                        <option value="CreditCheckFee">Credit Check Fee</option>
                        <option value="BackgroundCheckFee">Background Check Fee</option>
                        <option value="BoardApplicationFee">Board Application Fee</option>
                        <option value="ManagingAgentFee">Managing Agent Fee</option>
                        <option value="ProcessingFee">Processing Fee</option>
                        <option value="Other">Other</option>
                    </select>
                </td>
                <td class="py-2 pr-2"><input type="text" placeholder="Description" class="w-full field-input"></td>
                <td class="py-2 pr-2"><input type="number" placeholder="$0.00" step="0.01" class="w-full field-input"></td>
                <td class="py-2 text-center"><button onclick="this.closest('tr').remove()" class="text-red-500 hover:text-red-700 text-sm"><i class="fas fa-trash"></i></button></td>
            `;
            tbody.appendChild(tr);
        }
        
        // ══════════════════════════════════════════════════════
        // FAIR HOUSING SCANNER
        // ══════════════════════════════════════════════════════
        // ── Fair Housing Act (Federal) + NY State Human Rights Law + NYC Human Rights Law Title 8 ──
        var FAIR_HOUSING_VIOLATIONS = [
            // Federal Protected Classes — Fair Housing Act 42 U.S.C. 3604(c)
            { pattern: /\b(white|caucasian|african.american|black|hispanic|latino|latina|asian|chinese|jewish|muslim|christian|hindu|buddhist|sikh|arab|korean|japanese|indian|pakistani|irish|italian|polish|russian|greek|caribbean)\b/gi, category: 'Race/Ethnicity/Religion (Federal)' },
            { pattern: /\b(families|children|kids|no\s*kids|no\s*children|adults?\s*only|senior\s*only|elderly|mature|retiree|young\s+professional|over\s*55|55\+|no\s*strollers|baby[\s-]?proof|childless|newlywed)\b/gi, category: 'Familial Status/Age (Federal)' },
            { pattern: /\b(church|synagogue|mosque|temple|cathedral|parish)\s*(nearby|close|walking|near|district)/gi, category: 'Religion (Federal)' },
            { pattern: /\b(wheelchair|handicap|disabled|disability|able[\s-]?bodied|mobility\s*impair|hearing\s*impair|vision\s*impair|deaf[\s-]?friendly|quiet\s*for\s*recovery|sight[\s-]?impair)\b/gi, category: 'Disability (Federal)' },
            { pattern: /\b(male\s*only|female\s*only|gender|sex|bachelor\s*pad|bachelorette|couples?\s*only|single[s]?\s*only|men\s*only|women\s*only)\b/gi, category: 'Sex/Gender (Federal)' },
            { pattern: /\b(citizen|citizenship|immigration|immigrant|alien|visa\s*holder|undocumented|legal\s*status|native[\s-]born|foreign[\s-]born)\b/gi, category: 'National Origin (Federal)' },
            // NY State Human Rights Law (Executive Law Art. 15 Sec. 296)
            { pattern: /\b(creed|age\s*restriction|military|veteran|service\s*member|armed\s*forces|national\s*guard)\b/gi, category: 'Military Status / Creed (NY State)' },
            { pattern: /\b(marital\s*status|married|divorced|single|widowed|partnership|domestic\s*partner)\b/gi, category: 'Marital Status (NY State)' },
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
        ];
        
        // ── REBNY RLS / UCBA 2026 Description Compliance Rules ──
        var REBNY_DESCRIPTION_VIOLATIONS = [
            // Off-Market / Private Listing Language — UCBA Art. I Sec. 5(D)
            { pattern: /\b(off[\s-]?market|pocket\s*listing|private\s*listing|whisper\s*listing|unlisted|not\s*on\s*MLS|not\s*on\s*RLS|not\s*on\s*market|pre[\s-]?market|quiet\s*sale|quiet\s*listing|exclusive\s*listing|secret\s*listing|hidden\s*from\s*public|private\s*showing\s*only|not\s*publicly\s*listed)\b/gi, category: 'Off-Market Language (UCBA Art. I Sec. 5(D) — PROHIBITED)' },
            // Agent/Broker Info in Description — UCBA Art. I Sec. 5(C)
            { pattern: /\b(call\s+\w+|contact\s+\w+\s+at|agent\s*:\s*\w+|broker\s*:\s*\w+|listed\s*by|presented\s*by|offered\s*by|brought\s*to\s*you\s*by)\b/gi, category: 'Agent Info in Description (UCBA Art. I Sec. 5(C) — PROHIBITED)' },
            { pattern: /\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/g, category: 'Phone Number in Description (UCBA Art. I Sec. 5(C) — PROHIBITED)' },
            { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, category: 'Email in Description (UCBA Art. I Sec. 5(C) — PROHIBITED)' },
            { pattern: /\b(https?:\/\/|www\.)\S+/gi, category: 'URL/Website in Description (UCBA Art. I Sec. 5(C) — PROHIBITED)' },
            { pattern: /\b(license\s*#?\s*\d+|MLS\s*ID\s*:?\s*\w+|agent\s*ID\s*:?\s*\w+)\b/gi, category: 'License/ID Number in Description (UCBA Art. I Sec. 5(C) — PROHIBITED)' },
            // Compensation / Commission Mentions — UCBA Art. I Sec. 5(E)
            { pattern: /\b(commission|compensation|co[\s-]?broke|co[\s-]?op\s*fee|broker\s*fee|finder'?s?\s*fee|referral\s*fee|bonus\s*to\s*agent|agent\s*bonus|incentive\s*to\s*broker|buyer\s*pays?\s*closing|seller\s*pays?\s*closing|percentage\s*split|rebate|discount\s*fee|reduced\s*fee)\b/gi, category: 'Compensation in Description (UCBA Art. I Sec. 5(E) — PROHIBITED)' },
            // Free Services Claims — UCBA Art. III Sec. 5
            { pattern: /\b(free\s*closing\s*costs?|complimentary\s*(?:inspection|appraisal|services?)|no\s*(?:broker\s*)?fee|at\s*no\s*cost)\b/gi, category: 'Free Services Claim (UCBA Art. III Sec. 5 — PROHIBITED unless unconditionally free)' },
            // Coming Soon Language (Rental) — REBNY RLS Sec. 2.05(d)
            { pattern: /\b(coming\s*soon|not\s*yet\s*available|pre[\s-]?lease|pre[\s-]?listing|sneak\s*peek|first\s*look|early\s*access)\b/gi, category: 'Coming Soon Language (PROHIBITED for rentals — REBNY RLS Sec. 2.05(d))' },
            // Discriminatory Income Requirements — NYC Title 8
            { pattern: /\b(income\s*(?:must\s*be|required|requirement|minimum)\s*(?:\d+)?\s*(?:x|times))\b/gi, category: 'Income Multiplier (verify complies with NYC income source protections)' },
            // Owner/Seller Identity — UCBA Art. III Sec. 2
            { pattern: /\b(owner\s*(?:is|name|contact)|seller\s*(?:is|name|contact)|landlord\s*(?:is|name|contact))\b/gi, category: 'Owner/Seller Identity in Description (UCBA Art. III Sec. 2 — PROHIBITED)' },
        ];
        
        function checkDescriptionCompliance(textareaId, flagsDivId) {
            var textarea = document.getElementById(textareaId);
            var flagsDiv = document.getElementById(flagsDivId);
            if (!textarea || !flagsDiv) return;
            var text = textarea.value;
            if (!text.trim()) { flagsDiv.classList.add('hidden'); flagsDiv.innerHTML = ''; return; }
        
            var fhViolations = [];
            var rebnyViolations = [];
        
            FAIR_HOUSING_VIOLATIONS.forEach(v => {
                var matches = text.match(v.pattern);
                if (matches) fhViolations.push({ category: v.category, words: [...new Set(matches)], severity: 'critical' });
            });
            REBNY_DESCRIPTION_VIOLATIONS.forEach(v => {
                var matches = text.match(v.pattern);
                if (matches) rebnyViolations.push({ category: v.category, words: [...new Set(matches)], severity: 'critical' });
            });
        
            if (fhViolations.length === 0 && rebnyViolations.length === 0) {
                // Show green pass indicator when text is written but clean
                if (text.trim().length >= 20) {
                    flagsDiv.classList.remove('hidden');
                    flagsDiv.innerHTML = `<div class="flex items-center gap-2 text-green-600 text-xs"><i class="fas fa-check-circle"></i> No compliance violations detected</div>`;
                } else {
                    flagsDiv.classList.add('hidden');
                    flagsDiv.innerHTML = '';
                }
                return;
            }
        
            var html = '';
            var totalViolations = fhViolations.length + rebnyViolations.length;
            html += `<div class="flex items-center gap-2 mb-2"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700"><i class="fas fa-exclamation-circle"></i> ${totalViolations} violation${totalViolations > 1 ? 's' : ''} found — submission blocked</span></div>`;
        
            if (fhViolations.length > 0) {
                html += `<div class="bg-red-50 border border-red-300 rounded-lg p-3 mb-2">
                    <p class="text-sm font-bold text-red-700 mb-2"><i class="fas fa-gavel mr-1"></i> Fair Housing Violation — BLOCKED</p>
                    ${fhViolations.map(v => `<p class="text-xs text-red-600 mb-1"><i class="fas fa-times-circle mr-1"></i> <strong>${v.category}:</strong> "${v.words.join('", "')}"</p>`).join('')}
                    <p class="text-[10px] text-red-500 mt-2 leading-tight">Fair Housing Act (42 U.S.C. 3604(c)), NY Executive Law Art. 15 Sec. 296, NYC Admin Code Title 8 Sec. 8-107. Penalty: $250 first offense, $500 + RLS termination second offense (UCBA Exhibit C).</p>
                </div>`;
            }
            if (rebnyViolations.length > 0) {
                html += `<div class="bg-orange-50 border border-orange-300 rounded-lg p-3">
                    <p class="text-sm font-bold text-orange-700 mb-2"><i class="fas fa-exclamation-triangle mr-1"></i> REBNY RLS / UCBA 2026 Violation</p>
                    ${rebnyViolations.map(v => `<p class="text-xs text-orange-700 mb-1"><i class="fas fa-ban mr-1"></i> <strong>${v.category}:</strong> "${v.words.join('", "')}"</p>`).join('')}
                    <p class="text-[10px] text-orange-600 mt-2 leading-tight">UCBA violations: $500 first, $2,000 second, $10,000 third, suspension fourth (UCBA Art. IX). Incurable violations: $250 first, $500 subsequent.</p>
                </div>`;
            }
        
            flagsDiv.classList.remove('hidden');
            flagsDiv.innerHTML = html;
        }
        
        // Backward-compatible wrapper
        function checkFairHousing(prefix) {
            checkDescriptionCompliance(prefix + 'Description', prefix + 'FairHousingFlags');
        }
        
        function updateRentalCharCount() {
            var textarea = document.getElementById('rentalDescription');
            var counter = document.getElementById('rentalDescCharCount');
            if (textarea && counter) counter.textContent = textarea.value.length + ' / 5000 characters';
        }
        
        // ══════════════════════════════════════════════════════
        // OPEN HOUSE FUNCTIONS
        // ══════════════════════════════════════════════════════
        var rentalOpenHouseCount = 0;
        function addRentalOpenHouse() {
            rentalOpenHouseCount++;
            // (truncated — full implementation in RENTAL-FORM-REDESIGN.html)
        }
})();
