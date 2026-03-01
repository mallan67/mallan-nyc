        // Rent vs Buy Calculator Logic
        function calculateRentVsBuy() {
            // Parse input values
            var monthlyRent = parseFloat(document.getElementById('rvbMonthlyRent')?.value.replace(/[$,]/g, '')) || 0;
            var rentIncrease = parseFloat(document.getElementById('rvbRentIncrease')?.value) / 100 || 0.03;
            var renterInsurance = parseFloat(document.getElementById('rvbRenterInsurance')?.value.replace(/[$,]/g, '')) || 0;

            var purchasePrice = parseFloat(document.getElementById('rvbPurchasePrice')?.value.replace(/[$,]/g, '')) || 0;
            var downPaymentPct = parseFloat(document.getElementById('rvbDownPayment')?.value) / 100 || 0.20;
            var interestRate = parseFloat(document.getElementById('rvbInterestRate')?.value) / 100 || 0.065;
            var loanTerm = parseInt(document.getElementById('rvbLoanTerm')?.value) || 30;

            var maintenance = parseFloat(document.getElementById('rvbMaintenance')?.value.replace(/[$,]/g, '')) || 0;
            var propertyTax = parseFloat(document.getElementById('rvbPropertyTax')?.value.replace(/[$,]/g, '')) || 0;
            var homeInsurance = parseFloat(document.getElementById('rvbHomeInsurance')?.value.replace(/[$,]/g, '')) || 0;
            var appreciation = parseFloat(document.getElementById('rvbAppreciation')?.value) / 100 || 0.03;

            // Calculate mortgage payment
            var loanAmount = purchasePrice * (1 - downPaymentPct);
            var monthlyRate = interestRate / 12;
            var numPayments = loanTerm * 12;
            var mortgagePayment = 0;
            if (loanAmount > 0 && monthlyRate > 0) {
                mortgagePayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
            }

            // 5-year rental cost (with annual increases)
            var totalRentCost = 0;
            var currentRent = monthlyRent;
            for (var year = 0; year < 5; year++) {
                totalRentCost += currentRent * 12;
                currentRent *= (1 + rentIncrease);
            }
            totalRentCost += renterInsurance * 5; // 5 years of renter's insurance

            // 5-year ownership cost
            var monthlyOwnershipCost = mortgagePayment + maintenance + propertyTax + homeInsurance;
            var totalOwnershipCost = monthlyOwnershipCost * 60; // 60 months

            // Equity built in 5 years (principal paid + appreciation)
            var principalPaid = 0;
            var remainingBalance = loanAmount;
            for (var month = 0; month < 60; month++) {
                var interestPayment = remainingBalance * monthlyRate;
                var principalPayment = mortgagePayment - interestPayment;
                principalPaid += principalPayment;
                remainingBalance -= principalPayment;
            }
            var downPayment = purchasePrice * downPaymentPct;
            var appreciatedValue = purchasePrice * Math.pow(1 + appreciation, 5);
            var equityBuilt = downPayment + principalPaid + (appreciatedValue - purchasePrice);

            // Update display
            var formatCurrency = (val) => '$' + Math.round(val).toLocaleString();

            document.getElementById('rvbMortgagePayment').textContent = formatCurrency(mortgagePayment);
            document.getElementById('rvbRentCost').textContent = formatCurrency(totalRentCost);
            document.getElementById('rvbOwnCost').textContent = formatCurrency(totalOwnershipCost);
            document.getElementById('rvbEquity').textContent = formatCurrency(equityBuilt);
            document.getElementById('rvbTotalRent').textContent = formatCurrency(totalRentCost);

            // Recommendation
            var recommendation = document.getElementById('rvbRecommendation');
            var breakeven = document.getElementById('rvbBreakeven');

            if (monthlyRent > 0 && purchasePrice > 0) {
                var netRentCost = totalRentCost;
                var netOwnCost = totalOwnershipCost - equityBuilt;

                if (netOwnCost < netRentCost) {
                    recommendation.textContent = 'Buying may be more advantageous over 5 years';
                    recommendation.className = 'font-semibold text-green-700';
                } else {
                    recommendation.textContent = 'Renting may be more cost-effective over 5 years';
                    recommendation.className = 'font-semibold text-purple-800';
                }

                // Calculate approximate break-even
                var monthlyDiff = (monthlyOwnershipCost - monthlyRent);
                if (monthlyDiff > 0 && equityBuilt > 0) {
                    var breakevenMonths = Math.ceil((monthlyDiff * 60) / (equityBuilt / 5) * 12);
                    breakeven.textContent = breakevenMonths > 60 ? '5+ years' : `~${Math.ceil(breakevenMonths / 12)} years`;
                } else {
                    breakeven.textContent = 'Immediate';
                }
            } else {
                recommendation.textContent = 'Enter values to see recommendation';
                recommendation.className = 'font-semibold text-purple-800';
                breakeven.textContent = '--';
            }
        }

        // Add event listeners for Rent vs Buy calculator
        document.addEventListener('DOMContentLoaded', function() {
            var rvbInputs = ['rvbMonthlyRent', 'rvbRentIncrease', 'rvbRenterInsurance',
                              'rvbPurchasePrice', 'rvbDownPayment', 'rvbInterestRate', 'rvbLoanTerm',
                              'rvbMaintenance', 'rvbPropertyTax', 'rvbHomeInsurance', 'rvbAppreciation'];
            rvbInputs.forEach(id => {
                var el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', calculateRentVsBuy);
                    el.addEventListener('change', calculateRentVsBuy);
                }
            });

            // Initialize filter toggles
            initializeFilterToggles();
        });
