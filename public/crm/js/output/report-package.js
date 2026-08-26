        // ═══════════════════════════════════════════════════════════════════════════════
        // REPORT PACKAGE — Full Package combining all 8 report sections
        // Styled to match MALLAN NYC frontend brand (Urbanist/Inter, Gold/Dark)
        // ═══════════════════════════════════════════════════════════════════════════════

        /**
         * buildSearchReportPackage(listings, reportState, agentInfo, searchCriteria)
         *
         * Returns: HTML string (body content, not full document)
         * listings: pre-filtered (IDX compliant), sorted, capped at 250
         * reportState: global state object (version, options, sort, preparedFor, etc.)
         * agentInfo: { name, title, company, email, phone, license, companyLicense, address }
         * searchCriteria: from activeSearchCriteria (for criteria pills)
         */
        function buildSearchReportPackage(listings, reportState, agentInfo, searchCriteria) {
            if (!listings || listings.length === 0) return '<p style="padding:40px;text-align:center;color:#dc2626;font-family:Inter,system-ui,sans-serif">No listings available for package report.</p>';

            var version = reportState.version || 'agent';
            var isCustomer = (version === 'customer');
            var optContent = reportState.options || {};
            var preparedFor = reportState.preparedFor || (document.getElementById('reportPreparedFor') || {}).value || '';
            var reportTitle = reportState.title || (document.getElementById('reportTitle') || {}).value || 'Property Search Report';
            var now = new Date();
            var dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            var shortDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            var rentalCount = listings.filter(function(l) { return l.listingCategory === 'rental'; }).length;
            var isAllRental = rentalCount === listings.length && listings.length > 0;

            // ── Brand tokens ──
            var B = {
                gold: '#C4A052',
                goldDeep: '#B8860B',
                goldBright: '#D4AF37',
                goldGlow: 'rgba(196,160,82,0.12)',
                goldTint: 'rgba(196,160,82,0.06)',
                // Nav glass gradient (matches frontend Header.tsx / nav-glass class)
                navBg: 'linear-gradient(180deg, rgba(20,27,45,0.92) 0%, rgba(15,23,42,0.86) 100%)',
                navSolid: 'rgb(18,25,40)',
                navBorder: 'rgba(255,255,255,0.08)',
                navInset: 'inset 0 1px 0 0 rgba(255,255,255,0.07)',
                dark: '#0A0A0A',
                slate: '#3d4556',
                muted: '#64748b',
                line: '#e2e8f0',
                bg: '#FEFEFE',
                text: '#0A0A0A',
                textLight: 'rgba(10,10,10,0.7)',
                textMuted: '#64748b',
                fontDisplay: "'Urbanist',system-ui,sans-serif",
                fontBody: "'Inter',system-ui,sans-serif"
            };

            // ── Context object shared across all sections ──
            var ctx = {
                listings: listings,
                isCustomer: isCustomer,
                optContent: optContent,
                agentInfo: agentInfo,
                preparedFor: preparedFor,
                reportTitle: reportTitle,
                dateStr: dateStr,
                shortDate: shortDate,
                isAllRental: isAllRental,
                searchCriteria: searchCriteria
            };

            // ══════════════════════════════════════════════════════
            // SHARED HELPERS
            // ══════════════════════════════════════════════════════

            function _fmtCurrency(val) {
                if (val == null || isNaN(val)) return '';
                return '$' + Number(val).toLocaleString();
            }

            function _fmtPrice(l) {
                if (!l.price && l.price !== 0) return '';
                if (l.listingCategory === 'rental') return _fmtCurrency(l.price) + '/mo';
                return _fmtCurrency(l.price);
            }

            function _priceSF(l) {
                if (!l.intSqft || l.intSqft === 0 || !l.price) return '';
                return _fmtCurrency(Math.round(l.price / l.intSqft));
            }

            function _statusColor(s) {
                // An unknown status must not print as ACTIVE in a report a
                // broker sends to a client. A closed or expired listing
                // presented as Active is a misstatement in an advertisement.
                s = (s || 'UNKNOWN').toUpperCase();
                var m = {
                    'ACTIVE': { bg: '#dcfce7', color: '#15803d' },
                    'OFFER IN': { bg: '#ffedd5', color: '#c2410c' },
                    'IN CONTRACT': { bg: '#f3e8ff', color: '#7e22ce' },
                    'SOLD': { bg: '#dbeafe', color: '#1d4ed8' },
                    'CLOSED': { bg: '#f3f4f6', color: '#4b5563' },
                    'WITHDRAWN': { bg: '#f3f4f6', color: '#6b7280' },
                    'HOLD': { bg: '#f3f4f6', color: '#6b7280' },
                    'CANCELED': { bg: '#f3f4f6', color: '#6b7280' },
                    'ComingSoon': { bg: '#f5f3ff', color: '#7c3aed' }
                };
                return m[s] || { bg: '#f3f4f6', color: '#4b5563' };
            }

            function _statusBadge(s, listing) {
                s = (s || 'UNKNOWN').toUpperCase();
                var sc = _statusColor(s);
                var label = s.replace(/_/g, ' ');
                // UCBA Art. I Sec. 16: Coming Soon badge must include showing restriction text
                if (s === 'ComingSoon' && listing && listing.firstShowingDate) {
                    label = 'Coming Soon \u2014 No Showings or Open House until ' + listing.firstShowingDate;
                } else if (s === 'ComingSoon') {
                    label = 'Coming Soon \u2014 No Showings or Open House until Scheduled Date';
                }
                return '<span style="display:inline-block;padding:2px 10px;background:' + sc.bg + ';color:' + sc.color + ';font-size:11px;border-radius:9999px;font-weight:600;font-family:' + B.fontBody + ';letter-spacing:0.02em">' + label + '</span>';
            }

            // ── RLS Compliance: Off-market photo restriction (only primary photo) ──
            var OFF_MARKET_STATUSES = { 'CLOSED':1, 'WITHDRAWN':1, 'HOLD':1, 'CANCELED':1, 'EXPIRED':1 };
            function _isOffMarket(l) {
                return OFF_MARKET_STATUSES[(l.status||'').toUpperCase()] === 1;
            }
            function _getListingPhotos(l) {
                var photos = l.images || [];
                if (_isOffMarket(l) && photos.length > 1) return [photos[0]];
                return photos;
            }

            // Per-listing "Courtesy of" — only on online viewers, not client reports
            function _listingAttribution(l) {
                return '';
            }

            // ── RLS Compliance: Statistical data disclaimer ──
            function _statisticalDisclaimer() {
                return '<div style="padding:12px 24px;background:' + B.goldTint + ';border:1px solid ' + B.goldGlow + ';border-radius:8px;margin:16px 0;font-size:11px;color:' + B.muted + ';font-family:' + B.fontBody + ';font-weight:300">' +
                    '<p style="margin:0;font-style:italic">Based on information from the REBNY Listing Service for the period ending ' + dateStr + '. Display of MLS data is usually deemed reliable but is NOT guaranteed accurate by the MLS. Buyers are responsible for verifying the accuracy of all information.</p></div>';
            }

            // ── Format Open House data (handles object or string) ──
            function _formatOpenHouse(oh) {
                if (!oh) return '';
                if (typeof oh === 'string') return oh;
                if (typeof oh === 'object') {
                    var parts = [];
                    if (oh.date) {
                        try {
                            var d = new Date(oh.date);
                            if (!isNaN(d.getTime())) {
                                parts.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
                            } else {
                                parts.push(oh.date);
                            }
                        } catch(e) { parts.push(oh.date); }
                    }
                    if (oh.time) parts.push(oh.time);
                    if (oh.type) parts.push('(' + oh.type + ')');
                    return parts.join(', ') || '';
                }
                return String(oh);
            }

            // ── RLS Compliance: Commission negotiability disclosure (Art. I Sec. 17) ──
            function _commissionDisclosure() {
                return '<p style="font-size:10px;color:' + B.muted + ';font-style:italic;margin:4px 0 0;font-family:' + B.fontBody + ';font-weight:300">' +
                    'Commission rates are not set by law and are fully negotiable. The commission on any particular listing is set by the listing participant and is disclosed to cooperating brokers.</p>';
            }

            function _displayAddr(l) {
                if (l.addressDisplayYN === false) return 'Available Upon Request';
                return l.address + (l.unit ? ', ' + l.unit : '');
            }

            function _val(v) {
                if (v == null || v === '' || v === undefined) return '';
                return v;
            }

            function _detRow(label, val) {
                if (!val && val !== 0) return '';
                return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid ' + B.line + '"><span style="color:' + B.muted + ';font-size:13px;font-family:' + B.fontBody + '">' + label + '</span><span style="font-weight:500;font-size:13px;color:' + B.text + ';font-family:' + B.fontBody + '">' + val + '</span></div>';
            }

            // ── Branded header block (matches frontend nav-glass) ──
            function _headerBlock(subtitle) {
                return '<div style="background:' + B.navSolid + ';background-image:' + B.navBg + ';color:#fff;padding:28px 32px;border-bottom:1px solid ' + B.navBorder + ';box-shadow:' + B.navInset + ',0 4px 24px rgba(0,0,0,0.15)">' +
                    '<div style="display:flex;align-items:center;justify-content:space-between">' +
                    '<div>' +
                    '<h1 style="font-size:26px;font-weight:700;margin:0;font-family:' + B.fontDisplay + ';letter-spacing:-0.02em">MALLAN<span style="font-weight:200;color:' + B.goldDeep + ';opacity:0.95">NYC</span></h1>' +
                    '<p style="color:rgba(255,255,255,0.5);font-size:11px;margin:6px 0 0;text-transform:uppercase;letter-spacing:0.2em;font-family:' + B.fontBody + ';font-weight:500">Luxury Real Estate</p></div>' +
                    '<div style="text-align:right"><p style="font-size:17px;font-weight:600;margin:0;font-family:' + B.fontDisplay + ';letter-spacing:-0.01em;color:rgba(255,255,255,0.9)">' + subtitle + '</p>' +
                    '<p style="color:rgba(255,255,255,0.5);font-size:13px;margin:6px 0 0;font-family:' + B.fontBody + ';font-weight:300">Prepared: ' + dateStr + '</p></div></div></div>';
            }

            // ── Agent / Client bar ──
            function _agentClientBar() {
                return '<div style="padding:20px 32px;border-bottom:1px solid ' + B.line + ';background:' + B.bg + '">' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">' +
                    '<div><p style="font-size:10px;color:' + B.gold + ';text-transform:uppercase;letter-spacing:0.2em;margin:0 0 6px;font-family:' + B.fontBody + ';font-weight:600">Prepared By</p>' +
                    '<p style="font-weight:600;color:' + B.text + ';margin:0;font-family:' + B.fontDisplay + ';font-size:15px">' + agentInfo.name + '</p>' +
                    '<p style="font-size:13px;color:' + B.textLight + ';margin:3px 0 0;font-family:' + B.fontBody + ';font-weight:300">' + agentInfo.title + '</p>' +
                    '<p style="font-size:13px;color:' + B.textLight + ';margin:3px 0 0;font-family:' + B.fontBody + ';font-weight:300">' + agentInfo.company + ' &middot; Lic. ' + agentInfo.companyLicense + '</p>' +
                    '<p style="font-size:13px;color:' + B.muted + ';margin:3px 0 0;font-family:' + B.fontBody + ';font-weight:300">' + agentInfo.email + ' | ' + agentInfo.phone + '</p></div>' +
                    '<div><p style="font-size:10px;color:' + B.gold + ';text-transform:uppercase;letter-spacing:0.2em;margin:0 0 6px;font-family:' + B.fontBody + ';font-weight:600">Prepared For</p>' +
                    '<p style="font-weight:600;color:' + B.text + ';margin:0;font-family:' + B.fontDisplay + ';font-size:15px">' + (preparedFor || 'Client') + '</p></div></div></div>';
            }

            // ── Search criteria pills ──
            function _criteriaBlock() {
                var pills = '';
                if (searchCriteria) {
                    var pS = 'display:inline-block;padding:4px 10px;background:' + B.goldGlow + ';color:' + B.goldDeep + ';font-size:12px;border-radius:9999px;margin:0 4px 4px 0;font-family:' + B.fontBody + ';font-weight:500';
                    if (searchCriteria.priceMin || searchCriteria.priceMax) {
                        var pl = '';
                        if (searchCriteria.priceMin && searchCriteria.priceMax) pl = _fmtCurrency(searchCriteria.priceMin) + ' \u2013 ' + _fmtCurrency(searchCriteria.priceMax);
                        else if (searchCriteria.priceMin) pl = _fmtCurrency(searchCriteria.priceMin) + '+';
                        else pl = 'Up to ' + _fmtCurrency(searchCriteria.priceMax);
                        pills += '<span style="' + pS + '">' + pl + '</span>';
                    }
                    if (searchCriteria.bedsMin) pills += '<span style="' + pS + '">' + searchCriteria.bedsMin + '+ BR</span>';
                    if (searchCriteria.neighborhoods && searchCriteria.neighborhoods.length)
                        pills += '<span style="' + pS + '">' + searchCriteria.neighborhoods.join(', ') + '</span>';
                    if (searchCriteria.ownership && searchCriteria.ownership.length)
                        pills += '<span style="' + pS + '">' + searchCriteria.ownership.map(function(o){ return typeof ownershipLabel === 'function' ? ownershipLabel(o) : o; }).join(', ') + '</span>';
                }
                if (!pills) pills = '<span style="display:inline-block;padding:4px 10px;background:' + B.goldGlow + ';color:' + B.goldDeep + ';font-size:12px;border-radius:9999px;font-family:' + B.fontBody + ';font-weight:500">' + listings.length + ' matching properties</span>';
                return '<div style="padding:16px 32px;border-bottom:1px solid ' + B.line + '">' +
                    '<p style="font-size:10px;color:' + B.gold + ';text-transform:uppercase;letter-spacing:0.2em;margin:0 0 8px;font-family:' + B.fontBody + ';font-weight:600">Search Criteria</p>' +
                    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + pills + '</div></div>';
            }

            // ── REBNY footer (on every page) ──
            function _brokerFooter() {
                var f = '<div style="padding:16px 32px;border-top:2px solid ' + B.gold + ';background:' + B.bg + ';margin-top:16px;max-height:1.25in;overflow:hidden" class="pkg-no-break">' +
                    '<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr>' +
                    '<td style="width:50%;vertical-align:top;padding:0 8px 0 0">' +
                    '<table style="border-collapse:collapse"><tr>' +
                    '<td style="width:40px;vertical-align:top;padding:0 10px 0 0">' +
                    '<div style="width:36px;height:36px;background:' + B.dark + ';border-radius:50%;text-align:center;line-height:36px">' +
                    '<span style="color:' + B.goldBright + ';font-size:14px;font-weight:700;font-family:' + B.fontDisplay + '">M</span></div></td>' +
                    '<td style="vertical-align:top;padding:0">' +
                    '<p style="font-weight:600;color:' + B.text + ';margin:0;font-size:13px;font-family:' + B.fontDisplay + ';word-break:normal">' + agentInfo.name + '</p>' +
                    '<p style="font-size:11px;color:' + B.textLight + ';margin:1px 0 0;font-family:' + B.fontBody + ';font-weight:300;word-break:normal">' + agentInfo.title + '</p>' +
                    '<p style="font-size:11px;color:' + B.muted + ';margin:1px 0 0;font-family:' + B.fontBody + ';font-weight:300;word-break:normal">' + agentInfo.email + ' | ' + agentInfo.phone + '</p>' +
                    '</td></tr></table></td>' +
                    '<td style="width:50%;vertical-align:top;text-align:right;font-size:10px;color:' + B.muted + ';font-family:' + B.fontBody + ';font-weight:300;padding:0;word-break:normal">' +
                    '<p style="margin:0">Listing(s) courtesy of the REBNY Listing Service (RLS)</p>' +
                    '<p style="margin:1px 0 0">Data provided by REBNY RLS via Trestle &middot; ' + shortDate + '</p>' +
                    '<p style="margin:2px 0 0;font-style:italic">Information deemed reliable but not guaranteed.</p>' +
                    '<p style="margin:2px 0 0">Equal Housing Opportunity</p>';
                if (isCustomer) {
                    f += '<p style="margin:2px 0 0">Not for redistribution.</p>';
                }
                f += _commissionDisclosure();
                f += '</td></tr></table></div>';
                return f;
            }

            function _pageBreak() {
                return '<div class="pkg-section" style="page-break-before:always"></div>';
            }

            function _sectionDivider(label) {
                return '<div style="padding:10px 32px;background:' + B.navSolid + ';background-image:' + B.navBg + ';color:#fff;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;font-family:' + B.fontBody + ';display:flex;align-items:center;gap:10px;border-bottom:1px solid ' + B.navBorder + '">' +
                    '<span style="display:inline-block;width:3px;height:16px;background:' + B.goldBright + ';border-radius:2px"></span>' + label + '</div>';
            }

            // ── Image safety: onerror replaces broken img with placeholder ──
            var _imgErr = "this.onerror=null;this.style.display='none';this.parentNode.style.background='#f1f5f9';";

            // ── Ownership label helper (delegates to global if available) ──
            function _ownershipLabel(val) {
                if (typeof ownershipLabel === 'function') return ownershipLabel(val);
                if (!val) return '';
                var m = { 'Condominium': 'Condo', 'StockCooperative': 'Co-op', 'Condop': 'Condop' };
                return m[val] || val;
            }

            // ── Photo helper (delegates to global if available) ──
            function _getPhoto(l) {
                if (typeof getListingPhoto === 'function') return getListingPhoto(l);
                if (l.images && l.images.length > 0) return l.images[0].url;
                return '';
            }

            // ── Description helper (delegates to global if available) ──
            function _getDesc(l) {
                if (typeof getReportDescription === 'function') return getReportDescription(l);
                return l.description || '';
            }

            // ── Listing color palette helper ──
            function _getColor(l) {
                if (typeof getListingColor === 'function') return getListingColor(l.id);
                return { bg: '#f1f5f9', icon: '#94a3b8', accent: B.muted };
            }

            // ══════════════════════════════════════════════════════
            // SECTION 1: GRID
            // ══════════════════════════════════════════════════════
            function _gridSection() {
                var h = _sectionDivider('Grid Report') + _headerBlock(reportTitle + ' \u2014 Grid') + _agentClientBar() + _criteriaBlock();
                h += '<div style="padding:24px 32px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
                    '<h2 style="font-size:18px;font-weight:700;color:' + B.text + ';margin:0;font-family:' + B.fontDisplay + ';letter-spacing:-0.02em">Matching Properties</h2>' +
                    '<span style="font-size:13px;color:' + B.muted + ';font-family:' + B.fontBody + ';font-weight:300">' + listings.length + ' results</span></div>';

                var thS = 'padding:6px 4px;font-weight:600;color:' + B.slate + ';font-size:10px;text-align:left;white-space:nowrap;font-family:' + B.fontBody + ';text-transform:uppercase;letter-spacing:0.03em;word-break:normal';
                h += '<div><table style="width:100%;font-size:11px;border-collapse:collapse;table-layout:fixed;font-family:' + B.fontBody + '">' +
                    '<colgroup>' +
                    '<col style="width:3%">' +   // #
                    '<col style="width:20%">' +  // Address
                    '<col style="width:10%">' +  // Price
                    '<col style="width:3%">' +   // BR
                    '<col style="width:3%">' +   // BA
                    '<col style="width:6%">' +   // SqFt
                    '<col style="width:7%">';     // $/SF
                if (!isAllRental) h += '<col style="width:8%"><col style="width:8%">';  // Maint/CC, Total Mo.
                h += '<col style="width:7%">' +  // Type
                    '<col style="width:7%">' +   // Status
                    '<col style="width:4%">' +   // DOM
                    '<col style="width:9%">';     // Orig Price
                if (!isCustomer) h += '<col style="width:8%"><col style="width:8%">';  // Company, Agent
                h += '</colgroup>' +
                    '<thead><tr style="background:' + B.goldTint + ';border-bottom:2px solid ' + B.gold + '">' +
                    '<th style="' + thS + '">#</th>' +
                    '<th style="' + thS + '">Address</th>' +
                    '<th style="' + thS + '">Price</th>' +
                    '<th style="' + thS + '">BR</th>' +
                    '<th style="' + thS + '">BA</th>' +
                    '<th style="' + thS + '">SqFt</th>' +
                    '<th style="' + thS + '">$/SF</th>';
                if (!isAllRental) h += '<th style="' + thS + '">Maint/CC</th>';
                if (!isAllRental) h += '<th style="' + thS + '">Total Mo.</th>';
                h += '<th style="' + thS + '">Type</th>' +
                    '<th style="' + thS + '">Status</th>' +
                    '<th style="' + thS + '">DOM</th>' +
                    '<th style="' + thS + '">Orig Price</th>';
                if (!isCustomer) h += '<th style="' + thS + '">Company</th><th style="' + thS + '">Agent</th>';
                h += '</tr></thead><tbody>';

                var totP=0,totSF=0,totM=0,totD=0,cSF=0,cM=0;
                var tdS = 'padding:6px 4px;border-bottom:1px solid ' + B.line + ';font-size:11px;font-weight:300;word-break:normal;overflow:hidden;text-overflow:ellipsis';
                listings.forEach(function(l,i) {
                    var rowBg = i%2===1 ? 'background:' + B.goldTint + ';' : '';
                    h += '<tr style="' + rowBg + '">';
                    h += '<td style="' + tdS + ';color:' + B.muted + '">' + (i+1) + '</td>';
                    h += '<td style="' + tdS + ';font-weight:500;color:' + B.text + '">' + _displayAddr(l) + '</td>';
                    h += '<td style="' + tdS + ';font-weight:600;color:' + B.goldDeep + '">' + _fmtPrice(l) + '</td>';
                    h += '<td style="' + tdS + '">' + _val(l.beds) + '</td>';
                    h += '<td style="' + tdS + '">' + _val(l.baths) + '</td>';
                    h += '<td style="' + tdS + '">' + (l.intSqft ? l.intSqft.toLocaleString() : '') + '</td>';
                    h += '<td style="' + tdS + '">' + _priceSF(l) + '</td>';
                    if (!isAllRental) h += '<td style="' + tdS + '">' + (l.maintCC ? _fmtCurrency(l.maintCC)+'/mo' : '') + '</td>';
                    if (!isAllRental) h += '<td style="' + tdS + '">' + (l.totalMonthly ? _fmtCurrency(l.totalMonthly)+'/mo' : '') + '</td>';
                    h += '<td style="' + tdS + '">' + _ownershipLabel(l.ownership) + '</td>';
                    h += '<td style="' + tdS + '">' + _statusBadge(l.status, l) + '</td>';
                    h += '<td style="' + tdS + '">' + _val(l.dom) + '</td>';
                    h += '<td style="' + tdS + '">' + (l.originalPrice && l.originalPrice !== l.price ? _fmtCurrency(l.originalPrice) : '') + '</td>';
                    if (!isCustomer) h += '<td style="' + tdS + ';font-size:11px">' + _val(l.company) + '</td><td style="' + tdS + ';font-size:11px">' + _val(l.agentName) + '</td>';
                    h += '</tr>';
                    totP += l.price||0;
                    if (l.intSqft) { totSF += l.intSqft; cSF++; }
                    if (l.totalMonthly) { totM += l.totalMonthly; cM++; }
                    totD += l.dom||0;
                });
                h += '</tbody></table></div>';

                // Averages row
                var n = listings.length||1;
                var aP = Math.round(totP/n), aSF = cSF>0?Math.round(totSF/cSF):0;
                var aPSF = aSF>0?Math.round(aP/aSF):0, aM = cM>0?Math.round(totM/cM):0, aD = Math.round(totD/n);
                h += '<div style="margin-top:20px;padding:16px 20px;background:' + B.dark + ';border-radius:12px">' +
                    '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:16px;text-align:center;font-size:14px">' +
                    '<div><p style="color:' + B.goldBright + ';font-size:10px;margin:0;text-transform:uppercase;letter-spacing:0.1em;font-family:' + B.fontBody + ';font-weight:500">Avg Price</p><p style="font-weight:700;color:#fff;margin:4px 0 0;font-family:' + B.fontDisplay + '">' + _fmtCurrency(aP) + '</p></div>' +
                    '<div><p style="color:' + B.goldBright + ';font-size:10px;margin:0;text-transform:uppercase;letter-spacing:0.1em;font-family:' + B.fontBody + ';font-weight:500">Avg $/SF</p><p style="font-weight:700;color:#fff;margin:4px 0 0;font-family:' + B.fontDisplay + '">' + (aPSF ? _fmtCurrency(aPSF) : '') + '</p></div>' +
                    '<div><p style="color:' + B.goldBright + ';font-size:10px;margin:0;text-transform:uppercase;letter-spacing:0.1em;font-family:' + B.fontBody + ';font-weight:500">Avg SqFt</p><p style="font-weight:700;color:#fff;margin:4px 0 0;font-family:' + B.fontDisplay + '">' + (aSF ? aSF.toLocaleString() : '') + '</p></div>' +
                    '<div><p style="color:' + B.goldBright + ';font-size:10px;margin:0;text-transform:uppercase;letter-spacing:0.1em;font-family:' + B.fontBody + ';font-weight:500">Avg Monthly</p><p style="font-weight:700;color:#fff;margin:4px 0 0;font-family:' + B.fontDisplay + '">' + (aM ? _fmtCurrency(aM) : '') + '</p></div>' +
                    '<div><p style="color:' + B.goldBright + ';font-size:10px;margin:0;text-transform:uppercase;letter-spacing:0.1em;font-family:' + B.fontBody + ';font-weight:500">Avg DOM</p><p style="font-weight:700;color:#fff;margin:4px 0 0;font-family:' + B.fontDisplay + '">' + aD + ' days</p></div>' +
                    '<div><p style="color:' + B.goldBright + ';font-size:10px;margin:0;text-transform:uppercase;letter-spacing:0.1em;font-family:' + B.fontBody + ';font-weight:500">Total</p><p style="font-weight:700;color:#fff;margin:4px 0 0;font-family:' + B.fontDisplay + '">' + listings.length + ' listings</p></div>' +
                    '</div></div>';
                h += '</div>' + _brokerFooter();
                return h;
            }

            // ══════════════════════════════════════════════════════
            // SECTION 2: SUMMARY
            // ══════════════════════════════════════════════════════
            function _summarySection() {
                var h = _pageBreak() + _sectionDivider('Summary Report') + _headerBlock(reportTitle + ' \u2014 Summary') + _agentClientBar() + _criteriaBlock();
                h += '<div style="padding:24px 32px"><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:24px">';
                listings.forEach(function(l, idx) {
                    var stC = _statusColor(l.status);
                    h += '<div style="border:1px solid ' + B.line + ';border-radius:16px;overflow:hidden" class="pkg-no-break">';
                    // Photo
                    var photo = _getPhoto(l);
                    if (photo) {
                        h += '<div style="height:140px;position:relative;overflow:hidden;background:#f1f5f9">' +
                            '<img src="' + photo + '" alt="' + _displayAddr(l) + '" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '">' +
                            '<span style="position:absolute;top:8px;left:8px;padding:3px 10px;color:#fff;font-size:10px;font-weight:700;border-radius:9999px;background:' + stC.color + ';font-family:' + B.fontBody + ';letter-spacing:0.04em">' + (l.status||'ACTIVE') + '</span>';
                        if (l.photoCount) h += '<span style="position:absolute;top:8px;right:8px;padding:3px 8px;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;border-radius:9999px;font-family:' + B.fontBody + '">1 / ' + l.photoCount + '</span>';
                        h += '</div>';
                    }
                    h += '<div style="padding:16px">' +
                        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
                        '<span style="font-size:18px;font-weight:700;color:' + B.text + ';font-family:' + B.fontDisplay + '">' + _fmtPrice(l) + '</span>';
                    var psf = _priceSF(l);
                    if (psf) h += '<span style="font-size:11px;color:' + B.muted + ';font-family:' + B.fontBody + ';font-weight:300">' + psf + '</span>';
                    h += '</div>';
                    h += '<p style="font-weight:600;color:' + B.text + ';margin:0 0 4px;font-size:14px;font-family:' + B.fontDisplay + '">' + _displayAddr(l) + '</p>';
                    h += '<p style="font-size:13px;color:' + B.muted + ';margin:0 0 4px;font-family:' + B.fontBody + ';font-weight:300">' + _val(l.neighborhood) + '</p>';
                    if (l.crossStreet) h += '<p style="font-size:11px;color:' + B.muted + ';margin:0 0 4px;font-family:' + B.fontBody + ';font-weight:300">Cross: ' + l.crossStreet + '</p>';
                    h += '<div style="display:flex;align-items:center;gap:12px;font-size:13px;color:' + B.slate + ';margin-bottom:10px;font-family:' + B.fontBody + ';font-weight:300">' +
                        '<span><i class="fas fa-bed" style="margin-right:4px;color:' + B.gold + '"></i>' + _val(l.beds) + ' BR</span>' +
                        '<span><i class="fas fa-bath" style="margin-right:4px;color:' + B.gold + '"></i>' + _val(l.baths) + ' BA</span>';
                    if (l.intSqft) h += '<span><i class="fas fa-ruler-combined" style="margin-right:4px;color:' + B.gold + '"></i>' + l.intSqft.toLocaleString() + ' SF</span>';
                    h += '</div><div style="padding-top:10px;border-top:1px solid ' + B.line + ';font-size:11px;color:' + B.muted + ';display:flex;align-items:center;justify-content:space-between;font-family:' + B.fontBody + ';font-weight:300">' +
                        '<span>' + _ownershipLabel(l.ownership) + (l.era ? ' | ' + l.era : '') + '</span>' +
                        '<span>DOM: ' + _val(l.dom) + '</span></div>';
                    if (!isCustomer) h += '<div style="padding-top:6px;margin-top:6px;border-top:1px solid ' + B.line + ';font-size:11px;color:' + B.muted + ';font-family:' + B.fontBody + ';font-weight:300">' + _val(l.company) + ' \u2014 ' + _val(l.agentName) + '</div>';
                    if (idx === 0) {
                        var summDesc = _getDesc(l);
                        if (summDesc) h += '<div style="padding-top:6px;margin-top:6px;border-top:1px solid ' + B.line + ';font-size:11px;color:' + B.textLight + ';line-height:1.6;font-family:' + B.fontBody + ';font-weight:300">' + (summDesc.length > 200 ? summDesc.substring(0,197) + '...' : summDesc) + '</div>';
                    }
                    // Per-listing attribution (Art. III Sec. 2C — required on all versions)
                    h += _listingAttribution(l);
                    h += '</div></div>';
                });
                h += '</div></div>' + _brokerFooter();
                return h;
            }

            // ══════════════════════════════════════════════════════
            // SECTION 3: DETAIL (per listing)
            // ══════════════════════════════════════════════════════
            function _detailSection() {
                var h = '';
                listings.forEach(function(l, idx) {
                    h += _pageBreak() + (idx === 0 ? _sectionDivider('Detail Report') : '');
                    h += _headerBlock('Detailed Property Report \u2014 ' + (idx+1) + ' of ' + listings.length) + _agentClientBar();
                    h += '<div style="padding:24px 32px">';

                    // Photos (off-market: primary only per RLS rules)
                    var imgs = _getListingPhotos(l);
                    var hero = _getPhoto(l);
                    var side1 = imgs[1] ? imgs[1].url : hero;
                    var side2 = imgs[2] ? imgs[2].url : (imgs[1] ? imgs[1].url : hero);
                    if (hero) {
                        h += '<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:24px">' +
                            '<div style="height:220px;border-radius:12px;overflow:hidden;background:#f1f5f9"><img src="' + hero + '" alt="' + _displayAddr(l) + '" style="width:100%;height:100%;object-fit:cover"></div>' +
                            '<div style="display:flex;flex-direction:column;gap:12px">' +
                            '<div style="height:104px;border-radius:12px;overflow:hidden;background:#f1f5f9"><img src="' + side1 + '" alt="" style="width:100%;height:100%;object-fit:cover"></div>' +
                            '<div style="height:104px;border-radius:12px;overflow:hidden;background:#f1f5f9"><img src="' + side2 + '" alt="" style="width:100%;height:100%;object-fit:cover"></div>' +
                            '</div></div>';
                    }

                    // Price + Address header
                    h += '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px"><div>' +
                        '<h2 style="font-size:28px;font-weight:700;color:' + B.text + ';margin:0 0 4px;font-family:' + B.fontDisplay + ';letter-spacing:-0.02em">' + _fmtPrice(l) + '</h2>' +
                        '<p style="font-size:18px;color:' + B.text + ';margin:0;font-family:' + B.fontDisplay + ';font-weight:500">' + _displayAddr(l) + '</p>' +
                        '<p style="color:' + B.muted + ';margin:4px 0 0;font-family:' + B.fontBody + ';font-weight:300">' + _val(l.neighborhood) + ', NY ' + _val(l.zip) + '</p>';
                    if (l.crossStreet) h += '<p style="color:' + B.muted + ';font-size:12px;margin:2px 0 0;font-family:' + B.fontBody + ';font-weight:300">Cross: ' + l.crossStreet + '</p>';
                    h += '</div><div style="text-align:right">' + _statusBadge(l.status, l);
                    if (l.listedDate) h += '<p style="font-size:13px;color:' + B.muted + ';margin:8px 0 0;font-family:' + B.fontBody + ';font-weight:300">Listed: ' + l.listedDate + '</p>';
                    h += '<p style="font-size:13px;color:' + B.muted + ';margin:4px 0 0;font-family:' + B.fontBody + ';font-weight:300">DOM: ' + _val(l.dom) + ' days</p>';
                    if (!isCustomer && l.cdom && l.cdom !== l.dom) h += '<p style="font-size:13px;color:' + B.muted + ';margin:4px 0 0;font-family:' + B.fontBody + ';font-weight:300">CDOM: ' + l.cdom + '</p>';
                    if (l.originalPrice && l.originalPrice !== l.price) h += '<p style="font-size:13px;color:' + B.muted + ';margin:4px 0 0;font-family:' + B.fontBody + ';font-weight:300">Original: ' + _fmtCurrency(l.originalPrice) + '</p>';
                    h += '</div></div>';

                    // Stats bar
                    var metricCols = [];
                    metricCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + (l.beds === 0 ? 'Studio' : _val(l.beds)) + '</p><p style="font-size:10px;color:' + B.muted + ';margin:4px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Bedrooms</p></div>');
                    metricCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + _val(l.baths) + '</p><p style="font-size:10px;color:' + B.muted + ';margin:4px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Bathrooms</p></div>');
                    metricCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + (l.intSqft ? l.intSqft.toLocaleString() : '') + '</p><p style="font-size:10px;color:' + B.muted + ';margin:4px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Interior SF</p></div>');
                    var psf = _priceSF(l);
                    if (psf) metricCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + psf + '</p><p style="font-size:10px;color:' + B.muted + ';margin:4px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Price/SF</p></div>');
                    if (l.rooms && l.price) metricCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + _fmtCurrency(Math.round(l.price / l.rooms)) + '</p><p style="font-size:10px;color:' + B.muted + ';margin:4px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Price/Room</p></div>');
                    if (l.floor) metricCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + l.floor + '</p><p style="font-size:10px;color:' + B.muted + ';margin:4px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Floor</p></div>');
                    h += '<div style="display:grid;grid-template-columns:repeat(' + metricCols.length + ',1fr);gap:16px;padding:16px;background:' + B.goldTint + ';border:1px solid ' + B.goldGlow + ';border-radius:12px;margin-bottom:24px">' + metricCols.join('') + '</div>';

                    // Key Dates (overview area)
                    var dateFields = '';
                    dateFields += _detRow('Listed Date', l.listedDate);
                    dateFields += _detRow('Updated Date', l.updatedDate);
                    dateFields += _detRow('Contract Signed', l.contractSignedDate);
                    dateFields += _detRow('Closing Date', l.closingDate);
                    if (dateFields) {
                        h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px;margin-bottom:24px">' +
                            '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 12px;font-size:14px;font-family:' + B.fontDisplay + '"><i class="fas fa-calendar-alt" style="color:' + B.gold + ';margin-right:8px"></i>Key Dates</h3>' + dateFields + '</div>';
                    }
                    // Price History (overview area)
                    if (l.originalPrice && l.originalPrice !== l.price) {
                        var pDiff = l.price - l.originalPrice;
                        var pPct = ((pDiff / l.originalPrice) * 100).toFixed(1);
                        var pColor = pDiff > 0 ? '#dc2626' : '#15803d';
                        var pArrow = pDiff > 0 ? 'fa-arrow-up' : 'fa-arrow-down';
                        var pSign = pDiff > 0 ? '+' : '';
                        h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px;margin-bottom:24px" class="pkg-no-break">' +
                            '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 12px;font-size:14px;font-family:' + B.fontDisplay + '"><i class="fas fa-chart-line" style="color:' + B.gold + ';margin-right:8px"></i>Price History</h3>' +
                            _detRow('Original Price', _fmtCurrency(l.originalPrice)) +
                            _detRow('Current Price', _fmtCurrency(l.price)) +
                            _detRow('Change', '<span style="color:' + pColor + '"><i class="fas ' + pArrow + '" style="margin-right:4px;font-size:11px"></i>' + pSign + _fmtCurrency(Math.abs(pDiff)) + ' (' + pSign + pPct + '%)</span>') +
                            '</div>';
                    }

                    // Property + Financial 2-col
                    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px">';
                    h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px">' +
                        '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 12px;font-size:14px;font-family:' + B.fontDisplay + '"><i class="fas fa-home" style="color:' + B.gold + ';margin-right:8px"></i>Property Details</h3>';
                    h += _detRow('Type', _ownershipLabel(l.ownership));
                    h += _detRow('Building', l.era);
                    h += _detRow('Total Rooms', l.rooms);
                    h += _detRow('Exposures', l.exposures);
                    h += _detRow('Cross Street', l.crossStreet);
                    h += _detRow('Year Built', l.yearBuilt);
                    h += _detRow('Total Floors', l.totalFloors);
                    h += _detRow('Building', l.buildingName);
                    h += '</div>';
                    h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px">' +
                        '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 12px;font-size:14px;font-family:' + B.fontDisplay + '"><i class="fas fa-dollar-sign" style="color:' + B.gold + ';margin-right:8px"></i>Financial Details</h3>';
                    if (l.listingCategory !== 'rental') {
                        h += _detRow('Maintenance/CC', l.maintCC ? _fmtCurrency(l.maintCC)+'/mo' : '');
                        h += _detRow('RE Taxes', l.reTaxes ? _fmtCurrency(Math.round(l.reTaxes))+'/mo' : '');
                        h += _detRow('Total Monthly', l.totalMonthly ? '<span style="color:' + B.goldDeep + ';font-weight:600">' + _fmtCurrency(l.totalMonthly)+'/mo</span>' : '');
                    } else {
                        h += _detRow('Monthly Rent', '<span style="color:' + B.goldDeep + ';font-weight:600">' + _fmtCurrency(l.price) + '/mo</span>');
                    }
                    h += _detRow('Price/SqFt', _priceSF(l));
                    if (l.rooms && l.price) h += _detRow('Price/Room', _fmtCurrency(Math.round(l.price / l.rooms)));
                    if (l.originalPrice && l.originalPrice !== l.price) h += _detRow('Original Price', _fmtCurrency(l.originalPrice));
                    h += '</div></div>';

                    // Description
                    var descText = _getDesc(l);
                    if (descText) {
                        h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px;margin-bottom:24px">' +
                            '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 12px;font-size:14px;font-family:' + B.fontDisplay + '"><i class="fas fa-align-left" style="color:' + B.gold + ';margin-right:8px"></i>Description</h3>' +
                            '<p style="font-size:13px;color:' + B.textLight + ';line-height:1.7;margin:0;font-family:' + B.fontBody + ';font-weight:300">' + descText + '</p></div>';
                    }

                    // Media & Virtual Tours
                    if (l.virtualTourUrl) {
                        h += '<div style="display:inline-block;padding:12px 16px;background:' + B.goldTint + ';border:1px solid ' + B.goldGlow + ';border-radius:12px;margin-bottom:12px;margin-right:12px">' +
                            '<i class="fas fa-vr-cardboard" style="font-size:18px;color:' + B.goldDeep + ';margin-right:8px"></i>' +
                            '<span style="font-weight:600;font-size:13px;color:' + B.text + ';font-family:' + B.fontDisplay + '">3D Virtual Tour</span><br>' +
                            '<a href="' + l.virtualTourUrl + '" style="color:' + B.goldDeep + ';font-size:11px;text-decoration:none;overflow-wrap:anywhere;word-break:normal;font-family:' + B.fontBody + '">' + l.virtualTourUrl + '</a></div>';
                    }
                    if (l.videoTourUrl) {
                        h += '<div style="display:inline-block;padding:12px 16px;background:' + B.goldTint + ';border:1px solid ' + B.goldGlow + ';border-radius:12px;margin-bottom:12px;margin-right:12px">' +
                            '<i class="fas fa-video" style="font-size:18px;color:' + B.goldDeep + ';margin-right:8px"></i>' +
                            '<span style="font-weight:600;font-size:13px;color:' + B.text + ';font-family:' + B.fontDisplay + '">Video Tour</span><br>' +
                            '<a href="' + l.videoTourUrl + '" style="color:' + B.goldDeep + ';font-size:11px;text-decoration:none;overflow-wrap:anywhere;word-break:normal;font-family:' + B.fontBody + '">' + l.videoTourUrl + '</a></div>';
                    }

                    // Photo summary
                    var photoCount = _getListingPhotos(l).filter(function(img) { return img.mediaCategory !== 'FloorPlan'; }).length;
                    if (photoCount > 0) {
                        h += '<p style="font-size:12px;color:' + B.muted + ';margin:12px 0;font-family:' + B.fontBody + ';font-weight:300"><i class="fas fa-images" style="margin-right:4px;color:' + B.gold + '"></i>' + photoCount + ' photo(s) available</p>';
                    }

                    // Building Info
                    h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px;margin-bottom:24px">' +
                        '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 12px;font-size:14px;font-family:' + B.fontDisplay + '"><i class="fas fa-building" style="color:' + B.gold + ';margin-right:8px"></i>Building Information</h3>';
                    h += _detRow('Building Name', l.buildingName || l.address);
                    h += _detRow('Year Built', l.yearBuilt);
                    h += _detRow('Total Floors', l.totalFloors);
                    h += _detRow('Era', l.era);
                    h += _detRow('Condition', l.condition);
                    h += '</div>';

                    // Links
                    var linkHtml = '';
                    linkHtml += '<p style="margin:4px 0;font-size:12px;font-family:' + B.fontBody + '"><i class="fas fa-link" style="color:' + B.gold + ';margin-right:6px;width:14px;text-align:center"></i><a href="#" style="color:' + B.goldDeep + ';text-decoration:none">View on mallan.nyc</a></p>';
                    if (l.virtualTourUrl) linkHtml += '<p style="margin:4px 0;font-size:12px;font-family:' + B.fontBody + '"><i class="fas fa-vr-cardboard" style="color:' + B.gold + ';margin-right:6px;width:14px;text-align:center"></i><a href="' + l.virtualTourUrl + '" style="color:' + B.goldDeep + ';text-decoration:none">3D Virtual Tour</a></p>';
                    if (l.videoTourUrl) linkHtml += '<p style="margin:4px 0;font-size:12px;font-family:' + B.fontBody + '"><i class="fas fa-video" style="color:' + B.gold + ';margin-right:6px;width:14px;text-align:center"></i><a href="' + l.videoTourUrl + '" style="color:' + B.goldDeep + ';text-decoration:none">Video Tour</a></p>';
                    h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px;margin-bottom:24px">' +
                        '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 12px;font-size:14px;font-family:' + B.fontDisplay + '"><i class="fas fa-external-link-alt" style="color:' + B.gold + ';margin-right:8px"></i>Links</h3>' + linkHtml + '</div>';

                    // Agent-only data
                    if (!isCustomer) {
                        h += '<div style="padding:16px;background:' + B.goldTint + ';border:1px solid ' + B.goldGlow + ';border-radius:12px;font-size:12px;margin-bottom:16px;font-family:' + B.fontBody + '">' +
                            '<p style="font-weight:600;color:' + B.goldDeep + ';margin:0 0 8px;font-family:' + B.fontDisplay + '"><i class="fas fa-user-tie" style="margin-right:6px"></i>Listing Agent Information</p>' +
                            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;color:' + B.textLight + ';font-weight:300">';
                        if (l.company) h += '<div><span style="font-weight:500;color:' + B.text + '">Company:</span> ' + l.company + '</div>';
                        if (l.agentName) h += '<div><span style="font-weight:500;color:' + B.text + '">Agent:</span> ' + l.agentName + '</div>';
                        if (l.listingType) h += '<div><span style="font-weight:500;color:' + B.text + '">Listing Type:</span> ' + l.listingType + '</div>';
                        if (l.lid) h += '<div><span style="font-weight:500;color:' + B.text + '">LID:</span> ' + l.lid + '</div>';
                        if (l.wid) h += '<div><span style="font-weight:500;color:' + B.text + '">WID:</span> ' + l.wid + '</div>';
                        if (l.agentEmail) h += '<div><span style="font-weight:500;color:' + B.text + '">Email:</span> ' + l.agentEmail + '</div>';
                        if (l.agentPhone) h += '<div><span style="font-weight:500;color:' + B.text + '">Phone:</span> ' + l.agentPhone + '</div>';
                        if (l.showingInstructions) h += '<div style="grid-column:span 3"><span style="font-weight:500;color:' + B.text + '">Showing:</span> ' + l.showingInstructions + '</div>';
                        if (l.privateRemarks) h += '<div style="grid-column:span 3"><span style="font-weight:500;color:' + B.text + '">Private Remarks:</span> ' + l.privateRemarks + '</div>';
                        h += '</div></div>';
                    }

                    // Per-listing attribution (Art. III Sec. 2C)
                    h += _listingAttribution(l);
                    h += '</div>' + _brokerFooter();
                });
                return h;
            }

            // ══════════════════════════════════════════════════════
            // SECTION 4: COMPARISON (skip if < 2 listings)
            // ══════════════════════════════════════════════════════
            function _comparisonSection() {
                if (listings.length < 2) return '';
                var cl = listings.slice(0, 4);
                var h = _pageBreak() + _sectionDivider('Comparison Report') + _headerBlock(reportTitle + ' \u2014 Comparison') + _agentClientBar() + _criteriaBlock();
                var compBgs = [B.goldTint, 'rgba(196,160,82,0.04)', B.goldTint, 'rgba(196,160,82,0.04)'];

                h += '<div style="padding:24px 32px"><div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse;table-layout:fixed;font-family:' + B.fontBody + '">' +
                    '<thead><tr style="border-bottom:2px solid ' + B.gold + '">' +
                    '<th style="padding:12px;text-align:left;background:' + B.goldTint + ';width:140px"></th>';
                cl.forEach(function(l,i) {
                    var photo = _getPhoto(l);
                    h += '<th style="padding:12px;text-align:center;background:' + compBgs[i%4] + '">';
                    if (photo) {
                        h += '<div style="height:80px;border-radius:8px;margin-bottom:8px;overflow:hidden">' +
                            '<img src="' + photo + '" alt="" style="width:100%;height:100%;object-fit:cover"></div>';
                    }
                    h += '<span style="font-weight:600;font-size:11px;font-family:' + B.fontDisplay + '">' + _displayAddr(l) + '</span></th>';
                });
                h += '</tr></thead><tbody>';

                var tdS = 'padding:10px;text-align:center;border-bottom:1px solid ' + B.line + ';font-size:12px;font-weight:300';
                var thS = 'padding:10px;font-weight:600;color:' + B.slate + ';text-align:left;border-bottom:1px solid ' + B.line + ';font-size:12px;font-family:' + B.fontBody + '';
                var rows = [
                    ['Price', function(l){ return '<td style="' + tdS + ';font-weight:600;color:' + B.goldDeep + '">' + _fmtPrice(l) + '</td>'; }],
                    ['Original Price', function(l){ return '<td style="' + tdS + '">' + (l.originalPrice && l.originalPrice !== l.price ? _fmtCurrency(l.originalPrice) : '') + '</td>'; }],
                    ['$/SF', function(l){ return '<td style="' + tdS + '">' + _priceSF(l) + '</td>'; }],
                    ['Bedrooms', function(l){ return '<td style="' + tdS + '">' + _val(l.beds) + '</td>'; }],
                    ['Bathrooms', function(l){ return '<td style="' + tdS + '">' + _val(l.baths) + '</td>'; }],
                    ['SqFt', function(l){ return '<td style="' + tdS + '">' + (l.intSqft ? l.intSqft.toLocaleString() : '') + '</td>'; }],
                    ['Type', function(l){ return '<td style="' + tdS + '">' + _ownershipLabel(l.ownership) + '</td>'; }],
                    ['Era', function(l){ return '<td style="' + tdS + '">' + _val(l.era) + '</td>'; }],
                    ['Monthly', function(l){ return '<td style="' + tdS + '">' + (l.totalMonthly ? _fmtCurrency(l.totalMonthly) : '') + '</td>'; }],
                    ['Floor', function(l){ return '<td style="' + tdS + '">' + _val(l.floor) + '</td>'; }],
                    ['Neighborhood', function(l){ return '<td style="' + tdS + '">' + _val(l.neighborhood) + '</td>'; }],
                    ['DOM', function(l){ return '<td style="' + tdS + '">' + _val(l.dom) + '</td>'; }],
                    ['Status', function(l){ return '<td style="' + tdS + '">' + _statusBadge(l.status, l) + '</td>'; }]
                ];
                rows.forEach(function(r, ri) {
                    var rowBg = ri%2===0 ? 'background:' + B.goldTint + ';' : '';
                    h += '<tr style="' + rowBg + '"><td style="' + thS + '">' + r[0] + '</td>';
                    cl.forEach(function(l){ h += r[1](l); });
                    h += '</tr>';
                });
                // Agent-only rows
                if (!isCustomer) {
                    h += '<tr style="background:' + B.goldTint + '"><td style="' + thS + ';color:' + B.goldDeep + '">Company</td>';
                    cl.forEach(function(l){ h += '<td style="' + tdS + ';font-size:11px">' + _val(l.company) + '</td>'; }); h += '</tr>';
                    h += '<tr style="background:' + B.goldTint + '"><td style="' + thS + ';color:' + B.goldDeep + '">Agent</td>';
                    cl.forEach(function(l){ h += '<td style="' + tdS + ';font-size:11px">' + _val(l.agentName) + '</td>'; }); h += '</tr>';
                }
                h += '</tbody></table></div></div>' + _brokerFooter();
                return h;
            }

            // ══════════════════════════════════════════════════════
            // SECTION 5: FACT SHEET (per listing)
            // ══════════════════════════════════════════════════════
            function _factSheetSection() {
                var h = '';
                listings.forEach(function(l, idx) {
                    h += _pageBreak() + (idx === 0 ? _sectionDivider('Fact Sheet') : '');
                    h += _headerBlock('Property Fact Sheet \u2014 ' + (idx+1) + ' of ' + listings.length) + _agentClientBar();
                    // Hero photo
                    var photo = _getPhoto(l);
                    if (photo) {
                        h += '<div style="position:relative;height:180px;overflow:hidden">' +
                            '<img src="' + photo + '" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '">' +
                            '<span style="position:absolute;top:12px;left:12px;padding:4px 14px;color:#fff;font-size:10px;font-weight:700;border-radius:9999px;background:' + _statusColor(l.status).color + ';font-family:' + B.fontBody + ';letter-spacing:0.04em">' + (l.status||'ACTIVE') + '</span></div>';
                    }
                    h += '<div style="padding:24px 32px">';
                    // Price + Address
                    h += '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px"><div>' +
                        '<h2 style="font-size:26px;font-weight:700;color:' + B.text + ';margin:0 0 4px;font-family:' + B.fontDisplay + ';letter-spacing:-0.02em">' + _fmtPrice(l) + '</h2>' +
                        '<p style="font-size:16px;color:' + B.text + ';margin:0;font-family:' + B.fontDisplay + ';font-weight:500">' + _displayAddr(l) + '</p>' +
                        '<p style="color:' + B.muted + ';margin:4px 0 0;font-family:' + B.fontBody + ';font-weight:300">' + _val(l.neighborhood) + ', NY ' + _val(l.zip) + '</p>';
                    if (l.crossStreet) h += '<p style="font-size:12px;color:' + B.muted + ';margin:2px 0 0;font-family:' + B.fontBody + ';font-weight:300">Cross: ' + l.crossStreet + '</p>';
                    h += '</div><div style="text-align:right">' + _statusBadge(l.status, l);
                    h += '<p style="font-size:12px;color:' + B.muted + ';margin:8px 0 0;font-family:' + B.fontBody + ';font-weight:300">DOM: ' + _val(l.dom) + '</p>';
                    if (!isCustomer && l.cdom && l.cdom !== l.dom) h += '<p style="font-size:12px;color:' + B.muted + ';margin:4px 0 0;font-family:' + B.fontBody + ';font-weight:300">CDOM: ' + l.cdom + '</p>';
                    if (l.originalPrice && l.originalPrice !== l.price) h += '<p style="font-size:12px;color:' + B.muted + ';margin:4px 0 0;font-family:' + B.fontBody + ';font-weight:300">Original: ' + _fmtCurrency(l.originalPrice) + '</p>';
                    h += '</div></div>';

                    // Stats bar
                    var fsCols = [];
                    fsCols.push('<div style="text-align:center"><p style="font-size:22px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + _val(l.beds) + '</p><p style="font-size:10px;color:' + B.muted + ';margin:2px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Bedrooms</p></div>');
                    fsCols.push('<div style="text-align:center"><p style="font-size:22px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + _val(l.baths) + '</p><p style="font-size:10px;color:' + B.muted + ';margin:2px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Bathrooms</p></div>');
                    fsCols.push('<div style="text-align:center"><p style="font-size:22px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + (l.intSqft ? l.intSqft.toLocaleString() : '') + '</p><p style="font-size:10px;color:' + B.muted + ';margin:2px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Interior SF</p></div>');
                    var fspsf = _priceSF(l);
                    if (fspsf) fsCols.push('<div style="text-align:center"><p style="font-size:22px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + fspsf + '</p><p style="font-size:10px;color:' + B.muted + ';margin:2px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Price/SF</p></div>');
                    if (l.floor) fsCols.push('<div style="text-align:center"><p style="font-size:22px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + l.floor + '</p><p style="font-size:10px;color:' + B.muted + ';margin:2px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Floor</p></div>');
                    h += '<div style="display:grid;grid-template-columns:repeat(' + fsCols.length + ',1fr);gap:12px;padding:14px;background:' + B.goldTint + ';border:1px solid ' + B.goldGlow + ';border-radius:12px;margin-bottom:20px">' + fsCols.join('') + '</div>';

                    // Key Dates (overview area)
                    var fsDateFields = '';
                    fsDateFields += _detRow('Listed Date', l.listedDate);
                    fsDateFields += _detRow('Updated Date', l.updatedDate);
                    fsDateFields += _detRow('Contract Signed', l.contractSignedDate);
                    fsDateFields += _detRow('Closing Date', l.closingDate);
                    if (fsDateFields) {
                        h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px;margin-bottom:20px">' +
                            '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 10px;font-size:13px;font-family:' + B.fontDisplay + '"><i class="fas fa-calendar-alt" style="color:' + B.gold + ';margin-right:6px"></i>Key Dates</h3>' + fsDateFields + '</div>';
                    }
                    // Price History (overview area)
                    if (l.originalPrice && l.originalPrice !== l.price) {
                        var fsPD = l.price - l.originalPrice;
                        var fsPP = ((fsPD / l.originalPrice) * 100).toFixed(1);
                        var fsPCol = fsPD > 0 ? '#dc2626' : '#15803d';
                        var fsPArr = fsPD > 0 ? 'fa-arrow-up' : 'fa-arrow-down';
                        var fsPSgn = fsPD > 0 ? '+' : '';
                        h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px;margin-bottom:20px" class="pkg-no-break">' +
                            '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 10px;font-size:13px;font-family:' + B.fontDisplay + '"><i class="fas fa-chart-line" style="color:' + B.gold + ';margin-right:6px"></i>Price History</h3>' +
                            _detRow('Original Price', _fmtCurrency(l.originalPrice)) +
                            _detRow('Current Price', _fmtCurrency(l.price)) +
                            _detRow('Change', '<span style="color:' + fsPCol + '"><i class="fas ' + fsPArr + '" style="margin-right:4px;font-size:10px"></i>' + fsPSgn + _fmtCurrency(Math.abs(fsPD)) + ' (' + fsPSgn + fsPP + '%)</span>') +
                            '</div>';
                    }

                    // Property + Financial 2-col
                    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">';
                    h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px">' +
                        '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 10px;font-size:13px;font-family:' + B.fontDisplay + '"><i class="fas fa-home" style="color:' + B.gold + ';margin-right:6px"></i>Property Details</h3>';
                    h += _detRow('Type', _ownershipLabel(l.ownership));
                    h += _detRow('Building', l.era);
                    h += _detRow('Total Rooms', l.rooms);
                    h += _detRow('Exposures', l.exposures);
                    if (l.crossStreet) h += _detRow('Cross Street', l.crossStreet);
                    if (l.yearBuilt) h += _detRow('Year Built', l.yearBuilt);
                    h += '</div>';
                    h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px">' +
                        '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 10px;font-size:13px;font-family:' + B.fontDisplay + '"><i class="fas fa-dollar-sign" style="color:' + B.gold + ';margin-right:6px"></i>Financial Details</h3>';
                    if (l.listingCategory !== 'rental') {
                        h += _detRow('Maint/CC', l.maintCC ? _fmtCurrency(l.maintCC)+'/mo' : '');
                        h += _detRow('RE Taxes', l.reTaxes ? _fmtCurrency(Math.round(l.reTaxes))+'/mo' : '');
                        h += _detRow('Total Monthly', l.totalMonthly ? '<span style="color:' + B.goldDeep + ';font-weight:600">' + _fmtCurrency(l.totalMonthly)+'/mo</span>' : '');
                    } else {
                        h += _detRow('Monthly Rent', '<span style="color:' + B.goldDeep + ';font-weight:600">' + _fmtCurrency(l.price) + '/mo</span>');
                    }
                    h += _detRow('Price/SqFt', _priceSF(l));
                    if (l.originalPrice && l.originalPrice !== l.price) h += _detRow('Original Price', _fmtCurrency(l.originalPrice));
                    h += '</div></div>';

                    // Building Info (compact)
                    h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px;margin-bottom:20px">' +
                        '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 10px;font-size:13px;font-family:' + B.fontDisplay + '"><i class="fas fa-building" style="color:' + B.gold + ';margin-right:6px"></i>Building Information</h3>' +
                        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px;font-family:' + B.fontBody + ';font-weight:300">';
                    if (l.buildingName || l.address) h += '<div><span style="color:' + B.muted + '">Name:</span> <span style="font-weight:500;color:' + B.text + '">' + (l.buildingName||l.address) + '</span></div>';
                    if (l.yearBuilt) h += '<div><span style="color:' + B.muted + '">Year Built:</span> <span style="font-weight:500;color:' + B.text + '">' + l.yearBuilt + '</span></div>';
                    if (l.totalFloors) h += '<div><span style="color:' + B.muted + '">Floors:</span> <span style="font-weight:500;color:' + B.text + '">' + l.totalFloors + '</span></div>';
                    h += '</div></div>';

                    // Description
                    var fsDesc = _getDesc(l);
                    if (fsDesc) {
                        h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px;margin-bottom:20px">' +
                            '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 10px;font-size:13px;font-family:' + B.fontDisplay + '"><i class="fas fa-align-left" style="color:' + B.gold + ';margin-right:6px"></i>Description</h3>' +
                            '<p style="font-size:12px;color:' + B.textLight + ';line-height:1.7;margin:0;font-family:' + B.fontBody + ';font-weight:300">' + fsDesc + '</p></div>';
                    }

                    // Links
                    var fsLinks = '';
                    fsLinks += '<p style="margin:4px 0;font-size:11px;font-family:' + B.fontBody + '"><i class="fas fa-link" style="color:' + B.gold + ';margin-right:6px;width:14px;text-align:center"></i><a href="#" style="color:' + B.goldDeep + ';text-decoration:none">View on mallan.nyc</a></p>';
                    if (l.virtualTourUrl) fsLinks += '<p style="margin:4px 0;font-size:11px;font-family:' + B.fontBody + '"><i class="fas fa-video" style="color:' + B.gold + ';margin-right:6px;width:14px;text-align:center"></i><a href="' + l.virtualTourUrl + '" style="color:' + B.goldDeep + ';text-decoration:none">Virtual Tour</a></p>';
                    h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px;margin-bottom:20px">' +
                        '<h3 style="font-weight:700;color:' + B.text + ';margin:0 0 10px;font-size:13px;font-family:' + B.fontDisplay + '"><i class="fas fa-external-link-alt" style="color:' + B.gold + ';margin-right:6px"></i>Links</h3>' + fsLinks + '</div>';

                    // Agent-only data
                    if (!isCustomer) {
                        h += '<div style="padding:16px;background:' + B.goldTint + ';border:1px solid ' + B.goldGlow + ';border-radius:12px;font-size:12px;margin-bottom:20px;font-family:' + B.fontBody + '">' +
                            '<p style="font-weight:600;color:' + B.goldDeep + ';margin:0 0 8px;font-family:' + B.fontDisplay + '">Agent-Only Data</p>' +
                            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;color:' + B.textLight + ';font-weight:300">';
                        if (l.company) h += '<div><span style="font-weight:500;color:' + B.text + '">Company:</span> ' + l.company + '</div>';
                        if (l.agentName) h += '<div><span style="font-weight:500;color:' + B.text + '">Agent:</span> ' + l.agentName + '</div>';
                        if (l.listingType) h += '<div><span style="font-weight:500;color:' + B.text + '">Listing Type:</span> ' + l.listingType + '</div>';
                        if (l.commission) h += '<div><span style="font-weight:500;color:' + B.text + '">Commission:</span> ' + l.commission + '</div>';
                        if (l.privateRemarks) h += '<div style="grid-column:span 2"><span style="font-weight:500;color:' + B.text + '">Private Remarks:</span> ' + l.privateRemarks + '</div>';
                        if (l.showingInstructions) h += '<div style="grid-column:span 3"><span style="font-weight:500;color:' + B.text + '">Showing:</span> ' + l.showingInstructions + '</div>';
                        h += '</div></div>';
                    }
                    // Per-listing attribution (Art. III Sec. 2C)
                    h += _listingAttribution(l);
                    h += '</div>' + _brokerFooter();
                });
                return h;
            }

            // ══════════════════════════════════════════════════════
            // SECTION 6: CMA (skip if < 2 listings)
            // ══════════════════════════════════════════════════════
            function _cmaSection() {
                if (listings.length < 2) return '';
                var subject = listings[0];
                var comps = listings.slice(1);
                var h = _pageBreak() + _sectionDivider('Comparative Market Analysis') + _headerBlock('Comparative Market Analysis') + _agentClientBar();

                // Subject property
                h += '<div style="padding:24px 32px"><h2 style="font-size:15px;font-weight:700;color:' + B.text + ';margin:0 0 16px;border-bottom:2px solid ' + B.gold + ';padding-bottom:8px;font-family:' + B.fontDisplay + '">Subject Property</h2>';
                var subjPhoto = _getPhoto(subject);
                h += '<div style="display:grid;grid-template-columns:' + (subjPhoto ? '180px ' : '') + '1fr;gap:20px;margin-bottom:24px">';
                if (subjPhoto) {
                    h += '<div style="height:140px;border-radius:12px;overflow:hidden"><img src="' + subjPhoto + '" style="width:100%;height:100%;object-fit:cover"></div>';
                }
                h += '<div><h3 style="font-size:20px;font-weight:700;color:' + B.text + ';margin:0 0 4px;font-family:' + B.fontDisplay + '">' + _fmtPrice(subject) + '</h3>' +
                    '<p style="font-size:15px;color:' + B.text + ';margin:0 0 4px;font-family:' + B.fontDisplay + ';font-weight:500">' + _displayAddr(subject) + '</p>' +
                    '<p style="color:' + B.muted + ';font-size:12px;margin:0 0 12px;font-family:' + B.fontBody + ';font-weight:300">' + _val(subject.neighborhood) + '</p>' +
                    '<div style="display:flex;gap:16px;font-size:12px;color:' + B.slate + ';font-family:' + B.fontBody + ';font-weight:300">' +
                    '<span><i class="fas fa-bed" style="margin-right:4px;color:' + B.gold + '"></i>' + _val(subject.beds) + ' BR</span>' +
                    '<span><i class="fas fa-bath" style="margin-right:4px;color:' + B.gold + '"></i>' + _val(subject.baths) + ' BA</span>' +
                    '<span><i class="fas fa-ruler-combined" style="margin-right:4px;color:' + B.gold + '"></i>' + (subject.intSqft ? subject.intSqft.toLocaleString() : '') + ' SF</span>';
                var subjPsf = _priceSF(subject);
                if (subjPsf) h += '<span>' + subjPsf + '/SF</span>';
                h += '<span>DOM: ' + _val(subject.dom) + '</span></div></div></div>';

                // Comparables table
                h += '<h2 style="font-size:15px;font-weight:700;color:' + B.text + ';margin:24px 0 16px;border-bottom:2px solid ' + B.gold + ';padding-bottom:8px;font-family:' + B.fontDisplay + '">Comparable Properties (' + comps.length + ')</h2>';
                var cmaThS = 'padding:8px;font-weight:600;color:' + B.slate + ';font-size:11px;text-align:left;white-space:nowrap;background:' + B.goldTint + ';font-family:' + B.fontBody + ';text-transform:uppercase;letter-spacing:0.05em';
                var cmaTdS = 'padding:8px;font-size:12px;border-bottom:1px solid ' + B.line + ';font-weight:300;font-family:' + B.fontBody + '';
                h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
                    '<thead><tr>' +
                    '<th style="' + cmaThS + '">#</th><th style="' + cmaThS + '">Address</th><th style="' + cmaThS + '">Price</th>' +
                    '<th style="' + cmaThS + '">BR</th><th style="' + cmaThS + '">BA</th><th style="' + cmaThS + '">SqFt</th>' +
                    '<th style="' + cmaThS + '">$/SF</th><th style="' + cmaThS + '">Type</th><th style="' + cmaThS + '">DOM</th>' +
                    '<th style="' + cmaThS + '">Status</th>';
                if (!isCustomer) h += '<th style="' + cmaThS + '">Company</th>';
                h += '</tr></thead><tbody>';
                comps.forEach(function(cl, ci) {
                    var rowBg = ci%2===1 ? 'background:' + B.goldTint + ';' : '';
                    h += '<tr style="' + rowBg + '">' +
                        '<td style="' + cmaTdS + ';color:' + B.muted + '">' + (ci+1) + '</td>' +
                        '<td style="' + cmaTdS + ';font-weight:500;color:' + B.text + '">' + _displayAddr(cl) + '</td>' +
                        '<td style="' + cmaTdS + ';font-weight:600;color:' + B.goldDeep + '">' + _fmtPrice(cl) + '</td>' +
                        '<td style="' + cmaTdS + '">' + _val(cl.beds) + '</td>' +
                        '<td style="' + cmaTdS + '">' + _val(cl.baths) + '</td>' +
                        '<td style="' + cmaTdS + '">' + (cl.intSqft ? cl.intSqft.toLocaleString() : '') + '</td>' +
                        '<td style="' + cmaTdS + '">' + _priceSF(cl) + '</td>' +
                        '<td style="' + cmaTdS + '">' + _ownershipLabel(cl.ownership) + '</td>' +
                        '<td style="' + cmaTdS + '">' + _val(cl.dom) + '</td>' +
                        '<td style="' + cmaTdS + '">' + _statusBadge(cl.status, cl) + '</td>';
                    if (!isCustomer) h += '<td style="' + cmaTdS + ';font-size:11px">' + _val(cl.company) + '</td>';
                    h += '</tr>';
                });
                h += '</tbody></table></div>';

                // Market Summary
                var cmaTP=0,cmaTSF=0,cmaTD=0,cmaCsf=0;
                listings.forEach(function(l){ cmaTP+=l.price||0; if(l.intSqft){cmaTSF+=l.intSqft;cmaCsf++;} cmaTD+=l.dom||0; });
                var cmaN = listings.length||1;
                var cmaAP = Math.round(cmaTP/cmaN), cmaASF = cmaCsf>0?Math.round(cmaTSF/cmaCsf):0;
                var cmaAPSF = cmaASF>0?Math.round(cmaAP/cmaASF):0, cmaAD = Math.round(cmaTD/cmaN);
                var prices = listings.map(function(l){return l.price||0;}).sort(function(a,b){return a-b;});
                var medianPrice = prices.length%2===0 ? Math.round((prices[prices.length/2-1]+prices[prices.length/2])/2) : prices[Math.floor(prices.length/2)];
                h += '<h2 style="font-size:15px;font-weight:700;color:' + B.text + ';margin:24px 0 16px;border-bottom:2px solid ' + B.gold + ';padding-bottom:8px;font-family:' + B.fontDisplay + '">Market Summary</h2>';
                h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">';
                var cmaStat = function(label, val) {
                    return '<div style="text-align:center;padding:14px;background:' + B.bg + ';border-radius:12px;border:1px solid ' + B.line + '"><p style="font-size:18px;font-weight:700;color:' + B.text + ';margin:0;font-family:' + B.fontDisplay + '">' + val + '</p><p style="font-size:10px;color:' + B.muted + ';margin:4px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">'+label+'</p></div>';
                };
                h += cmaStat('Avg Price', _fmtCurrency(cmaAP));
                h += cmaStat('Avg $/SF', cmaAPSF ? _fmtCurrency(cmaAPSF) : '');
                h += cmaStat('Median Price', _fmtCurrency(medianPrice));
                h += cmaStat('Avg DOM', cmaAD + ' days');
                h += cmaStat('Price Range', _fmtCurrency(prices[0]) + ' \u2013 ' + _fmtCurrency(prices[prices.length-1]));
                h += '</div>';

                // Price comparison bar chart
                h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">' +
                    '<h3 style="font-weight:600;color:' + B.text + ';margin:0 0 12px;font-size:13px;font-family:' + B.fontDisplay + '">Price Comparison</h3>' +
                    '<div style="display:flex;align-items:flex-end;justify-content:center;gap:12px;height:140px;padding:0 20px">';
                var maxP = Math.max.apply(null, listings.map(function(l){return l.price||0;}));
                var goldShades = [B.goldDeep, B.gold, '#D4AF37', '#E5C76B', '#8B7534', '#A68B45', '#C9A84C', '#B89A3F'];
                listings.forEach(function(l,i) {
                    var barH = maxP > 0 ? Math.round((l.price||0)/maxP*120) : 10;
                    h += '<div style="text-align:center;flex:1;max-width:80px"><div style="height:' + barH + 'px;background:' + goldShades[i%goldShades.length] + ';border-radius:6px 6px 0 0;margin-bottom:4px"></div>' +
                        '<p style="font-size:9px;color:' + B.muted + ';margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:' + B.fontBody + '">' + (l.addressDisplayYN === false ? 'N/A' : (l.address||'').split(',')[0]) + '</p>' +
                        '<p style="font-size:10px;font-weight:600;color:' + B.text + ';margin:2px 0 0;font-family:' + B.fontBody + '">' + _fmtCurrency(l.price) + '</p></div>';
                });
                h += '</div></div>';
                h += _statisticalDisclaimer();
                h += '</div>' + _brokerFooter();
                return h;
            }

            // ══════════════════════════════════════════════════════
            // SECTION 7: OPEN HOUSE (first listing only)
            // ══════════════════════════════════════════════════════
            function _openHouseSection() {
                var l = listings[0];
                var h = _pageBreak() + _sectionDivider('Open House Report');
                // Hero photo
                var photo = _getPhoto(l);
                if (photo) {
                    h += '<div style="position:relative;height:260px;overflow:hidden">' +
                        '<img src="' + photo + '" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '">' +
                        '<span style="position:absolute;top:12px;left:12px;padding:6px 16px;color:#fff;font-size:12px;font-weight:700;border-radius:9999px;background:' + _statusColor(l.status).color + ';font-family:' + B.fontBody + '">' + (l.status||'ACTIVE') + '</span>' +
                        '<span style="position:absolute;top:12px;right:12px;padding:6px 16px;background:rgba(0,0,0,0.7);color:#fff;font-size:12px;font-weight:700;border-radius:9999px;font-family:' + B.fontBody + '"><i class="fas fa-door-open" style="margin-right:6px"></i>OPEN HOUSE</span></div>';
                }
                // Address + price bar
                h += '<div style="padding:24px 32px;background:' + B.navSolid + ';background-image:' + B.navBg + ';color:#fff;border-bottom:1px solid ' + B.navBorder + ';box-shadow:' + B.navInset + ',0 4px 24px rgba(0,0,0,0.15)">' +
                    '<div style="display:flex;align-items:center;justify-content:space-between">' +
                    '<div><h1 style="font-size:24px;font-weight:700;margin:0;font-family:' + B.fontDisplay + ';letter-spacing:-0.02em">' + _displayAddr(l) + '</h1>' +
                    '<p style="color:rgba(255,255,255,0.5);font-size:14px;margin:4px 0 0;font-family:' + B.fontBody + ';font-weight:300">' + _val(l.neighborhood) + ', NY ' + _val(l.zip) + '</p>';
                if (l.crossStreet) h += '<p style="color:rgba(255,255,255,0.4);font-size:12px;margin:2px 0 0;font-family:' + B.fontBody + ';font-weight:300">Cross: ' + l.crossStreet + '</p>';
                h += '</div><div style="text-align:right"><p style="font-size:24px;font-weight:700;margin:0;font-family:' + B.fontDisplay + '">' + _fmtPrice(l) + '</p>';
                var ohPsf = _priceSF(l);
                if (ohPsf) h += '<p style="color:' + B.goldBright + ';font-size:13px;margin:4px 0 0;font-family:' + B.fontBody + ';font-weight:300">' + ohPsf + '/SF</p>';
                h += '</div></div></div>';

                // Open House date/time
                h += '<div style="padding:20px 32px;background:' + B.goldTint + ';border-bottom:1px solid ' + B.goldGlow + '">' +
                    '<div style="display:flex;align-items:center;justify-content:center;gap:20px">' +
                    '<div style="text-align:center"><i class="fas fa-calendar-alt" style="font-size:28px;color:' + B.goldDeep + '"></i></div>' +
                    '<div><p style="font-size:18px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">Open House</p>' +
                    '<p style="font-size:14px;color:' + B.textLight + ';margin:4px 0 0;font-family:' + B.fontBody + ';font-weight:300">' + (_formatOpenHouse(l.nextOpenHouse) || 'Date & Time TBD \u2014 Contact Agent') + '</p></div></div></div>';

                // Stats
                var ohCols = [];
                ohCols.push('<div style="text-align:center;padding:14px;background:' + B.bg + ';border-radius:12px;border:1px solid ' + B.line + '"><p style="font-size:22px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + _val(l.beds) + '</p><p style="font-size:10px;color:' + B.muted + ';margin:4px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Bedrooms</p></div>');
                ohCols.push('<div style="text-align:center;padding:14px;background:' + B.bg + ';border-radius:12px;border:1px solid ' + B.line + '"><p style="font-size:22px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + _val(l.baths) + '</p><p style="font-size:10px;color:' + B.muted + ';margin:4px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Bathrooms</p></div>');
                ohCols.push('<div style="text-align:center;padding:14px;background:' + B.bg + ';border-radius:12px;border:1px solid ' + B.line + '"><p style="font-size:22px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + (l.intSqft ? l.intSqft.toLocaleString() : '') + '</p><p style="font-size:10px;color:' + B.muted + ';margin:4px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Square Feet</p></div>');
                if (ohPsf) ohCols.push('<div style="text-align:center;padding:14px;background:' + B.bg + ';border-radius:12px;border:1px solid ' + B.line + '"><p style="font-size:22px;font-weight:700;color:' + B.goldDeep + ';margin:0;font-family:' + B.fontDisplay + '">' + ohPsf + '</p><p style="font-size:10px;color:' + B.muted + ';margin:4px 0 0;text-transform:uppercase;letter-spacing:0.08em;font-family:' + B.fontBody + '">Price/SF</p></div>');
                h += '<div style="padding:24px 32px"><div style="display:grid;grid-template-columns:repeat(' + ohCols.length + ',1fr);gap:16px;margin-bottom:24px">' + ohCols.join('') + '</div>';

                // Description
                var ohDesc = _getDesc(l);
                if (ohDesc) {
                    if (ohDesc.length > 400) ohDesc = ohDesc.substring(0, 397) + '...';
                    h += '<div style="border:1px solid ' + B.line + ';border-radius:12px;padding:16px;margin-bottom:24px">' +
                        '<p style="font-size:13px;color:' + B.textLight + ';line-height:1.7;margin:0;font-family:' + B.fontBody + ';font-weight:300">' + ohDesc + '</p></div>';
                }

                // Links
                    // STEP 1 — the Google Map link that stood here is gone. It sent the
                    // property address in the query string of a third party's URL,
                    // out of an authenticated broker report. Two of the three sites
                    // emitted it regardless of the "Google Map Link" option, so a
                    // broker who left that box unchecked sent it anyway.
                    //
                    // Nothing replaces it: swapping Google for another outside
                    // location authority is the same dependency renamed. Mallan's
                    // map capability stays where it already lives — the
                    // MapLibre/OpenFreeMap panels in js/render/results-map.js and
                    // js/render/neighborhood-map.js. The report keeps the address.
                var ohLinks = '';
                ohLinks += '<span style="margin-right:16px;font-size:12px;font-family:' + B.fontBody + '"><i class="fas fa-link" style="color:' + B.gold + ';margin-right:4px"></i><a href="#" style="color:' + B.goldDeep + ';text-decoration:none">View on mallan.nyc</a></span>';
                if (l.virtualTourUrl) ohLinks += '<span style="font-size:12px;font-family:' + B.fontBody + '"><i class="fas fa-video" style="color:' + B.gold + ';margin-right:4px"></i><a href="' + l.virtualTourUrl + '" style="color:' + B.goldDeep + ';text-decoration:none">Virtual Tour</a></span>';
                h += '<div style="margin-bottom:24px">' + ohLinks + '</div>';

                // Agent contact card
                h += '<div style="display:flex;align-items:center;gap:20px;padding:20px;background:' + B.bg + ';border:1px solid ' + B.line + ';border-radius:16px">' +
                    '<div style="width:64px;height:64px;background:' + B.dark + ';border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
                    '<span style="color:' + B.goldBright + ';font-size:24px;font-weight:700;font-family:' + B.fontDisplay + '">M</span></div>' +
                    '<div><p style="font-size:16px;font-weight:700;color:' + B.text + ';margin:0;font-family:' + B.fontDisplay + '">' + agentInfo.name + '</p>' +
                    '<p style="font-size:13px;color:' + B.textLight + ';margin:2px 0 0;font-family:' + B.fontBody + ';font-weight:300">' + agentInfo.title + '</p>' +
                    '<p style="font-size:13px;color:' + B.textLight + ';margin:2px 0 0;font-family:' + B.fontBody + ';font-weight:300">' + agentInfo.company + '</p>' +
                    '<div style="display:flex;gap:16px;margin-top:8px;font-size:13px;font-family:' + B.fontBody + '">' +
                    '<span style="color:' + B.goldDeep + '"><i class="fas fa-phone" style="margin-right:4px"></i>' + agentInfo.phone + '</span>' +
                    '<span style="color:' + B.goldDeep + '"><i class="fas fa-envelope" style="margin-right:4px"></i>' + agentInfo.email + '</span></div></div></div></div>';
                h += _brokerFooter();
                return h;
            }

            // ══════════════════════════════════════════════════════
            // SECTION 8: IMAGES (per listing)
            // ══════════════════════════════════════════════════════
            function _imagesSection() {
                var h = '';
                listings.forEach(function(l, idx) {
                    h += _pageBreak() + (idx === 0 ? _sectionDivider('Images Report') : '');
                    if (idx === 0) h += _headerBlock('Property Images Report') + _agentClientBar();

                    h += '<div style="padding:24px 32px">';
                    // Header with address + stats
                    var imgStats = _fmtPrice(l) + ' | ' + _val(l.beds) + ' BR / ' + _val(l.baths) + ' BA';
                    if (l.intSqft) imgStats += ' | ' + l.intSqft.toLocaleString() + ' SF';
                    var imgPsf = _priceSF(l);
                    if (imgPsf) imgStats += ' | ' + imgPsf + '/SF';
                    imgStats += ' | DOM: ' + _val(l.dom);
                    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid ' + B.line + '">' +
                        '<div><h3 style="font-weight:700;color:' + B.text + ';margin:0;font-size:14px;font-family:' + B.fontDisplay + '">' + _displayAddr(l) + '</h3>' +
                        '<p style="font-size:12px;color:' + B.muted + ';margin:2px 0 0;font-family:' + B.fontBody + ';font-weight:300">' + imgStats + '</p></div>' +
                        '<span style="padding:4px 12px;background:' + B.goldTint + ';color:' + B.goldDeep + ';font-size:11px;border-radius:9999px;font-weight:600;font-family:' + B.fontBody + '"><i class="fas fa-images" style="margin-right:4px"></i>' + (l.photoCount || _getListingPhotos(l).length || 0) + ' photos</span></div>';

                    // Photo grid
                    h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">';
                    // Same rule as reports.js, from the same shared helper. This file
                    // is not referenced by any HTML page today, so it does not execute —
                    // fixed anyway so the defect cannot arrive with a future wire-up.
                    var imgArr = typeof reportPhotoTiles === 'function' ? reportPhotoTiles(l) : _getListingPhotos(l).slice(0, 9);
                    for (var pi = 0; pi < imgArr.length; pi++) {
                        var span = pi === 0 ? 'grid-column:span 2;grid-row:span 2;' : '';
                        var imgHgt = pi === 0 ? '240px' : '112px';
                        var imgUrl = imgArr[pi].url;
                        if (imgUrl) {
                            h += '<div style="' + span + 'height:' + imgHgt + ';border-radius:8px;overflow:hidden;position:relative;background:#f1f5f9">' +
                                '<img src="' + imgUrl + '" alt="" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '">' +
                                '<span style="position:absolute;bottom:4px;right:6px;font-size:10px;color:rgba(255,255,255,0.8);background:rgba(0,0,0,0.5);padding:1px 4px;border-radius:2px;font-family:' + B.fontBody + '">' + (pi+1) + '</span></div>';
                        }
                    }
                    h += '</div>';

                    // Floor plans notice (suppressed for off-market — only primary photo remains)
                    var hasFloorPlans = !_isOffMarket(l) && (l.images || []).some(function(img) { return img.mediaCategory === 'FloorPlan' || img.imageOf === 'FloorPlan'; });
                    if (hasFloorPlans) {
                        h += '<p style="font-size:11px;color:' + B.muted + ';margin:12px 0;font-style:italic;font-family:' + B.fontBody + ';font-weight:300"><i class="fas fa-drafting-compass" style="margin-right:4px;color:' + B.gold + '"></i>Floor plans available upon request</p>';
                    }

                    // Company/Agent
                    if (!isCustomer) {
                        h += '<div style="margin-top:8px;font-size:11px;color:' + B.muted + ';font-family:' + B.fontBody + ';font-weight:300">' + _val(l.company) + ' \u2014 ' + _val(l.agentName) + '</div>';
                    }
                    // Per-listing attribution (Art. III Sec. 2C)
                    h += _listingAttribution(l);
                    h += '</div>';

                    // Footer on last listing only
                    if (idx === listings.length - 1) {
                        h += '<div style="padding:12px 32px;background:' + B.bg + ';border-top:1px solid ' + B.line + ';font-size:11px;color:' + B.muted + ';text-align:center;font-family:' + B.fontBody + ';font-weight:300">' +
                            '<p style="margin:0">Listing(s) courtesy of the REBNY Listing Service (RLS). Equal Housing Opportunity.</p></div>';
                        h += _brokerFooter();
                    }
                });
                return h;
            }

            // ══════════════════════════════════════════════════════
            // ASSEMBLE ALL SECTIONS
            // ══════════════════════════════════════════════════════

            // Print CSS (embedded at top of output)
            // NOTE: Fonts are loaded via <link> tags in the iframe <head> — NOT @import here
            var printCSS = '<style>' +
                '*,*::before,*::after{box-sizing:border-box}' +
                'body{margin:0;padding:0;font-family:Inter,system-ui,-apple-system,sans-serif;font-weight:300;color:#0A0A0A;background:#fff;width:7.3in;max-width:7.3in}' +
                'h1,h2,h3,h4{font-family:Urbanist,system-ui,-apple-system,sans-serif}' +
                'img{max-width:100%;height:auto}' +
                'table{table-layout:fixed;width:100%;border-collapse:collapse}' +
                'td,th{overflow:hidden;text-overflow:ellipsis;word-break:normal;overflow-wrap:break-word}' +
                'a{overflow-wrap:anywhere}' +
                '@page{margin:0.6in;size:letter portrait}' +
                '@media print{' +
                '.pkg-section{page-break-before:always}' +
                '.pkg-section:first-child{page-break-before:auto}' +
                '.pkg-per-listing{page-break-before:always}' +
                '.pkg-no-break{break-inside:avoid;page-break-inside:avoid}' +
                'table{page-break-inside:auto}' +
                'tr{break-inside:avoid;page-break-inside:avoid}' +
                'img{max-width:100%}' +
                '*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}' +
                '}' +
                '</style>';

            var html = printCSS;
            html += _gridSection();
            html += _summarySection();
            html += _detailSection();
            html += _imagesSection();

            return html;
        }
