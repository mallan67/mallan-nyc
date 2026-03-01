        function validateDates(formType) {
            var errors = [];
            var getVal = (id) => document.getElementById(id)?.value || '';

            if (formType === 'sale') {
                var listingDate = getVal('saleDateListed') || getVal('saleExclusiveStart');
                var contractDate = getVal('saleContractSignedDate');
                var soldDate = getVal('saleSoldDate');
                var expirationDate = getVal('saleExclusiveExpires');

                // D1: CloseDate >= PurchaseContractDate
                if (soldDate && contractDate && new Date(soldDate) < new Date(contractDate)) {
                    errors.push('Sold Date cannot be before Contract Signed Date');
                }
                // D2: PurchaseContractDate >= ListingContractDate
                if (contractDate && listingDate && new Date(contractDate) < new Date(listingDate)) {
                    errors.push('Contract Signed Date cannot be before Date Listed');
                }
                // D3: ExpirationDate <= 10 years from now
                if (expirationDate) {
                    var maxExpire = new Date();
                    maxExpire.setFullYear(maxExpire.getFullYear() + 10);
                    if (new Date(expirationDate) > maxExpire) {
                        errors.push('Expiration Date cannot be more than 10 years from today');
                    }
                }
                // D4: ListingContractDate not > 1 year from now
                if (listingDate) {
                    var maxListing = new Date();
                    maxListing.setFullYear(maxListing.getFullYear() + 1);
                    if (new Date(listingDate) > maxListing) {
                        errors.push('Date Listed cannot be more than 1 year from today');
                    }
                }
            } else {
                var listingDate = getVal('rentalDateListed');
                var leasedDate = getVal('rentalLeasedDate');
                var expirationDate = getVal('rentalExclusiveExpires');

                if (leasedDate && listingDate && new Date(leasedDate) < new Date(listingDate)) {
                    errors.push('Leased Date cannot be before Date Listed');
                }
                if (expirationDate) {
                    var maxExpire = new Date();
                    maxExpire.setFullYear(maxExpire.getFullYear() + 10);
                    if (new Date(expirationDate) > maxExpire) {
                        errors.push('Expiration Date cannot be more than 10 years from today');
                    }
                }
            }

            return errors;
        }

        // Wire date validation to submit functions
        var origValidateSalesListing = window.validateSalesListing;
        window.validateSalesListing = function() {
            var dateErrors = validateDates('sale');
            if (dateErrors.length > 0) {
                showToast('Date Validation Errors: ' + dateErrors.join('; '), 'error');
                return false;
            }
            // Also run content scanners
            var contentViolations = scanAllContent('sale');
            if (contentViolations.length > 0) {
                var proceed = confirm('REBNY Content Violations Found:\n\n' + contentViolations.map(v => '• ' + v.type + ': "' + v.match + '"').join('\n') + '\n\nSubmitting with violations may result in fines. Continue anyway?');
                if (!proceed) return false;
            }
            return origValidateSalesListing ? origValidateSalesListing() : true;
        };

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  COMING SOON ENFORCEMENT (Sale Only — 14 Day Max)             ║
        // ╚══════════════════════════════════════════════════════════════════╝

        // Enhance handleSaleComingSoon to add 14-day enforcement
        var origHandleSaleComingSoon = window.handleSaleComingSoon;
        window.handleSaleComingSoon = function() {
            if (origHandleSaleComingSoon) origHandleSaleComingSoon();

            var statusEl = document.getElementById('saleStatus');
            if (!statusEl || statusEl.value !== 'ComingSoon') return;

            // Show ActivationDate field if Coming Soon
            var activationField = document.getElementById('saleActivationDateContainer');
            if (!activationField) {
                // Create ActivationDate field dynamically
                var dateSection = document.getElementById('saleFirstShowingDate')?.closest('.grid');
                if (dateSection) {
                    var container = document.createElement('div');
                    container.id = 'saleActivationDateContainer';
                    container.innerHTML = `
                        <label class="block text-sm font-medium text-gray-700 mb-2">Activation Date <span class="text-red-500">*</span></label>
                        <input type="date" id="saleActivationDate" class="w-full border rounded-lg px-4 py-2 text-sm" required>
                        <p class="text-xs text-amber-600 mt-1"><i class="fas fa-clock mr-1"></i>Must be within 14 days. REBNY Coming Soon max: 14 calendar days.</p>
                    `;
                    dateSection.appendChild(container);

                    // Add 14-day max validation
                    var activationInput = container.querySelector('#saleActivationDate');
                    var today = new Date();
                    var maxDate = new Date(today);
                    maxDate.setDate(maxDate.getDate() + 14);
                    activationInput.min = today.toISOString().split('T')[0];
                    activationInput.max = maxDate.toISOString().split('T')[0];
                    activationInput.addEventListener('change', function() {
                        var selected = new Date(this.value);
                        if (selected > maxDate) {
                            showToast('Coming Soon period cannot exceed 14 calendar days per REBNY rules.', 'error');
                            this.value = maxDate.toISOString().split('T')[0];
                        }
                    });
                }
            }
            if (activationField) activationField.style.display = '';
        };

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  STATUS STATE MACHINE (Valid Transitions)                      ║
        // ╚══════════════════════════════════════════════════════════════════╝

