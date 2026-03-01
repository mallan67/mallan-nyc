        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT FEEDBACK REPLY MODAL FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        // Store for client feedback responses
        var clientFeedbackResponses = {};

        function openClientFeedbackReplyModal() {
            document.getElementById('clientFeedbackReplyModal').classList.remove('hidden');
        }

        function closeClientFeedbackReplyModal() {
            document.getElementById('clientFeedbackReplyModal').classList.add('hidden');
        }

        function openClientReportViewModal() {
            document.getElementById('clientReportViewModal').classList.remove('hidden');
        }

        function closeClientReportViewModal() {
            document.getElementById('clientReportViewModal').classList.add('hidden');
        }

        function togglePassedProperties() {
            var list = document.getElementById('passedPropertiesList');
            var chevron = document.getElementById('passedChevron');
            if (list.classList.contains('hidden')) {
                list.classList.remove('hidden');
                chevron.classList.add('rotate-180');
            } else {
                list.classList.add('hidden');
                chevron.classList.remove('rotate-180');
            }
        }

        function setClientFeedback(buildingId, response) {
            // Store the response
            clientFeedbackResponses[buildingId] = response;

            // Update UI to show selection
            var card = document.querySelector(`[data-building="${buildingId}"]`);
            if (!card) return;

            // Reset all buttons for this card
            var buttons = card.querySelectorAll('.client-feedback-btn');
            buttons.forEach(btn => {
                btn.classList.remove('bg-red-100', 'border-red-500', 'text-red-700',
                                     'bg-yellow-100', 'border-yellow-500', 'text-yellow-700',
                                     'bg-green-100', 'border-green-500', 'text-green-700',
                                     'ring-2', 'ring-offset-1');
            });

            // Highlight selected button
            var selectedBtn = card.querySelector(`[data-response="${response}"], button:nth-child(${
                response === 'pass' ? 1 : response === 'save' ? 2 : response === 'love' ? 3 : 4
            })`);

            if (response === 'pass') {
                selectedBtn.classList.add('bg-red-100', 'border-red-500', 'text-red-700', 'ring-2', 'ring-red-200', 'ring-offset-1');
            } else if (response === 'save') {
                selectedBtn.classList.add('bg-yellow-100', 'border-yellow-500', 'text-yellow-700', 'ring-2', 'ring-yellow-200', 'ring-offset-1');
            } else if (response === 'love') {
                selectedBtn.classList.add('bg-green-100', 'border-green-500', 'text-green-700', 'ring-2', 'ring-green-200', 'ring-offset-1');
            } else if (response === 'tour') {
                // Tour button already has blue styling
            }

            // Show note field if not pass
            var noteField = card.querySelector('.feedback-note-field');
            if (noteField) {
                if (response !== 'pass') {
                    noteField.classList.remove('hidden');
                } else {
                    noteField.classList.add('hidden');
                }
            }

            // Update reviewed count
            updateReviewedCount();
        }

        function updateReviewedCount() {
            var reviewed = Object.keys(clientFeedbackResponses).length;
            var total = document.querySelectorAll('#clientReportViewModal [data-building]').length;
            var countEl = document.querySelector('#clientReportViewModal .text-gray-900');
            if (countEl) {
                countEl.textContent = `${reviewed} of ${total}`;
            }
        }

        function submitClientFeedback() {
            var reviewed = Object.keys(clientFeedbackResponses).length;
            if (reviewed === 0) {
                showToast('Please provide feedback on at least one property before submitting.', 'warning');
                return;
            }

            // Organize feedback by type
            var love = [], save = [], pass = [], tour = [];
            Object.entries(clientFeedbackResponses).forEach(([building, response]) => {
                if (response === 'love') love.push(building);
                else if (response === 'save') save.push(building);
                else if (response === 'pass') pass.push(building);
                else if (response === 'tour') tour.push(building);
            });

            // Show confirmation
            var summary = 'Feedback Summary:\n\n';
            if (love.length) summary += `❤️ Love: ${love.join(', ')}\n`;
            if (tour.length) summary += `📅 Tour Requests: ${tour.join(', ')}\n`;
            if (save.length) summary += `🔖 Saved: ${save.join(', ')}\n`;
            if (pass.length) summary += `❌ Passed: ${pass.join(', ')}\n`;

            var confirmed = confirm(summary + '\nSend this feedback to your agent?');
            if (confirmed) {
                closeClientReportViewModal();
                // Show agent's view of received feedback
                setTimeout(() => {
                    openClientFeedbackReplyModal();
                }, 300);
            }
        }

        // Close modals on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeClientFeedbackReplyModal();
                closeClientReportViewModal();
            }
        });

        // Close modals on backdrop click
        document.getElementById('clientFeedbackReplyModal')?.addEventListener('click', function(e) {
            if (e.target === this) closeClientFeedbackReplyModal();
        });
        document.getElementById('clientReportViewModal')?.addEventListener('click', function(e) {
            if (e.target === this) closeClientReportViewModal();
        });
