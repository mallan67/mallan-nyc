        function toggleSubmenu(id) {
            var submenu = document.getElementById(id);
            var isOpen = submenu.classList.contains('open');

            // Close all other submenus
            document.querySelectorAll('.submenu').forEach(menu => {
                menu.classList.remove('open');
            });

            // Toggle this submenu
            if (!isOpen) {
                submenu.classList.add('open');
            }
        }

        // Add Listing Multi-Step Form Functions
        function nextListingStep(stepNumber) {
            // Hide all steps
            document.querySelectorAll('.listing-step').forEach(step => {
                step.style.display = 'none';
            });

            // Show the selected step
            document.getElementById('listingStep' + stepNumber).style.display = 'block';

            // Update progress indicator
            updateListingProgress(stepNumber);

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function updateListingProgress(currentStep) {
            // Reset all indicators
            for (var i = 1; i <= 3; i++) {
                var indicator = document.getElementById('step' + i + 'Indicator');
                var circle = indicator.querySelector('div');
                var text = indicator.querySelector('span');

                if (i < currentStep) {
                    // Completed steps
                    circle.className = 'w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-semibold';
                    circle.innerHTML = '<i class="fas fa-check"></i>';
                    text.className = 'text-sm text-green-600';
                } else if (i === currentStep) {
                    // Current step
                    circle.className = 'w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold';
                    circle.textContent = i;
                    text.className = 'text-sm font-semibold text-blue-600';
                } else {
                    // Future steps
                    circle.className = 'w-8 h-8 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-sm font-semibold';
                    circle.textContent = i;
                    text.className = 'text-sm text-gray-400';
                }
            }
        }

        // IDX opt-out warning now controlled by handleSaleListingTypeChange() and handleRentalListingTypeChange()
        // via Listing Type radio buttons (Owner Opt-Out / Participant Only) — no standalone IDXOptOutYN checkbox

        function cancelListing() {
            if (confirm('Are you sure you want to cancel? All unsaved changes will be lost.')) {
                // Reset form
                document.querySelectorAll('.listing-step input, .listing-step textarea, .listing-step select').forEach(field => {
                    if (field.type === 'checkbox' || field.type === 'radio') {
                        field.checked = false;
                    } else {
                        field.value = '';
                    }
                });

                // Go back to step 1
                nextListingStep(1);

                // Optionally navigate to listings tab
                showTab('my-listings');
            }
        }

        function submitListing() {
            // Show success message
            showToast('Rental listing submitted for review. You can manage it in the "My Listings" tab.', 'success');

            // Reset form
            cancelListing();
        }

        // Sales Listing Multi-Step Form Functions
        function nextSalesStep(step) {
            // Hide current step
            document.querySelectorAll('[id^="salesListingStep"]').forEach(s => s.style.display = 'none');

            // Show next step
            document.getElementById('salesListingStep' + step).style.display = 'block';

            // Update progress indicator
            updateSalesProgressIndicator(step);

            // Scroll to top
            window.scrollTo(0, 0);
        }

        function prevSalesStep(step) {
            // Hide current step
            document.querySelectorAll('[id^="salesListingStep"]').forEach(s => s.style.display = 'none');

            // Show previous step
            document.getElementById('salesListingStep' + step).style.display = 'block';

            // Update progress indicator
            updateSalesProgressIndicator(step);

            // Scroll to top
            window.scrollTo(0, 0);
        }

        function updateSalesProgressIndicator(currentStep) {
            for (var i = 1; i <= 3; i++) {
                var indicator = document.getElementById('salesStep' + i + 'Indicator');
                var circle = indicator.querySelector('div');
                var text = indicator.querySelector('span');

                if (i < currentStep) {
                    // Completed step
                    circle.className = 'w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-semibold';
                    circle.innerHTML = '<i class="fas fa-check"></i>';
                    text.className = 'text-sm text-green-600';
                } else if (i === currentStep) {
                    // Current step
                    circle.className = 'w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold';
                    circle.textContent = i;
                    text.className = 'text-sm font-semibold text-blue-600';
                } else {
                    // Future step
                    circle.className = 'w-8 h-8 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-sm font-semibold';
                    circle.textContent = i;
                    text.className = 'text-sm text-gray-400';
                }
            }
        }

        // ╔══════════════════════════════════════════════════════════════════════════════╗
        // ║                                                                              ║
