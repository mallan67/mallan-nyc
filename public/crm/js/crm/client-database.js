// ============================================
// CUSTOMER MODE
// ============================================
var customerDB = {
    // Test account — uses the email from Email Settings (gear icon in nav)
    'test-client': {
        name: 'Test Client (You)', initials: 'TC', email: '', phone: '',
        type: 'Buyer', clientType: 'buyer', budget: 'Any', color: 'amber',
        agentId: 'DEMO-001', agentName: 'Demo Agent', tags: ['Test'],
        clientStatus: 'active', closedDate: null, closedType: null, closedProperty: null,
        preferences: { propertyTypes: ['Condo', 'Co-op'], neighborhoods: ['Upper East Side'], minBeds: 1, maxBeds: null, minBaths: 1, maxBaths: null, minPrice: 0, maxPrice: null, moveInDate: '', mustHaves: [], notes: 'Test account — email auto-filled from Email Settings' },
        coViewers: [], alertSettings: { enabled: false }, closedAlertSettings: { enabled: false },
        matchedListings: [], sendHistory: [], lastDelivery: null, nextDelivery: null,
        portfolio: { picked: 0, liked: 0, disliked: 0, shown: 0, emailed: 0, newMatches: 0, listings: [] },
        savedSearches: [], showings: [], loginHistory: [], lastLogin: null, viewHistory: [],
        inviteStatus: 'active', inviteDate: '2026-02-19', inviteSentDate: '2026-02-19', inviteResendCount: 0, lastActivity: '2026-02-19',
        dealStage: 'new', lastContacted: null, tasks: [], notes: [],
        dealMetrics: { avgResponseTime: '', showingsToOffer: '', avgNegotiation: '' }
    },
    // Demo agent's clients (mock data)
    'james-richardson': {
        name: 'James Richardson', initials: 'JR', email: 'james.richardson@email.com', phone: '(212) 555-0147',
        type: 'Buyer', clientType: 'buyer', budget: '$50M+', color: 'blue',
        agentId: 'DEMO-001', agentName: 'Demo Agent', tags: ['Full Floor', 'Central Park'],
        clientStatus: 'active', closedDate: null, closedType: null, closedProperty: null,
        preferences: {
            propertyTypes: ['Condo', 'Co-op'], neighborhoods: ['Upper East Side', 'Central Park South'],
            minBeds: 3, maxBeds: null, minBaths: 3, maxBaths: null,
            minPrice: 50000000, maxPrice: null, moveInDate: '', mustHaves: ['Doorman', 'Central Park Views', 'Full Floor'], notes: 'Prefers pre-war with modern renovation'
        },
        coViewers: [{ name: 'Patricia Richardson', email: 'p.richardson@email.com', phone: '(212) 555-0148', relation: 'Spouse', permission: 'REQUEST_SHOWING', lastActive: '2026-02-12' }],
        alertSettings: { enabled: true, checkFreq: '5min', emailTemplate: 'detailed', agentFreq: 'monthly', agentDeliveryDay: '1', frequency: 'monthly', customerDeliveryDay: '1', newListingAlerts: true, priceAlerts: true },
        closedAlertSettings: { enabled: false, type: 'newsletter', frequency: 'quarterly' },
        matchedListings: [
            { id: 'ml-jr-1', type: 'new_listing', listingId: 'ML-2024-099', address: '1040 Fifth Ave #12B', price: '$52,000,000', oldPrice: null, matchedSearch: 'Full Floor Central Park', dateFound: '2026-02-14', status: 'queued' },
            { id: 'ml-jr-2', type: 'price_change', listingId: 'ML-2024-003', address: '220 CPS #45A', price: '$58,500,000', oldPrice: '$62,000,000', matchedSearch: 'Full Floor Central Park', dateFound: '2026-02-13', status: 'queued' },
            { id: 'ml-jr-3', type: 'new_listing', listingId: 'ML-2024-077', address: '960 Fifth Ave #18C', price: '$47,500,000', oldPrice: null, matchedSearch: 'Full Floor Central Park', dateFound: '2026-02-10', status: 'sent', sentDate: '2026-02-10' },
            { id: 'ml-jr-4', type: 'price_change', listingId: 'ML-2024-055', address: '740 Park Ave #6/7A', price: '$55,000,000', oldPrice: '$59,000,000', matchedSearch: 'Full Floor Central Park', dateFound: '2026-02-08', status: 'sent', sentDate: '2026-02-08' }
        ],
        sendHistory: [
            { date: '2026-02-10', count: 2, type: 'daily', listings: ['960 Fifth Ave #18C', '740 Park Ave #6/7A'] },
            { date: '2026-02-06', count: 1, type: 'daily', listings: ['834 Fifth Ave #9A'] }
        ],
        lastDelivery: '2026-02-10',
        nextDelivery: '2026-02-15',
        portfolio: { picked: 3, liked: 2, disliked: 1, shown: 2, emailed: 5, newMatches: 1,
            listings: [
                { listingId: 'ML-2024-001', address: '432 Park Ave #82', price: '$55,000,000', status: 'liked', comment: 'Amazing views, want second showing', addedDate: '2026-02-10' },
                { listingId: 'ML-2024-003', address: '220 CPS #45A', price: '$62,000,000', status: 'shown', comment: '', addedDate: '2026-02-08' },
                { listingId: 'ML-2024-005', address: '15 CPW #32B', price: '$48,000,000', status: 'new', comment: '', addedDate: '2026-02-13' }
            ]
        },
        savedSearches: [
            { id: 'cs-jr-1', name: 'Full Floor Central Park', criteria: { minPrice: 40000000, beds: '3+', neighborhoods: ['UES','CPS'] }, dateCreated: '2026-01-15', lastRun: '2026-02-13', resultCount: 8 }
        ],
        showings: [
            { id: 'sh-1', listingId: 'ML-2024-001', address: '432 Park Ave #82', date: '2026-02-18', time: '2:00 PM', type: 'In-Person', status: 'scheduled', notes: 'Second showing, bring spouse' }
        ],
        loginHistory: [
            { date: '2026-02-13', time: '3:22 PM', device: 'Mobile (iPhone)', duration: '12 min' },
            { date: '2026-02-11', time: '10:15 AM', device: 'Desktop (Chrome)', duration: '25 min' }
        ],
        lastLogin: '2026-02-13 3:22 PM',
        viewHistory: [
            { listingId: 'ML-2024-001', address: '432 Park Ave #82', date: '2026-02-13', time: '3:24 PM', duration: '4m 32s', source: 'portfolio' },
            { listingId: 'ML-2024-005', address: '15 CPW #32B', date: '2026-02-13', time: '3:30 PM', duration: '2m 10s', source: 'alert' }
        ],
        inviteStatus: 'active', inviteDate: '2026-01-10', inviteSentDate: '2026-01-10', inviteResendCount: 0, lastActivity: '2026-02-13',
        dealStage: 'touring', lastContacted: '2026-02-13',
        tasks: [
            { id: 'tsk-1', text: 'Call to confirm budget', dueDate: '2026-02-16', status: 'pending', overdue: false },
            { id: 'tsk-2', text: 'Follow up after showing', dueDate: '2026-02-19', status: 'pending', overdue: false },
            { id: 'tsk-3', text: 'Send updated shortlist', dueDate: '2026-02-17', status: 'pending', overdue: false },
            { id: 'tsk-4', text: 'Board package review', dueDate: '2026-02-20', status: 'pending', overdue: false }
        ],
        _notes: [
            { id: 'note-seed-1', text: 'Client prefers pre-war with modern renovation. Full floor only.', type: 'note', date: '2026-01-20', time: '10:30 AM', author: 'Demo Agent' },
            { id: 'note-seed-2', text: 'Discussed Central Park South options — interested in 220 CPS', type: 'call', date: '2026-02-05', time: '2:15 PM', author: 'Demo Agent' },
            { id: 'note-seed-3', text: 'Spouse very involved in decision. Wants 2nd showing at 432 Park.', type: 'meeting', date: '2026-02-10', time: '11:00 AM', author: 'Demo Agent' },
            { id: 'note-seed-4', text: 'Budget confirmed $50M+ cash. LLC entity purchase. Roberts & Associates on retainer.', type: 'note', date: '2026-02-13', time: '4:00 PM', author: 'Demo Agent' }
        ],
        internalTags: ['Cash', 'Foreign Buyer'],
        dealValue: 55000000, closeProbability: 65, estimatedTimeline: 60,
        financialReadiness: { type: 'Cash', lender: '', proofOfFunds: true, attorneyAssigned: true, attorneyName: 'Roberts & Associates', entityPurchase: 'LLC' },
        criteriaHistory: [
            { date: '2026-01-15', field: 'neighborhoods', oldVal: 'UES', newVal: 'UES, CPS', changedBy: 'agent' },
            { date: '2026-02-05', field: 'minPrice', oldVal: '$40M', newVal: '$50M', changedBy: 'client' }
        ],
        responseMetrics: { avgReplyHours: 4, avgFeedbackDays: 2, lastReplyDate: '2026-02-13', ghostRisk: 'low' }
    },
    'victoria-chen': {
        name: 'Victoria Chen', initials: 'VC', email: 'v.chen@investment.com', phone: '(917) 555-0283',
        type: 'Buyer', clientType: 'buyer', budget: '$10-20M', color: 'purple',
        agentId: 'DEMO-001', agentName: 'Demo Agent', tags: ['New Dev', 'Tax Abatement'],
        clientStatus: 'active', closedDate: null, closedType: null, closedProperty: null,
        preferences: {
            propertyTypes: ['Condo'], neighborhoods: ['Tribeca', 'Hudson Yards', 'FiDi'],
            minBeds: 2, maxBeds: 3, minBaths: 2, maxBaths: null,
            minPrice: 10000000, maxPrice: 20000000, moveInDate: '2026-06-01', mustHaves: ['Tax Abatement', 'New Development', 'Gym'], notes: 'Investment property, wants high rental yield'
        },
        coViewers: [],
        alertSettings: { enabled: true, checkFreq: '5min', emailTemplate: 'detailed', agentFreq: 'realtime', agentDeliveryDay: '1', frequency: 'realtime', customerDeliveryDay: '1', newListingAlerts: true, priceAlerts: true },
        closedAlertSettings: { enabled: false, type: 'newsletter', frequency: 'quarterly' },
        matchedListings: [
            { id: 'ml-vc-1', type: 'new_listing', listingId: 'ML-2024-088', address: '56 Leonard St #PH', price: '$18,500,000', oldPrice: null, matchedSearch: 'New Dev Tribeca/HY $10-20M', dateFound: '2026-02-14', status: 'sent', sentDate: '2026-02-14' },
            { id: 'ml-vc-2', type: 'price_change', listingId: 'ML-2024-010', address: '50 Hudson Yards #67A', price: '$13,900,000', oldPrice: '$14,500,000', matchedSearch: 'Portfolio — Price Watch', dateFound: '2026-02-14', status: 'sent', sentDate: '2026-02-14' },
            { id: 'ml-vc-3', type: 'new_listing', listingId: 'ML-2024-091', address: '77 Greenwich St #PH2', price: '$16,200,000', oldPrice: null, matchedSearch: 'New Dev Tribeca/HY $10-20M', dateFound: '2026-02-14', status: 'queued' }
        ],
        sendHistory: [
            { date: '2026-02-14', count: 2, type: 'realtime', listings: ['56 Leonard St #PH', '50 Hudson Yards #67A (price change)'] },
            { date: '2026-02-12', count: 3, type: 'realtime', listings: ['111 Murray St #42', '30 Park Place #62A', '50 Hudson Yards #67A'] }
        ],
        lastDelivery: '2026-02-14',
        nextDelivery: 'Instant',
        portfolio: { picked: 5, liked: 3, disliked: 2, shown: 1, emailed: 8, newMatches: 3,
            listings: [
                { listingId: 'ML-2024-010', address: '50 Hudson Yards #67A', price: '$14,500,000', status: 'liked', comment: 'Great tax abatement, check HOA', addedDate: '2026-02-12' },
                { listingId: 'ML-2024-012', address: '111 Murray St #42', price: '$12,800,000', status: 'new', comment: '', addedDate: '2026-02-14' }
            ]
        },
        savedSearches: [
            { id: 'cs-vc-1', name: 'New Dev Tribeca/HY $10-20M', criteria: { minPrice: 10000000, maxPrice: 20000000, beds: '2-3', neighborhoods: ['Tribeca','Hudson Yards'] }, dateCreated: '2026-02-01', lastRun: '2026-02-14', resultCount: 12 }
        ],
        showings: [],
        loginHistory: [
            { date: '2026-02-14', time: '9:05 AM', device: 'Desktop (Safari)', duration: '18 min' }
        ],
        lastLogin: '2026-02-14 9:05 AM',
        viewHistory: [
            { listingId: 'ML-2024-010', address: '50 Hudson Yards #67A', date: '2026-02-14', time: '9:08 AM', duration: '6m 45s', source: 'search' }
        ],
        inviteStatus: 'active', inviteDate: '2026-01-28', inviteSentDate: '2026-01-28', inviteResendCount: 0, lastActivity: '2026-02-14',
        dealStage: 'searching', lastContacted: '2026-02-14',
        tasks: [
            { id: 'tsk-5', text: 'Verify tax abatement status', dueDate: '2026-02-18', status: 'pending', overdue: false },
            { id: 'tsk-6', text: 'Send HOA comparison spreadsheet', dueDate: '2026-02-16', status: 'pending', overdue: false }
        ],
        internalTags: ['1031', 'Developer'],
        dealValue: 15000000, closeProbability: 45, estimatedTimeline: 90,
        financialReadiness: { type: 'Pre-Approved', lender: 'JPMorgan Private Bank', proofOfFunds: true, attorneyAssigned: false, attorneyName: '', entityPurchase: 'LLC' },
        criteriaHistory: [
            { date: '2026-02-01', field: 'neighborhoods', oldVal: 'Tribeca', newVal: 'Tribeca, Hudson Yards, FiDi', changedBy: 'client' }
        ],
        responseMetrics: { avgReplyHours: 1, avgFeedbackDays: 1, lastReplyDate: '2026-02-14', ghostRisk: 'low' }
    },
    'sarah-miller': {
        name: 'Sarah & David Miller', initials: 'SM', email: 'smiller@gmail.com', phone: '(646) 555-0198',
        type: 'Renter', clientType: 'renter', budget: '$6-8K/mo', color: 'green',
        agentId: 'DEMO-001', agentName: 'Demo Agent', tags: ['2BR', 'UES / Tribeca'],
        clientStatus: 'active', closedDate: null, closedType: null, closedProperty: null,
        preferences: {
            propertyTypes: ['Condo', 'Co-op', 'Rental Building'], neighborhoods: ['Upper East Side', 'Tribeca'],
            minBeds: 2, maxBeds: 2, minBaths: 1, maxBaths: 2,
            minPrice: 6000, maxPrice: 8000, moveInDate: '2026-04-01', mustHaves: ['Doorman', 'Laundry In-Unit', 'Pet-Friendly'], notes: 'Have a golden retriever, need pet-friendly. Prefer pre-war charm.'
        },
        coViewers: [{ name: 'David Miller', email: 'dmiller@gmail.com', phone: '(646) 555-0199', relation: 'Spouse', permission: 'COMMENT', lastActive: '2026-02-11' }],
        alertSettings: { enabled: true, checkFreq: '5min', emailTemplate: 'detailed', agentFreq: 'monthly', agentDeliveryDay: '1', frequency: 'monthly', customerDeliveryDay: '1', newListingAlerts: true, priceAlerts: true },
        closedAlertSettings: { enabled: false, type: 'newsletter', frequency: 'quarterly' },
        matchedListings: [], sendHistory: [], lastDelivery: null, nextDelivery: null,
        portfolio: { picked: 4, liked: 2, disliked: 3, shown: 2, emailed: 6, newMatches: 2,
            listings: [
                { listingId: 'ML-R-001', address: '400 E 90th St #12C', price: '$7,200/mo', status: 'liked', comment: 'Love the layout, is there parking?', addedDate: '2026-02-09' },
                { listingId: 'ML-R-003', address: '145 Hudson St #8B', price: '$7,800/mo', status: 'new', comment: '', addedDate: '2026-02-13' }
            ]
        },
        savedSearches: [
            { id: 'cs-sm-1', name: 'UES 2BR Pet-Friendly', criteria: { minPrice: 6000, maxPrice: 8000, beds: '2', neighborhoods: ['UES'] }, dateCreated: '2026-02-05', lastRun: '2026-02-12', resultCount: 15 }
        ],
        showings: [
            { id: 'sh-2', listingId: 'ML-R-001', address: '400 E 90th St #12C', date: '2026-02-16', time: '11:00 AM', type: 'In-Person', status: 'scheduled', notes: 'Both Sarah and David attending' }
        ],
        loginHistory: [
            { date: '2026-02-12', time: '7:45 PM', device: 'Mobile (Android)', duration: '8 min' }
        ],
        lastLogin: '2026-02-12 7:45 PM',
        viewHistory: [
            { listingId: 'ML-R-001', address: '400 E 90th St #12C', date: '2026-02-12', time: '7:47 PM', duration: '3m 20s', source: 'portfolio' }
        ],
        inviteStatus: 'active', inviteDate: '2026-02-01', inviteSentDate: '2026-02-01', inviteResendCount: 0, lastActivity: '2026-02-12',
        dealStage: 'touring', lastContacted: '2026-02-12',
        tasks: [
            { id: 'tsk-7', text: 'Research pet policies for shortlisted buildings', dueDate: '2026-02-15', status: 'pending', overdue: true }
        ],
        internalTags: ['Referral Source'],
        dealValue: 84000, closeProbability: 55, estimatedTimeline: 30,
        financialReadiness: { type: 'Pre-Approved', lender: 'N/A (Rental)', proofOfFunds: false, attorneyAssigned: false, attorneyName: '', entityPurchase: 'N/A' },
        criteriaHistory: [],
        responseMetrics: { avgReplyHours: 12, avgFeedbackDays: 3, lastReplyDate: '2026-02-12', ghostRisk: 'medium' }
    },
    'thomas-nakamura': {
        name: 'Thomas Nakamura', initials: 'TN', email: 't.nakamura@email.com', phone: '(212) 555-0567',
        type: 'Buyer', clientType: 'buyer', budget: '$2-4M', color: 'teal',
        agentId: 'DEMO-001', agentName: 'Demo Agent', tags: ['Condo', 'Midtown East'],
        clientStatus: 'active', closedDate: null, closedType: null, closedProperty: null,
        preferences: {
            propertyTypes: ['Condo'], neighborhoods: ['Midtown East', 'Murray Hill', 'Gramercy'],
            minBeds: 1, maxBeds: 2, minBaths: 1, maxBaths: 2,
            minPrice: 2000000, maxPrice: 4000000, moveInDate: '', mustHaves: ['Gym', 'Roof Deck'], notes: 'First-time buyer, needs mortgage pre-approval guidance'
        },
        coViewers: [],
        alertSettings: { enabled: false, checkFreq: '4xday', emailTemplate: 'summary', agentFreq: 'weekly', agentDeliveryDay: '1', frequency: 'weekly', customerDeliveryDay: '1', newListingAlerts: false, priceAlerts: false },
        closedAlertSettings: { enabled: false, type: 'newsletter', frequency: 'quarterly' },
        matchedListings: [], sendHistory: [], lastDelivery: null, nextDelivery: null,
        portfolio: { picked: 1, liked: 0, disliked: 0, shown: 0, emailed: 2, newMatches: 0, listings: [] },
        savedSearches: [],
        showings: [],
        loginHistory: [],
        lastLogin: '',
        viewHistory: [],
        inviteStatus: 'sent', inviteDate: '2026-02-12', inviteSentDate: '2026-02-12', inviteResendCount: 1, lastActivity: '2026-02-12',
        dealStage: 'qualified', lastContacted: '2026-02-12',
        tasks: [
            { id: 'tsk-8', text: 'Send mortgage pre-approval checklist', dueDate: '2026-02-14', status: 'pending', overdue: true },
            { id: 'tsk-9', text: 'Follow up on portal invite', dueDate: '2026-02-15', status: 'pending', overdue: true }
        ],
        internalTags: ['First-Time'],
        dealValue: 3000000, closeProbability: 25, estimatedTimeline: 90,
        financialReadiness: { type: 'TBD', lender: '', proofOfFunds: false, attorneyAssigned: false, attorneyName: '', entityPurchase: 'N/A' },
        criteriaHistory: [],
        responseMetrics: { avgReplyHours: 48, avgFeedbackDays: 0, lastReplyDate: '', ghostRisk: 'high' }
    },
    // Closed clients
    'elena-kowalski': {
        name: 'Elena Kowalski', initials: 'EK', email: 'elena.kowalski@email.com', phone: '(917) 555-0412',
        type: 'Buyer', clientType: 'buyer', budget: '$3.5M', color: 'blue',
        agentId: 'DEMO-001', agentName: 'Demo Agent', tags: ['Condo', 'Tribeca'],
        clientStatus: 'closed', closedDate: '2026-01-22', closedType: 'purchased', closedProperty: '77 Hudson St #28C, Tribeca',
        pipelineData: { checkInFrequency: 'annual', nextCheckIn: '2027-01-22', lastCheckIn: '2026-01-22', sellerPotentialYears: 5, notes: 'Tribeca condo purchase — potential seller 2031' },
        preferences: {
            propertyTypes: ['Condo'], neighborhoods: ['Tribeca', 'SoHo'],
            minBeds: 2, maxBeds: 2, minBaths: 2, maxBaths: 2,
            minPrice: 3000000, maxPrice: 4000000, moveInDate: '2026-03-01', mustHaves: ['Doorman', 'Gym', 'Laundry In-Unit'], notes: 'Closed Jan 22 — purchased 77 Hudson St #28C'
        },
        coViewers: [],
        alertSettings: { enabled: false, checkFreq: '5min', emailTemplate: 'detailed', agentFreq: 'monthly', agentDeliveryDay: '1', frequency: 'monthly', customerDeliveryDay: '1', newListingAlerts: false, priceAlerts: false },
        closedAlertSettings: { enabled: true, type: 'both', frequency: 'quarterly' },
        matchedListings: [], sendHistory: [], lastDelivery: null, nextDelivery: null,
        portfolio: { picked: 6, liked: 3, disliked: 2, shown: 4, emailed: 10, newMatches: 0,
            listings: [
                { listingId: 'ML-2024-077', address: '77 Hudson St #28C', price: '$3,450,000', status: 'liked', comment: 'PURCHASED — closed 1/22/2026', addedDate: '2026-01-05' }
            ]
        },
        savedSearches: [
            { id: 'cs-ek-1', name: 'Tribeca 2BR Condos', criteria: { minPrice: 3000000, maxPrice: 4000000, beds: '2', neighborhoods: ['Tribeca'] }, dateCreated: '2025-11-10', lastRun: '2026-01-20', resultCount: 9 }
        ],
        showings: [],
        loginHistory: [
            { date: '2026-01-20', time: '4:15 PM', device: 'Desktop (Chrome)', duration: '10 min' }
        ],
        lastLogin: '2026-01-20 4:15 PM',
        viewHistory: [],
        inviteStatus: 'active', inviteDate: '2025-11-15', inviteSentDate: '2025-11-15', inviteResendCount: 0, lastActivity: '2026-01-22',
        dealStage: 'closed', lastContacted: '2026-01-22', tasks: [],
        internalTags: [], dealValue: 3450000, closeProbability: 100, estimatedTimeline: 0,
        financialReadiness: { type: 'Pre-Approved', lender: 'Citibank', proofOfFunds: true, attorneyAssigned: true, attorneyName: 'Chen & Partners', entityPurchase: 'N/A' },
        criteriaHistory: [], responseMetrics: { avgReplyHours: 6, avgFeedbackDays: 2, lastReplyDate: '2026-01-22', ghostRisk: 'none' }
    },
    'marcus-johnson': {
        name: 'Marcus Johnson', initials: 'MJ', email: 'marcus.j@email.com', phone: '(646) 555-0733',
        type: 'Renter', clientType: 'renter', budget: '$5K/mo', color: 'green',
        agentId: 'DEMO-001', agentName: 'Demo Agent', tags: ['1BR', 'UES'],
        clientStatus: 'closed', closedDate: '2026-02-01', closedType: 'rented', closedProperty: '200 E 82nd St #6A, UES',
        pipelineData: { leaseExpiration: '2027-02-01', checkInFrequency: '60days_before_lease', nextCheckIn: '2026-12-03', lastCheckIn: '2026-02-01', notes: '1yr lease UES — renewal outreach Dec 2026' },
        preferences: {
            propertyTypes: ['Co-op', 'Rental Building'], neighborhoods: ['Upper East Side'],
            minBeds: 1, maxBeds: 1, minBaths: 1, maxBaths: 1,
            minPrice: 4000, maxPrice: 5500, moveInDate: '2026-02-15', mustHaves: ['Doorman', 'Laundry In-Unit'], notes: 'Closed Feb 1 — rented 200 E 82nd St #6A'
        },
        coViewers: [],
        alertSettings: { enabled: false, checkFreq: '5min', emailTemplate: 'detailed', agentFreq: 'monthly', agentDeliveryDay: '1', frequency: 'monthly', customerDeliveryDay: '1', newListingAlerts: false, priceAlerts: false },
        closedAlertSettings: { enabled: true, type: 'newsletter', frequency: 'monthly' },
        matchedListings: [], sendHistory: [], lastDelivery: null, nextDelivery: null,
        portfolio: { picked: 3, liked: 1, disliked: 1, shown: 2, emailed: 4, newMatches: 0,
            listings: [
                { listingId: 'ML-R-082', address: '200 E 82nd St #6A', price: '$4,500/mo', status: 'liked', comment: 'RENTED — lease signed 2/1/2026', addedDate: '2026-01-18' }
            ]
        },
        savedSearches: [],
        showings: [],
        loginHistory: [
            { date: '2026-02-01', time: '11:30 AM', device: 'Mobile (iPhone)', duration: '5 min' }
        ],
        lastLogin: '2026-02-01 11:30 AM',
        viewHistory: [],
        inviteStatus: 'active', inviteDate: '2026-01-05', inviteSentDate: '2026-01-05', inviteResendCount: 0, lastActivity: '2026-02-01',
        dealStage: 'closed', lastContacted: '2026-02-01', tasks: [],
        internalTags: [], dealValue: 54000, closeProbability: 100, estimatedTimeline: 0,
        financialReadiness: { type: 'Pre-Approved', lender: 'N/A (Rental)', proofOfFunds: false, attorneyAssigned: false, attorneyName: '', entityPurchase: 'N/A' },
        criteriaHistory: [], responseMetrics: { avgReplyHours: 8, avgFeedbackDays: 1, lastReplyDate: '2026-02-01', ghostRisk: 'none' }
    }
};

// Agent-scoped client filtering — broker sees all, agent sees only their own
function getMyClients() {
    var clients = {};
    for (var id in customerDB) {
        var c = customerDB[id];
        if (LOGGED_IN_AGENT.role === 'broker' || c.agentId === LOGGED_IN_AGENT.id) {
            clients[id] = c;
        }
    }
    return clients;
}

// Dynamically render client card grid (replaces hardcoded HTML cards)
function renderClientGrid() {
    var tbody = document.getElementById('clientTableBody');
    if (!tbody) return;
    var clients = getMyClients();
    var stageLabels = { new_lead:'New Lead', qualified:'Qualified', requirements_confirmed:'Req. Confirmed', searching:'Searching', touring:'Touring', shortlist:'Shortlist', offer_prep:'Offer Prep', offer_submitted:'Offer', negotiation:'Negotiating', contract_signed:'Contract', closing_scheduled:'Closing', closed:'Closed' };
    var stageSteps = ['new_lead','qualified','requirements_confirmed','searching','touring','shortlist','offer_prep','offer_submitted','negotiation','contract_signed','closing_scheduled','closed'];
    var typeColors = { Buyer:'blue', Renter:'green', Seller:'amber', Landlord:'purple', Investor:'indigo' };

    // Apply filters
    var typeFilter = document.getElementById('clientTypeFilter') ? document.getElementById('clientTypeFilter').value : 'all';
    var stageFilter = document.getElementById('clientStageFilter') ? document.getElementById('clientStageFilter').value : 'all';
    var searchText = (document.getElementById('clientDirectorySearch') ? document.getElementById('clientDirectorySearch').value : '').toLowerCase();

    var rows = [];
    var activeCount = 0, closedCount = 0;
    for (var id in clients) {
        var c = clients[id];
        var cs = c.clientStatus || 'active';
        if (cs === 'active') activeCount++;
        else closedCount++;
        // Tab filtering
        if (currentClientTab === 'active' && cs !== 'active') continue;
        if (currentClientTab === 'closed' && cs !== 'closed') continue;
        // Dropdown filters
        if (typeFilter !== 'all' && (c.clientType || c.type || '').toLowerCase() !== typeFilter) continue;
        if (stageFilter !== 'all' && c.dealStage !== stageFilter) continue;
        if (searchText && c.name.toLowerCase().indexOf(searchText) === -1
            && c.email.toLowerCase().indexOf(searchText) === -1
            && ((c.preferences && c.preferences.neighborhoods) || []).join(',').toLowerCase().indexOf(searchText) === -1) continue;
        rows.push({ id: id, client: c });
    }

    var html = '';
    rows.forEach(function(row) {
        var c = row.client;
        var cs = c.clientStatus || 'active';
        var p = c.preferences || {};
        var dealStage = c.dealStage || 'new_lead';
        var stageIdx = stageSteps.indexOf(dealStage);
        var stageColor = stageIdx >= 9 ? 'green' : stageIdx >= 6 ? 'purple' : stageIdx >= 3 ? 'blue' : 'gray';
        var tc = typeColors[c.type] || 'gray';
        var neighborhoods = (p.neighborhoods || []).join(', ') || '\u2014';
        var beds = p.minBeds ? (p.maxBeds && p.maxBeds !== p.minBeds ? p.minBeds + '-' + p.maxBeds : p.minBeds + '+') : '\u2014';
        var baths = p.minBaths ? (p.maxBaths && p.maxBaths !== p.minBaths ? p.minBaths + '-' + p.maxBaths : p.minBaths + '+') : '\u2014';
        var lastAct = c.lastActivity ? Math.round((new Date() - new Date(c.lastActivity)) / 86400000) : null;
        var actColor = lastAct === null ? 'gray' : lastAct > 7 ? 'red' : lastAct > 3 ? 'amber' : 'green';
        var pendingAlerts = (c.matchedListings || []).filter(function(m) { return m.status === 'queued'; }).length;
        var savedSearchCount = (c.savedSearches || []).length;
        var portfolioCount = (c.portfolio && c.portfolio.listings) ? c.portfolio.listings.length : 0;

        html += '<tr onclick="openClientWorkspace(\'' + row.id + '\')" class="border-b hover:bg-blue-50/50 cursor-pointer transition-colors">';

        // Name + avatar
        html += '<td class="px-4 py-3"><div class="flex items-center gap-2.5">';
        html += '<div class="w-8 h-8 bg-' + c.color + '-100 text-' + c.color + '-700 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">' + c.initials + '</div>';
        html += '<div class="min-w-0"><p class="font-semibold text-gray-900 text-sm truncate">' + c.name + '</p>';
        html += '<p class="text-[11px] text-gray-400 truncate">' + c.email + '</p></div>';
        html += '</div></td>';

        // Role
        html += '<td class="px-4 py-3"><span class="text-[10px] px-2 py-0.5 bg-' + tc + '-100 text-' + tc + '-700 rounded-full font-semibold">' + c.type + '</span></td>';

        // Stage
        if (cs === 'closed') {
            var closedLabels = { purchased:'Purchased', rented:'Rented', sold:'Sold', leased:'Leased' };
            html += '<td class="px-4 py-3"><span class="text-[10px] px-2 py-0.5 bg-gray-800 text-white rounded-full font-semibold">' + (closedLabels[c.closedType] || 'Closed') + '</span></td>';
        } else {
            html += '<td class="px-4 py-3"><span class="text-xs font-medium text-' + stageColor + '-700">' + (stageLabels[dealStage] || dealStage) + '</span></td>';
        }

        // Budget
        html += '<td class="px-4 py-3 text-right text-sm font-semibold text-gray-900 whitespace-nowrap">' + (c.budget || '\u2014') + '</td>';

        // BD / BA
        html += '<td class="px-4 py-3 text-center text-xs text-gray-700">' + beds + '</td>';
        html += '<td class="px-4 py-3 text-center text-xs text-gray-700">' + baths + '</td>';

        // Neighborhood
        html += '<td class="px-4 py-3 text-xs text-gray-600 max-w-[160px] truncate" title="' + neighborhoods + '">' + neighborhoods + '</td>';

        // Activity
        html += '<td class="px-4 py-3">';
        html += '<span class="text-[11px] text-' + actColor + '-600">' + (lastAct === null ? '\u2014' : lastAct === 0 ? 'Today' : lastAct + 'd') + '</span>';
        if (pendingAlerts > 0) html += ' <span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">' + pendingAlerts + '</span>';
        html += '</td>';

        // Actions
        html += '<td class="px-4 py-3 text-center"><div class="flex items-center justify-center gap-1">';
        if (savedSearchCount > 0) html += '<span class="w-6 h-6 flex items-center justify-center text-gray-400" title="' + savedSearchCount + ' saved searches"><i class="fas fa-search text-[10px]"></i></span>';
        if (portfolioCount > 0) html += '<span class="w-6 h-6 flex items-center justify-center text-gray-400" title="' + portfolioCount + ' portfolio listings"><i class="fas fa-folder text-[10px]"></i></span>';
        html += '</div></td>';

        html += '</tr>';
    });

    tbody.innerHTML = html || '<tr><td colspan="9" class="text-center py-12 text-gray-400"><i class="fas fa-users text-3xl mb-3 block text-gray-300"></i>No clients match filters</td></tr>';

    // Update tab counts
    var activeCountEl = document.getElementById('clientTabActiveCount');
    var closedCountEl = document.getElementById('clientTabClosedCount');
    if (activeCountEl) activeCountEl.textContent = activeCount;
    if (closedCountEl) closedCountEl.textContent = closedCount;
}

// Dynamically populate client select dropdown in delivery modal
function populateClientSelect() {
    var sel = document.getElementById('clientSelect');
    if (!sel) return;
    var clients = getMyClients();
    var html = '<option value="">-- Choose a client --</option>';

    if (LOGGED_IN_AGENT.role === 'broker') {
        // Group by agent
        var byAgent = {};
        for (var id in clients) {
            var c = clients[id];
            var aname = c.agentName || 'Unassigned';
            if (!byAgent[aname]) byAgent[aname] = [];
            byAgent[aname].push({ id: id, client: c });
        }
        for (var agent in byAgent) {
            html += '<optgroup label="' + agent + '\'s Clients">';
            byAgent[agent].forEach(function(item) {
                html += '<option value="' + item.id + '">' + item.client.name + ' - ' + item.client.type + ' (' + item.client.budget + ')</option>';
            });
            html += '</optgroup>';
        }
    } else {
        // Group by type
        var buyers = [], renters = [];
        for (var id in clients) {
            var c = clients[id];
            if (c.type === 'Buyer') buyers.push({ id: id, client: c });
            else renters.push({ id: id, client: c });
        }
        if (buyers.length) {
            html += '<optgroup label="Buyers">';
            buyers.forEach(function(item) { html += '<option value="' + item.id + '">' + item.client.name + ' (' + item.client.budget + ')</option>'; });
            html += '</optgroup>';
        }
        if (renters.length) {
            html += '<optgroup label="Renters">';
            renters.forEach(function(item) { html += '<option value="' + item.id + '">' + item.client.name + ' (' + item.client.budget + ')</option>'; });
            html += '</optgroup>';
        }
    }

    sel.innerHTML = html;
}

function filterClientList() {
    var searchVal = (document.getElementById('clientDirectorySearch') ? document.getElementById('clientDirectorySearch').value : '').toLowerCase();
    var typeEl = document.getElementById('clientTypeFilter');
    var typeVal = (typeEl && typeEl.value !== 'all') ? typeEl.value.toLowerCase() : '';
    var stageEl = document.getElementById('clientStageFilter');
    var stageVal = (stageEl && stageEl.value !== 'all') ? stageEl.value : '';
    var rows = document.querySelectorAll('#clientCardGrid > tr');
    rows.forEach(function(row) {
        var text = row.textContent.toLowerCase();
        var matchSearch = !searchVal || text.indexOf(searchVal) !== -1;
        var matchType = !typeVal || (row.dataset.type || '').indexOf(typeVal) !== -1;
        var matchStage = !stageVal || row.dataset.stage === stageVal;
        row.style.display = (matchSearch && matchType && matchStage) ? '' : 'none';
    });
}

// ── Column sort for client table ──
var clientSortState = { column: '', direction: 'asc' };

function sortClientColumn(col) {
    if (clientSortState.column === col) {
        clientSortState.direction = clientSortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        clientSortState.column = col;
        clientSortState.direction = 'asc';
    }
    var grid = document.getElementById('clientCardGrid');
    if (!grid) return;
    var rows = Array.from(grid.querySelectorAll('tr'));
    var stages = ['new_lead','qualified','requirements_confirmed','searching','touring','shortlist','offer_prep','offer_submitted','negotiation','contract_signed','closing_scheduled','closed'];

    rows.sort(function(a, b) {
        var dir = clientSortState.direction === 'asc' ? 1 : -1;
        switch(col) {
            case 'name':
                return dir * ((a.dataset.name || '').localeCompare(b.dataset.name || ''));
            case 'stage':
                return dir * (stages.indexOf(a.dataset.stage || 'new_lead') - stages.indexOf(b.dataset.stage || 'new_lead'));
            case 'type':
                return dir * ((a.dataset.type || '').localeCompare(b.dataset.type || ''));
            case 'budget': {
                var aB = parseBudgetValue(a.querySelectorAll('td')[3]);
                var bB = parseBudgetValue(b.querySelectorAll('td')[3]);
                return dir * (aB - bB);
            }
            case 'beds': {
                var aBd = parseInt(a.querySelectorAll('td')[5] ? a.querySelectorAll('td')[5].textContent : '0') || 0;
                var bBd = parseInt(b.querySelectorAll('td')[5] ? b.querySelectorAll('td')[5].textContent : '0') || 0;
                return dir * (aBd - bBd);
            }
            case 'baths': {
                var aBa = parseInt(a.querySelectorAll('td')[6] ? a.querySelectorAll('td')[6].textContent : '0') || 0;
                var bBa = parseInt(b.querySelectorAll('td')[6] ? b.querySelectorAll('td')[6].textContent : '0') || 0;
                return dir * (aBa - bBa);
            }
            case 'neighborhood': {
                var aN = (a.querySelectorAll('td')[7] ? a.querySelectorAll('td')[7].textContent : '').toLowerCase();
                var bN = (b.querySelectorAll('td')[7] ? b.querySelectorAll('td')[7].textContent : '').toLowerCase();
                return dir * aN.localeCompare(bN);
            }
            default:
                return dir * ((a.dataset.name || '').localeCompare(b.dataset.name || ''));
        }
    });
    rows.forEach(function(row) { grid.appendChild(row); });
}

function parseBudgetValue(td) {
    if (!td) return 0;
    var text = td.textContent.replace(/[^0-9.KMB+\-]/gi, '');
    var num = parseFloat(text) || 0;
    if (text.toUpperCase().indexOf('B') !== -1) num *= 1000000000;
    else if (text.toUpperCase().indexOf('M') !== -1) num *= 1000000;
    else if (text.toUpperCase().indexOf('K') !== -1) num *= 1000;
    return num;
}

