        // ═══════════════════════════════════════════════════════════════════════════════
        // REPORTS MODAL FUNCTIONS — reportState-driven
        // ═══════════════════════════════════════════════════════════════════════════════

        // ── Sync reportState → UI (highlight tiles, check boxes) ──
        function renderReportSelections() {
            // Format tiles
            document.querySelectorAll('[data-step="format"] .report-tile').forEach(function(btn) {
                var sel = btn.dataset.value === reportState.format;
                btn.classList.toggle('border-2', sel);
                btn.classList.toggle('border-blue-600', sel);
                btn.classList.toggle('bg-blue-50', sel);
                if (!sel) { btn.classList.remove('border-2'); btn.classList.add('border'); }
                else { btn.classList.remove('border'); }
                var icon = btn.querySelector('i');
                if (icon) { icon.classList.toggle('text-blue-600', sel); icon.classList.toggle('text-gray-400', !sel); }
                var label = btn.querySelector('p');
                if (label) { label.classList.toggle('font-semibold', sel); }
            });
            // Version tiles
            document.querySelectorAll('[data-step="version"] .report-tile').forEach(function(btn) {
                var sel = btn.dataset.value === reportState.version;
                btn.classList.toggle('border-blue-600', sel);
                btn.classList.toggle('bg-blue-50', sel);
                var icon = btn.querySelector('i');
                if (icon) { icon.classList.toggle('text-blue-600', sel); icon.classList.toggle('text-gray-400', !sel); }
            });
            // Output tiles
            document.querySelectorAll('[data-step="output"] .report-tile').forEach(function(btn) {
                var sel = btn.dataset.value === reportState.output;
                btn.classList.toggle('border-blue-600', sel);
                btn.classList.toggle('bg-blue-50', sel);
                var icon = btn.querySelector('i');
                if (icon) { icon.classList.toggle('text-blue-600', sel); icon.classList.toggle('text-gray-400', !sel); }
                var label = btn.querySelector('p');
                if (label) { label.classList.toggle('text-blue-600', sel); label.classList.toggle('text-gray-400', !sel); }
            });
            // Optional content checkboxes (both main and media sections)
            document.querySelectorAll('#optionalContentOptions input[data-option], #mediaContentOptions input[data-option]').forEach(function(cb) {
                cb.checked = !!reportState.options[cb.dataset.option];
            });
            // Fact Sheet options
            var fsCountEl = document.getElementById('fsPhotoCount');
            if (fsCountEl) fsCountEl.value = reportState.options.factSheetPhotoCount || 4;
            setFsLayout(reportState.options.factSheetPhotoLayout || 'vertical');
            // Show/hide photo layout options (Fact Sheet + Detail)
            var fsSection = document.getElementById('factSheetOptionsSection');
            if (fsSection) {
                if (reportState.format === 'factSheet' || reportState.format === 'detail') fsSection.classList.remove('hidden');
                else fsSection.classList.add('hidden');
            }
            // Sort radio
            var sortRadio = document.querySelector('input[name="reportSort"][value="' + reportState.sort.key + '"]');
            if (sortRadio) sortRadio.checked = true;
            // Title & preparedFor
            var titleEl = document.getElementById('reportTitle');
            if (titleEl && reportState.title) titleEl.value = reportState.title;
            var pfEl = document.getElementById('reportPreparedFor');
            if (pfEl && reportState.preparedFor) pfEl.value = reportState.preparedFor;
        }

        // ── Sync UI → reportState (read all inputs) ──
        function syncUIToReportState() {
            reportState.title = (document.getElementById('reportTitle') || {}).value || 'Property Report';
            reportState.preparedFor = (document.getElementById('reportPreparedFor') || {}).value || '';
            // Options from checkboxes
            document.querySelectorAll('#optionalContentOptions input[data-option], #mediaContentOptions input[data-option]').forEach(function(cb) {
                reportState.options[cb.dataset.option] = cb.checked;
            });
            // Fact Sheet options
            var fsCountEl = document.getElementById('fsPhotoCount');
            if (fsCountEl) reportState.options.factSheetPhotoCount = parseInt(fsCountEl.value) || 4;
            // Layout is already synced via setFsLayout onclick
            // Description editor
            var descEl = document.getElementById('reportDescriptionEditor');
            if (descEl) reportState.customDescription = descEl.value;
            // Sort from radio
            var sortRadio = document.querySelector('input[name="reportSort"]:checked');
            if (sortRadio) reportState.sort.key = sortRadio.value;
        }

        // ── Description editor helpers ──
        function populateReportDescription() {
            var descEl = document.getElementById('reportDescriptionEditor');
            var countEl = document.getElementById('reportDescCharCount');
            if (!descEl) return;
            // Get description from first selected listing
            var allListings = searchResultsState.filteredListings || listings;
            var selIds = reportState.selectedListingIds || [];
            var listing = null;
            if (selIds.length > 0) {
                listing = allListings.find(function(l) { return selIds.indexOf(l.id) > -1; });
            }
            var desc = listing ? (listing.description || '') : '';
            reportState.originalDescription = desc;
            if (!reportState.customDescription) reportState.customDescription = desc;
            descEl.value = reportState.customDescription;
            if (countEl) countEl.textContent = descEl.value.length + ' characters';
            // Live character count
            descEl.oninput = function() {
                reportState.customDescription = this.value;
                if (countEl) countEl.textContent = this.value.length + ' characters';
            };
        }
        function resetReportDescription() {
            reportState.customDescription = reportState.originalDescription || '';
            var descEl = document.getElementById('reportDescriptionEditor');
            var countEl = document.getElementById('reportDescCharCount');
            if (descEl) descEl.value = reportState.customDescription;
            if (countEl) countEl.textContent = reportState.customDescription.length + ' characters';
        }

        // ── Helper: get listing description (uses custom if edited) ──
        function getReportDescription(listing) {
            if (reportState.customDescription && reportState.customDescription !== reportState.originalDescription) {
                return reportState.customDescription;
            }
            return listing.description || '';
        }

        // ── Render validation errors ──
        function renderReportErrors(errors) {
            var el = document.getElementById('reportErrors');
            if (!el) return;
            if (!errors || !errors.length) { el.classList.add('hidden'); el.textContent = ''; return; }
            el.classList.remove('hidden');
            el.innerHTML = '<ul class="list-disc pl-4 space-y-1">' + errors.map(function(e) { return '<li>' + e + '</li>'; }).join('') + '</ul>';
        }

        // ── REBNY/IDX compliance validation ──
        function validateReportState() {
            var errors = [];

            // A report LEAVES the CRM — CSV, Excel, a public shareable link, a
            // printed sheet, an email to a client. It may only ever be built
            // from a completed search.
            //
            // This gate used to ask only whether the rows may be DISPLAYED
            // (IDX / internet opt-out). It never asked whether they were an
            // ANSWER. So when a server search failed and the local preview rows
            // stayed on screen, a report built from them validated cleanly and
            // could be published or emailed to a client as search results.
            //
            // Deliberately keyed on `searchResultsAreStale()`, not on
            // `!hasAuthoritativeSearchResults()`: reporting over the loaded
            // catalogue BEFORE any search is existing behaviour and is not what
            // this fixes.
            if (typeof searchResultsAreStale === 'function' && searchResultsAreStale()) {
                errors.push(
                    'These rows are a preview, not a completed search — run the search again before ' +
                    'generating a report. A failed or in-flight search cannot be delivered to a client.'
                );
            }

            if (reportState.selectedListingIds.length === 0) errors.push('Select at least 1 listing.');
            if (reportState.selectedListingIds.length > 250) errors.push('Maximum 250 listings allowed per report.');
            // Compliance: block agent-only comments in CSV/Excel customer export
            if ((reportState.output === 'csv' || reportState.output === 'excel') && reportState.version === 'customer') {
                if (reportState.options.customAgentComments) errors.push('Custom Agent Comments cannot be exported in Customer CSV/Excel (IDX restriction).');
                if (reportState.options.importPersonalComments) errors.push('Personal Comments cannot be exported in Customer CSV/Excel (IDX restriction).');
            }
            // Block prohibited fields in customer version (UCBA + NAR settlement compliance)
            if (reportState.version === 'customer') {
                if (reportState.options.commentsAboutCustomer) errors.push('"Comments About Customer" is agent-only and cannot appear in Customer version.');
                // Commission data must NEVER appear in customer-facing reports (NAR settlement / UCBA decoupling)
                if (reportState.options.buyerCommission) {
                    errors.push('Commission data cannot appear in Customer version (UCBA Art. I Sec. 5).');
                    reportState.options.buyerCommission = false;
                }
                if (reportState.options.listingContact) {
                    // listingContact is allowed but agent-specific commission info must be stripped
                }
            }
            // Check IDX opt-out listings
            var allListings = searchResultsState.filteredListings || listings;
            var selectedIds = reportState.selectedListingIds;
            var selectedListings = selectedIds.length > 0
                ? allListings.filter(function(l) { return selectedIds.indexOf(l.id) > -1; })
                : allListings;
            var optedOut = selectedListings.filter(function(l) { return l.idxDisplayYN === false || l.internetDisplayYN === false; });
            if (optedOut.length > 0 && optedOut.length === selectedListings.length) {
                errors.push('All selected listings have display opted out (IDX or Internet) — cannot generate report.');
            } else if (optedOut.length > 0) {
                // Warning, not blocker — they'll be filtered out
            }
            return errors;
        }

        // ── Open / Close modal ──
        function openReportsModal(selectedIds, presetOutput) {
            // Enforce 250 cap at selection model
            var allListings = searchResultsState.filteredListings || listings;
            var selIds = selectedIds || searchResultsState.selectedListings || [];
            reportState.selectedListingIds = selIds.slice(0, 250);

            // Update counts in Sort Order tab
            var allEl = document.getElementById('reportAllCount');
            var selEl = document.getElementById('reportSelectedCount');
            if (allEl) allEl.textContent = Math.min(allListings.length, 250);
            if (selEl) selEl.textContent = reportState.selectedListingIds.length;
            // Update Picked/Liked counts from listingFlags
            var flags = typeof listingFlags !== 'undefined' ? listingFlags : {};
            var pickedEl = document.getElementById('reportPickedCount');
            var likedEl = document.getElementById('reportLikedCount');
            if (pickedEl) pickedEl.textContent = allListings.filter(function(l) { return flags[l.id] && flags[l.id].picked; }).length;
            if (likedEl) likedEl.textContent = allListings.filter(function(l) { return flags[l.id] && flags[l.id].liked; }).length;

            // Auto-select "Selected Only" if there are selected listings
            if (reportState.selectedListingIds.length > 0) {
                var selRadio = document.querySelector('input[name="reportSelection"][value="selected"]');
                if (selRadio) selRadio.checked = true;
            } else {
                // Default: use all results (capped at 250)
                reportState.selectedListingIds = allListings.slice(0, 250).map(function(l) { return l.id; });
                var allRadio = document.querySelector('input[name="reportSelection"][value="all"]');
                if (allRadio) allRadio.checked = true;
            }

            // Pre-select output type if specified (e.g., 'print' from Print button)
            if (presetOutput) {
                reportState.output = presetOutput;
            }

            reportState.customDescription = '';
            reportState.originalDescription = '';
            renderReportSelections();
            renderReportErrors([]);
            populateReportDescription();
            document.getElementById('reportsModal').classList.remove('hidden');
        }

        function closeReportsModal() {
            document.getElementById('reportsModal').classList.add('hidden');
        }

        // ── Tab switching ──
        function switchReportTab(tab) {
            ['General', 'Customize', 'SortOrder'].forEach(function(t) {
                var btn = document.getElementById('reportTab' + t);
                if (btn) { btn.classList.remove('bg-blue-600', 'text-white'); btn.classList.add('text-gray-300'); }
            });
            var tabMap = { general: 'General', customize: 'Customize', sortOrder: 'SortOrder' };
            var activeBtn = document.getElementById('reportTab' + (tabMap[tab] || 'General'));
            if (activeBtn) { activeBtn.classList.remove('text-gray-300'); activeBtn.classList.add('bg-blue-600', 'text-white'); }

            document.getElementById('reportGeneralOptions').classList.add('hidden');
            document.getElementById('reportCustomizeOptions').classList.add('hidden');
            document.getElementById('reportSortOrderOptions').classList.add('hidden');

            if (tab === 'general') document.getElementById('reportGeneralOptions').classList.remove('hidden');
            if (tab === 'customize') document.getElementById('reportCustomizeOptions').classList.remove('hidden');
            if (tab === 'sortOrder') document.getElementById('reportSortOrderOptions').classList.remove('hidden');
        }

        // ── Options that should be OFF for Customer version ──
        var AGENT_ONLY_OPTIONS = ['commentsAboutCustomer', 'importPersonalComments', 'customAgentComments', 'listingTypeCompany', 'listingContact', 'appointmentTime', 'acrisLink'];

        // Apply version-appropriate defaults to options
        function applyVersionDefaults(version) {
            // Try loading saved defaults first
            var agentId = typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.id : 'default';
            var saved = localStorage.getItem('reportDefaults_' + version + '_' + agentId);
            if (saved) {
                try {
                    var savedOpts = JSON.parse(saved);
                    Object.keys(savedOpts).forEach(function(k) {
                        if (reportState.options.hasOwnProperty(k)) {
                            reportState.options[k] = savedOpts[k];
                        }
                    });
                    return;
                } catch(e) {}
            }
            // No saved defaults — use built-in defaults
            if (version === 'customer') {
                AGENT_ONLY_OPTIONS.forEach(function(k) {
                    reportState.options[k] = false;
                });
            }
        }

        // Toggle all optional content checkboxes on/off
        function toggleAllReportOptions(checkAll) {
            Object.keys(reportState.options).forEach(function(k) {
                if (k === 'factSheetPhotoCount' || k === 'factSheetPhotoLayout') return;
                // Always keep fullListingAddress on when checking all
                if (k === 'fullListingAddress') { reportState.options[k] = true; return; }
                // streetNameOnly is mutually exclusive with fullListingAddress
                if (k === 'streetNameOnly') { reportState.options[k] = false; return; }
                reportState.options[k] = checkAll;
            });
            // Apply version restrictions (hide agent-only in customer mode)
            applyVersionDefaults(reportState.version);
            renderReportSelections();
        }

        // Save current options as defaults for a version
        function saveReportDefaults() {
            var version = reportState.version || 'customer';
            var agentId = typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.id : 'default';
            syncUIToReportState();
            localStorage.setItem('reportDefaults_' + version + '_' + agentId, JSON.stringify(reportState.options));
            showReportToast('Defaults saved for ' + version + ' version');
        }

        // ── Fact Sheet layout toggle ──
        function setFsLayout(layout) {
            reportState.options.factSheetPhotoLayout = layout;
            var vBtn = document.getElementById('fsLayoutVertical');
            var hBtn = document.getElementById('fsLayoutHorizontal');
            if (vBtn && hBtn) {
                if (layout === 'vertical') {
                    vBtn.className = 'px-3 py-1.5 text-xs font-semibold rounded border-2 border-blue-600 bg-blue-50 text-blue-600';
                    hBtn.className = 'px-3 py-1.5 text-xs font-semibold rounded border text-gray-500 hover:border-blue-300';
                } else {
                    hBtn.className = 'px-3 py-1.5 text-xs font-semibold rounded border-2 border-blue-600 bg-blue-50 text-blue-600';
                    vBtn.className = 'px-3 py-1.5 text-xs font-semibold rounded border text-gray-500 hover:border-blue-300';
                }
            }
        }

        // ── Delegated tile click handler ──
        document.addEventListener('click', function(e) {
            var tile = e.target.closest('.report-tile');
            if (!tile) return;
            var stepWrap = tile.closest('[data-step]');
            if (!stepWrap) return;
            var step = stepWrap.dataset.step;
            var val = tile.dataset.value;
            if (step === 'format') {
                reportState.format = val;
                // Version restrictions still apply when switching formats
                if (val === 'detail' || val === 'factSheet') {
                    applyVersionDefaults(reportState.version);
                }
                // Show/hide photo layout options (Fact Sheet + Detail)
                var fsSection = document.getElementById('factSheetOptionsSection');
                if (fsSection) {
                    if (val === 'factSheet' || val === 'detail') fsSection.classList.remove('hidden');
                    else fsSection.classList.add('hidden');
                }
            }
            if (step === 'version') {
                reportState.version = val;
                applyVersionDefaults(val);
            }
            if (step === 'output') {
                reportState.output = val;
                // Show/hide email recipient section
                var recipientSec = document.getElementById('reportEmailRecipientSection');
                if (recipientSec) {
                    if (val === 'email') {
                        recipientSec.classList.remove('hidden');
                        populateReportRecipientDropdown();
                    } else {
                        recipientSec.classList.add('hidden');
                    }
                }
            }
            renderReportSelections();
            // Auto-refresh preview if open
            var previewModal = document.getElementById('reportPreviewModal');
            if (previewModal && !previewModal.classList.contains('hidden')) {
                try { populateReportPreview(); } catch(e) { /* silent */ }
            }
        });

        // ── Delegated option checkbox handler ──
        document.addEventListener('change', function(e) {
            var cb = e.target.closest('[data-option]');
            if (!cb) return;
            if (reportState.options.hasOwnProperty(cb.dataset.option)) {
                reportState.options[cb.dataset.option] = cb.checked;
            }
        });

        // ── Preview report (validate first) ──
        function previewReport() {
            syncUIToReportState();
            var errors = validateReportState();
            if (errors.length) { renderReportErrors(errors); return; }
            renderReportErrors([]);
            // Set email context so Send to Client / Email Report buttons work from preview
            var prepFor = (document.getElementById('reportPreparedFor') || {}).value || 'Client';
            var ttl = (document.getElementById('reportTitle') || {}).value || 'Property Report';
            var listings = getReportListings ? getReportListings() : [];
            window._reportEmailContext = { title: ttl, preparedFor: prepFor, count: listings.length };
            document.getElementById('reportPreviewModal').classList.remove('hidden');
            switchPreviewFormat(reportState.format);
            try {
                populateReportPreview();
            } catch(err) {
                console.error('Report generation error:', err);
                var errEl = document.getElementById('previewGrid');
                if (errEl) errEl.innerHTML = '<div style="padding:40px;text-align:center"><p style="color:#dc2626;font-weight:700;margin-bottom:8px">Report Generation Error</p><p style="font-size:13px;color:#4b5563">' + String(err.message || err) + '</p></div>';
            }
        }

        // ── Report Helper Functions ──
        function getOptionalContentConfig() {
            return Object.assign({}, reportState.options);
        }

        function getSelectedReportFields() {
            var fields = [];
            var container = currentReportFieldType === 'sale' ? 'reportSalesFields' :
                             currentReportFieldType === 'rental' ? 'reportRentalFields' : 'reportBuildingFields';
            document.querySelectorAll('#' + container + ' .report-field:checked').forEach(function(cb) {
                if (cb.dataset.field) fields.push(cb.dataset.field);
            });
            return fields;
        }

        function getSortedListings(listingsArr) {
            var sortKey = reportState.sort.key || 'price';
            var sorted = listingsArr.slice();
            sorted.sort(function(a, b) {
                switch (sortKey) {
                    case 'price': return (a.price || 0) - (b.price || 0);
                    case 'priceDesc': return (b.price || 0) - (a.price || 0);
                    case 'address': return (a.address || '').localeCompare(b.address || '');
                    case 'listedDate':
                        var da = a.listedDate ? new Date(a.listedDate) : new Date(0);
                        var db = b.listedDate ? new Date(b.listedDate) : new Date(0);
                        return db - da;
                    case 'dom': return (a.dom || 0) - (b.dom || 0);
                    case 'beds': return (a.beds || 0) - (b.beds || 0);
                    case 'sqft': return (b.intSqft || 0) - (a.intSqft || 0);
                    default: return 0;
                }
            });
            return sorted;
        }

        // ── Field label map for Grid/CSV/Excel column headers ──
        var reportFieldLabels = {
            listingType:'Listing Type',status:'Status',price:'Price',maintCC:'Maint/CC',reTaxes:'RE Taxes',
            totalMonthly:'Total Monthly',availableDate:'Available Date',exclusiveStartDate:'Exclusive Start',
            exclusiveEndDate:'Exclusive End',virtualTourUrl:'Virtual Tour',videoTourUrl:'Video Tour',
            bedrooms:'BR',fullBathrooms:'Full BA',halfBathrooms:'Half BA',totalBathrooms:'Total BA',
            totalRooms:'Rooms',approxInteriorSqft:'Int SqFt',approxExteriorSqft:'Ext SqFt',sqftSource:'SqFt Source',
            floor:'Floor',totalFloors:'Total Floors',unitNumber:'Unit #',unitType:'Unit Type',condition:'Condition',
            exposures:'Exposures',viewType:'View',viewDescription:'View Desc',airConditioning:'A/C',heating:'Heating',
            fireplace:'Fireplace',numFireplaces:'# FP',washerDryerInUnit:'W/D',dishwasher:'DW',
            privateOutdoorSpace:'Outdoor',outdoorSpaceType:'Outdoor Type',outdoorSpaceSqft:'Outdoor SF',
            homeOffice:'Office',ceilingHeight:'Ceiling Ht',hardwoodFloors:'Hardwood',privateStorage:'Storage',
            parkingIncluded:'Parking',parkingSpaces:'Parking #',smartHome:'Smart Home',
            financingAllowed:'Financing %',flipTaxPercent:'Flip Tax %',flipTaxPaidBy:'Flip Tax By',
            taxAbatement:'Tax Abate',sponsorUnit:'Sponsor',shares:'Shares',boardApprovalRequired:'Board',
            firstRightOfRefusal:'1st Right',petsAllowed:'Pets',sublettingAllowed:'Sublet',
            piedATerreAllowed:'Pied-a-Terre',guarantorsAllowed:'Guarantors',minimumDownPayment:'Min Down',
            incomeRequirement:'Income Req',purchaseApplicationFee:'App Fee',moveInFee:'Move-In Fee',
            buyersBrokerCompensation:'Buyer Comm',bonus:'Bonus',bonusExpirationDate:'Bonus Exp',
            bonusRemarks:'Bonus Notes',primaryAgentName:'Agent',primaryAgentEmail:'Agent Email',
            primaryAgentPhone:'Agent Phone',listingOfficeName:'Office',coListingAgentName:'Co-Agent',
            showingInstructions:'Showing Info',lockboxInfo:'Lockbox',keyLocation:'Key Loc',
            listedDate:'Listed',updatedDate:'Updated',contractSignedDate:'Contract',closingDate:'Closing',
            dom:'DOM',cdom:'CDOM',originalPrice:'Orig Price',priceChangeDate:'Price Change',
            previousSoldDate:'Prev Sold Date',previousSoldPrice:'Prev Sold Price',
            rlsId:'RLS ID',webId:'Web ID',mlsNumber:'MLS #',internalListingNumber:'Internal #',
            acrisId:'ACRIS ID',bbl:'BBL',bin:'BIN',taxBlock:'Tax Block',taxLot:'Tax Lot',
            publicDescription:'Description',privateRemarks:'Private Remarks',marketingHeadline:'Headline',
            highlights:'Highlights',keyFeatures:'Key Features'
        };

        // ── Field value resolver for custom field columns ──
        function getFieldValue(listing, field) {
            var map = {
                listingType: listing.listingType, status: listing.status, price: listing.price,
                maintCC: listing.maintCC, reTaxes: listing.reTaxes, totalMonthly: listing.totalMonthly,
                bedrooms: listing.beds, fullBathrooms: listing.baths, totalBathrooms: listing.baths,
                totalRooms: listing.rooms, approxInteriorSqft: listing.intSqft, floor: listing.floor,
                dom: listing.dom, cdom: listing.cdom, listedDate: listing.listedDate,
                updatedDate: listing.updatedDate, originalPrice: listing.originalPrice,
                rlsId: listing.lid, webId: listing.wid, publicDescription: listing.description,
                primaryAgentName: listing.agentName, primaryAgentEmail: listing.agentEmail,
                primaryAgentPhone: listing.agentPhone, listingOfficeName: listing.company,
                condition: listing.condition, exposures: listing.exposures,
                petsAllowed: listing.petsAllowed, privateRemarks: listing.privateRemarks,
                showingInstructions: listing.showingInstructions, buyersBrokerCompensation: listing.commission,
                unitNumber: listing.unit
            };
            return map[field] !== undefined ? map[field] : (listing[field] || '');
        }

        // ── AGT-only fields (hidden in Customer version) ──
        var agentOnlyFields = ['privateRemarks','showingInstructions','buyersBrokerCompensation','bonus',
            'bonusExpirationDate','bonusRemarks','primaryAgentName','primaryAgentEmail','primaryAgentPhone',
            'listingOfficeName','coListingAgentName','lockboxInfo','keyLocation','cdom','expirationDate'];

        // ── CSV/Excel allowlisted fields (IDX-safe for Customer version) ──
        var csvExcelAllowlistCustomer = ['listingType','status','price','maintCC','reTaxes','totalMonthly',
            'bedrooms','fullBathrooms','halfBathrooms','totalBathrooms','totalRooms','approxInteriorSqft',
            'floor','totalFloors','unitNumber','condition','exposures','dom','listedDate','updatedDate',
            'publicDescription','rlsId','webId'];

        function populateReportPreview() {
            // Use the same listing selection logic as generateReport
            // getReportListings() handles: selection radio (all/selected/picked/liked),
            // IDX compliance filter, sorting, and 250 cap
            var listings = getReportListings();
            if (listings.length === 0) {
                document.getElementById('previewGrid').innerHTML = '<div style="padding:40px;text-align:center"><p style="color:#dc2626;font-weight:700;margin-bottom:8px">No Listings Available</p><p style="font-size:13px;color:#4b5563">No compliant listings found for the selected criteria.</p></div>';
                return;
            }

            // Pre-fetch photos for listings missing images before rendering
            // Batch in groups of 25 (API detail mode limit) to handle larger reports
            var needPhotos = listings.filter(function(l) { return !l.images || l.images.length === 0; });
            if (needPhotos.length > 0 && typeof fetch !== 'undefined') {
                var allIds = needPhotos.map(function(l) { return l.lid || l.id; }).filter(Boolean);
                var BATCH_SIZE = 25;
                var batches = [];
                for (var bi = 0; bi < allIds.length; bi += BATCH_SIZE) {
                    batches.push(allIds.slice(bi, bi + BATCH_SIZE));
                }
                var completedBatches = 0;
                function applyMediaToListings(data) {
                    if (!data) return;
                    var photos = data.photos || {};
                    var media = data.media || {};
                    needPhotos.forEach(function(l) {
                        if (l.images && l.images.length > 0) return; // already populated by earlier batch
                        var lid = l.lid || l.id;
                        if (media[lid] && media[lid].length > 0) {
                            l.images = media[lid].map(function(m) {
                                return {
                                    url: m.url, mediaType: m.mediaType,
                                    mediaCategory: m.mediaType,
                                    imageOf: m.mediaType === 'FloorPlan' ? 'FloorPlan' : 'Photo',
                                    order: m.order, caption: m.caption || '',
                                    isPrimary: m.order === -1 || m.order === 0
                                };
                            }).sort(function(a, b) { return a.order - b.order; });
                            l.photoCount = l.images.filter(function(m) { return m.mediaCategory !== 'FloorPlan'; }).length;
                        } else if (photos[lid]) {
                            l.images = [{ url: photos[lid], isPrimary: true, mediaType: 'Photo', mediaCategory: 'Photo', imageOf: 'Photo' }];
                            if (!l.photoCount) l.photoCount = 1;
                        }
                    });
                    completedBatches++;
                    if (completedBatches >= batches.length) {
                        try { populateReportPreview(); } catch(e) { console.warn('Report re-render with photos failed:', e); }
                    }
                }
                batches.forEach(function(batchIds) {
                    fetch('/api/media/batch?ids=' + encodeURIComponent(batchIds.join(',')) + '&detail=true', { credentials: 'same-origin' })
                        .then(function(r) { return r.ok ? r.json() : null; })
                        .then(applyMediaToListings)
                        .catch(function() { completedBatches++; });
                });
            }

            // Track address-suppressed listings for compliance warning banner
            var complianceWarnings = listings.filter(function(l) { return l.addressDisplayYN === false; });

            // ── Steps 6-7: Read optional content + custom fields ──
            var optContent = getOptionalContentConfig();
            var customFields = getSelectedReportFields();

            // Compliance warning banner HTML (used in all formats)
            var complianceBanner = '';
            if (complianceWarnings.length > 0) {
                complianceBanner += '<div style="padding:12px 24px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin:8px 24px 0;font-size:12px;color:#92400e">' +
                    '<p style="font-weight:600;margin:0 0 4px"><i class="fas fa-info-circle" style="margin-right:4px"></i>' + complianceWarnings.length + ' listing(s) with address suppressed</p>' +
                    '<p style="margin:0">Address displayed as "Available Upon Request"</p></div>';
            }

            // Helper: resolve display address (suppress if opted out)
            function displayAddr(l) {
                if (l.addressDisplayYN === false) return 'Available Upon Request';
                return l.address + (l.unit ? ', ' + l.unit : '');
            }

            // Helper: address as clickable link (opens client detail report)
            // href → mallan.nyc/report.html?id=X (works in email)
            // onclick → openClientDetailReport (works in browser preview)
            function addrLink(l, text, extraStyle) {
                var addr = text || displayAddr(l);
                if (l.addressDisplayYN === false) return addr; // no link for suppressed addresses
                var baseStyle = 'color:inherit;text-decoration:none;border-bottom:1px dotted #C4A052;cursor:pointer';
                if (extraStyle) baseStyle += ';' + extraStyle;
                return '<a href="https://mallan.nyc/report.html?id=' + l.id + '" onclick="if(typeof openClientDetailReport===\'function\'){openClientDetailReport(\'' + l.id + '\');return false;}" style="' + baseStyle + '">' + addr + '</a>';
            }

            // Helper: small "View Photos" link for a listing
            function mediaLink(l) {
                var count = l.photoCount || (l.images ? l.images.length : 0);
                if (count === 0) return '';
                return '<a href="https://mallan.nyc/report.html?id=' + l.id + '" onclick="if(typeof openClientDetailReport===\'function\'){openClientDetailReport(\'' + l.id + '\');return false;}" style="color:#C4A052;text-decoration:none;font-size:11px;white-space:nowrap;cursor:pointer"><i class="fas fa-camera" style="margin-right:3px"></i>' + count + ' Photos</a>';
            }

            var version = reportState.version || 'agent';
            var isCustomer = (version === 'customer');
            var preparedFor = (document.getElementById('reportPreparedFor') || {}).value || '';
            var reportTitle = (document.getElementById('reportTitle') || {}).value || 'Property Search Report';
            var now = new Date();
            var dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            var shortDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            var rentalCount = listings.filter(function(l) { return l.listingCategory === 'rental'; }).length;
            var isAllRental = rentalCount === listings.length && listings.length > 0;

            // Agent info (auto-populated from AGENT_PROFILE set by agent-context.js)
            var agentInfo = typeof AGENT_PROFILE !== 'undefined' ? {
                name: AGENT_PROFILE.name || '',
                title: AGENT_PROFILE.licenseTitle || AGENT_PROFILE.title || 'Licensed Real Estate Broker',
                company: AGENT_PROFILE.company || '',
                email: AGENT_PROFILE.email || '',
                phone: AGENT_PROFILE.phone || '',
                license: AGENT_PROFILE.license || '',
                companyLicense: AGENT_PROFILE.companyLicense || '',
                address: AGENT_PROFILE.address || '',
                photo: AGENT_PROFILE.photo || ''
            } : {
                name: '',
                title: 'Licensed Real Estate Broker',
                company: '',
                email: '',
                phone: '',
                license: '',
                companyLicense: '',
                address: '',
                photo: ''
            };

            // ── Helper functions ──
            function fmtCurrency(val) {
                if (val == null || isNaN(val)) return '\u2014';
                return '$' + Number(val).toLocaleString();
            }
            function fmtPrice(l) {
                if (l.listingCategory === 'rental') return fmtCurrency(l.price) + '/mo';
                return fmtCurrency(l.price);
            }
            function priceSF(l) {
                if (!l.intSqft || l.intSqft === 0) return '\u2014';
                return fmtCurrency(Math.round(l.price / l.intSqft));
            }
            function statusColor(s) {
                s = (s || 'Active').toUpperCase();
                var m = {
                    'ACTIVE': { bg: '#dcfce7', color: '#15803d' },
                    'OFFER IN': { bg: '#ffedd5', color: '#c2410c' },
                    'IN CONTRACT': { bg: '#f3e8ff', color: '#7e22ce' },
                    'SOLD': { bg: '#dbeafe', color: '#1d4ed8' },
                    'CLOSED': { bg: '#f3f4f6', color: '#4b5563' },
                    'WITHDRAWN': { bg: '#f3f4f6', color: '#6b7280' },
                    'HOLD': { bg: '#f3f4f6', color: '#6b7280' },
                    'CANCELED': { bg: '#f3f4f6', color: '#6b7280' },
                    'COMING_SOON': { bg: '#f5f3ff', color: '#7c3aed' }
                };
                return m[s] || { bg: '#f3f4f6', color: '#4b5563' };
            }
            function statusBadge(s, listing) {
                s = (s || 'Active').toUpperCase();
                var sc = statusColor(s);
                var label = s.replace(/_/g, ' ');
                // UCBA Art. I Sec. 16: Coming Soon badge must include showing restriction text
                if (s === 'COMING_SOON' && listing && listing.firstShowingDate) {
                    label = 'Coming Soon \u2014 No Showings or Open House until ' + listing.firstShowingDate;
                } else if (s === 'COMING_SOON') {
                    label = 'Coming Soon \u2014 No Showings or Open House until Scheduled Date';
                }
                return '<span style="display:inline-block;padding:2px 8px;background:' + sc.bg + ';color:' + sc.color + ';font-size:12px;border-radius:4px;font-weight:500">' + label + '</span>';
            }

            // ── RLS Compliance: Off-market photo restriction (only primary photo for non-active) ──
            var OFF_MARKET_STATUSES = { 'CLOSED':1, 'WITHDRAWN':1, 'HOLD':1, 'CANCELED':1, 'EXPIRED':1 };
            function isOffMarket(l) {
                return OFF_MARKET_STATUSES[(l.status||'').toUpperCase()] === 1;
            }
            function getListingPhotos(l) {
                // Off-market: only primary photo per REBNY RLS rule (Feb 2025)
                var photos = l.images || [];
                if (isOffMarket(l) && photos.length > 1) return [photos[0]];
                return photos;
            }

            // Per-listing "Courtesy of" — only on online viewers (UCBA Art. III Sec. 2C applies to IDX/VOW display, not client reports)
            function listingAttribution(l) {
                return '';
            }

            // ── RLS Compliance: Statistical data disclaimer (REBNY required) ──
            function statisticalDisclaimer() {
                return '<div style="padding:12px 24px;background:rgba(196,160,82,0.06);border:1px solid rgba(196,160,82,0.12);border-radius:8px;margin:16px 0;font-size:11px;color:#64748b;font-family:Inter,system-ui,sans-serif;font-weight:300">' +
                    '<p style="margin:0;font-style:italic">Based on information from the REBNY Listing Service for the period ending ' + dateStr + '. Display of MLS data is usually deemed reliable but is NOT guaranteed accurate by the MLS. Buyers are responsible for verifying the accuracy of all information.</p></div>';
            }

            // ── Format Open House data (handles object or string) ──
            function formatOpenHouse(oh) {
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
            function commissionDisclosure() {
                return '<p style="font-size:10px;color:#9ca3af;font-style:italic;margin:4px 0 0;font-family:Inter,system-ui,sans-serif;font-weight:300">' +
                    'Commission rates are not set by law and are fully negotiable. The commission on any particular listing is set by the listing participant and is disclosed to cooperating brokers.</p>';
            }

            // ── Shared report blocks (ALL inline styles — no Tailwind) ──
            function headerBlock() {
                return '<div style="background:rgb(18,25,40);background-image:linear-gradient(180deg, rgba(20,27,45,0.92) 0%, rgba(15,23,42,0.86) 100%);color:#fff;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.08);box-shadow:inset 0 1px 0 0 rgba(255,255,255,0.07),0 4px 24px rgba(0,0,0,0.15)" class="pkg-no-break">' +
                    '<div style="display:flex;align-items:center;justify-content:space-between">' +
                    '<div><p style="font-size:12px;color:#C4A052;text-transform:uppercase;letter-spacing:0.2em;margin:0 0 4px;font-family:Inter,system-ui,sans-serif;font-weight:600">' + agentInfo.company + '</p>' +
                    '<h1 style="font-size:22px;font-weight:700;margin:0;font-family:Urbanist,system-ui,sans-serif;letter-spacing:-0.02em">MALLAN<span style="font-weight:200;color:#B8860B;opacity:0.95">NYC</span></h1>' +
                    '<p style="color:rgba(255,255,255,0.5);font-size:10px;margin:4px 0 0;text-transform:uppercase;letter-spacing:0.15em;font-family:Inter,system-ui,sans-serif;font-weight:400">Luxury Real Estate</p></div>' +
                    '<div style="text-align:right"><p style="font-size:14px;font-weight:600;margin:0;font-family:Urbanist,system-ui,sans-serif;color:rgba(255,255,255,0.95)">' + agentInfo.name + '</p>' +
                    '<p style="color:rgba(255,255,255,0.6);font-size:12px;margin:3px 0 0;font-family:Inter,system-ui,sans-serif;font-weight:300">' + agentInfo.phone + ' | ' + agentInfo.email + '</p>' +
                    '<p style="color:rgba(255,255,255,0.4);font-size:11px;margin:3px 0 0;font-family:Inter,system-ui,sans-serif;font-weight:300">' + dateStr + '</p></div></div></div>';
            }

            function agentClientBar() {
                return '<div style="padding:20px 32px;border-bottom:1px solid #e2e8f0;background:#FEFEFE" class="pkg-no-break">' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">' +
                    '<div><p style="font-size:10px;color:#C4A052;text-transform:uppercase;letter-spacing:0.2em;margin:0 0 6px;font-family:Inter,system-ui,sans-serif;font-weight:600">Prepared By</p>' +
                    '<p style="font-weight:600;color:#0A0A0A;margin:0;font-family:Urbanist,system-ui,sans-serif;font-size:15px">' + agentInfo.name + '</p>' +
                    '<p style="font-size:13px;color:rgba(10,10,10,0.7);margin:3px 0 0;font-family:Inter,system-ui,sans-serif;font-weight:300">' + agentInfo.title + '</p>' +
                    '<p style="font-size:13px;color:rgba(10,10,10,0.7);margin:3px 0 0;font-family:Inter,system-ui,sans-serif;font-weight:300">' + agentInfo.company + ' &middot; Lic. ' + agentInfo.companyLicense + '</p>' +
                    '<p style="font-size:13px;color:#64748b;margin:3px 0 0;font-family:Inter,system-ui,sans-serif;font-weight:300">' + agentInfo.email + ' | ' + agentInfo.phone + '</p></div>' +
                    '<div><p style="font-size:10px;color:#C4A052;text-transform:uppercase;letter-spacing:0.2em;margin:0 0 6px;font-family:Inter,system-ui,sans-serif;font-weight:600">Prepared For</p>' +
                    '<p style="font-weight:600;color:#0A0A0A;margin:0;font-family:Urbanist,system-ui,sans-serif;font-size:15px">' + (preparedFor || 'Client') + '</p></div></div></div>';
            }

            function criteriaBlock() {
                var pills = '';
                if (typeof activeSearchCriteria !== 'undefined' && activeSearchCriteria) {
                    var pS = 'display:inline-block;padding:4px 10px;background:rgba(196,160,82,0.12);color:#B8860B;font-size:12px;border-radius:9999px;margin:0 4px 4px 0;font-family:Inter,system-ui,sans-serif;font-weight:500';
                    if (activeSearchCriteria.priceMin || activeSearchCriteria.priceMax) {
                        var pl = '';
                        if (activeSearchCriteria.priceMin && activeSearchCriteria.priceMax) pl = fmtCurrency(activeSearchCriteria.priceMin) + ' \u2013 ' + fmtCurrency(activeSearchCriteria.priceMax);
                        else if (activeSearchCriteria.priceMin) pl = fmtCurrency(activeSearchCriteria.priceMin) + '+';
                        else pl = 'Up to ' + fmtCurrency(activeSearchCriteria.priceMax);
                        pills += '<span style="' + pS + '">' + pl + '</span>';
                    }
                    if (activeSearchCriteria.bedsMin) pills += '<span style="' + pS + '">' + activeSearchCriteria.bedsMin + '+ BR</span>';
                    if (activeSearchCriteria.neighborhoods && activeSearchCriteria.neighborhoods.length)
                        pills += '<span style="' + pS + '">' + activeSearchCriteria.neighborhoods.join(', ') + '</span>';
                    if (activeSearchCriteria.ownership && activeSearchCriteria.ownership.length)
                        pills += '<span style="' + pS + '">' + activeSearchCriteria.ownership.map(ownershipLabel).join(', ') + '</span>';
                }
                if (!pills) pills = '<span style="display:inline-block;padding:4px 10px;background:rgba(196,160,82,0.12);color:#B8860B;font-size:12px;border-radius:9999px;font-family:Inter,system-ui,sans-serif;font-weight:500">' + listings.length + ' matching properties</span>';
                return '<div style="padding:16px 32px;border-bottom:1px solid #e2e8f0">' +
                    '<p style="font-size:10px;color:#C4A052;text-transform:uppercase;letter-spacing:0.2em;margin:0 0 8px;font-family:Inter,system-ui,sans-serif;font-weight:600">Search Criteria</p>' +
                    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + pills + '</div></div>';
            }

            function brokerFooter() {
                var f = '<div style="padding:12px 32px;border-top:2px solid #C4A052;background:#FEFEFE;margin-top:16px" class="pkg-no-break">' +
                    '<div style="text-align:center;font-size:10px;color:#64748b;font-family:Inter,system-ui,sans-serif;font-weight:300;line-height:1.5">' +
                    '<p style="margin:0">Listing(s) courtesy of the REBNY Listing Service (RLS)</p>' +
                    '<p style="margin:1px 0 0">Data provided by REBNY RLS via Trestle &middot; ' + shortDate + '</p>' +
                    '<p style="margin:2px 0 0;font-style:italic">Information deemed reliable but not guaranteed.</p>' +
                    '<p style="margin:2px 0 0">Equal Housing Opportunity</p>';
                if (isCustomer) {
                    f += '<p style="margin:2px 0 0">Not for redistribution.</p>';
                }
                f += commissionDisclosure();
                f += '</div></div>';
                return f;
            }

            // ── Image safety: onerror replaces broken img with placeholder ──
            var _imgErr = "this.onerror=null;this.style.display='none';this.parentNode.style.background='#f1f5f9';";

            // ── Media rendering helpers (used by all formats) ──
            function renderFloorPlans(listing) {
                // Off-market listings: only primary photo remains (no floor plans)
                if (isOffMarket(listing)) return '';
                var floorPlans = (listing.images || []).filter(function(img) {
                    return img.mediaCategory === 'FloorPlan' || img.imageOf === 'FloorPlan';
                });
                if (floorPlans.length === 0) return '';
                var h = '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px">' +
                    '<h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px"><i class="fas fa-drafting-compass" style="color:#C4A052;margin-right:8px"></i>Floor Plans</h3>' +
                    '<div style="display:grid;grid-template-columns:repeat(' + Math.min(floorPlans.length, 3) + ',1fr);gap:12px">';
                floorPlans.forEach(function(fp, fi) {
                    h += '<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">' +
                        '<div style="height:180px;background:#f1f5f9"><img src="' + fp.url + '" alt="' + (fp.caption||'Floor Plan') + '" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '"></div>' +
                        '<div style="padding:8px;text-align:center;font-size:12px;color:#6b7280;background:#f9fafb">' +
                        '<i class="fas fa-drafting-compass" style="margin-right:4px"></i>' + (fp.caption || 'Floor Plan ' + (fi+1)) + '</div></div>';
                });
                h += '</div></div>';
                return h;
            }
            function renderPhotoGallery(listing) {
                var imgs = getListingPhotos(listing);
                if (imgs.length === 0) return '';
                var photos = imgs.filter(function(img) { return img.mediaCategory !== 'FloorPlan'; });
                var show = Math.min(photos.length, 9);
                var h = '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px">' +
                    '<h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px"><i class="fas fa-images" style="color:#C4A052;margin-right:8px"></i>Photo Gallery (' + photos.length + ' photos)</h3>' +
                    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">';
                for (var i = 0; i < show; i++) {
                    var hgt = i === 0 ? 'grid-column:span 2;grid-row:span 2;height:260px;' : 'height:120px;';
                    h += '<div style="' + hgt + 'border-radius:6px;overflow:hidden;background:#f1f5f9;position:relative">' +
                        '<img src="' + photos[i].url + '" alt="' + (photos[i].caption||'') + '" style="width:100%;height:100%;object-fit:cover">' +
                        '<span style="position:absolute;bottom:4px;left:6px;font-size:10px;color:#fff;background:rgba(0,0,0,0.5);padding:1px 4px;border-radius:2px;background:rgba(0,0,0,0.4);padding:1px 5px;border-radius:3px">' + (photos[i].caption||('Photo '+(i+1))) + '</span></div>';
                }
                h += '</div></div>';
                return h;
            }
            function renderVirtualTour(listing) {
                if (!listing.virtualTourUrl) return '';
                return '<div style="display:inline-block;padding:14px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:12px;margin-right:12px">' +
                    '<i class="fas fa-vr-cardboard" style="font-size:20px;color:#B8860B;margin-right:10px"></i>' +
                    '<span style="font-weight:600;font-size:14px;color:#111827">3D Virtual Tour</span><br>' +
                    '<a href="' + listing.virtualTourUrl + '" style="color:#C4A052;font-size:12px;text-decoration:none;overflow-wrap:anywhere;word-break:normal">' + listing.virtualTourUrl + '</a></div>';
            }
            function renderVideoTour(listing) {
                if (!listing.videoTourUrl) return '';
                return '<div style="display:inline-block;padding:14px 20px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:12px;margin-right:12px">' +
                    '<i class="fas fa-video" style="font-size:20px;color:#dc2626;margin-right:10px"></i>' +
                    '<span style="font-weight:600;font-size:14px;color:#111827">Video Tour</span><br>' +
                    '<a href="' + listing.videoTourUrl + '" style="color:#C4A052;font-size:12px;text-decoration:none;overflow-wrap:anywhere;word-break:normal">' + listing.videoTourUrl + '</a></div>';
            }
            function renderMediaSection(listing, optContent) {
                var h = '';
                if (optContent.virtualTour) h += renderVirtualTour(listing);
                if (optContent.videoTour) h += renderVideoTour(listing);
                if (optContent.listingFloorplans) h += renderFloorPlans(listing);
                if (optContent.photoGallery) h += renderPhotoGallery(listing);
                return h;
            }

            // ═══════════════ GRID FORMAT ═══════════════
            var g = headerBlock() + agentClientBar() + criteriaBlock();
            g += '<div style="padding:24px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
                '<h2 style="font-size:18px;font-weight:700;color:#111827;margin:0">Matching Properties</h2>' +
                '<span style="font-size:14px;color:#6b7280">' + listings.length + ' results</span></div>';

            var thS = 'padding:6px 4px;font-weight:600;color:#374151;font-size:10px;text-align:left;white-space:nowrap;word-break:normal';
            g += '<div><table style="width:100%;font-size:11px;border-collapse:collapse;table-layout:fixed">' +
                '<colgroup>';
            if (optContent.numberListings) g += '<col style="width:3%">';
            g += '<col style="width:22%">' +  // Address
                '<col style="width:10%">' +    // Price
                '<col style="width:3%">' +     // BR
                '<col style="width:3%">' +     // BA
                '<col style="width:6%">';      // SqFt
            if (optContent.priceSqft) g += '<col style="width:7%">';
            if (!isAllRental) g += '<col style="width:8%"><col style="width:8%">';
            g += '<col style="width:7%">' +    // Type
                '<col style="width:7%">';       // Status
            if (optContent.dom) g += '<col style="width:4%">';
            if (optContent.originalPrice) g += '<col style="width:9%">';
            if (!isCustomer && optContent.listingContact) g += '<col style="width:8%"><col style="width:8%">';
            g += '</colgroup><thead><tr style="background:#f3f4f6">';
            if (optContent.numberListings) g += '<th style="' + thS + '">#</th>';
            g += '<th style="' + thS + '">Address</th>' +
                '<th style="' + thS + '">Price</th>' +
                '<th style="' + thS + '">BR</th>' +
                '<th style="' + thS + '">BA</th>' +
                '<th style="' + thS + '">SqFt</th>';
            if (optContent.priceSqft) g += '<th style="' + thS + '">$/SF</th>';
            if (!isAllRental) g += '<th style="' + thS + '">Maint/CC</th>';
            if (!isAllRental) g += '<th style="' + thS + '">Total Mo.</th>';
            g += '<th style="' + thS + '">Type</th>' +
                '<th style="' + thS + '">Status</th>';
            if (optContent.dom) g += '<th style="' + thS + '">DOM</th>';
            if (optContent.originalPrice) g += '<th style="' + thS + '">Orig Price</th>';
            if (!isCustomer && optContent.listingContact) g += '<th style="' + thS + '">Company</th><th style="' + thS + '">Agent</th>';
            g += '</tr></thead><tbody>';

            var totP=0,totSF=0,totM=0,totD=0,cSF=0,cM=0;
            var tdS = 'padding:6px 4px;border-bottom:1px solid #f3f4f6;overflow:hidden;text-overflow:ellipsis;word-break:normal';
            listings.forEach(function(l,i) {
                var rowBg = i%2===1 ? 'background:rgba(239,246,255,0.3);' : '';
                g += '<tr style="' + rowBg + '">';
                if (optContent.numberListings) g += '<td style="' + tdS + ';color:#6b7280">' + (i+1) + '</td>';
                g += '<td style="' + tdS + ';font-weight:500">' + addrLink(l) + '<br>' + mediaLink(l) + '</td>' +
                    '<td style="' + tdS + ';font-weight:600;color:#15803d">' + fmtPrice(l) + '</td>' +
                    '<td style="' + tdS + '">' + (l.beds||'\u2014') + '</td>' +
                    '<td style="' + tdS + '">' + (l.baths||'\u2014') + '</td>' +
                    '<td style="' + tdS + '">' + (l.intSqft ? l.intSqft.toLocaleString() : '\u2014') + '</td>';
                if (optContent.priceSqft) g += '<td style="' + tdS + '">' + priceSF(l) + '</td>';
                if (!isAllRental) g += '<td style="' + tdS + '">' + (l.maintCC ? fmtCurrency(l.maintCC)+'/mo' : '\u2014') + '</td>';
                if (!isAllRental) g += '<td style="' + tdS + '">' + (l.totalMonthly ? fmtCurrency(l.totalMonthly)+'/mo' : '\u2014') + '</td>';
                g += '<td style="' + tdS + '">' + (ownershipLabel(l.ownership)||'\u2014') + '</td>' +
                    '<td style="' + tdS + '">' + statusBadge(l.status, l) + '</td>';
                if (optContent.dom) g += '<td style="' + tdS + '">' + (l.dom||'\u2014') + '</td>';
                if (optContent.originalPrice) g += '<td style="' + tdS + '">' + (l.originalPrice ? fmtCurrency(l.originalPrice) : '\u2014') + '</td>';
                if (!isCustomer && optContent.listingContact) g += '<td style="' + tdS + ';font-size:12px">' + (l.company||'\u2014') + '</td><td style="' + tdS + ';font-size:12px">' + (l.agentName||'\u2014') + '</td>';
                g += '</tr>';
                totP += l.price||0;
                if (l.intSqft) { totSF += l.intSqft; cSF++; }
                if (l.totalMonthly) { totM += l.totalMonthly; cM++; }
                totD += l.dom||0;
            });
            g += '</tbody></table></div>';

            // Averages row (controlled by includeAverages)
            if (optContent.includeAverages) {
                var n = listings.length||1;
                var aP = Math.round(totP/n), aSF = cSF>0?Math.round(totSF/cSF):0;
                var aPSF = aSF>0?Math.round(aP/aSF):0, aM = cM>0?Math.round(totM/cM):0, aD = Math.round(totD/n);
                g += '<div style="margin-top:16px;padding:16px;background:#f3f4f6;border-radius:8px">' +
                    '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:16px;text-align:center;font-size:14px">' +
                    '<div><p style="color:#6b7280;font-size:12px;margin:0">Avg Price</p><p style="font-weight:700;color:#111827;margin:4px 0 0">' + fmtCurrency(aP) + '</p></div>' +
                    '<div><p style="color:#6b7280;font-size:12px;margin:0">Avg $/SF</p><p style="font-weight:700;color:#111827;margin:4px 0 0">' + (aPSF?fmtCurrency(aPSF):'\u2014') + '</p></div>' +
                    '<div><p style="color:#6b7280;font-size:12px;margin:0">Avg SqFt</p><p style="font-weight:700;color:#111827;margin:4px 0 0">' + (aSF?aSF.toLocaleString():'\u2014') + '</p></div>' +
                    '<div><p style="color:#6b7280;font-size:12px;margin:0">Avg Monthly</p><p style="font-weight:700;color:#111827;margin:4px 0 0">' + (aM?fmtCurrency(aM):'\u2014') + '</p></div>' +
                    '<div><p style="color:#6b7280;font-size:12px;margin:0">Avg DOM</p><p style="font-weight:700;color:#111827;margin:4px 0 0">' + aD + ' days</p></div>' +
                    '<div><p style="color:#6b7280;font-size:12px;margin:0">Total</p><p style="font-weight:700;color:#111827;margin:4px 0 0">' + listings.length + ' listings</p></div>' +
                    '</div></div>';
            }
            g += '</div>';
            g += brokerFooter();
            document.getElementById('previewList').innerHTML = g;

            // ═══════════════ GRID FORMAT ═══════════════
            // Table-based rows: photo thumbnail left, listing details right — Outlook/email safe
            var li = headerBlock() + agentClientBar() + criteriaBlock();
            li += '<div style="padding:24px">';
            li += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:16px"><tr>' +
                '<td><h2 style="font-size:18px;font-weight:700;color:#111827;margin:0">Property Listings</h2></td>' +
                '<td style="text-align:right"><span style="font-size:14px;color:#6b7280">' + listings.length + ' results</span></td></tr></table>';

            listings.forEach(function(l, idx) {
                var isRental = l.listingCategory === 'rental';
                var stC = statusColor(l.status);
                var photo = getListingPhoto(l);
                var bedsLabel = l.beds === 0 ? 'Studio' : l.beds + ' BD';
                var rowBg = idx % 2 === 1 ? 'background:rgba(249,250,251,0.5);' : '';

                li += '<div style="padding:16px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;' + rowBg + '" class="pkg-no-break">';

                // Main layout: photo | details (TABLE)
                li += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>';

                // Photo thumbnail (left cell)
                if (optContent.listingImages) {
                    li += '<td style="width:180px;vertical-align:top;padding-right:16px">';
                    li += '<div style="width:180px;height:130px;border-radius:6px;overflow:hidden;position:relative;background:#f1f5f9">';
                    li += '<img src="' + photo + '" alt="' + displayAddr(l) + '" width="180" height="130" style="width:180px;height:130px;object-fit:cover;display:block" onerror="' + _imgErr + '">';
                    li += '</div>';
                    li += '</td>';
                }

                // Details (right cell)
                li += '<td style="vertical-align:top">';

                // Row 1: Address + Price (table)
                li += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:6px"><tr>';
                li += '<td style="vertical-align:top">';
                if (optContent.fullListingAddress) {
                    li += '<p style="font-size:15px;font-weight:700;color:#111827;margin:0">' + addrLink(l) + '</p>';
                } else if (optContent.streetNameOnly) {
                    li += '<p style="font-size:15px;font-weight:700;color:#111827;margin:0">' + addrLink(l, l.address || '') + '</p>';
                }
                var locParts = [];
                if (l.neighborhood) locParts.push(l.neighborhood);
                if (l.ownership) locParts.push(ownershipLabel(l.ownership));
                if (l.zip) locParts.push(l.zip);
                if (locParts.length) li += '<p style="font-size:12px;color:#6b7280;margin:2px 0 0">' + locParts.join(' | ') + ' &nbsp; ' + mediaLink(l) + '</p>';
                if (optContent.crossStreets && l.crossStreet) li += '<p style="font-size:11px;color:#9ca3af;margin:2px 0 0">Cross: ' + l.crossStreet + '</p>';
                li += '</td>';
                li += '<td style="text-align:right;vertical-align:top;white-space:nowrap;padding-left:16px">';
                li += '<p style="font-size:18px;font-weight:700;color:#15803d;margin:0">' + fmtPrice(l) + '</p>';
                if (optContent.priceSqft) li += '<p style="font-size:11px;color:#6b7280;margin:2px 0 0">' + priceSF(l) + '</p>';
                li += '</td></tr></table>';

                // Row 2: Key details (inline spans)
                li += '<div style="font-size:13px;color:#374151;margin-bottom:8px;line-height:1.8">';
                li += bedsLabel + ' &nbsp;&middot;&nbsp; ' + (l.baths || 0) + ' BA';
                if (l.intSqft) li += ' &nbsp;&middot;&nbsp; ' + l.intSqft.toLocaleString() + ' SF';
                if (!isRental && l.maintCC) li += ' &nbsp;&middot;&nbsp; Maint: ' + fmtCurrency(l.maintCC) + '/mo';
                if (l.totalMonthly) li += ' &nbsp;&middot;&nbsp; Total: ' + fmtCurrency(l.totalMonthly) + '/mo';
                if (optContent.dom) li += ' &nbsp;&middot;&nbsp; DOM: ' + (l.dom || '\u2014');
                if (optContent.originalPrice && l.originalPrice && l.originalPrice !== l.price) li += ' &nbsp;&middot;&nbsp; <span style="color:#6b7280">Orig: ' + fmtCurrency(l.originalPrice) + '</span>';
                li += '</div>';

                // Row 3: Description snippet
                var listDesc = getReportDescription(l);
                if (listDesc) {
                    var snippet = listDesc.length > 180 ? listDesc.substring(0, 177) + '...' : listDesc;
                    li += '<p style="font-size:12px;color:#4b5563;line-height:1.5;margin:0 0 8px">' + snippet + '</p>';
                }

                // Row 4: Agent info (table) — "Courtesy of" only on online viewers per user preference
                li += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding-top:6px;border-top:1px solid #f3f4f6"><tr>';
                li += '<td></td>';
                if (!isCustomer && optContent.listingContact && l.agentName) li += '<td style="text-align:right;font-size:11px;color:#9ca3af">' + l.agentName + '</td>';
                li += '</tr></table>';

                li += '</td>'; // close details
                li += '</tr></table>'; // close main layout

                li += '</div>'; // close row
            });

            li += '</div>';
            li += brokerFooter();
            document.getElementById('previewGrid').innerHTML = li;

            // ═══════════════ SUMMARY FORMAT ═══════════════
            // Table-based layout for Outlook/email compatibility + print-ready
            var s = headerBlock() + agentClientBar() + criteriaBlock();
            s += '<div style="padding:16px 24px">';
            listings.forEach(function(l, idx) {
                var isRental = l.listingCategory === 'rental';
                var stC = statusColor(l.status);
                var statusLabel = (l.status === 'COMING_SOON') ? 'COMING SOON' : (l.status || 'ACTIVE');
                var bedsLabel = l.beds === 0 ? 'Studio' : l.beds;
                var photo = getListingPhoto(l);

                s += '<div style="border-bottom:1px solid #e5e7eb;padding:16px 0" class="pkg-no-break">';

                // Header row: address + status + price (table-based)
                s += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px"><tr>';
                s += '<td style="vertical-align:top">';
                if (optContent.fullListingAddress) {
                    s += '<span style="font-size:15px;font-weight:700;color:#111827">' + addrLink(l) + '</span>';
                } else if (optContent.streetNameOnly) {
                    s += '<span style="font-size:15px;font-weight:700;color:#111827">' + addrLink(l, l.address || '') + '</span>';
                }
                s += ' &nbsp; ' + mediaLink(l);
                s += '</td>';
                s += '<td style="vertical-align:top;text-align:right;white-space:nowrap">';
                s += '<span style="display:inline-block;padding:3px 8px;color:#fff;font-size:11px;font-weight:700;border-radius:4px;background:' + stC.color + ';vertical-align:middle">' + statusLabel + '</span>';
                s += ' <span style="font-size:20px;font-weight:700;color:#111827;vertical-align:middle;margin-left:8px">' + fmtPrice(l) + '</span>';
                s += '</td></tr></table>';

                // Tags row (inline spans, no flex)
                s += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px"><tr>';
                s += '<td style="font-size:11px;color:#6b7280">';
                if (l.era) s += '<span style="display:inline-block;padding:2px 6px;background:#f3f4f6;border-radius:3px;margin-right:4px">' + l.era + '</span>';
                s += '<span style="display:inline-block;padding:2px 6px;background:#f3f4f6;border-radius:3px;margin-right:4px">' + (ownershipLabel(l.ownership) || '') + '</span>';
                if (optContent.crossStreets && l.crossStreet) s += '<span style="margin-right:4px">' + l.crossStreet + '</span>';
                s += '<span style="display:inline-block;padding:2px 6px;background:#f3f4f6;border-radius:3px;margin-right:4px">' + (l.neighborhood || '') + '</span>';
                if (l.zip) s += '<span>' + l.zip + '</span>';
                s += '</td>';
                s += '<td style="text-align:right;font-size:10px;color:#6b7280;white-space:nowrap">';
                if (l.totalMonthly) s += 'MT: $' + Number(l.totalMonthly).toLocaleString();
                s += '</td></tr></table>';

                // 3-column body: photo | details | agent (TABLE-BASED for Outlook)
                s += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>';

                // Photo (left column)
                if (optContent.listingImages) {
                    s += '<td style="width:200px;vertical-align:top;padding-right:16px">';
                    s += '<div style="width:200px;height:160px;border-radius:8px;overflow:hidden;position:relative;background:#f1f5f9">';
                    s += '<img src="' + photo + '" alt="' + displayAddr(l) + '" width="200" height="160" style="width:200px;height:160px;object-fit:cover;display:block" onerror="' + _imgErr + '">';
                    s += '</div>';
                    s += '</td>';
                }

                // Details (center column)
                s += '<td style="vertical-align:top">';

                // Specs row (inline, no flex)
                s += '<div style="font-size:13px;margin-bottom:10px;line-height:1.6">';
                if (l.rooms) s += '<strong>' + l.rooms + '</strong> Rooms <span style="color:#d1d5db">&nbsp;|&nbsp;</span>';
                s += '<strong>' + bedsLabel + '</strong> Beds <span style="color:#d1d5db">&nbsp;|&nbsp;</span>';
                s += '<strong>' + (l.baths || 0) + '</strong> Baths <span style="color:#d1d5db">&nbsp;|&nbsp;</span>';
                s += '<strong>' + (l.intSqft ? l.intSqft.toLocaleString() : '--') + '</strong> SqFt';
                if (optContent.priceSqft) s += ' <span style="color:#d1d5db">&nbsp;|&nbsp;</span><strong>' + priceSF(l) + '</strong>';
                s += '</div>';

                // Financial row
                if (!isRental) {
                    s += '<div style="font-size:12px;color:#374151;margin-bottom:10px;line-height:1.6">';
                    if (l.maintCC) s += 'Maint: $' + Number(l.maintCC).toLocaleString() + '/mo &nbsp;&middot;&nbsp; ';
                    s += 'Total: $' + Number(l.totalMonthly || 0).toLocaleString() + '/mo';
                    if (optContent.dom) s += ' &nbsp;&middot;&nbsp; DOM: ' + (l.dom || '--');
                    s += '</div>';
                }

                // Dates row (table-based)
                s += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:6px;margin-bottom:10px;width:100%"><tr>';
                if (optContent.updatedSoldDate) {
                    s += '<td style="padding:8px 12px;font-size:11px"><span style="color:#9ca3af;text-transform:uppercase;font-size:9px;display:block">Updated</span><span style="font-weight:600">' + (l.updatedDate || '--') + '</span></td>';
                }
                s += '<td style="padding:8px 12px;font-size:11px"><span style="color:#9ca3af;text-transform:uppercase;font-size:9px;display:block">Listed</span><span style="font-weight:600">' + (l.listedDate || '--') + '</span></td>';
                if (optContent.dom) {
                    s += '<td style="padding:8px 12px;font-size:11px"><span style="color:#9ca3af;text-transform:uppercase;font-size:9px;display:block">DOM</span><span style="font-weight:600">' + (l.dom || '--') + '</span></td>';
                }
                if (optContent.originalPrice && l.originalPrice) {
                    s += '<td style="padding:8px 12px;font-size:11px"><span style="color:#9ca3af;text-transform:uppercase;font-size:9px;display:block">Orig Price</span><span style="font-weight:600">' + fmtCurrency(l.originalPrice) + '</span></td>';
                }
                s += '</tr></table>';

                // Features row (inline, no flex)
                s += '<div style="border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:11px;color:#4b5563;line-height:1.8">';
                s += 'Outdoor: ' + (l.outdoorSpace || 'None');
                if (l.lobby || l.attendedLobby) s += ' &nbsp;&middot;&nbsp; Lobby: ' + (l.lobby || l.attendedLobby);
                if (!isRental && l.financingAllowed) s += ' &nbsp;&middot;&nbsp; Financing: ' + l.financingAllowed;
                if (!isRental && l.shares) s += ' &nbsp;&middot;&nbsp; Shares: ' + l.shares;
                if (isRental && l.petPolicy) s += ' &nbsp;&middot;&nbsp; Pets: ' + l.petPolicy;
                if (l.buildingAmenities) s += ' &nbsp;&middot;&nbsp; ' + l.buildingAmenities;
                s += '</div>';

                // Description (compact, 2 lines max)
                if (l.description) {
                    s += '<p style="margin:8px 0 0;font-size:12px;color:#4b5563;line-height:1.5">' + l.description + '</p>';
                }

                s += '</td>'; // close details

                // Agent panel (right column)
                if (!isCustomer && optContent.listingContact) {
                    s += '<td style="width:170px;vertical-align:top;padding-left:12px;border-left:1px solid #e5e7eb;font-size:12px">';
                    s += '<p style="font-weight:600;margin:0 0 2px">' + (l.company || '') + '</p>';
                    s += '<p style="color:#6b7280;font-size:11px;margin:0 0 6px">' + (l.listingType || 'Exclusive') + '</p>';
                    if (l.agentName) s += '<p style="font-weight:500;margin:0 0 2px">' + l.agentName + '</p>';
                    if (l.agentPhone) s += '<p style="color:#2563eb;font-size:11px;margin:0 0 1px">' + l.agentPhone + '</p>';
                    if (l.agentEmail) s += '<p style="color:#2563eb;font-size:11px;margin:0">' + l.agentEmail + '</p>';
                    s += '</td>';
                }

                s += '</tr></table>'; // close 3-col body

                // Attribution
                s += '<div style="margin-top:6px">' + listingAttribution(l) + '</div>';

                s += '</div>'; // close listing row
            });
            s += '</div>' + brokerFooter();
            document.getElementById('previewSummary').innerHTML = s;

            // ═══════════════ DETAIL FORMAT ═══════════════
            // Detail = entire form loaded — ALL sections always shown
            var first = listings[0] || {};
            var d = headerBlock() + agentClientBar();
            d += '<div style="padding:24px">';
            var detailImgs = getListingPhotos(first).filter(function(img) { return img.imageOf !== 'FloorPlan' && img.mediaCategory !== 'FloorPlan'; });
            var detPhotoCount = optContent.factSheetPhotoCount || 4;
            var detPhotoLayout = optContent.factSheetPhotoLayout || 'vertical';
            var detShowPhotos = optContent.listingImages ? Math.min(detailImgs.length, detPhotoCount) : 0;

            // ── Photos section ──
            if (detShowPhotos > 0 && detPhotoLayout === 'horizontal') {
                // Horizontal: full-width row of photos
                var detPhH = detShowPhotos <= 2 ? '180px' : detShowPhotos <= 4 ? '140px' : '100px';
                d += '<div style="display:flex;gap:8px;margin-bottom:24px" class="pkg-no-break">';
                for (var dpi = 0; dpi < detShowPhotos; dpi++) {
                    d += '<div style="flex:1;height:' + detPhH + ';border-radius:8px;overflow:hidden;background:#f1f5f9;position:relative">';
                    d += '<img src="' + detailImgs[dpi].url + '" alt="' + (detailImgs[dpi].caption || '') + '" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '">';
                    if (dpi === 0) d += '<div style="position:absolute;bottom:0;left:0;right:0;padding:8px 12px;background:linear-gradient(transparent,rgba(0,0,0,0.45))"><span style="font-size:14px;font-weight:500;color:rgba(255,255,255,0.9)">' + (first.neighborhood||'') + '</span></div>';
                    d += '</div>';
                }
                d += '</div>';
            } else if (detShowPhotos > 0) {
                // Vertical: hero + side stack (default detail layout)
                var heroUrl = detailImgs[0] ? detailImgs[0].url : '';
                var sidePhotos = detShowPhotos - 1;
                if (sidePhotos > 0) {
                    var sideH = Math.floor(256 / sidePhotos) - (sidePhotos > 1 ? 6 : 0);
                    d += '<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:24px" class="pkg-no-break">';
                    d += '<div style="height:256px;border-radius:8px;overflow:hidden;position:relative;background:#f1f5f9">';
                    d += '<img src="' + heroUrl + '" alt="' + displayAddr(first) + '" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '">';
                    d += '<div style="position:absolute;bottom:0;left:0;right:0;padding:8px 12px;background:linear-gradient(transparent,rgba(0,0,0,0.45))"><span style="font-size:14px;font-weight:500;color:rgba(255,255,255,0.9)">' + (first.neighborhood||'') + '</span><br><span style="font-size:12px;color:rgba(255,255,255,0.7)">' + displayAddr(first) + '</span></div></div>';
                    d += '<div style="display:flex;flex-direction:column;gap:8px">';
                    for (var dpi = 1; dpi <= sidePhotos; dpi++) {
                        d += '<div style="height:' + sideH + 'px;border-radius:8px;overflow:hidden;background:#f1f5f9"><img src="' + detailImgs[dpi].url + '" alt="" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '"></div>';
                    }
                    d += '</div></div>';
                } else {
                    // Only 1 photo — full width
                    d += '<div style="height:256px;border-radius:8px;overflow:hidden;position:relative;background:#f1f5f9;margin-bottom:24px" class="pkg-no-break">';
                    d += '<img src="' + heroUrl + '" alt="' + displayAddr(first) + '" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '">';
                    d += '<div style="position:absolute;bottom:0;left:0;right:0;padding:8px 12px;background:linear-gradient(transparent,rgba(0,0,0,0.45))"><span style="font-size:14px;font-weight:500;color:rgba(255,255,255,0.9)">' + (first.neighborhood||'') + '</span></div></div>';
                }
            }

            // ── Address + Price header ──
            d += '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px" class="pkg-no-break"><div>' +
                '<h2 style="font-size:28px;font-weight:700;color:#111827;margin:0 0 4px">' + fmtPrice(first) + '</h2>' +
                '<p style="font-size:20px;color:#374151;margin:0">' + addrLink(first) + '</p>' +
                '<p style="color:#6b7280;margin:4px 0 0">' + (first.neighborhood||'') + ', NY ' + (first.zip||'') + ' &nbsp; ' + mediaLink(first) + '</p>';
            if (first.crossStreet) d += '<p style="color:#9ca3af;font-size:13px;margin:2px 0 0">Cross: ' + first.crossStreet + '</p>';
            d += '</div><div style="text-align:right">' + statusBadge(first.status, first);
            if (first.listedDate) d += '<p style="font-size:14px;color:#6b7280;margin:8px 0 0">Listed: ' + first.listedDate + '</p>';
            d += '<p style="font-size:14px;color:#6b7280;margin:4px 0 0">DOM: ' + (first.dom||'\u2014') + ' days</p>';
            if (first.originalPrice && first.originalPrice !== first.price) d += '<p style="font-size:14px;color:#6b7280;margin:4px 0 0">Original: ' + fmtCurrency(first.originalPrice) + '</p>';
            d += '</div></div>';

            // ── Key metrics bar (all metrics shown in detail) ──
            var metricCols = [];
            metricCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + (first.beds === 0 ? 'Studio' : (first.beds||'\u2014')) + '</p><p style="font-size:12px;color:#4b5563;margin:4px 0 0">Bedrooms</p></div>');
            metricCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + (first.baths||'\u2014') + '</p><p style="font-size:12px;color:#4b5563;margin:4px 0 0">Bathrooms</p></div>');
            metricCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + (first.intSqft?first.intSqft.toLocaleString():'\u2014') + '</p><p style="font-size:12px;color:#4b5563;margin:4px 0 0">Interior SF</p></div>');
            metricCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + priceSF(first) + '</p><p style="font-size:12px;color:#4b5563;margin:4px 0 0">Price/SF</p></div>');
            if (first.rooms) metricCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + fmtCurrency(Math.round(first.price / first.rooms)) + '</p><p style="font-size:12px;color:#4b5563;margin:4px 0 0">Price/Room</p></div>');
            metricCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + (first.floor||'\u2014') + '</p><p style="font-size:12px;color:#4b5563;margin:4px 0 0">Floor</p></div>');
            d += '<div style="display:grid;grid-template-columns:repeat(' + metricCols.length + ',1fr);gap:16px;padding:16px;background:rgba(196,160,82,0.06);border-radius:8px;margin-bottom:24px">' + metricCols.join('') + '</div>';

            // ── Key Dates (moved to overview area) ──
            var detRow0 = function(label, val) {
                return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6"><span style="color:#6b7280;font-size:14px">' + label + '</span><span style="font-weight:500;font-size:14px">' + val + '</span></div>';
            };
            var dateFields = '';
            if (first.listedDate) dateFields += detRow0('Listed Date', first.listedDate);
            if (first.updatedDate) dateFields += detRow0('Updated Date', first.updatedDate);
            if (first.contractSignedDate) dateFields += detRow0('Contract Signed', first.contractSignedDate);
            if (first.closingDate) dateFields += detRow0('Closing Date', first.closingDate);
            if (dateFields) {
                d += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px">' +
                    '<h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px"><i class="fas fa-calendar-alt" style="color:#6b7280;margin-right:8px"></i>Key Dates</h3>' + dateFields + '</div>';
            }
            // ── Price History (moved to overview area) ──
            if (first.originalPrice && first.originalPrice !== first.price) {
                var pDiff = first.price - first.originalPrice;
                var pPct = ((pDiff / first.originalPrice) * 100).toFixed(1);
                var pColor = pDiff > 0 ? '#dc2626' : '#15803d';
                var pArrow = pDiff > 0 ? 'fa-arrow-up' : 'fa-arrow-down';
                var pSign = pDiff > 0 ? '+' : '';
                d += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px" class="pkg-no-break">' +
                    '<h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px"><i class="fas fa-chart-line" style="color:#6b7280;margin-right:8px"></i>Price History</h3>' +
                    detRow0('Original Price', fmtCurrency(first.originalPrice)) +
                    detRow0('Current Price', fmtCurrency(first.price)) +
                    detRow0('Change', '<span style="color:' + pColor + '"><i class="fas ' + pArrow + '" style="margin-right:4px;font-size:11px"></i>' + pSign + fmtCurrency(Math.abs(pDiff)) + ' (' + pSign + pPct + '%)</span>') +
                    '</div>';
            }

            // ── Property & Financial details (all fields shown in detail) ──
            var detRow = function(label, val) {
                return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6"><span style="color:#6b7280;font-size:14px">' + label + '</span><span style="font-weight:500;font-size:14px">' + val + '</span></div>';
            };
            d += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px" class="pkg-no-break">';

            // Property Details card
            d += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px" class="pkg-no-break">' +
                '<h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px"><i class="fas fa-home" style="color:#C4A052;margin-right:8px"></i>Property Details</h3>' +
                detRow('Type', ownershipLabel(first.ownership)||'\u2014') +
                detRow('Ownership', ownershipLabel(first.ownership)||'\u2014') +
                detRow('Building', first.era||'\u2014') +
                detRow('Total Rooms', first.rooms||'\u2014') +
                detRow('Exposures', first.exposures||'\u2014');
            if (first.crossStreet) d += detRow('Cross Street', first.crossStreet);
            if (first.yearBuilt) d += detRow('Year Built', first.yearBuilt);
            if (first.totalFloors) d += detRow('Total Floors', first.totalFloors);
            if (first.buildingName) d += detRow('Building', first.buildingName);
            d += '</div>';

            // Financial Details card
            d += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px" class="pkg-no-break">' +
                '<h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px"><i class="fas fa-dollar-sign" style="color:#B8860B;margin-right:8px"></i>Financial Details</h3>';
            if (first.listingCategory !== 'rental') {
                d += detRow('Maintenance/CC', first.maintCC ? fmtCurrency(first.maintCC)+'/mo' : '\u2014');
                d += detRow('RE Taxes', first.reTaxes ? fmtCurrency(Math.round(first.reTaxes))+'/mo' : '\u2014');
                d += detRow('Total Monthly', '<span style="color:#15803d;font-weight:600">' + (first.totalMonthly ? fmtCurrency(first.totalMonthly)+'/mo' : '\u2014') + '</span>');
            } else {
                d += detRow('Monthly Rent', '<span style="color:#15803d;font-weight:600">' + fmtCurrency(first.price) + '/mo</span>');
            }
            d += detRow('Price/SqFt', priceSF(first));
            if (first.rooms) d += detRow('Price/Room', fmtCurrency(Math.round(first.price / first.rooms)));
            if (first.originalPrice) d += detRow('Original Price', fmtCurrency(first.originalPrice));
            if (first.walkScore) d += detRow('Walk Score', first.walkScore);
            d += '</div></div>';

            // ── Description (uses custom if edited) ──
            var descText = getReportDescription(first);
            if (descText) {
                d += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px">' +
                    '<h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px"><i class="fas fa-align-left" style="color:#6b7280;margin-right:8px"></i>Description</h3>' +
                    '<p style="font-size:14px;color:#374151;line-height:1.6;margin:0">' + descText + '</p></div>';
            }

            // ── Floor Plans, Media, Photo Gallery (always shown in Detail) ──
            d += renderFloorPlans(first);
            d += renderVirtualTour(first);
            d += renderVideoTour(first);
            d += renderPhotoGallery(first);

            // ── Building Information section ──
            d += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px" class="pkg-no-break">' +
                '<h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px"><i class="fas fa-building" style="color:#C4A052;margin-right:8px"></i>Building Information</h3>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">' +
                detRow('Building Name', first.buildingName || first.address || '\u2014') +
                detRow('Year Built', first.yearBuilt || '\u2014') +
                detRow('Total Floors', first.totalFloors || '\u2014') +
                detRow('Era', first.era || '\u2014') +
                detRow('Condition', first.condition || '\u2014') +
                '</div></div>';

            // ── Links section ──
            var linkHtml = '';
            linkHtml += '<p style="margin:4px 0;font-size:13px"><i class="fas fa-link" style="color:#C4A052;margin-right:6px;width:14px;text-align:center"></i><a href="#" style="color:#C4A052;text-decoration:none">View on mallan.nyc</a></p>';
            if (first.virtualTourUrl) linkHtml += '<p style="margin:4px 0;font-size:13px"><i class="fas fa-vr-cardboard" style="color:#C4A052;margin-right:6px;width:14px;text-align:center"></i><a href="' + first.virtualTourUrl + '" style="color:#C4A052;text-decoration:none">3D Virtual Tour</a></p>';
            if (first.videoTourUrl) linkHtml += '<p style="margin:4px 0;font-size:13px"><i class="fas fa-video" style="color:#C4A052;margin-right:6px;width:14px;text-align:center"></i><a href="' + first.videoTourUrl + '" style="color:#C4A052;text-decoration:none">Video Tour</a></p>';
            linkHtml += '<p style="margin:4px 0;font-size:13px"><i class="fas fa-map-marker-alt" style="color:#C4A052;margin-right:6px;width:14px;text-align:center"></i><a href="https://maps.google.com/?q=' + encodeURIComponent(displayAddr(first) + ' New York NY') + '" style="color:#C4A052;text-decoration:none">Google Map</a></p>';
            linkHtml += '<p style="margin:4px 0;font-size:13px"><i class="fas fa-file-alt" style="color:#C4A052;margin-right:6px;width:14px;text-align:center"></i><a href="#" style="color:#C4A052;text-decoration:none">ACRIS Records</a></p>';
            d += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px">' +
                '<h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px"><i class="fas fa-external-link-alt" style="color:#6b7280;margin-right:8px"></i>Links</h3>' + linkHtml + '</div>';

            // ═══ AGENT VERSION: Listing agent info + building contact + showing ═══
            // Customer version: EXCLUDED — no agent info, no building contact
            if (!isCustomer) {
                // Listing Agent Info
                d += '<div style="padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;margin-bottom:16px" class="pkg-no-break">' +
                    '<p style="font-weight:600;color:#92400e;margin:0 0 8px"><i class="fas fa-user-tie" style="margin-right:6px"></i>Listing Agent Information</p>' +
                    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;color:#374151">' +
                    '<div><span style="font-weight:500">Company:</span> ' + (first.company||'\u2014') + '</div>' +
                    '<div><span style="font-weight:500">Agent:</span> ' + (first.agentName||'\u2014') + '</div>' +
                    '<div><span style="font-weight:500">Listing Type:</span> ' + (first.listingType||'\u2014') + '</div>';
                if (first.lid) d += '<div><span style="font-weight:500">LID:</span> ' + first.lid + '</div>';
                if (first.wid) d += '<div><span style="font-weight:500">WID:</span> ' + first.wid + '</div>';
                if (first.agentEmail) d += '<div><span style="font-weight:500">Email:</span> ' + first.agentEmail + '</div>';
                if (first.agentPhone) d += '<div><span style="font-weight:500">Phone:</span> ' + first.agentPhone + '</div>';
                if (first.showingInstructions) d += '<div style="grid-column:span 3"><span style="font-weight:500">Showing Instructions:</span> ' + first.showingInstructions + '</div>';
                if (first.privateRemarks) d += '<div style="grid-column:span 3"><span style="font-weight:500">Private Remarks:</span> ' + first.privateRemarks + '</div>';
                d += '</div></div>';

                // Building Contact Info (agent-only)
                if (first.buildingContact) {
                    var bc = first.buildingContact;
                    d += '<div style="padding:16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:12px;margin-bottom:16px">' +
                        '<p style="font-weight:600;color:#0c4a6e;margin:0 0 8px"><i class="fas fa-phone-alt" style="margin-right:6px"></i>Building Contact Information</p>' +
                        '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;color:#374151">';
                    if (bc.super) d += '<div><span style="font-weight:500">Superintendent:</span> ' + bc.super + '</div>';
                    if (bc.superPhone) d += '<div><span style="font-weight:500">Super Phone:</span> ' + bc.superPhone + '</div>';
                    if (bc.management) d += '<div><span style="font-weight:500">Management Co:</span> ' + bc.management + '</div>';
                    if (bc.managementPhone) d += '<div><span style="font-weight:500">Mgmt Phone:</span> ' + bc.managementPhone + '</div>';
                    d += '</div></div>';
                }
            }
            d += '</div>' + brokerFooter();
            document.getElementById('previewDetail').innerHTML = d;

            // ═══════════════ COMPARISON FORMAT ═══════════════
            // Respects optContent: photos, address, $/SF, DOM, original price, agent info
            var cl = listings.slice(0,4);
            var c = headerBlock() + agentClientBar() + criteriaBlock();
            var compBgs = ['#eff6ff','#f0fdf4','#faf5ff','#fff7ed'];
            c += '<div style="padding:24px"><div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse;table-layout:fixed">' +
                '<thead><tr style="border-bottom:2px solid #e5e7eb">' +
                '<th style="padding:8px 6px;text-align:left;background:#f3f4f6;width:140px"></th>';
            cl.forEach(function(l,i) {
                var cp = getListingColor(l.id);
                c += '<th style="padding:12px;text-align:center;background:' + compBgs[i%4] + '">';
                if (optContent.listingImages) {
                    c += '<div style="height:96px;border-radius:8px;margin-bottom:8px;overflow:hidden;background:' + cp.bg + '">' +
                        '<img src="' + getListingPhoto(l) + '" alt="" style="width:100%;height:100%;object-fit:cover;filter:contrast(1.05) brightness(1.03)" onerror="' + _imgErr + '">' +
                        '</div>';
                }
                var compAddrText = optContent.fullListingAddress ? displayAddr(l) : (optContent.streetNameOnly ? (l.address || '') : (l.neighborhood || ''));
                c += '<span style="font-weight:700;font-size:12px">' + addrLink(l, compAddrText) + '</span><br>' + mediaLink(l) + '</th>';
            });
            c += '</tr></thead><tbody>';

            var compTdS = 'padding:12px;text-align:center;border-bottom:1px solid #f3f4f6';
            var compThS = 'padding:12px;font-weight:600;color:#374151;text-align:left;border-bottom:1px solid #f3f4f6';
            // Build comparison rows dynamically based on optContent
            var compRows = [
                ['Price', function(l){ return '<td style="' + compTdS + ';font-weight:700;color:#15803d">' + fmtPrice(l) + '</td>'; }, true]
            ];
            if (optContent.originalPrice) compRows.push(['Original Price', function(l){ return '<td style="' + compTdS + '">' + (l.originalPrice ? fmtCurrency(l.originalPrice) : '\u2014') + '</td>'; }, true]);
            if (optContent.priceSqft) compRows.push(['$/SF', function(l){ return '<td style="' + compTdS + '">' + priceSF(l) + '</td>'; }, true]);
            compRows.push(['Bedrooms', function(l){ return '<td style="' + compTdS + '">' + (l.beds||'\u2014') + '</td>'; }, true]);
            compRows.push(['Bathrooms', function(l){ return '<td style="' + compTdS + '">' + (l.baths||'\u2014') + '</td>'; }, true]);
            compRows.push(['SqFt', function(l){ return '<td style="' + compTdS + '">' + (l.intSqft?l.intSqft.toLocaleString():'\u2014') + '</td>'; }, true]);
            compRows.push(['Type', function(l){ return '<td style="' + compTdS + '">' + (ownershipLabel(l.ownership)||'\u2014') + '</td>'; }, true]);
            compRows.push(['Era', function(l){ return '<td style="' + compTdS + '">' + (l.era||'\u2014') + '</td>'; }, true]);
            compRows.push(['Monthly', function(l){ return '<td style="' + compTdS + '">' + (l.totalMonthly?fmtCurrency(l.totalMonthly):'\u2014') + '</td>'; }, true]);
            compRows.push(['Floor', function(l){ return '<td style="' + compTdS + '">' + (l.floor||'\u2014') + '</td>'; }, true]);
            compRows.push(['Neighborhood', function(l){ return '<td style="' + compTdS + ';font-size:12px">' + (l.neighborhood||'\u2014') + '</td>'; }, true]);
            if (optContent.dom) compRows.push(['DOM', function(l){ return '<td style="' + compTdS + '">' + (l.dom||'\u2014') + '</td>'; }, true]);
            if (optContent.crossStreets) compRows.push(['Cross Streets', function(l){ return '<td style="' + compTdS + ';font-size:12px">' + (l.crossStreet||'\u2014') + '</td>'; }, true]);
            compRows.push(['Status', function(l){ return '<td style="' + compTdS + '">' + statusBadge(l.status, l) + '</td>'; }, true]);
            if (optContent.updatedSoldDate) compRows.push(['Listed Date', function(l){ return '<td style="' + compTdS + ';font-size:12px">' + (l.listedDate||'\u2014') + '</td>'; }, true]);
            compRows.forEach(function(r,ri) {
                var rowBg = ri%2===0 ? 'background:#f9fafb;' : '';
                c += '<tr style="' + rowBg + '"><td style="' + compThS + '">' + r[0] + '</td>';
                cl.forEach(function(l){ c += r[1](l); });
                c += '</tr>';
            });
            // Agent-only rows (controlled by listingContact + not customer)
            if (!isCustomer && optContent.listingContact) {
                var agentTdS = 'padding:12px;text-align:center;font-size:12px;border-bottom:1px solid #f3f4f6';
                var agentThS = 'padding:12px;font-weight:600;color:#92400e;text-align:left;border-bottom:1px solid #f3f4f6';
                c += '<tr style="background:#fffbeb"><td style="' + agentThS + '">Company</td>';
                cl.forEach(function(l){ c += '<td style="' + agentTdS + '">' + (l.company||'\u2014') + '</td>'; }); c += '</tr>';
                c += '<tr style="background:#fffbeb"><td style="' + agentThS + '">Agent</td>';
                cl.forEach(function(l){ c += '<td style="' + agentTdS + '">' + (l.agentName||'\u2014') + '</td>'; }); c += '</tr>';
                c += '<tr style="background:#fffbeb"><td style="' + agentThS + '">Listing Type</td>';
                cl.forEach(function(l){ c += '<td style="' + agentTdS + '">' + (l.listingType||'\u2014') + '</td>'; }); c += '</tr>';
            }
            c += '</tbody></table></div></div>' + brokerFooter();
            document.getElementById('previewComparison').innerHTML = c;

            // ═══════════════ FACT SHEET FORMAT ═══════════════
            // Blue header + agent bar (shared), 2-col body: address/price, photos | description + table, agent contact, floor plan page
            var fs = '';
            var fsDisclaimer = '<div style="border-top:1px solid #999;margin-top:auto;padding-top:8px">' +
                '<p style="font-size:7.5px;color:#555;line-height:1.4;margin:0;font-style:italic">' +
                'Reports are prepared by Broker only for Broker or the intended client and may not be relied upon or distributed to any other person. ' +
                'All information is from sources deemed reliable but is subject to errors, omissions, change of price, prior sale or withdrawal without notice. ' +
                'No representation is made as to accuracy of any description or information. All measurements and square footage are approximate. ' +
                'All information, particularly building details, amenities, and requirements, is subject to change and should be confirmed by client. ' +
                'All rights to content, photographs and graphics reserved to Broker or content source. Broker supports equal housing opportunity. ' +
                'If report includes a listing that is RLS: Participant Only, retransmission, redistribution or copying of this listing information is strictly prohibited.</p></div>';

            listings.forEach(function(l, idx) {
                var isRental = l.listingCategory === 'rental';
                var mlsId = l.lid || l.wid || '';
                var ownerType = ownershipLabel(l.ownership) || l.propertySubType || '';

                // ── Page 1: Listing fact sheet ──
                fs += '<div class="pkg-per-listing">';
                fs += headerBlock();
                fs += agentClientBar();
                if (idx === 0) fs += complianceBanner;

                // Body wrapper
                fs += '<div style="padding:20px 28px;font-family:Arial,Helvetica,sans-serif;color:#111;display:flex;flex-direction:column;flex:1">';

                // Listing address + price line
                fs += '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:0 0 6px" class="pkg-no-break"><div>';
                if (optContent.fullListingAddress) {
                    fs += '<p style="font-size:15px;font-weight:700;color:#111;margin:0">' + addrLink(l, displayAddr(l).toUpperCase(), 'text-decoration:underline') + ' &nbsp; ' + mediaLink(l) + '</p>';
                } else {
                    fs += '<p style="font-size:15px;font-weight:700;color:#111;margin:0">' + addrLink(l, (l.address || '').toUpperCase(), 'text-decoration:underline') + ' &nbsp; ' + mediaLink(l) + '</p>';
                }
                var crossParts = [];
                if (l.neighborhood) crossParts.push(l.neighborhood);
                if (optContent.crossStreets && l.crossStreet) crossParts.push(l.crossStreet.replace(/&/g, 'and').toUpperCase());
                if (l.zip) crossParts.push(l.zip);
                if (crossParts.length) fs += '<p style="font-size:11px;color:#333;margin:3px 0 0">' + crossParts.join(', ') + '</p>';
                fs += '</div>';
                fs += '<div style="text-align:right">' +
                    '<p style="font-size:20px;font-weight:700;color:#111;margin:0">' + fmtPrice(l) + '</p>' +
                    '<p style="font-size:11px;color:#555;margin:2px 0 0">' + (l.status || 'Active') + ' / ' + ownerType + (mlsId ? ' / #' + mlsId : '') + '</p></div></div>';
                fs += '<hr style="border:none;border-top:1px solid #bbb;margin:0 0 12px">';

                // Body: photos + description + details table
                var photos = getListingPhotos(l).filter(function(img) { return img.imageOf !== 'FloorPlan' && img.mediaCategory !== 'FloorPlan'; });
                var fsPhotoCount = optContent.factSheetPhotoCount || 4;
                var fsPhotoLayout = optContent.factSheetPhotoLayout || 'vertical';
                var showPhotos = optContent.listingImages ? Math.min(photos.length, fsPhotoCount) : 0;

                // Horizontal layout: photos as full-width row above details
                if (showPhotos > 0 && fsPhotoLayout === 'horizontal') {
                    var photoH = showPhotos <= 2 ? '120px' : showPhotos <= 4 ? '100px' : '80px';
                    fs += '<div style="display:flex;gap:6px;margin-bottom:10px">';
                    for (var pi = 0; pi < showPhotos; pi++) {
                        fs += '<div style="flex:1;background:#f5f5f5;height:' + photoH + ';overflow:hidden"><img src="' + photos[pi].url + '" alt="' + (photos[pi].caption || '') + '" style="width:100%;height:100%;object-fit:cover;display:block" onerror="' + _imgErr + '"></div>';
                    }
                    fs += '</div>';
                }

                fs += '<div style="display:flex;gap:14px;flex:1">';

                // Vertical layout: photos as left column
                if (showPhotos > 0 && fsPhotoLayout === 'vertical') {
                    var photoH = showPhotos <= 2 ? '160px' : showPhotos <= 4 ? '110px' : '80px';
                    fs += '<div style="width:34%;flex-shrink:0">';
                    for (var pi = 0; pi < showPhotos; pi++) {
                        fs += '<div style="margin-bottom:4px;background:#f5f5f5;height:' + photoH + ';overflow:hidden"><img src="' + photos[pi].url + '" alt="' + (photos[pi].caption || '') + '" style="width:100%;height:100%;object-fit:cover;display:block" onerror="' + _imgErr + '"></div>';
                    }
                    fs += '</div>';
                }

                // Details column (full width when horizontal, right side when vertical)
                fs += '<div style="flex:1;min-width:0">';

                // Description
                var fsDesc = getReportDescription(l);
                if (fsDesc) {
                    fs += '<div style="font-size:11.5px;color:#222;line-height:1.55;margin-bottom:14px;text-align:justify">' + fsDesc + '</div>';
                }

                // Details table (bold label left, value right, light row borders)
                var trs = '';
                var fsRow = function(label, value) {
                    if (value === null || value === undefined || value === '' || value === false) return '';
                    return '<tr><td style="padding:4px 8px;font-weight:700;font-size:11px;color:#111;white-space:nowrap;border-bottom:1px solid #ddd;width:38%">' + label + '</td>' +
                        '<td style="padding:4px 8px;font-size:11px;color:#333;border-bottom:1px solid #ddd">' + value + '</td></tr>';
                };

                trs += fsRow('Building Name', l.buildingName || '');
                if (!isRental) {
                    trs += fsRow('Maintenance', l.maintCC ? '$' + Number(l.maintCC).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '');
                    if (l.ownership === 'StockCooperative' && l.shares) trs += fsRow('Shares', l.shares);
                }
                var rmBdBth = '';
                if (isRental) {
                    rmBdBth = (l.rooms || '\u2014') + '/' + (l.beds === 0 ? 'Studio' : (l.beds || '\u2014')) + '/' + (l.baths || '\u2014');
                } else {
                    rmBdBth = (l.rooms ? l.rooms + '.0' : '\u2014') + '/' + (l.beds || '\u2014') + '/' + (l.baths ? l.baths + '.0' : '\u2014');
                }
                trs += fsRow('Rm/Bd/Bth', rmBdBth);
                trs += fsRow('Approx Interior SqFt', l.intSqft ? l.intSqft.toLocaleString() : '');
                if (optContent.priceSqft && l.intSqft) trs += fsRow('Price / SqFt', '$' + Math.round(l.price / l.intSqft).toLocaleString());
                trs += fsRow('Approx Exterior SqFt', l.extSqft !== undefined ? l.extSqft : '0');
                trs += fsRow('Private Outdoor Space', l.outdoorSpace || 'None');
                trs += fsRow('Attended Lobby', l.lobby || l.attendedLobby || '');
                if (optContent.originalPrice && l.originalPrice) trs += fsRow('Original Price', '$' + Number(l.originalPrice).toLocaleString());
                if (l.closedPrice) trs += fsRow('Closed Price', '$' + Number(l.closedPrice).toLocaleString());
                if (l.lastAskPrice) trs += fsRow('Last Ask Price', '$' + Number(l.lastAskPrice).toLocaleString());

                if (!isRental) {
                    trs += fsRow('Building Allows', l.buildingAllows || '');
                    if (l.flipTaxAmount) trs += fsRow('Flip Tax Amount', l.flipTaxAmount);
                    if (l.flipTaxType) trs += fsRow('Flip Tax Type', l.flipTaxType);
                    if (l.flipTaxRemarks) trs += fsRow('Flip Tax Remarks', l.flipTaxRemarks);
                    trs += fsRow('Financing Allowed', l.financingAllowed || '');
                    if (optContent.priceRoom && l.rooms && l.price) trs += fsRow('Price / Room', '$' + Math.round(l.price / l.rooms).toLocaleString());
                } else {
                    trs += fsRow('Unit Pet Policy', l.petPolicy || '');
                    trs += fsRow('Lease Type', l.leaseType || '');
                    trs += fsRow('Lease Terms', l.leaseTerms || '');
                    var bldgInfo = [];
                    if (l.buildingAmenities) bldgInfo.push(l.buildingAmenities);
                    if (l.totalFloors) bldgInfo.push(l.totalFloors + ' Floors');
                    if (l.totalUnits) bldgInfo.push(l.totalUnits + ' Units');
                    if (bldgInfo.length) trs += fsRow('Building Information', bldgInfo.join(', '));
                    if (!isCustomer && l.commission) trs += fsRow('Commission', l.commission);
                }

                if (optContent.dom) trs += fsRow('Days on Market', l.dom || '');
                if (optContent.updatedSoldDate) {
                    trs += fsRow('Listed Date', l.listedDate || '');
                    if (l.updatedDate) trs += fsRow('Updated Date', l.updatedDate);
                }
                var ohStr = l.openHouse ? formatOpenHouse(l.openHouse) : '---';
                trs += fsRow('Open House', ohStr);

                fs += '<table style="width:100%;border-collapse:collapse">' + trs + '</table>';

                // Agent-only data (controlled by listingContact + not customer)
                if (!isCustomer && optContent.listingContact) {
                    var agentData = [];
                    if (l.company) agentData.push('Listing: ' + l.company);
                    if (l.agentName) agentData.push('Agent: ' + l.agentName);
                    if (l.commission) agentData.push('Commission: ' + l.commission);
                    if (l.showingInstructions) agentData.push('Showing: ' + l.showingInstructions);
                    if (agentData.length) {
                        fs += '<div style="margin-top:10px;padding:8px;background:#fff8e7;border:1px solid #e8d8a0;font-size:10px;color:#444">' +
                            '<span style="font-weight:700;color:#8b6914">Agent Only:</span> ' + agentData.join(' &middot; ') + '</div>';
                    }
                }

                fs += '</div>'; // close right column
                fs += '</div>'; // close 2-col flex

                // Per-listing attribution + disclaimer
                fs += '<div style="margin-top:8px">' + listingAttribution(l) + '</div>';
                fs += fsDisclaimer;

                fs += '</div>'; // close body wrapper
                fs += brokerFooter();
                fs += '</div>'; // close pkg-per-listing

                // ── Page 2: Floor plan (if available) ──
                var floorPlans = (l.images || []).filter(function(img) {
                    return img.mediaCategory === 'FloorPlan' || img.imageOf === 'FloorPlan';
                });
                if (optContent.listingFloorplans && floorPlans.length > 0) {
                    fs += '<div class="pkg-per-listing">';
                    fs += headerBlock();
                    fs += agentClientBar();
                    fs += '<div style="padding:20px 28px;font-family:Arial,Helvetica,sans-serif;color:#111;display:flex;flex-direction:column;flex:1">';
                    fs += '<p style="font-size:14px;font-weight:700;color:#111;margin:0">' + addrLink(l, displayAddr(l).toUpperCase(), 'text-decoration:underline') + '</p>';
                    fs += '<hr style="border:none;border-top:1px solid #bbb;margin:8px 0 0">';
                    fs += '<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px 0">';
                    floorPlans.forEach(function(fp) {
                        fs += '<img src="' + fp.url + '" alt="' + (fp.caption || 'Floor Plan') + '" style="max-width:85%;max-height:560px" onerror="' + _imgErr + '">';
                    });
                    fs += '</div>';
                    fs += fsDisclaimer;
                    fs += '</div>'; // close body wrapper
                    fs += brokerFooter();
                    fs += '</div>'; // close floor plan page
                }
            });
            document.getElementById('previewFactSheet').innerHTML = fs;

            // ═══════════════ CMA FORMAT (Step 3) ═══════════════
            // Respects optContent: photos, address, $/SF, DOM, original price, dates, averages, agent info
            var subject = listings[0] || {};
            var comps = listings.slice(1);
            var cma = headerBlock() + agentClientBar() + complianceBanner;
            // Subject property
            cma += '<div style="padding:24px"><h2 style="font-size:16px;font-weight:700;color:#111827;margin:0 0 16px;border-bottom:2px solid #C4A052;padding-bottom:8px">Subject Property</h2>';
            var sp = getListingColor(subject.id||1);
            var cmaSubjPhoto = getListingPhoto(subject);
            cma += '<div style="display:grid;grid-template-columns:' + (optContent.listingImages ? '200px ' : '') + '1fr;gap:20px;margin-bottom:24px">';
            // Photo (controlled by listingImages)
            if (optContent.listingImages) {
                cma += '<div style="height:160px;border-radius:8px;overflow:hidden">' +
                    (cmaSubjPhoto ? '<img src="' + cmaSubjPhoto + '" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '" />' :
                    '<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:' + sp.bg + '"><i class="fas fa-camera" style="font-size:36px;color:' + sp.icon + '"></i><span style="font-size:12px;margin-top:4px;color:' + sp.accent + '">' + (subject.neighborhood||'') + '</span></div>') +
                    '</div>';
            }
            cma += '<div><h3 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 4px">' + fmtPrice(subject) + '</h3>';
            // Address (controlled by fullListingAddress / streetNameOnly)
            if (optContent.fullListingAddress) {
                cma += '<p style="font-size:16px;color:#374151;margin:0 0 4px">' + addrLink(subject) + '</p>';
            } else if (optContent.streetNameOnly) {
                cma += '<p style="font-size:16px;color:#374151;margin:0 0 4px">' + addrLink(subject, subject.address || '') + '</p>';
            }
            cma += '<p style="color:#6b7280;font-size:13px;margin:0 0 12px">' + (subject.neighborhood||'') + ' &nbsp; ' + mediaLink(subject) + '</p>';
            if (optContent.crossStreets && subject.crossStreet) cma += '<p style="font-size:12px;color:#9ca3af;margin:0 0 8px">Cross: ' + subject.crossStreet + '</p>';
            cma += '<div style="display:flex;gap:16px;font-size:13px;color:#4b5563">' +
                '<span><i class="fas fa-bed" style="margin-right:4px"></i>' + (subject.beds||0) + ' BR</span>' +
                '<span><i class="fas fa-bath" style="margin-right:4px"></i>' + (subject.baths||0) + ' BA</span>' +
                '<span><i class="fas fa-ruler-combined" style="margin-right:4px"></i>' + (subject.intSqft?subject.intSqft.toLocaleString():'--') + ' SF</span>';
            if (optContent.priceSqft) cma += '<span>' + priceSF(subject) + '/SF</span>';
            if (optContent.dom) cma += '<span>DOM: ' + (subject.dom||'\u2014') + '</span>';
            if (optContent.originalPrice && subject.originalPrice && subject.originalPrice !== subject.price) cma += '<span>Original: ' + fmtCurrency(subject.originalPrice) + '</span>';
            cma += '</div></div></div>';
            // Description for subject (uses custom if edited)
            var cmaDesc = getReportDescription(subject);
            if (cmaDesc) {
                cma += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px">' +
                    '<p style="font-size:13px;color:#374151;line-height:1.6;margin:0">' + (cmaDesc.length > 300 ? cmaDesc.substring(0,297) + '...' : cmaDesc) + '</p></div>';
            }
            // Media section for subject property
            cma += renderMediaSection(subject, optContent);
            // Comparables table
            if (comps.length > 0) {
                cma += '<h2 style="font-size:16px;font-weight:700;color:#111827;margin:24px 0 16px;border-bottom:2px solid #C4A052;padding-bottom:8px">Comparable Properties (' + comps.length + ')</h2>';
                var cmaThS = 'padding:10px;font-weight:600;color:#374151;font-size:12px;text-align:left;white-space:nowrap;background:#f3f4f6';
                var cmaTdS = 'padding:10px;font-size:13px;border-bottom:1px solid #f3f4f6';
                // Build CMA table headers dynamically
                var cmaHeaders = '<th style="' + cmaThS + '">#</th><th style="' + cmaThS + '">Address</th><th style="' + cmaThS + '">Price</th>';
                if (optContent.originalPrice) cmaHeaders += '<th style="' + cmaThS + '">Orig Price</th>';
                cmaHeaders += '<th style="' + cmaThS + '">BR</th><th style="' + cmaThS + '">BA</th><th style="' + cmaThS + '">SqFt</th>';
                if (optContent.priceSqft) cmaHeaders += '<th style="' + cmaThS + '">$/SF</th>';
                cmaHeaders += '<th style="' + cmaThS + '">Type</th>';
                if (optContent.dom) cmaHeaders += '<th style="' + cmaThS + '">DOM</th>';
                cmaHeaders += '<th style="' + cmaThS + '">Status</th>';
                if (optContent.updatedSoldDate) cmaHeaders += '<th style="' + cmaThS + '">Listed</th>';
                if (!isCustomer && optContent.listingContact) cmaHeaders += '<th style="' + cmaThS + '">Company</th>';
                cma += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
                    '<thead><tr>' + cmaHeaders + '</tr></thead><tbody>';
                comps.forEach(function(cl,ci) {
                    var rowBg = ci%2===1 ? 'background:rgba(239,246,255,0.3);' : '';
                    cma += '<tr style="' + rowBg + '">' +
                        '<td style="' + cmaTdS + ';color:#6b7280">' + (ci+1) + '</td>' +
                        '<td style="' + cmaTdS + ';font-weight:500">' + addrLink(cl) + '<br>' + mediaLink(cl) + '</td>' +
                        '<td style="' + cmaTdS + ';font-weight:600;color:#15803d">' + fmtPrice(cl) + '</td>';
                    if (optContent.originalPrice) cma += '<td style="' + cmaTdS + '">' + (cl.originalPrice ? fmtCurrency(cl.originalPrice) : '\u2014') + '</td>';
                    cma += '<td style="' + cmaTdS + '">' + (cl.beds||'\u2014') + '</td>' +
                        '<td style="' + cmaTdS + '">' + (cl.baths||'\u2014') + '</td>' +
                        '<td style="' + cmaTdS + '">' + (cl.intSqft?cl.intSqft.toLocaleString():'\u2014') + '</td>';
                    if (optContent.priceSqft) cma += '<td style="' + cmaTdS + '">' + priceSF(cl) + '</td>';
                    cma += '<td style="' + cmaTdS + '">' + (ownershipLabel(cl.ownership)||'\u2014') + '</td>';
                    if (optContent.dom) cma += '<td style="' + cmaTdS + '">' + (cl.dom||'\u2014') + '</td>';
                    cma += '<td style="' + cmaTdS + '">' + statusBadge(cl.status, cl) + '</td>';
                    if (optContent.updatedSoldDate) cma += '<td style="' + cmaTdS + ';font-size:12px">' + (cl.listedDate||'\u2014') + '</td>';
                    if (!isCustomer && optContent.listingContact) cma += '<td style="' + cmaTdS + ';font-size:12px">' + (cl.company||'\u2014') + '</td>';
                    cma += '</tr>';
                });
                cma += '</tbody></table></div>';
            }
            // Market summary stats (controlled by includeAverages)
            if (optContent.includeAverages) {
                var allCma = listings;
                var cmaTP=0,cmaTSF=0,cmaTD=0,cmaCsf=0;
                allCma.forEach(function(l){ cmaTP+=l.price||0; if(l.intSqft){cmaTSF+=l.intSqft;cmaCsf++;} cmaTD+=l.dom||0; });
                var cmaN = allCma.length||1;
                var cmaAP = Math.round(cmaTP/cmaN), cmaASF = cmaCsf>0?Math.round(cmaTSF/cmaCsf):0;
                var cmaAPSF = cmaASF>0?Math.round(cmaAP/cmaASF):0, cmaAD = Math.round(cmaTD/cmaN);
                var prices = allCma.map(function(l){return l.price||0;}).sort(function(a,b){return a-b;});
                var medianPrice = prices.length%2===0 ? Math.round((prices[prices.length/2-1]+prices[prices.length/2])/2) : prices[Math.floor(prices.length/2)];
                cma += '<h2 style="font-size:16px;font-weight:700;color:#111827;margin:24px 0 16px;border-bottom:2px solid #C4A052;padding-bottom:8px">Market Summary</h2>';
                cma += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">';
                var cmaStat = function(label, val) {
                    return '<div style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb"><p style="font-size:20px;font-weight:700;color:#111827;margin:0">' + val + '</p><p style="font-size:11px;color:#6b7280;margin:4px 0 0">' + label + '</p></div>';
                };
                cma += cmaStat('Avg Price', fmtCurrency(cmaAP));
                if (optContent.priceSqft) cma += cmaStat('Avg $/SF', cmaAPSF ? fmtCurrency(cmaAPSF) : '\u2014');
                cma += cmaStat('Median Price', fmtCurrency(medianPrice));
                if (optContent.dom) cma += cmaStat('Avg DOM', cmaAD + ' days');
                cma += cmaStat('Price Range', fmtCurrency(prices[0]) + ' \u2013 ' + fmtCurrency(prices[prices.length-1]));
                cma += '</div>';
            }
            // Chart placeholder (always shown — uses listings directly)
            cma += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;text-align:center">' +
                '<h3 style="font-weight:600;color:#111827;margin:0 0 12px;font-size:14px">Price Comparison</h3>' +
                '<div style="display:flex;align-items:flex-end;justify-content:center;gap:12px;height:160px;padding:0 20px">';
            var maxP = Math.max.apply(null, listings.map(function(l){return l.price||0;}));
            listings.forEach(function(l,i) {
                var h = maxP > 0 ? Math.round((l.price||0)/maxP*140) : 10;
                var colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];
                cma += '<div style="text-align:center;flex:1;max-width:100px"><div style="height:' + h + 'px;background:' + colors[i%colors.length] + ';border-radius:4px 4px 0 0;margin-bottom:6px"></div>' +
                    '<p style="font-size:10px;color:#6b7280;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (l.addressDisplayYN === false ? 'N/A' : (l.address||'').split(',')[0]) + '</p>' +
                    '<p style="font-size:11px;font-weight:600;color:#111827;margin:2px 0 0">' + fmtCurrency(l.price) + '</p></div>';
            });
            cma += '</div></div>';
            cma += statisticalDisclaimer() + '</div>' + brokerFooter();
            document.getElementById('previewCma').innerHTML = cma;

            // ═══════════════ OPEN HOUSE FORMAT (Step 4) ═══════════════
            // Respects optContent: photos, address, $/SF, DOM, cross streets, description editor, open house date
            var ohFirst = listings[0] || {};
            var oh = '';
            // Large hero photo area (controlled by listingImages)
            if (optContent.listingImages) {
                var ohp = getListingColor(ohFirst.id||1);
                var ohPhoto = getListingPhoto(ohFirst);
                oh += '<div style="position:relative;height:300px;overflow:hidden">' +
                    (ohPhoto ? '<img src="' + ohPhoto + '" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '" />' :
                    '<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:' + ohp.bg + '"><i class="fas fa-camera" style="font-size:64px;color:' + ohp.icon + '"></i><span style="font-size:16px;margin-top:8px;color:' + ohp.accent + ';font-weight:500">' + (ohFirst.neighborhood||'') + '</span></div>') +
                    '<span style="position:absolute;top:12px;left:12px;padding:6px 16px;color:#fff;font-size:14px;font-weight:700;border-radius:6px;background:' + statusColor(ohFirst.status).color + '">' + (ohFirst.status||'ACTIVE') + '</span>' +
                    '<span style="position:absolute;top:12px;right:12px;padding:6px 16px;background:rgba(0,0,0,0.7);color:#fff;font-size:14px;font-weight:700;border-radius:6px"><i class="fas fa-door-open" style="margin-right:6px"></i>OPEN HOUSE</span></div>';
            }
            // Address & price bar
            oh += '<div style="padding:24px 32px;background:rgb(18,25,40);background-image:linear-gradient(180deg, rgba(20,27,45,0.92) 0%, rgba(15,23,42,0.86) 100%);color:#fff;border-bottom:1px solid rgba(255,255,255,0.08);box-shadow:inset 0 1px 0 0 rgba(255,255,255,0.07),0 4px 24px rgba(0,0,0,0.15)">' +
                '<div style="display:flex;align-items:center;justify-content:space-between">' +
                '<div>';
            if (optContent.fullListingAddress) {
                oh += '<h1 style="font-size:24px;font-weight:700;margin:0;font-family:Urbanist,system-ui,sans-serif;letter-spacing:-0.02em">' + addrLink(ohFirst, null, 'color:#fff') + '</h1>';
            } else if (optContent.streetNameOnly) {
                oh += '<h1 style="font-size:24px;font-weight:700;margin:0;font-family:Urbanist,system-ui,sans-serif;letter-spacing:-0.02em">' + addrLink(ohFirst, ohFirst.address || '', 'color:#fff') + '</h1>';
            } else {
                oh += '<h1 style="font-size:24px;font-weight:700;margin:0;font-family:Urbanist,system-ui,sans-serif;letter-spacing:-0.02em">' + addrLink(ohFirst, ohFirst.neighborhood||'', 'color:#fff') + '</h1>';
            }
            oh += '<p style="color:rgba(255,255,255,0.5);font-size:14px;margin:4px 0 0;font-family:Inter,system-ui,sans-serif;font-weight:300">' + (ohFirst.neighborhood||'') + ', NY ' + (ohFirst.zip||'') + ' &nbsp; ' + mediaLink(ohFirst) + '</p>';
            if (optContent.crossStreets && ohFirst.crossStreet) oh += '<p style="color:rgba(255,255,255,0.4);font-size:12px;margin:2px 0 0;font-family:Inter,system-ui,sans-serif;font-weight:300">Cross: ' + ohFirst.crossStreet + '</p>';
            oh += '</div>' +
                '<div style="text-align:right"><p style="font-size:24px;font-weight:700;margin:0;font-family:Urbanist,system-ui,sans-serif">' + fmtPrice(ohFirst) + '</p>';
            if (optContent.priceSqft) oh += '<p style="color:#D4AF37;font-size:13px;margin:4px 0 0;font-family:Inter,system-ui,sans-serif;font-weight:300">' + priceSF(ohFirst) + '/SF</p>';
            oh += '</div></div></div>';
            // Open House date/time (controlled by nextOpenHouse)
            if (optContent.nextOpenHouse || ohFirst.nextOpenHouse) {
                oh += '<div style="padding:20px 32px;background:rgba(196,160,82,0.06);border-bottom:1px solid rgba(196,160,82,0.12)">' +
                    '<div style="display:flex;align-items:center;justify-content:center;gap:20px">' +
                    '<div style="text-align:center"><i class="fas fa-calendar-alt" style="font-size:28px;color:#B8860B"></i></div>' +
                    '<div><p style="font-size:18px;font-weight:700;color:#B8860B;margin:0;font-family:Urbanist,system-ui,sans-serif">Open House</p>' +
                    '<p style="font-size:14px;color:rgba(10,10,10,0.7);margin:4px 0 0;font-family:Inter,system-ui,sans-serif;font-weight:300">' + (formatOpenHouse(ohFirst.nextOpenHouse) || 'Date & Time TBD \u2014 Contact Agent') + '</p></div></div></div>';
            }
            // Key features
            var ohStatCols = [];
            ohStatCols.push('<div style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + (ohFirst.beds||'\u2014') + '</p><p style="font-size:12px;color:#6b7280;margin:4px 0 0">Bedrooms</p></div>');
            ohStatCols.push('<div style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + (ohFirst.baths||'\u2014') + '</p><p style="font-size:12px;color:#6b7280;margin:4px 0 0">Bathrooms</p></div>');
            ohStatCols.push('<div style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + (ohFirst.intSqft?ohFirst.intSqft.toLocaleString():'\u2014') + '</p><p style="font-size:12px;color:#6b7280;margin:4px 0 0">Square Feet</p></div>');
            if (optContent.priceSqft) ohStatCols.push('<div style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + priceSF(ohFirst) + '</p><p style="font-size:12px;color:#6b7280;margin:4px 0 0">Price/SF</p></div>');
            ohStatCols.push('<div style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + (ohFirst.floor||'\u2014') + '</p><p style="font-size:12px;color:#6b7280;margin:4px 0 0">Floor</p></div>');
            oh += '<div style="padding:24px"><div style="display:grid;grid-template-columns:repeat(' + ohStatCols.length + ',1fr);gap:16px;margin-bottom:24px">' + ohStatCols.join('') + '</div>';
            // Description (uses custom if edited, truncated)
            var ohDesc = getReportDescription(ohFirst);
            if (ohDesc) {
                if (ohDesc.length > 400) ohDesc = ohDesc.substring(0, 397) + '...';
                oh += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px">' +
                    '<p style="font-size:14px;color:#374151;line-height:1.6;margin:0">' + ohDesc + '</p></div>';
            }
            // Media section for open house
            oh += renderMediaSection(ohFirst, optContent);
            // Links section
            var ohLinks = '';
            if (optContent.listingWebLink) ohLinks += '<span style="margin-right:16px;font-size:13px"><i class="fas fa-link" style="color:#C4A052;margin-right:4px"></i><a href="#" style="color:#C4A052;text-decoration:none">View on mallan.nyc</a></span>';
            if (optContent.googleMapLink) ohLinks += '<span style="margin-right:16px;font-size:13px"><i class="fas fa-map-marker-alt" style="color:#C4A052;margin-right:4px"></i><a href="https://maps.google.com/?q=' + encodeURIComponent(displayAddr(ohFirst) + ' New York NY') + '" style="color:#C4A052;text-decoration:none">Google Map</a></span>';
            if (optContent.mediaViewerLink && ohFirst.virtualTourUrl) ohLinks += '<span style="font-size:13px"><i class="fas fa-video" style="color:#C4A052;margin-right:4px"></i><a href="' + ohFirst.virtualTourUrl + '" style="color:#C4A052;text-decoration:none">Virtual Tour</a></span>';
            if (ohLinks) oh += '<div style="margin-bottom:24px">' + ohLinks + '</div>';
            // Agent contact card (prominent)
            oh += '<div style="display:flex;align-items:center;gap:20px;padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px" class="pkg-no-break">' +
                '<div style="width:80px;height:80px;background:#d1d5db;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
                '<i class="fas fa-user" style="color:#6b7280;font-size:32px"></i></div>' +
                '<div><p style="font-size:18px;font-weight:700;color:#111827;margin:0">' + agentInfo.name + '</p>' +
                '<p style="font-size:14px;color:#4b5563;margin:2px 0 0">' + agentInfo.title + '</p>' +
                '<p style="font-size:14px;color:#4b5563;margin:2px 0 0">' + agentInfo.company + '</p>' +
                '<div style="display:flex;gap:16px;margin-top:8px;font-size:14px">' +
                '<span style="color:#C4A052"><i class="fas fa-phone" style="margin-right:4px"></i>' + agentInfo.phone + '</span>' +
                '<span style="color:#C4A052"><i class="fas fa-envelope" style="margin-right:4px"></i>' + agentInfo.email + '</span></div></div></div></div>';
            oh += brokerFooter();
            document.getElementById('previewOpenHouse').innerHTML = oh;

            // ═══════════════ IMAGES FORMAT (Step 5) ═══════════════
            // Respects optContent: address, $/SF, DOM, agent info, floorplans
            var img = headerBlock() + agentClientBar() + complianceBanner;
            img += '<div style="padding:24px">';
            listings.forEach(function(l) {
                var ip = getListingColor(l.id);
                img += '<div style="margin-bottom:32px" class="pkg-per-listing">';
                // Header with address + stats
                var imgAddrText = optContent.fullListingAddress ? displayAddr(l) : (optContent.streetNameOnly ? (l.address || '') : (l.neighborhood || ''));
                var imgStats = fmtPrice(l) + ' | ' + (l.beds||0) + ' BR / ' + (l.baths||0) + ' BA';
                if (l.intSqft) imgStats += ' | ' + l.intSqft.toLocaleString() + ' SF';
                if (optContent.priceSqft) imgStats += ' | ' + priceSF(l) + '/SF';
                if (optContent.dom) imgStats += ' | DOM: ' + (l.dom||'\u2014');
                img += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb">' +
                    '<div><h3 style="font-weight:700;color:#111827;margin:0;font-size:15px">' + addrLink(l, imgAddrText) + '</h3>' +
                    '<p style="font-size:13px;color:#6b7280;margin:2px 0 0">' + imgStats + '</p></div>' +
                    '<span style="padding:4px 10px;background:rgba(196,160,82,0.06);color:#B8860B;font-size:12px;border-radius:4px;font-weight:600"><i class="fas fa-images" style="margin-right:4px"></i>' + (reportedPhotoCount(l) == null ? 'Photo count not provided' : reportedPhotoCount(l) + ' photos') + '</span></div>';
                // Photo grid 3-col
                img += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">';
                // The grid renders the media that exists, once each. It used to
                // render `photoCount || 6` tiles and fill them with `imgArr[pi % len]`,
                // so two real photos became a six-tile grid of repeats numbered 1..6.
                var imgArr = reportPhotoTiles(l);
                for (var pi = 0; pi < imgArr.length; pi++) {
                    var hgt = pi === 0 ? '180px' : '120px';
                    var span = pi === 0 ? 'grid-column:span 2;grid-row:span 2;' : '';
                    var imgUrl = imgArr[pi].url;
                    img += '<div style="' + span + 'height:' + (pi===0?'260px':hgt) + ';border-radius:6px;overflow:hidden;position:relative;background:#f1f5f9">' +
                        '<img src="' + imgUrl + '" alt="" style="width:100%;height:100%;object-fit:cover;filter:contrast(1.05) brightness(1.03)" onerror="' + _imgErr + '">' +
                        '<span style="position:absolute;bottom:4px;right:6px;font-size:10px;color:rgba(255,255,255,0.8);background:rgba(0,0,0,0.5);padding:1px 4px;border-radius:2px">' + (pi+1) + '</span></div>';
                }
                img += '</div>';
                // Floorplans section (controlled by listingFloorplans — shows actual floor plan images)
                if (optContent.listingFloorplans) {
                    var imgFP = renderFloorPlans(l);
                    if (imgFP) {
                        img += '<div style="margin-top:12px">' + imgFP + '</div>';
                    }
                }
                // Virtual/Video tours (controlled by virtualTour/videoTour)
                if (optContent.virtualTour) img += renderVirtualTour(l);
                if (optContent.videoTour) img += renderVideoTour(l);
                // Agent info per listing (controlled by listingContact)
                if (!isCustomer && optContent.listingContact) {
                    img += '<div style="margin-top:8px;font-size:12px;color:#9ca3af">' + (l.company||'') + ' \u2014 ' + (l.agentName||'') + '</div>';
                }
                img += '</div>';
            });
            img += '</div>' + brokerFooter();
            document.getElementById('previewImages').innerHTML = img;


            // ═══════════════ UPDATE PREVIEW FOOTER ═══════════════
            var fEl = document.getElementById('reportPreviewFooter');
            if (fEl) {
                var vLabel = isCustomer ? 'Customer Version' : 'Agent Version';
                var footerSpans = fEl.querySelector('.flex.items-center.gap-4');
                if (footerSpans) {
                    footerSpans.innerHTML =
                        '<span><i class="fas fa-file-alt" style="margin-right:4px"></i>' + listings.length + ' listings</span>' +
                        '<span><i class="fas fa-calendar" style="margin-right:4px"></i>' + shortDate + '</span>' +
                        '<span><i class="fas fa-user" style="margin-right:4px"></i>' + vLabel + '</span>';
                }
            }
        }

        function closeReportPreview() {
            document.getElementById('reportPreviewModal').classList.add('hidden');
        }

        // copyReportToClipboard removed — emails are sent directly from the system

        // ── Send email directly from CRM system ──
        // Posts to /api/crm/email when wired; until then writes the send to
        // localStorage so the sent-emails panel still has data to render.
        var _sentEmailsKey = 'sentEmails_' + LOGGED_IN_AGENT.id;
        var sentEmails = JSON.parse(localStorage.getItem(_sentEmailsKey)) || [];

        function sendEmailDirect(opts) {
            // Sanitize user-supplied strings to prevent XSS in innerHTML contexts
            function escapeHTML(str) { var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
            var agent = typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE : { name: '', phone: '', email: '', company: 'Mallan Real Estate Inc.' };
            var to = escapeHTML(opts.to || '');
            var toName = escapeHTML(opts.toName || to);
            var subject = opts.subject || 'Property Report — Mallan Real Estate';
            var count = opts.count || 0;
            var useRealEmail = (typeof isEmailConfigured === 'function') && isEmailConfigured();

            // Show sending overlay
            var overlay = document.createElement('div');
            overlay.id = 'emailSendingOverlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = '<div style="background:#fff;border-radius:12px;padding:40px 48px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);max-width:420px;width:90%;">' +
                '<div id="emailSendingSpinner" style="margin:0 auto 16px;">' +
                    '<div style="width:48px;height:48px;border:4px solid #e5e7eb;border-top:4px solid #C4A052;border-radius:50%;animation:emailSpin 1s linear infinite;margin:0 auto;"></div>' +
                '</div>' +
                '<div id="emailSendingIcon" style="display:none;margin:0 auto 16px;"></div>' +
                '<p id="emailSendingMsg" style="font-size:15px;font-weight:600;color:#1a1a1a;margin:0 0 8px;">Sending email...</p>' +
                '<p id="emailSendingDetail" style="font-size:13px;color:#6b7280;margin:0;">To: ' + toName + (to ? ' (' + to + ')' : '') + '</p>' +
                '<style>@keyframes emailSpin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>' +
            '</div>';
            document.body.appendChild(overlay);

            // Store record + log audit + show result
            function storeAndShowResult(realSend, error) {
                var record = {
                    id: 'email_' + Date.now(),
                    to: to, toName: toName,
                    from: agent.email || '',
                    fromName: agent.name, subject: subject,
                    listingCount: count,
                    listingIds: opts.listingIds || [],
                    sentAt: new Date().toISOString(),
                    source: opts.source || 'manual',
                    status: error ? 'failed' : 'delivered',
                    method: realSend ? 'emailjs' : 'simulated'
                };
                sentEmails.push(record);
                localStorage.setItem(_sentEmailsKey, JSON.stringify(sentEmails));

                logAuditEntry('email_sent', {
                    to: to, toName: toName, subject: subject,
                    listingIds: opts.listingIds || [],
                    count: count, source: opts.source,
                    method: realSend ? 'emailjs' : 'simulated',
                    error: error || null
                });

                var spinner = document.getElementById('emailSendingSpinner');
                var icon = document.getElementById('emailSendingIcon');
                var msg = document.getElementById('emailSendingMsg');
                var detail = document.getElementById('emailSendingDetail');
                if (spinner) spinner.style.display = 'none';

                if (error) {
                    // Error state
                    if (icon) { icon.style.display = 'block'; icon.innerHTML = '<div style="width:48px;height:48px;background:#dc2626;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;"><span style="color:#fff;font-size:24px;font-weight:bold;">&times;</span></div>'; }
                    if (msg) { msg.style.color = '#dc2626'; msg.textContent = 'Email failed to send'; }
                    if (detail) {
                        detail.innerHTML = (error || 'Unknown error') +
                            '<br><a href="#" onclick="openEmailSettings();var ov=document.getElementById(\'emailSendingOverlay\');if(ov)ov.remove();return false;" style="color:#C4A052;font-weight:600;font-size:12px;text-decoration:underline;margin-top:8px;display:inline-block;">Check Email Settings</a>';
                    }
                    setTimeout(function() { var ov = document.getElementById('emailSendingOverlay'); if (ov) ov.remove(); }, 6000);
                } else {
                    // Success state
                    if (icon) { icon.style.display = 'block'; icon.innerHTML = '<div style="width:48px;height:48px;background:#059669;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;"><span style="color:#fff;font-size:24px;font-weight:bold;">&#10003;</span></div>'; }
                    if (msg) { msg.style.color = '#059669'; msg.textContent = realSend ? 'Email delivered!' : 'Email sent (simulated)'; }
                    if (detail) {
                        var html = count + ' listing' + (count !== 1 ? 's' : '') + ' sent to ' + toName + (to ? ' (' + to + ')' : '');
                        html += '<br><a href="/crm/dashboard" target="_blank" style="color:#C4A052;font-weight:600;font-size:12px;text-decoration:underline;margin-top:8px;display:inline-block;">View in Dashboard</a>';
                        if (!realSend) {
                            html += '<br><a href="#" onclick="openEmailSettings();var ov=document.getElementById(\'emailSendingOverlay\');if(ov)ov.remove();return false;" style="color:#6b7280;font-size:11px;text-decoration:underline;margin-top:4px;display:inline-block;">Configure real email delivery &rarr;</a>';
                        }
                        detail.innerHTML = html;
                    }
                    setTimeout(function() { var ov = document.getElementById('emailSendingOverlay'); if (ov) ov.remove(); }, realSend ? 4000 : 3500);
                }
            }

            // Route: real email via EmailJS or simulated
            if (useRealEmail && typeof sendViaEmailJS === 'function') {
                sendViaEmailJS({
                    to_email: to,
                    to_name: toName,
                    from_name: agent.name + ' — Mallan Real Estate',
                    subject: subject,
                    message_html: opts.htmlBody || '<p>Property report from ' + agent.name + '</p>'
                }).then(function() {
                    storeAndShowResult(true, null);
                }).catch(function(err) {
                    storeAndShowResult(true, err.text || err.message || 'EmailJS error');
                });
            } else {
                // Not configured — simulate with delay
                setTimeout(function() {
                    storeAndShowResult(false, null);
                }, 1200);
            }
        }

        // ── Wrap format-specific report HTML in an email-safe shell ──
        function wrapReportForEmail(reportBody, title, preparedFor, listings) {
            var agent = typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE : { name: '', phone: '', email: '', company: '', companyLicense: '', license: '', address: '', website: 'mallan.nyc' };
            var dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            var firstName = preparedFor ? preparedFor.split(' ')[0] : '';
            var listingCount = listings ? listings.length : 0;

            var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">';
            h += '<style>.pkg-per-listing { page-break-after: always; } .pkg-no-break { page-break-inside: avoid; }</style>';
            h += '</head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">';
            h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;">';
            h += '<tr><td align="center" style="padding:20px 10px;">';
            h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="720" style="max-width:720px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">';

            // Greeting
            h += '<tr><td style="padding:24px 32px 16px 32px;">';
            h += '<p style="margin:0;font-size:14px;color:#374151;">Hi' + (firstName ? ' ' + firstName : '') + ',</p>';
            h += '<p style="margin:8px 0 0 0;font-size:14px;color:#374151;">Please find below your ' + (title || 'Property Report') + ' with ' + listingCount + ' listing' + (listingCount !== 1 ? 's' : '') + '.</p>';
            h += '</td></tr>';

            // Report content (the actual format-specific HTML)
            h += '<tr><td style="padding:0 16px 16px 16px;">' + reportBody + '</td></tr>';

            // REBNY Attribution Footer
            h += '<tr><td style="padding:24px 32px;border-top:1px solid #e5e7eb;background:#fafafa;">';
            h += '<p style="margin:0 0 6px 0;font-size:10px;color:#9ca3af;line-height:1.5;">';
            h += 'Listing information courtesy of the REBNY Listing Service (RLS). All information is deemed reliable but is not guaranteed and should be independently verified.</p>';
            h += '<p style="margin:0 0 6px 0;font-size:10px;color:#6b7280;font-style:italic;">';
            h += 'Commission rates are not set by law and are fully negotiable.</p>';
            h += '</td></tr>';

            // CAN-SPAM Footer
            h += '<tr><td style="padding:16px 32px;background:#1a1a1a;">';
            h += '<p style="margin:0;font-size:10px;color:#d1d5db;">Equal Housing Opportunity &middot; ' + (agent.company || 'Mallan Real Estate Inc.') + '</p>';
            h += '<p style="margin:8px 0 0 0;font-size:9px;color:#6b7280;line-height:1.4;">';
            h += 'This email was sent by ' + agent.name + ' at ' + (agent.company || 'Mallan Real Estate Inc.') + ', ' + (agent.address || '') + '. ';
            h += 'If you no longer wish to receive property updates, please reply with "Unsubscribe" in the subject line.</p>';
            h += '</td></tr>';

            h += '</table></td></tr></table></body></html>';
            return h;
        }

        // ── Build branded HTML email body (table-based, inline styles for Outlook) ──
        // NOTE: This is the legacy card-based email. Used by copyReportAndEmail() fallback.
        function buildBrandedEmailHTML(listings, title, preparedFor) {
            // Sanitize user-supplied strings to prevent XSS in HTML email body
            function escapeHTML(str) { var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
            title = escapeHTML(title || ''); preparedFor = escapeHTML(preparedFor || '');
            var agent = typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE : { name: '', phone: '', email: '', company: '', companyLicense: '', license: '', address: '', website: 'mallan.nyc' };
            var dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            var firstName = preparedFor ? preparedFor.split(' ')[0] : '';

            // Status color map (inline — email safe)
            var statusColors = {
                'ACTIVE': { bg: '#dcfce7', color: '#166534' },
                'PENDING': { bg: '#fef3c7', color: '#92400e' },
                'CONTRACT': { bg: '#ede9fe', color: '#5b21b6' },
                'CLOSED': { bg: '#fee2e2', color: '#991b1b' },
                'COMING_SOON': { bg: '#f5f3ff', color: '#7c3aed' },
                'WITHDRAWN': { bg: '#f3f4f6', color: '#6b7280' },
                'HOLD': { bg: '#f3f4f6', color: '#6b7280' }
            };

            var h = '';
            h += '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>';
            h += '<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">';
            h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;">';
            h += '<tr><td align="center" style="padding:20px 10px;">';

            // Main content wrapper — 680px max
            h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" style="max-width:680px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">';

            // ── Header bar (dark with gold accent) ──
            h += '<tr><td style="background:linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 100%);padding:0;">';
            h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">';
            h += '<tr><td style="padding:24px 32px 8px 32px;">';
            h += '<span style="font-size:22px;font-weight:700;color:#C4A052;letter-spacing:2px;">MALLAN</span>';
            h += '<span style="font-size:22px;font-weight:300;color:#ffffff;letter-spacing:2px;margin-left:6px;">NYC</span>';
            h += '</td></tr>';
            h += '<tr><td style="padding:0 32px 4px 32px;"><span style="font-size:11px;color:#9ca3af;letter-spacing:1px;">REAL ESTATE</span></td></tr>';
            h += '<tr><td style="padding:0 32px 20px 32px;">';
            h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>';
            h += '<td style="border-top:1px solid #C4A052;padding-top:12px;">';
            h += '<span style="font-size:18px;font-weight:600;color:#ffffff;">' + (title || 'Property Summary Report') + '</span>';
            h += '</td></tr></table>';
            h += '</td></tr>';
            h += '</table></td></tr>';

            // ── Prepared By / For bar ──
            h += '<tr><td style="padding:20px 32px;background:#fafafa;border-bottom:1px solid #e5e7eb;">';
            h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>';
            h += '<td style="vertical-align:top;width:50%;">';
            h += '<span style="font-size:10px;text-transform:uppercase;color:#9ca3af;letter-spacing:1px;">Prepared By</span><br>';
            h += '<span style="font-size:14px;font-weight:600;color:#1a1a1a;">' + agent.name + '</span><br>';
            h += '<span style="font-size:12px;color:#4b5563;">' + (agent.licenseTitle || agent.title || 'Licensed Real Estate Broker') + '</span><br>';
            h += '<span style="font-size:12px;color:#6b7280;">' + (agent.company || 'Mallan Real Estate Inc.') + ' &middot; Lic. ' + (agent.companyLicense || '') + '</span><br>';
            h += '<span style="font-size:12px;color:#6b7280;">' + (agent.phone || '') + ' &middot; ' + (agent.email || '') + '</span>';
            h += '</td>';
            h += '<td style="vertical-align:top;width:50%;text-align:right;">';
            h += '<span style="font-size:10px;text-transform:uppercase;color:#9ca3af;letter-spacing:1px;">Prepared For</span><br>';
            h += '<span style="font-size:14px;font-weight:600;color:#1a1a1a;">' + (preparedFor || 'Client') + '</span><br>';
            h += '<span style="font-size:12px;color:#6b7280;">' + dateStr + '</span><br>';
            h += '<span style="font-size:12px;color:#6b7280;">' + listings.length + ' Listing' + (listings.length !== 1 ? 's' : '') + '</span>';
            h += '</td>';
            h += '</tr></table></td></tr>';

            // ── Greeting ──
            h += '<tr><td style="padding:24px 32px 8px 32px;">';
            h += '<p style="margin:0;font-size:14px;color:#374151;">Hi' + (firstName ? ' ' + firstName : '') + ',</p>';
            h += '<p style="margin:8px 0 0 0;font-size:14px;color:#374151;">Please find below a curated selection of properties based on your search criteria. I\'d be happy to schedule viewings for any that interest you.</p>';
            h += '</td></tr>';

            // ── Listing Cards ──
            for (var i = 0; i < listings.length; i++) {
                var l = listings[i];
                var isRental = l.listingCategory === 'rental';
                var displayAddr = l.addressDisplayYN === false ? 'Address Available Upon Request' : l.address;
                var unitStr = l.addressDisplayYN !== false && l.unit ? ', Unit ' + l.unit : '';
                var priceStr = isRental ? '$' + Number(l.price).toLocaleString() + '/mo' : '$' + Number(l.price).toLocaleString();
                var priceSf = l.intSqft ? '$' + Math.round(l.price / l.intSqft).toLocaleString() + '/SF' : '';
                var statusLabel = (l.status || 'ACTIVE').replace(/_/g, ' ');
                var sc = statusColors[l.status] || statusColors['ACTIVE'];
                var bedsLabel = l.beds === 0 ? 'Studio' : l.beds + ' BD';
                var details = bedsLabel + ' &middot; ' + l.baths + ' BA';
                if (l.intSqft) details += ' &middot; ' + Number(l.intSqft).toLocaleString() + ' SF';

                h += '<tr><td style="padding:12px 32px;">';
                h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">';

                // Card header — status + price
                h += '<tr><td style="padding:14px 16px;background:#fafafa;border-bottom:1px solid #e5e7eb;">';
                h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>';
                h += '<td>';
                h += '<span style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:' + sc.bg + ';color:' + sc.color + ';">' + statusLabel + '</span>';
                if (l.priceChange === 'down') h += '<span style="margin-left:8px;font-size:10px;color:#dc2626;">&#9660; Price Reduced</span>';
                h += '</td>';
                h += '<td style="text-align:right;">';
                h += '<span style="font-size:18px;font-weight:700;color:#1a1a1a;">' + priceStr + '</span>';
                if (priceSf) h += '<span style="font-size:11px;color:#9ca3af;margin-left:8px;">' + priceSf + '</span>';
                h += '</td>';
                h += '</tr></table></td></tr>';

                // Card body — address + details
                h += '<tr><td style="padding:14px 16px;">';
                h += '<p style="margin:0 0 4px 0;font-size:15px;font-weight:600;color:#1a1a1a;">' + displayAddr + unitStr + '</p>';
                h += '<p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;">' + (l.neighborhood || '') + (l.zip ? ', ' + l.zip : '') + '</p>';
                h += '<p style="margin:0;font-size:13px;color:#374151;">' + details + '</p>';

                // Extra details row
                var extras = [];
                if (l.ownership) extras.push(l.ownership === 'StockCooperative' ? 'Co-op' : l.ownership);
                if (l.era) extras.push(l.era);
                if (l.dom !== undefined) extras.push(l.dom + ' DOM');
                if (l.floor) extras.push('Floor ' + l.floor);
                if (extras.length > 0) {
                    h += '<p style="margin:6px 0 0 0;font-size:11px;color:#9ca3af;">' + extras.join(' &middot; ') + '</p>';
                }

                // Per-listing "Courtesy of" — only on online viewers, not client reports

                // View Listing link — links to the property page on mallan.nyc
                var listingSlug = (displayAddr || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                var listingUrl = 'https://mallan.nyc/' + (isRental ? 'rent' : 'buy') + '/' + listingSlug + '-' + l.id;
                h += '<p style="margin:10px 0 0 0;"><a href="' + listingUrl + '" style="display:inline-block;padding:6px 16px;background:#C4A052;color:#ffffff;font-size:12px;font-weight:600;text-decoration:none;border-radius:4px;">View Listing</a></p>';

                h += '</td></tr>';
                h += '</table></td></tr>';
            }

            // ── REBNY Attribution Footer ──
            h += '<tr><td style="padding:24px 32px;border-top:1px solid #e5e7eb;background:#fafafa;">';
            h += '<p style="margin:0 0 6px 0;font-size:10px;color:#9ca3af;line-height:1.5;">';
            h += 'Listing information courtesy of the REBNY Listing Service (RLS). All information is deemed reliable but is not guaranteed and should be independently verified. ';
            h += 'Based on information from the REBNY Listing Service for the period ending ' + dateStr + '.</p>';
            h += '<p style="margin:0 0 6px 0;font-size:10px;color:#6b7280;font-style:italic;">';
            h += 'Commission rates are not set by law and are fully negotiable. The commission on any particular listing is set by the listing participant and is disclosed to cooperating brokers.</p>';
            h += '<p style="margin:0;font-size:10px;color:#9ca3af;">';
            h += agent.name + ', ' + (agent.title || 'Licensed Real Estate Broker') + ' &middot; Lic. ' + (agent.license || '') + ' &middot; ' + (agent.company || 'Mallan Real Estate Inc.') + ' &middot; ' + (agent.companyLicense || '') + '<br>';
            h += (agent.address || '') + ' &middot; ' + (agent.phone || '') + ' &middot; ' + (agent.website || 'mallan.nyc') + '</p>';
            h += '</td></tr>';

            // ── Equal Housing + CAN-SPAM Footer ──
            h += '<tr><td style="padding:16px 32px;background:#1a1a1a;">';
            h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>';
            h += '<td style="vertical-align:middle;width:40px;"><span style="font-size:20px;color:#C4A052;">&#9632;</span></td>';
            h += '<td style="vertical-align:middle;">';
            h += '<span style="font-size:10px;color:#d1d5db;">Equal Housing Opportunity &middot; </span>';
            h += '<span style="font-size:10px;color:#9ca3af;">' + (agent.company || 'Mallan Real Estate Inc.') + '</span>';
            h += '</td>';
            h += '</tr></table>';
            h += '<p style="margin:8px 0 0 0;font-size:9px;color:#6b7280;line-height:1.4;">';
            h += 'This email was sent by ' + agent.name + ' at ' + (agent.company || 'Mallan Real Estate Inc.') + ', ' + (agent.address || '') + '. ';
            h += 'If you no longer wish to receive property updates, please reply with "Unsubscribe" in the subject line.</p>';
            h += '</td></tr>';

            h += '</table>'; // End main content wrapper
            h += '</td></tr></table>'; // End outer wrapper
            h += '</body></html>';
            return h;
        }

        // ── Send to Client — sends branded report email directly from the system ──
        function copyReportAndEmail() {
            // Get email context
            var ctx = window._reportEmailContext || {};
            var title = ctx.title || 'Property Report';
            var preparedFor = ctx.preparedFor || '';

            // Get recipient email
            var recipientEmail = '';
            var recipientEl = document.getElementById('reportRecipientEmail');
            if (recipientEl) recipientEmail = recipientEl.value.trim();
            if (!recipientEmail) {
                var clientSelect = document.getElementById('reportRecipientClient');
                if (clientSelect && clientSelect.value) {
                    var selectedClient = customerDB[clientSelect.value];
                    if (selectedClient) recipientEmail = selectedClient.email || (clientSelect.value === 'test-client' && typeof getConfiguredAgentEmail === 'function' ? getConfiguredAgentEmail() : '');
                }
            }

            if (!recipientEmail && !preparedFor) {
                showReportToast('Please enter a recipient email or select a client.');
                return;
            }

            // Get listings with compliance filtering
            var listings = typeof getReportListings === 'function' ? getReportListings() : [];
            if (listings.length === 0) {
                showReportToast('No listings to include in report.');
                return;
            }

            // Filter out compliance violations
            listings = listings.filter(function(l) {
                var perm = l.permissions || {};
                if (perm.ownerOptOut) return false;
                if (l.internetDisplayYN === false) return false;
                if (l.idxDisplayYN === false) return false;
                return true;
            });

            // Build format-aware email using the actual selected report format
            var reportBody = buildFullReportHTML(title);
            var richHTML = wrapReportForEmail(reportBody, title, preparedFor, listings);

            // Send directly from the system
            sendEmailDirect({
                to: recipientEmail,
                toName: preparedFor,
                subject: title + ' — Mallan Real Estate',
                htmlBody: richHTML,
                listingIds: listings.map(function(l) { return l.id; }),
                count: listings.length,
                source: 'report_send_to_client'
            });

            // Close the preview modal after sending
            closeReportPreview();
        }

        // ── Print report from preview modal ──
        function printReportFromPreview() {
            // Only print the ACTIVE format panel, not all 8 formats
            var format = reportState.format || 'grid';
            var formatCap = format.charAt(0).toUpperCase() + format.slice(1);
            var activePanel = document.getElementById('preview' + formatCap);
            if (!activePanel) { showToast('No report content to print.', 'warning'); return; }
            var ctx = window._reportEmailContext || {};
            var title = ctx.title || 'Property Report';
            printReportViaIframe(activePanel.innerHTML, title);
        }

        function switchPreviewFormat(format) {
            // Update format buttons
            var formats = ['grid', 'list', 'summary', 'detail', 'comparison', 'factSheet', 'cma', 'openHouse', 'images'];
            formats.forEach(f => {
                var capKey = f.charAt(0).toUpperCase() + f.slice(1);
                var btn = document.getElementById('previewFormat' + capKey);
                if (btn) {
                    if (f === format) {
                        btn.classList.remove('bg-gray-600', 'text-gray-300');
                        btn.classList.add('bg-blue-600', 'text-white');
                    } else {
                        btn.classList.remove('bg-blue-600', 'text-white');
                        btn.classList.add('bg-gray-600', 'text-gray-300');
                    }
                }
            });

            // Show/hide format previews
            document.querySelectorAll('.report-preview-format').forEach(el => {
                el.classList.add('hidden');
            });
            var capFormat = format.charAt(0).toUpperCase() + format.slice(1);
            var previewEl = document.getElementById('preview' + capFormat);
            if (previewEl) {
                previewEl.classList.remove('hidden');
            }
        }

        // Close preview modal on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeReportPreview();
            }
        });

        // Close preview modal on backdrop click
        document.getElementById('reportPreviewModal')?.addEventListener('click', function(e) {
            if (e.target === this) {
                closeReportPreview();
            }
        });

        // ── CSV Export (IDX allowlist enforced for customer version) ──
        function exportReportCSV() {
            var listings = getReportListings();
            if (!listings || listings.length === 0) { showToast('No listings available for export.', 'warning'); return; }
            var fields = getSelectedReportFields();
            if (fields.length === 0) fields = ['status','price','bedrooms','totalBathrooms','approxInteriorSqft','dom'];
            var isCustomer = (reportState.version === 'customer');
            if (isCustomer) {
                fields = fields.filter(function(f){ return agentOnlyFields.indexOf(f) === -1; });
                fields = fields.filter(function(f){ return csvExcelAllowlistCustomer.indexOf(f) > -1; });
            }

            var header = fields.map(function(f){ return '"' + (reportFieldLabels[f]||f) + '"'; }).join(',');
            var rows = listings.map(function(l) {
                return fields.map(function(f) {
                    var val = getFieldValue(l, f);
                    if (val === null || val === undefined) val = '';
                    val = String(val).replace(/"/g, '""');
                    return '"' + val + '"';
                }).join(',');
            });
            var csv = header + '\n' + rows.join('\n');
            var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'mallan-report-' + new Date().toISOString().slice(0,10) + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            logAuditEntry('report_csv_export', { count: listings.length, fields: fields.length });
        }

        // ── Excel Export (IDX allowlist enforced for customer version) ──
        function exportReportExcel() {
            var listings = getReportListings();
            if (!listings || listings.length === 0) { showToast('No listings available for export.', 'warning'); return; }
            var fields = getSelectedReportFields();
            if (fields.length === 0) fields = ['status','price','bedrooms','totalBathrooms','approxInteriorSqft','dom'];
            var isCustomer = (reportState.version === 'customer');
            if (isCustomer) {
                fields = fields.filter(function(f){ return agentOnlyFields.indexOf(f) === -1; });
                fields = fields.filter(function(f){ return csvExcelAllowlistCustomer.indexOf(f) > -1; });
            }

            var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:spreadsheet">' +
                '<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">' +
                '<style>td,th{border:1px solid #ccc;padding:6px 10px;font-family:Calibri,sans-serif;font-size:12px}th{background:#2563eb;color:#fff;font-weight:700}tr:nth-child(even){background:#f3f4f6}</style></head><body>' +
                '<table><thead><tr>';
            fields.forEach(function(f){ html += '<th>' + (reportFieldLabels[f]||f) + '</th>'; });
            html += '</tr></thead><tbody>';
            listings.forEach(function(l) {
                html += '<tr>';
                fields.forEach(function(f) {
                    var val = getFieldValue(l, f);
                    html += '<td>' + (val !== null && val !== undefined ? String(val) : '') + '</td>';
                });
                html += '</tr>';
            });
            html += '</tbody></table></body></html>';
            var blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'mallan-report-' + new Date().toISOString().slice(0,10) + '.xls';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            logAuditEntry('report_excel_export', { count: listings.length, fields: fields.length });
        }

        // ── Step 12: Shareable Link ──
        function generateShareableLink() {
            var config = {
                format: reportState.format || 'grid',
                version: reportState.version || 'customer',
                listingIds: getReportListings().map(function(l){ return l.id; }),
                optionalContent: getOptionalContentConfig(),
                fields: getSelectedReportFields(),
                title: (document.getElementById('reportTitle') || {}).value || '',
                preparedFor: (document.getElementById('reportPreparedFor') || {}).value || '',
                created: new Date().toISOString()
            };
            var encoded = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
            var shareUrl = 'https://mallan.nyc/reports/view?config=' + encoded;
            navigator.clipboard.writeText(shareUrl).then(function() {
                showReportToast('Link copied to clipboard');
            }).catch(function() {
                prompt('Copy this shareable link:', shareUrl);
            });
            logAuditEntry('report_shareable_link', { format: config.format, listingCount: config.listingIds.length });
        }

        // ── Toast notification helper ──
        function showReportToast(message) {
            var existing = document.getElementById('reportToast');
            if (existing) existing.remove();
            var toast = document.createElement('div');
            toast.id = 'reportToast';
            toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 24px;background:#1f2937;color:#fff;border-radius:8px;font-size:14px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.15);display:flex;align-items:center;gap:8px;animation:fadeInUp 0.3s ease';
            toast.innerHTML = '<i class="fas fa-check-circle" style="color:#4ade80"></i> ' + message;
            document.body.appendChild(toast);
            setTimeout(function() { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(function(){ toast.remove(); }, 300); }, 3000);
        }

        // ── Helper: Get filtered+compliant listings from reportState ──
        function getReportListings() {
            var reportSelRadio = document.querySelector('input[name="reportSelection"]:checked');
            var reportSel = reportSelRadio ? reportSelRadio.value : 'all';
            var allListings = searchResultsState.filteredListings || (typeof listings !== 'undefined' ? listings : []);
            var reportListings;

            // Helper: match listing ID flexibly (string/number, id/lid/listingKey)
            function matchesId(listing, idArr) {
                var lid = String(listing.id || '');
                var llid = String(listing.lid || '');
                var lkey = String(listing.listingKey || listing.ListingKey || '');
                for (var i = 0; i < idArr.length; i++) {
                    var sid = String(idArr[i]);
                    if (sid === lid || sid === llid || (lkey && sid === lkey)) return true;
                }
                return false;
            }

            // If selectedListingIds were set but radio reverted to 'all', still respect selection
            if (reportSel === 'all' && reportState.selectedListingIds.length > 0 &&
                reportState.selectedListingIds.length < allListings.length) {
                reportSel = 'selected';
            }

            if (reportSel === 'selected' && reportState.selectedListingIds.length > 0) {
                var selIds = reportState.selectedListingIds;
                reportListings = allListings.filter(function(l) { return matchesId(l, selIds); });
                if (reportListings.length === 0 && selIds.length > 0) {
                    console.warn('[Reports] ID mismatch — selected IDs:', selIds.slice(0,3), 'listing IDs:', allListings.slice(0,3).map(function(l){return l.id;}));
                }
            } else if (reportSel === 'picked') {
                var flags = typeof listingFlags !== 'undefined' ? listingFlags : {};
                reportListings = allListings.filter(function(l) { return flags[l.id] && flags[l.id].picked; });
            } else if (reportSel === 'liked') {
                var lflags = typeof listingFlags !== 'undefined' ? listingFlags : {};
                reportListings = allListings.filter(function(l) { return lflags[l.id] && lflags[l.id].liked; });
            } else {
                reportListings = allListings;
            }
            if (reportListings.length === 0 && reportSel === 'all') reportListings = allListings;
            // IDX + Internet compliance filter — remove opted-out listings
            reportListings = reportListings.filter(function(l) { return l.idxDisplayYN !== false && l.internetDisplayYN !== false; });
            // Sort via reportState
            reportListings = getSortedListings(reportListings);
            // Enforce 250 cap
            return reportListings.slice(0, 250);
        }

        // ── Helper: Get agent info for reports ──
        function getAgentInfo() {
            return typeof AGENT_PROFILE !== 'undefined' ? {
                name: AGENT_PROFILE.name,
                title: AGENT_PROFILE.licenseTitle || AGENT_PROFILE.title || 'Licensed Real Estate Broker',
                company: AGENT_PROFILE.company || 'Mallan Real Estate Inc.',
                email: AGENT_PROFILE.email || '',
                phone: AGENT_PROFILE.phone || '',
                license: AGENT_PROFILE.license || '',
                companyLicense: AGENT_PROFILE.companyLicense || '',
                address: AGENT_PROFILE.address || ''
            } : {
                name: '',
                title: 'Licensed Real Estate Broker',
                company: '',
                email: '',
                phone: '',
                license: '',
                companyLicense: '',
                address: ''
            };
        }

        // ── Open a standalone client-friendly Detail report in a new tab ──
        // Called from List report address links — shows Detail format without
        // listing agent info or building contact (customer version)
        function openClientDetailReport(listingId) {
            var allListings = searchResultsState.filteredListings || listings;
            var l = null;
            for (var i = 0; i < allListings.length; i++) {
                if (allListings[i].id === listingId) { l = allListings[i]; break; }
            }
            if (!l) return;

            var agentInfo = getAgentInfo();
            var preparedFor = (document.getElementById('reportPreparedFor') || {}).value || 'Client';
            var now = new Date();
            var dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            var shortDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

            // Helpers (duplicated from populateReportPreview scope — self-contained for standalone)
            function fc(val) { return val == null || isNaN(val) ? '\u2014' : '$' + Number(val).toLocaleString(); }
            function fp(listing) { return listing.listingCategory === 'rental' ? fc(listing.price) + '/mo' : fc(listing.price); }
            function psf(listing) { return !listing.intSqft || listing.intSqft === 0 ? '\u2014' : fc(Math.round(listing.price / listing.intSqft)); }
            function da(listing) { return listing.addressDisplayYN === false ? 'Available Upon Request' : listing.address + (listing.unit ? ', ' + listing.unit : ''); }
            function sBadge(s, listing) {
                s = (s || 'Active').toUpperCase();
                var m = { 'ACTIVE':['#dcfce7','#15803d'], 'OFFER IN':['#ffedd5','#c2410c'], 'IN CONTRACT':['#f3e8ff','#7e22ce'], 'SOLD':['#dbeafe','#1d4ed8'], 'COMING_SOON':['#f5f3ff','#7c3aed'] };
                var c = m[s] || ['#f3f4f6','#4b5563'];
                var label = s.replace(/_/g,' ');
                if (s === 'COMING_SOON') label = listing && listing.firstShowingDate ? 'Coming Soon \u2014 No Showings until ' + listing.firstShowingDate : 'Coming Soon';
                return '<span style="display:inline-block;padding:2px 8px;background:' + c[0] + ';color:' + c[1] + ';font-size:12px;border-radius:4px;font-weight:500">' + label + '</span>';
            }
            function dr(label, val) {
                return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6"><span style="color:#6b7280;font-size:14px">' + label + '</span><span style="font-weight:500;font-size:14px">' + val + '</span></div>';
            }
            var _imgErr = "this.onerror=null;this.src='data:image/svg+xml," + encodeURIComponent('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"300\" fill=\"%23f1f5f9\"><rect width=\"400\" height=\"300\"/><text x=\"200\" y=\"150\" text-anchor=\"middle\" fill=\"%2394a3b8\" font-size=\"14\">No Image</text></svg>') + "'";

            // Off-market photo restriction
            var offMkt = { 'CLOSED':1, 'WITHDRAWN':1, 'HOLD':1, 'CANCELED':1, 'EXPIRED':1 };
            var photos = l.images || [];
            if (offMkt[(l.status||'').toUpperCase()] === 1 && photos.length > 1) photos = [photos[0]];
            var detailImgs = photos.filter(function(img) { return img.imageOf !== 'FloorPlan' && img.mediaCategory !== 'FloorPlan'; });
            var isRental = l.listingCategory === 'rental';

            // ── Build header ──
            var html = '<div style="background:rgb(18,25,40);color:#fff;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.08)">' +
                '<div style="display:flex;align-items:center;justify-content:space-between">' +
                '<div><p style="font-size:12px;color:#C4A052;text-transform:uppercase;letter-spacing:0.2em;margin:0 0 4px">' + agentInfo.company + '</p>' +
                '<h1 style="font-size:22px;font-weight:700;margin:0;letter-spacing:-0.02em">MALLAN<span style="font-weight:200;color:#B8860B;opacity:0.95">NYC</span></h1>' +
                '<p style="color:rgba(255,255,255,0.5);font-size:10px;margin:4px 0 0;text-transform:uppercase;letter-spacing:0.15em">Luxury Real Estate</p></div>' +
                '<div style="text-align:right"><p style="font-size:14px;font-weight:600;margin:0;color:rgba(255,255,255,0.95)">' + agentInfo.name + '</p>' +
                '<p style="color:rgba(255,255,255,0.6);font-size:12px;margin:3px 0 0">' + agentInfo.phone + ' | ' + agentInfo.email + '</p>' +
                '<p style="color:rgba(255,255,255,0.4);font-size:11px;margin:3px 0 0">' + dateStr + '</p></div></div></div>';

            // ── Agent/Client bar ──
            html += '<div style="padding:20px 32px;border-bottom:1px solid #e2e8f0;background:#FEFEFE">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">' +
                '<div><p style="font-size:10px;color:#C4A052;text-transform:uppercase;letter-spacing:0.2em;margin:0 0 6px;font-weight:600">Prepared By</p>' +
                '<p style="font-weight:600;color:#0A0A0A;margin:0;font-size:15px">' + agentInfo.name + '</p>' +
                '<p style="font-size:13px;color:rgba(10,10,10,0.7);margin:3px 0 0">' + agentInfo.title + '</p>' +
                '<p style="font-size:13px;color:rgba(10,10,10,0.7);margin:3px 0 0">' + agentInfo.company + ' &middot; Lic. ' + agentInfo.companyLicense + '</p>' +
                '<p style="font-size:13px;color:#64748b;margin:3px 0 0">' + agentInfo.email + ' | ' + agentInfo.phone + '</p></div>' +
                '<div><p style="font-size:10px;color:#C4A052;text-transform:uppercase;letter-spacing:0.2em;margin:0 0 6px;font-weight:600">Prepared For</p>' +
                '<p style="font-weight:600;color:#0A0A0A;margin:0;font-size:15px">' + preparedFor + '</p></div></div></div>';

            html += '<div style="padding:24px">';

            // ── Photos: hero + thumbnail grid, all clickable for lightbox ──
            if (detailImgs.length > 0) {
                var heroUrl = detailImgs[0].url;
                // Hero image (clickable)
                html += '<div style="height:360px;border-radius:8px;overflow:hidden;position:relative;background:#f1f5f9;margin-bottom:12px;cursor:pointer" onclick="openLightbox(0)">';
                html += '<img src="' + heroUrl + '" alt="' + da(l) + '" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '">';
                html += '<div style="position:absolute;bottom:0;left:0;right:0;padding:10px 16px;background:linear-gradient(transparent,rgba(0,0,0,0.5))"><span style="font-size:15px;font-weight:500;color:rgba(255,255,255,0.95)">' + (l.neighborhood||'') + '</span><br><span style="font-size:12px;color:rgba(255,255,255,0.7)">' + da(l) + '</span></div>';
                html += '<div style="position:absolute;top:12px;right:12px;padding:4px 10px;background:rgba(0,0,0,0.5);color:#fff;font-size:12px;border-radius:4px"><i class="fas fa-expand" style="margin-right:4px"></i>' + detailImgs.length + ' Photos</div>';
                html += '</div>';
                // Thumbnail grid (up to 8 shown, all clickable)
                if (detailImgs.length > 1) {
                    var thumbMax = Math.min(detailImgs.length, 9);
                    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:24px">';
                    for (var ti = 1; ti < thumbMax; ti++) {
                        html += '<div style="height:90px;border-radius:6px;overflow:hidden;background:#f1f5f9;cursor:pointer;position:relative" onclick="openLightbox(' + ti + ')">';
                        html += '<img src="' + detailImgs[ti].url + '" alt="' + (detailImgs[ti].caption || '') + '" style="width:100%;height:100%;object-fit:cover" onerror="' + _imgErr + '">';
                        // Show "+N more" badge on last thumbnail if there are more photos
                        if (ti === thumbMax - 1 && detailImgs.length > thumbMax) {
                            html += '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:600">+' + (detailImgs.length - thumbMax) + ' more</div>';
                        }
                        html += '</div>';
                    }
                    html += '</div>';
                } else {
                    html += '<div style="margin-bottom:24px"></div>';
                }
            }

            // ── Address + Price ──
            html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px"><div>' +
                '<h2 style="font-size:28px;font-weight:700;color:#111827;margin:0 0 4px">' + fp(l) + '</h2>' +
                '<p style="font-size:20px;color:#374151;margin:0">' + da(l) + '</p>' +
                '<p style="color:#6b7280;margin:4px 0 0">' + (l.neighborhood||'') + ', NY ' + (l.zip||'') + '</p>';
            if (l.crossStreet) html += '<p style="color:#9ca3af;font-size:13px;margin:2px 0 0">Cross: ' + l.crossStreet + '</p>';
            html += '</div><div style="text-align:right">' + sBadge(l.status, l);
            if (l.listedDate) html += '<p style="font-size:14px;color:#6b7280;margin:8px 0 0">Listed: ' + l.listedDate + '</p>';
            html += '<p style="font-size:14px;color:#6b7280;margin:4px 0 0">DOM: ' + (l.dom||'\u2014') + ' days</p>';
            if (l.originalPrice && l.originalPrice !== l.price) html += '<p style="font-size:14px;color:#6b7280;margin:4px 0 0">Original: ' + fc(l.originalPrice) + '</p>';
            html += '</div></div>';

            // ── Key metrics bar ──
            var mCols = [];
            mCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + (l.beds === 0 ? 'Studio' : (l.beds||'\u2014')) + '</p><p style="font-size:12px;color:#4b5563;margin:4px 0 0">Bedrooms</p></div>');
            mCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + (l.baths||'\u2014') + '</p><p style="font-size:12px;color:#4b5563;margin:4px 0 0">Bathrooms</p></div>');
            mCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + (l.intSqft?l.intSqft.toLocaleString():'\u2014') + '</p><p style="font-size:12px;color:#4b5563;margin:4px 0 0">Interior SF</p></div>');
            mCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + psf(l) + '</p><p style="font-size:12px;color:#4b5563;margin:4px 0 0">Price/SF</p></div>');
            if (l.rooms) mCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + fc(Math.round(l.price / l.rooms)) + '</p><p style="font-size:12px;color:#4b5563;margin:4px 0 0">Price/Room</p></div>');
            mCols.push('<div style="text-align:center"><p style="font-size:24px;font-weight:700;color:#B8860B;margin:0">' + (l.floor||'\u2014') + '</p><p style="font-size:12px;color:#4b5563;margin:4px 0 0">Floor</p></div>');
            html += '<div style="display:grid;grid-template-columns:repeat(' + mCols.length + ',1fr);gap:16px;padding:16px;background:rgba(196,160,82,0.06);border-radius:8px;margin-bottom:24px">' + mCols.join('') + '</div>';

            // ── Key Dates ──
            var dfs = '';
            if (l.listedDate) dfs += dr('Listed Date', l.listedDate);
            if (l.updatedDate) dfs += dr('Updated Date', l.updatedDate);
            if (l.contractSignedDate) dfs += dr('Contract Signed', l.contractSignedDate);
            if (l.closingDate) dfs += dr('Closing Date', l.closingDate);
            if (dfs) html += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px"><h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px">Key Dates</h3>' + dfs + '</div>';

            // ── Price History ──
            if (l.originalPrice && l.originalPrice !== l.price) {
                var pd = l.price - l.originalPrice, pp = ((pd / l.originalPrice) * 100).toFixed(1);
                var pc = pd > 0 ? '#dc2626' : '#15803d', pa = pd > 0 ? '+' : '';
                html += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px"><h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px">Price History</h3>' +
                    dr('Original Price', fc(l.originalPrice)) + dr('Current Price', fc(l.price)) +
                    dr('Change', '<span style="color:' + pc + '">' + pa + fc(Math.abs(pd)) + ' (' + pa + pp + '%)</span>') + '</div>';
            }

            // ── Property + Financial Details ──
            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px">';
            html += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px"><h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px">Property Details</h3>' +
                dr('Type', (typeof ownershipLabel === 'function' ? ownershipLabel(l.ownership) : l.ownership) || '\u2014') +
                dr('Building', l.era||'\u2014') +
                dr('Total Rooms', l.rooms||'\u2014') +
                dr('Exposures', l.exposures||'\u2014');
            if (l.crossStreet) html += dr('Cross Street', l.crossStreet);
            if (l.yearBuilt) html += dr('Year Built', l.yearBuilt);
            if (l.totalFloors) html += dr('Total Floors', l.totalFloors);
            if (l.buildingName) html += dr('Building', l.buildingName);
            html += '</div>';
            html += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px"><h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px">Financial Details</h3>';
            if (!isRental) {
                html += dr('Maintenance/CC', l.maintCC ? fc(l.maintCC)+'/mo' : '\u2014');
                html += dr('RE Taxes', l.reTaxes ? fc(Math.round(l.reTaxes))+'/mo' : '\u2014');
                html += dr('Total Monthly', '<span style="color:#15803d;font-weight:600">' + (l.totalMonthly ? fc(l.totalMonthly)+'/mo' : '\u2014') + '</span>');
            } else {
                html += dr('Monthly Rent', '<span style="color:#15803d;font-weight:600">' + fc(l.price) + '/mo</span>');
            }
            html += dr('Price/SqFt', psf(l));
            if (l.rooms) html += dr('Price/Room', fc(Math.round(l.price / l.rooms)));
            if (l.originalPrice) html += dr('Original Price', fc(l.originalPrice));
            if (l.walkScore) html += dr('Walk Score', l.walkScore);
            html += '</div></div>';

            // ── Description ──
            var desc = (typeof getReportDescription === 'function') ? getReportDescription(l) : (l.description || '');
            if (desc) {
                html += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px">' +
                    '<h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px">Description</h3>' +
                    '<p style="font-size:14px;color:#374151;line-height:1.6;margin:0">' + desc + '</p></div>';
            }

            // ── Building Information ──
            html += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px">' +
                '<h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px">Building Information</h3>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">' +
                dr('Building Name', l.buildingName || l.address || '\u2014') +
                dr('Year Built', l.yearBuilt || '\u2014') +
                dr('Total Floors', l.totalFloors || '\u2014') +
                dr('Era', l.era || '\u2014') +
                dr('Condition', l.condition || '\u2014') +
                '</div></div>';

            // ── Links ──
            html += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px">' +
                '<h3 style="font-weight:700;color:#111827;margin:0 0 12px;font-size:15px">Links</h3>' +
                '<p style="margin:4px 0;font-size:13px"><a href="#" style="color:#C4A052;text-decoration:none">View on mallan.nyc</a></p>';
            if (l.virtualTourUrl) html += '<p style="margin:4px 0;font-size:13px"><a href="' + l.virtualTourUrl + '" style="color:#C4A052;text-decoration:none">3D Virtual Tour</a></p>';
            if (l.videoTourUrl) html += '<p style="margin:4px 0;font-size:13px"><a href="' + l.videoTourUrl + '" style="color:#C4A052;text-decoration:none">Video Tour</a></p>';
            html += '<p style="margin:4px 0;font-size:13px"><a href="https://maps.google.com/?q=' + encodeURIComponent(da(l) + ' New York NY') + '" style="color:#C4A052;text-decoration:none">Google Map</a></p></div>';

            // ── NO listing agent info or building contact (customer version) ──

            html += '</div>'; // close padding div

            // ── Footer ──
            html += '<div style="padding:12px 32px;border-top:2px solid #C4A052;background:#FEFEFE;margin-top:16px">' +
                '<div style="text-align:center;font-size:10px;color:#64748b;line-height:1.5">' +
                '<p style="margin:0">Listing courtesy of the REBNY Listing Service (RLS)</p>' +
                '<p style="margin:1px 0 0">Data provided by REBNY RLS via Trestle &middot; ' + shortDate + '</p>' +
                '<p style="margin:2px 0 0;font-style:italic">Information deemed reliable but not guaranteed.</p>' +
                '<p style="margin:2px 0 0">Equal Housing Opportunity</p>' +
                '<p style="margin:2px 0 0">Not for redistribution.</p>' +
                '<p style="font-size:10px;color:#9ca3af;font-style:italic;margin:4px 0 0">Commission rates are not set by law and are fully negotiable.</p>' +
                '</div></div>';

            // ── Build lightbox photo data ──
            var lbPhotos = [];
            for (var lbi = 0; lbi < detailImgs.length; lbi++) {
                lbPhotos.push({ url: detailImgs[lbi].url, caption: detailImgs[lbi].caption || '' });
            }

            // ── Lightbox overlay HTML ──
            // Structure: backdrop (click-to-close) → controls on top with stopPropagation
            var lightboxHtml = '<div id="lightbox" style="display:none;position:fixed;inset:0;z-index:9999">' +
                // Backdrop (click to close)
                '<div id="lbBackdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.92)"></div>' +
                // Top bar: counter + close
                '<div style="position:absolute;top:16px;right:20px;display:flex;gap:12px;align-items:center;z-index:10002">' +
                '<span id="lbCounter" style="color:rgba(255,255,255,0.7);font-size:14px"></span>' +
                '<button id="lbClose" style="background:none;border:none;color:#fff;font-size:32px;cursor:pointer;padding:4px 12px;line-height:1" title="Close">&times;</button>' +
                '</div>' +
                // Prev button
                '<button id="lbPrev" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:36px;cursor:pointer;width:52px;height:52px;border-radius:50%;z-index:10002;line-height:1;display:flex;align-items:center;justify-content:center" title="Previous">&#8249;</button>' +
                // Next button
                '<button id="lbNext" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:36px;cursor:pointer;width:52px;height:52px;border-radius:50%;z-index:10002;line-height:1;display:flex;align-items:center;justify-content:center" title="Next">&#8250;</button>' +
                // Image container
                '<div style="position:absolute;inset:60px 70px 50px 70px;display:flex;align-items:center;justify-content:center;z-index:10001;pointer-events:none">' +
                '<img id="lbImg" src="" alt="" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;box-shadow:0 8px 32px rgba(0,0,0,0.4);pointer-events:auto">' +
                '</div>' +
                // Caption
                '<div id="lbCaption" style="position:absolute;bottom:16px;left:0;right:0;text-align:center;color:rgba(255,255,255,0.7);font-size:13px;z-index:10002"></div>' +
                '</div>';

            // ── Lightbox JS ──
            var lightboxJs = 'var _lbPhotos=' + JSON.stringify(lbPhotos) + ';var _lbIdx=0;' +
                'function openLightbox(i){_lbIdx=i;document.getElementById("lightbox").style.display="block";showLbPhoto();document.body.style.overflow="hidden";}' +
                'function closeLightbox(){document.getElementById("lightbox").style.display="none";document.body.style.overflow="";}' +
                'function lbNav(d){_lbIdx+=d;if(_lbIdx<0)_lbIdx=_lbPhotos.length-1;if(_lbIdx>=_lbPhotos.length)_lbIdx=0;showLbPhoto();}' +
                'function showLbPhoto(){var p=_lbPhotos[_lbIdx];document.getElementById("lbImg").src=p.url;' +
                'document.getElementById("lbCounter").textContent=(_lbIdx+1)+" / "+_lbPhotos.length;' +
                'document.getElementById("lbCaption").textContent=p.caption||"";' +
                'document.getElementById("lbPrev").style.display=_lbPhotos.length>1?"":"none";' +
                'document.getElementById("lbNext").style.display=_lbPhotos.length>1?"":"none";}' +
                // Button click handlers (separate from backdrop)
                'document.getElementById("lbClose").addEventListener("click",function(e){e.stopPropagation();closeLightbox();});' +
                'document.getElementById("lbPrev").addEventListener("click",function(e){e.stopPropagation();lbNav(-1);});' +
                'document.getElementById("lbNext").addEventListener("click",function(e){e.stopPropagation();lbNav(1);});' +
                // Backdrop click = close
                'document.getElementById("lbBackdrop").addEventListener("click",function(){closeLightbox();});' +
                // Keyboard nav
                'document.addEventListener("keydown",function(e){if(document.getElementById("lightbox").style.display==="none")return;' +
                'if(e.key==="Escape")closeLightbox();if(e.key==="ArrowLeft")lbNav(-1);if(e.key==="ArrowRight")lbNav(1);});';

            // ── Open in new tab (CSP-safe Blob URL) ──
            var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + da(l) + ' | Mallan NYC</title>' +
                '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">' +
                '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,system-ui,-apple-system,sans-serif;color:#111827;background:#f9fafb;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
                '@media print{body{background:#fff}@page{margin:0.5in}#lightbox{display:none!important}}</style></head>' +
                '<body><div style="max-width:900px;margin:0 auto;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.1)">' +
                html + '</div>' + lightboxHtml + '<script>' + lightboxJs + '<\/script></body></html>';
            openPrintableWindow(fullHtml);
        }

        // ── Build full formatted report HTML from preview panels ──
        function buildFullReportHTML(title) {
            // Populate preview panels silently (they may already be populated)
            try { populateReportPreview(); } catch(e) { console.error('Report build error:', e); }
            var format = reportState.format || 'grid';
            var formatCap = format.charAt(0).toUpperCase() + format.slice(1);
            var previewEl = document.getElementById('preview' + formatCap);
            if (!previewEl) return '<p style="padding:40px;text-align:center;color:#dc2626">Report format "' + format + '" not found.</p>';
            return previewEl.innerHTML;
        }

        // openEmailDeliveryWindow and openReportDeliveryWindow REMOVED
        // All emails are sent directly via sendEmailDirect() — no copy/paste windows

        // ── Populate recipient dropdown from customerDB ──
        function populateReportRecipientDropdown() {
            var sel = document.getElementById('reportRecipientClient');
            if (!sel) return;
            sel.innerHTML = '<option value="">— Choose a client —</option>';
            var clients = typeof customerDB !== 'undefined' ? customerDB : {};
            var configuredEmail = (typeof getConfiguredAgentEmail === 'function') ? getConfiguredAgentEmail() : '';
            Object.keys(clients).forEach(function(id) {
                var c = clients[id];
                // Test client uses configured email from Email Settings
                var email = c.email || (id === 'test-client' ? configuredEmail : '');
                if (!email) return;
                var opt = document.createElement('option');
                opt.value = id;
                opt.textContent = c.name + ' (' + email + ')';
                sel.appendChild(opt);
            });
        }

        // ── When a client is selected from dropdown, fill email + prepared-for ──
        function reportClientSelected(selectEl) {
            var clientId = selectEl.value;
            var emailInput = document.getElementById('reportRecipientEmail');
            var preparedForInput = document.getElementById('reportPreparedFor');
            if (clientId && typeof customerDB !== 'undefined' && customerDB[clientId]) {
                var c = customerDB[clientId];
                // Test client uses configured email from Email Settings
                var email = c.email || (clientId === 'test-client' && typeof getConfiguredAgentEmail === 'function' ? getConfiguredAgentEmail() : '');
                if (emailInput) emailInput.value = email;
                if (preparedForInput) preparedForInput.value = c.name || '';
            }
        }

        // ── Get report recipient email ──
        function getReportRecipientEmail() {
            var emailInput = document.getElementById('reportRecipientEmail');
            return emailInput ? emailInput.value.trim() : '';
        }

        // ── Build a plain-text summary of report listings for mailto body ──
        function buildReportEmailBody(listings, title, preparedFor) {
            var agent = typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE : { name: '', phone: '', email: '' };
            var body = 'Hi' + (preparedFor ? ' ' + preparedFor.split(' ')[0] : '') + ',\n\n';
            body += 'Please find your property report below:\n';
            body += '"' + title + '" — ' + listings.length + ' listing' + (listings.length !== 1 ? 's' : '') + '\n\n';
            body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
            listings.forEach(function(l, i) {
                var addr = l.fullAddress || l.address || (l.streetNumber ? l.streetNumber + ' ' + l.streetName : 'Address on request');
                if (typeof addr === 'object') addr = (addr.full || addr.streetNumber + ' ' + addr.streetName + (addr.unitNumber ? ' #' + addr.unitNumber : ''));
                var price = l.listPrice ? '$' + Number(l.listPrice).toLocaleString() : (l.price || '');
                body += (i + 1) + '. ' + addr + '\n';
                body += '   Price: ' + price + '\n';
                if (l.bedrooms) body += '   Beds: ' + l.bedrooms + ' | ';
                if (l.totalBathrooms) body += 'Baths: ' + l.totalBathrooms + ' | ';
                if (l.approxInteriorSqft) body += 'SqFt: ' + Number(l.approxInteriorSqft).toLocaleString();
                body += '\n';
                if (l.status) body += '   Status: ' + l.status + '\n';
                body += '\n';
            });
            body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
            body += agent.name + '\n';
            body += 'Mallan Real Estate Inc.\n';
            body += agent.phone + '\n';
            body += (agent.email || '') + '\n\n';
            body += 'Listing(s) courtesy of the REBNY Listing Service (RLS).\n';
            body += 'Equal Housing Opportunity\n';
            return body;
        }

        // ── Wait for fonts + images to load, then print (shared by both print functions) ──
        function _waitForPrintReady(iframe, html) {
            iframe.onload = function() {
                var win = iframe.contentWindow;
                var doc = iframe.contentDocument || win.document;

                function doPrint() {
                    try {
                        win.focus();
                        win.print();
                    } catch(e) {
                        // Fallback: open in new tab (CSP-safe Blob URL)
                        if (!openPrintableWindow(html, { autoPrint: true, printDelay: 1500 })) {
                            showToast('Could not open print dialog. Please try again.', 'error');
                        }
                    }
                    // Clean up after print dialog closes
                    setTimeout(function() { iframe.remove(); }, 5000);
                }

                // Wait for all images to finish loading
                function waitForImages(cb) {
                    var imgs = doc.querySelectorAll('img');
                    if (imgs.length === 0) return cb();
                    var remaining = imgs.length;
                    var done = false;
                    function check() {
                        remaining--;
                        if (remaining <= 0 && !done) { done = true; cb(); }
                    }
                    imgs.forEach(function(img) {
                        if (img.complete) { check(); return; }
                        img.addEventListener('load', check);
                        img.addEventListener('error', check);
                    });
                    // Safety timeout: don't wait forever for images
                    setTimeout(function() { if (!done) { done = true; cb(); } }, 8000);
                }

                // Wait for fonts via document.fonts API (supported in all modern browsers)
                function waitForFonts(cb) {
                    if (win.document.fonts && typeof win.document.fonts.ready !== 'undefined') {
                        win.document.fonts.ready.then(cb).catch(cb);
                    } else {
                        // Fallback: wait 2 seconds for fonts
                        setTimeout(cb, 2000);
                    }
                }

                // Chain: wait for fonts THEN images THEN print
                waitForFonts(function() {
                    waitForImages(function() {
                        // Extra buffer for stylesheet rendering
                        setTimeout(doPrint, 300);
                    });
                });
            };
        }

        // ── Open report in a standalone new tab ──
        function printReportViaIframe(reportBodyHTML, title) {
            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
            html += '<title>' + title + ' \u2014 Mallan Real Estate</title>';
            // Fonts: Urbanist (headings), Inter (body), Font Awesome 6.7.2
            html += '<link rel="preconnect" href="https://fonts.googleapis.com">';
            html += '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>';
            html += '<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet">';
            html += '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">';
            html += '<style>';
            html += '*,*::before,*::after{box-sizing:border-box}';
            html += 'body{margin:0 auto;padding:0.5in;font-family:Inter,system-ui,-apple-system,sans-serif;font-weight:300;color:#0A0A0A;background:#f5f5f5;max-width:8.5in}';
            html += 'h1,h2,h3,h4{font-family:Urbanist,system-ui,-apple-system,sans-serif}';
            html += 'img{max-width:100%;height:auto}';
            html += 'table{table-layout:fixed;width:100%;border-collapse:collapse}';
            html += 'td,th{overflow:hidden;text-overflow:ellipsis;word-break:normal;overflow-wrap:break-word}';
            html += 'a{overflow-wrap:anywhere}';
            html += '@page{margin:0.5in 0.5in 0.6in 0.5in;size:letter portrait}';
            html += '@media print{';
            html += 'body{background:#fff;padding:0;max-width:7.3in}';
            html += '*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}';
            html += '.pkg-section{page-break-before:always}.pkg-section:first-child{page-break-before:auto}';
            html += '.pkg-per-listing{page-break-before:always}.pkg-per-listing:first-child{page-break-before:auto}';
            html += '.pkg-no-break{break-inside:avoid;page-break-inside:avoid}';
            html += '.pkg-keep-together{break-inside:avoid;page-break-inside:avoid}';
            html += 'table{page-break-inside:auto}';
            html += 'thead{display:table-header-group}';
            html += 'tr{break-inside:avoid;page-break-inside:avoid}';
            html += 'img{max-width:100%}';
            html += 'h2,h3{orphans:3;widows:3;page-break-after:avoid}';
            html += 'p{orphans:2;widows:2}';
            html += '.report-toolbar{display:none!important}';
            html += '}';
            html += '</style></head><body>';
            // Toolbar at top of the standalone page (hidden when printing)
            html += '<div class="report-toolbar" style="position:sticky;top:0;z-index:100;background:#1e293b;color:#fff;padding:10px 20px;display:flex;align-items:center;gap:16px;font-family:Inter,sans-serif;font-size:14px;margin:-0.5in -0.5in 20px -0.5in">';
            html += '<span style="font-weight:600;font-size:15px">' + title + '</span>';
            html += '<span style="flex:1"></span>';
            html += '<button onclick="window.print()" style="background:#2563eb;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px"><i class="fas fa-print"></i> Print</button>';
            html += '<button onclick="window.close()" style="background:#475569;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:14px;cursor:pointer">Close</button>';
            html += '</div>';
            html += reportBodyHTML;
            html += '</body></html>';

            // Open in a new tab (CSP-safe Blob URL)
            openPrintableWindow(html);
        }

        // ── Quick print: open a single-listing Detail report in a new tab ──
        function quickPrintReport(listingId) {
            var listing = listings.find(function(l) { return l.id === listingId; });
            if (!listing) return;

            // Save current state
            var prevIds = reportState.selectedListingIds;
            var prevFormat = reportState.format;
            var prevVersion = reportState.version;
            var prevFiltered = searchResultsState.filteredListings;

            // Configure for single-listing Detail report
            reportState.selectedListingIds = [listingId];
            reportState.format = 'detail';
            reportState.version = 'customer';
            searchResultsState.filteredListings = [listing];

            var addr = listing.addressDisplayYN === false
                ? 'Property Report'
                : listing.address + (listing.unit ? ', ' + listing.unit : '');
            var title = addr + ' — Detail Report';

            // Build report HTML (calls populateReportPreview internally)
            var html = buildFullReportHTML(title);

            // Open in standalone new tab
            printReportViaIframe(html, title);

            // Restore state
            reportState.selectedListingIds = prevIds;
            reportState.format = prevFormat;
            reportState.version = prevVersion;
            searchResultsState.filteredListings = prevFiltered;
        }


        // ── generateReport() — validates, then routes to output handler ──
        function generateReport() {
            syncUIToReportState();
            var errors = validateReportState();
            if (errors.length) { renderReportErrors(errors); return; }
            renderReportErrors([]);

            var format = reportState.format;
            var version = reportState.version;
            var output = reportState.output;
            var preparedFor = (document.getElementById('reportPreparedFor') || {}).value || 'Client';
            var title = (document.getElementById('reportTitle') || {}).value || 'Property Report';

            // Get listings (already compliance-filtered + sorted + capped at 250)
            var listings = getReportListings();
            if (listings.length === 0) {
                renderReportErrors(['No compliant listings available. All selected listings may have IDX display opted out.']);
                return;
            }

            // Route to output handler
            switch (output) {
                case 'csv':
                    exportReportCSV();
                    logAuditEntry('report_generate', { format: format, version: version, output: 'csv', count: listings.length });
                    closeReportsModal();
                    showReportToast('CSV report downloaded (' + listings.length + ' listings)');
                    break;

                case 'excel':
                    exportReportExcel();
                    logAuditEntry('report_generate', { format: format, version: version, output: 'excel', count: listings.length });
                    closeReportsModal();
                    showReportToast('Excel report downloaded (' + listings.length + ' listings)');
                    break;

                case 'share':
                case 'shareableLink':
                    generateShareableLink();
                    logAuditEntry('report_generate', { format: format, version: version, output: 'share', count: listings.length });
                    closeReportsModal();
                    break;

                case 'print':
                    var printContent = buildFullReportHTML(title);
                    closeReportsModal();
                    printReportViaIframe(printContent, title);
                    logAuditEntry('report_generate', { format: format, version: version, output: 'print', count: listings.length });
                    showReportToast('Print dialog opening...');
                    break;

                case 'email':
                default:
                    // Get recipient info
                    var recipientEmail = '';
                    var recipientName = preparedFor || 'Client';
                    var clientSel = document.getElementById('reportRecipientClient');
                    if (clientSel && clientSel.value) {
                        var sc = customerDB[clientSel.value];
                        if (sc) {
                            recipientEmail = sc.email || (clientSel.value === 'test-client' && typeof getConfiguredAgentEmail === 'function' ? getConfiguredAgentEmail() : '');
                            recipientName = sc.name || preparedFor;
                        }
                    }
                    var emailInput = document.getElementById('reportRecipientEmail');
                    if (emailInput && emailInput.value.trim()) recipientEmail = emailInput.value.trim();

                    if (!recipientEmail) {
                        renderReportErrors(['Please enter a recipient email address or select a client to send to.']);
                        return;
                    }

                    // Build format-aware email: use the actual selected format (grid, summary, etc.)
                    var reportBody = buildFullReportHTML(title);
                    var emailHTML = wrapReportForEmail(reportBody, title, recipientName, listings);

                    // Send directly from the system
                    closeReportsModal();
                    sendEmailDirect({
                        to: recipientEmail,
                        toName: recipientName,
                        subject: title + ' — Mallan Real Estate',
                        htmlBody: emailHTML,
                        listingIds: listings.map(function(l) { return l.id; }),
                        count: listings.length,
                        source: 'report_email'
                    });
                    break;
            }
        }
