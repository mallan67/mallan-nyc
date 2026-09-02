
        /**
         * A FEE WE DO NOT KNOW IS NOT A FEE OF ZERO.
         *
         * The FARE Act disclosure rendered `'$' + (f.applicationFee || 0)`, so an
         * ABSENT application fee printed "App fee: $0" — telling a renter there
         * is no application fee, inside the disclosure that exists to state fees
         * truthfully. NYC LL 119/2024 carries $1,800-$2,000 per violation, and
         * this is that surface.
         *
         * `||` also cannot tell the two apart in the other direction: a genuine
         * $0 fee is falsy and took the same branch, so "unknown" and "free" were
         * rendered identically and neither could be trusted.
         *
         * Unknown says so. A real zero still says $0, because that is a real and
         * useful fact about a rental.
         */
        function fareFeeAmount(value) {
            if (value === null || value === undefined || value === '') return 'Not stated';
            var n = Number(value);
            if (isNaN(n)) return 'Not stated';
            return '$' + n.toLocaleString();
        }

        // ── FARE Act Fee Disclosure Helper (NYC Local Law, eff. June 2025) ──
        function fareActDisclosure(listing) {
            if (listing.listingCategory !== 'rental' || !listing.fareActFees) return '';
            var f = listing.fareActFees;
            return '<div class="text-[10px] bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-1.5" data-compliance="fare-act">'
                + '<i class="fas fa-receipt text-amber-400 mr-1"></i>'
                + '<strong>Fee Disclosure:</strong> Broker fee paid by <strong><span data-fare-field="BrokerFeePaidBy">' + (f.brokerFeePaidBy || 'Not stated') + '</span></strong>'
                + ' &middot; App fee: <span data-fare-field="ApplicationFee">' + fareFeeAmount(f.applicationFee) + '</span>'
                + (f.moveInFees ? ' &middot; Move-in: <span data-fare-field="MoveInFees">' + f.moveInFees + '</span>' : '')
                + (f.otherFees ? ' &middot; Other: <span data-fare-field="OtherFees">' + f.otherFees + '</span>' : '')
                + '</div>';
        }

        // ── Participant Only Badge Helper (UCBA Art. I Sec. 4, Rule A4/H4) ──
        // Replaces inline PO badge code across all 6 views
        function participantOnlyBadge(listing) {
            if (!listing.permissions || !listing.permissions.participantOnly) return '';
            return '<span class="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[9px] font-bold"'
                + ' data-reso-field="InternetEntireListingDisplayYN" data-reso-value="false"'
                + ' data-compliance="participant-only"'
                + ' title="UCBA H4: Participant Only — restricted to RLS participants. DOM exempt (Rule A4)."'
                + '>RLS ONLY</span>';
        }

        // ── Coming Soon Badge Helper — full version (Gallery/ShortSum/Summary/MasterDetail) ──
        // UCBA Art. I Sec. 5(C): No showings, open houses, or negotiations. D7/D2/D1.
        function comingSoonBadge(listing) {
            if (listing.status !== 'ComingSoon') return '';
            var dateTag = listing.comingSoonDate ? ' <span' + resoData('comingSoonDate', listing.comingSoonDate) + '>' + listing.comingSoonDate + '</span>' : '';
            return '<div class="bg-purple-50 border-b border-purple-200 px-3 py-1.5 text-xs text-purple-700 font-semibold"'
                + ' data-reso-field="MlsStatus" data-reso-value="ComingSoon"'
                + ' data-compliance="coming-soon-badge"'
                + ' title="UCBA D7: Coming Soon — max 14 days (D2). Sales only (D1). No showings, no open houses, no negotiations. Unsolicited offers may be conveyed."'
                + '><i class="fas fa-clock mr-1"></i> Coming Soon'
                + (listing.comingSoonDate ? ' &mdash; No Showings or Open House Until ' + dateTag : '')
                + ' <i class="fas fa-info-circle ml-1 opacity-50"></i>'
                + '</div>';
        }

        // ── Coming Soon Badge — compact version (Grid/Map) ──
        function comingSoonBadgeCompact(listing) {
            if (listing.status !== 'ComingSoon') return '';
            return '<span class="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[9px] font-bold"'
                + ' data-reso-field="MlsStatus" data-reso-value="ComingSoon"'
                + ' data-compliance="coming-soon-badge"'
                + ' title="UCBA D7: Coming Soon — max 14 days. No showings or open houses until ' + (listing.comingSoonDate || 'active date') + '."'
                + '>CS' + (listing.comingSoonDate ? ' ' + listing.comingSoonDate : '')
                + '</span>';
        }

        // ── Syndication Badge Helper (Gate 4) ──
        // UCBA: SyndicateYN=false → listing not distributed to third-party portals.
        // Listing still appears in IDX search. Badge informs agent of distribution status.
        function syndicationBadge(listing) {
            var perm = listing.permissions || {};
            if (perm.syndication !== false && listing.syndicateYN !== false) return '';
            return '<span class="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[9px] font-bold"'
                + ' data-reso-field="SyndicateTo" data-reso-value="None"'
                + ' data-compliance="syndication-gate"'
                + ' title="SyndicateYN=false — this listing is not distributed to third-party syndication portals (StreetEasy, Zillow, etc.)."'
                + '>NOT SYNDICATED</span>';
        }

        // ── Syndication Badge — compact version (Grid/Map) ──
        function syndicationBadgeCompact(listing) {
            var perm = listing.permissions || {};
            if (perm.syndication !== false && listing.syndicateYN !== false) return '';
            return '<span class="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[9px] font-bold"'
                + ' data-reso-field="SyndicateTo" data-reso-value="None"'
                + ' data-compliance="syndication-gate"'
                + ' title="Not distributed to third-party portals"'
                + '>NS</span>';
        }

        // ── Coming Soon Showing Block Helper (Gate 5) ──
        // Returns a text notice for Coming Soon listings: "No Showings or Open House until [date]"
        // Used in detail views and action bars to inform agent that showings are blocked.
        function comingSoonShowingNotice(listing) {
            if (listing.status !== 'ComingSoon') return '';
            var dateStr = listing.comingSoonDate || 'active date';
            return '<div class="bg-purple-50 border border-purple-200 rounded px-2.5 py-1.5 text-xs text-purple-700 font-medium"'
                + ' data-reso-field="MlsStatus" data-reso-value="ComingSoon"'
                + ' data-compliance="coming-soon-showing-block"'
                + ' title="UCBA Art. I Sec. 5(C): No showings, open houses, or negotiations until listing is active."'
                + '><i class="fas fa-ban mr-1 text-purple-400"></i>'
                + 'Coming Soon. No Showings or Open House until ' + dateStr + '.'
                + '</div>';
        }

        // ── Helper: is listing Coming Soon? ──
        // Used to conditionally disable Schedule Showing buttons across views.
        function isComingSoon(listing) {
            if (listing.status === 'ComingSoon') return true;
            if (listing.comingSoonDate) {
                var csDate = new Date(listing.comingSoonDate);
                if (!isNaN(csDate.getTime()) && csDate > new Date()) return true;
            }
            return false;
        }

        // ── Listing Freshness Indicator (#3) ──
        // Color-coded freshness: green 0-3d, default 4-14d, yellow 15-30d, red 30+
        function listingFreshness(listing) {
            if (!listing.updatedDate) return '';
            var updated = new Date(listing.updatedDate);
            var now = new Date();
            var days = Math.floor((now - updated) / (1000 * 60 * 60 * 24));
            var color, label;
            if (days <= 3) { color = 'text-green-600'; label = 'Fresh'; }
            else if (days <= 14) { color = 'text-gray-500'; label = days + 'd ago'; }
            else if (days <= 30) { color = 'text-yellow-600'; label = days + 'd ago'; }
            else { color = 'text-red-600'; label = days + 'd ago'; }
            return '<span class="text-[9px] ' + color + '"'
                + resoData('updatedDate', listing.updatedDate)
                + ' data-compliance="freshness-indicator"'
                + ' title="Last updated: ' + listing.updatedDate + ' (' + days + ' days ago)"'
                + '><i class="fas fa-clock mr-0.5"></i>' + label + '</span>';
        }

        // ── Client Feedback Icons (Like/Dislike) ──
        // Visible only when a client is assigned via Assign Customer dropdown.
        // Icons must be INSIDE the listing card div that carries data-source="REBNY-RLS".
        // Like/dislike is agent-entered metadata (not RLS data) — no RESO tagging required.
        function clientFeedbackIcons(listing) {
            if (!currentWorkspaceClientId) return '';
            var status = (typeof getClientFeedbackStatus === 'function') ? getClientFeedbackStatus(listing.id) : null;
            var isLiked = status === 'liked';
            var isDisliked = status === 'disliked';
            return '<div class="client-feedback-icons flex items-center gap-1">'
                + '<button onclick="event.stopPropagation(); markClientFeedback(' + listing.id + ', \'liked\')"'
                + ' class="w-7 h-7 rounded-full flex items-center justify-center text-xs hover:bg-green-100 transition-colors ' + (isLiked ? 'bg-green-100 text-green-600' : 'text-gray-300') + '"'
                + ' title="' + (isLiked ? 'Remove like' : 'Client likes this') + '">'
                + '<i class="fas fa-thumbs-up"></i>'
                + '</button>'
                + '<button onclick="event.stopPropagation(); markClientFeedback(' + listing.id + ', \'disliked\')"'
                + ' class="w-7 h-7 rounded-full flex items-center justify-center text-xs hover:bg-red-100 transition-colors ' + (isDisliked ? 'bg-red-100 text-red-600' : 'text-gray-300') + '"'
                + ' title="' + (isDisliked ? 'Remove dislike' : 'Client dislikes this') + '">'
                + '<i class="fas fa-thumbs-down"></i>'
                + '</button>'
                + '</div>';
        }

        // ── DOM Display with Color Coding (#16) ──
        // Color: green 0-14d, gray 15-30d, yellow 31-60d, orange 61-90d, red 90+
        // PO/CS → exempt. TOM/Withdrawn → paused. Closed/Sold/Leased → stopped.
        function domDisplay(listing) {
            var dom = listing.dom;
            if (dom == null) return '<span class="text-xs text-gray-400">--</span>';
            var status = 'accruing';
            if (listing.permissions && listing.permissions.participantOnly) status = 'exempt';
            else if (listing.status === 'ComingSoon' || listing.status === 'ComingSoon') status = 'exempt';
            else if (listing.status === 'Temp Off Market' || listing.status === 'WITHDRAWN' || listing.status === 'Withdrawn') status = 'paused';
            else if (listing.status === 'Closed' || listing.status === 'Sold' || listing.status === 'Leased') status = 'stopped';

            var color;
            if (status === 'exempt') color = '#9ca3af';
            else if (status === 'paused') color = '#9ca3af';
            else if (status === 'stopped') color = '#6b7280';
            else if (dom <= 14) color = '#16a34a';
            else if (dom <= 30) color = '#9ca3af';
            else if (dom <= 60) color = '#ca8a04';
            else if (dom <= 90) color = '#ea580c';
            else color = '#dc2626';

            var statusLabel = status === 'exempt' ? ' (exempt)' : status === 'paused' ? ' (paused)' : status === 'stopped' ? ' (final)' : '';
            return '<span class="text-xs font-semibold" style="color:' + color + '"'
                + resoData('dom', dom)
                + ' data-dom-status="' + status + '"'
                + ' title="Days on Market: ' + dom + statusLabel + '"'
                + '>' + dom + 'd' + statusLabel + '</span>';
        }

