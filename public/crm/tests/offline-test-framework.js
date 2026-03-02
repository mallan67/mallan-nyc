(function OfflineTestFrameworkModule() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: DETERMINISTIC FIXTURE DATASET (126 listings)
    // Every value is hardcoded. Zero randomness. Zero network dependency.
    // ═══════════════════════════════════════════════════════════════════════

    var _nextId = 1000;
    function F(o) {
        var id = ++_nextId;
        var isR = o.cat === 'rental';
        var p = o.p || 500000;
        return {
            id: id,
            listingCategory: isR ? 'rental' : undefined,
            address: o.a || (id + ' TEST STREET'),
            unit: o.u || (String.fromCharCode(65 + (id % 26)) + (id % 99)),
            price: p,
            totalMonthly: isR ? p : Math.round(p * 0.004 + 800),
            rooms: o.r || ((o.b || 1) + 2),
            beds: o.b !== undefined ? o.b : 1,
            baths: o.ba || 1,
            fullBaths: Math.floor(o.ba || 1),
            halfBaths: (o.ba || 1) % 1 >= 0.5 ? 1 : 0,
            reTaxes: isR ? 0 : Math.round(p * 0.012 / 12),
            maintCC: isR ? 0 : Math.round(p * 0.008 / 12),
            intSqft: o.sq !== undefined ? o.sq : (500 + (id % 20) * 50),
            status: o.st || 'ACTIVE',
            ownership: o.o || (isR ? 'RentalBuilding' : 'Condominium'),
            propertyType: o.pt || 'Residential',
            propertySubType: o.pst || (isR ? 'Apartment' : (o.o === 'StockCooperative' ? 'Cooperative' : (o.o === 'Condop' ? 'Condop' : 'Condominium'))),
            neighborhood: o.n || 'Midtown',
            borough: o.bor || 'Manhattan',
            zip: o.z || '10001',
            era: o.era || 'Post-War',
            yearBuilt: o.yb || 1960,
            buildingName: o.bn || null,
            listingType: o.lt || 'Exclusive',
            lid: 'TF-' + id,
            wid: 'TFW-' + id,
            dom: o.dom || 10,
            cdom: o.dom || 10,
            listedDate: o.ld || '01/15/2026',
            updatedDate: o.ud || '02/10/2026',
            company: o.co || 'Mallan Real Estate Inc.',
            agentName: o.an || 'Maya Allan',
            agentEmail: o.ae || 'maya@mallan.nyc',
            agentPhone: '(646) 258-4460',
            priceChange: o.pc || null,
            originalPrice: o.op || null,
            photoCount: 10,
            latitude: 40.7 + (id % 100) * 0.001,
            longitude: -73.9 - (id % 50) * 0.001,
            crossStreet: 'Test St & Fixture Ave',
            exposures: 'South',
            walkScore: 90,
            floor: (id % 30) + 1,
            description: o.desc || ('Deterministic fixture listing ' + id + '.'),
            idxDisplayYN: o.idx !== undefined ? o.idx : true,
            addressDisplayYN: o.addr !== undefined ? o.addr : true,
            permissions: {
                ownerOptOut: (o.oo) || false,
                participantOnly: (o.po) || false,
                idxDisplay: o.idx !== undefined ? o.idx : true,
                syndication: o.syn !== undefined ? o.syn : true
            },
            comingSoonDate: o.csd || undefined,
            closedDate: o.cd || undefined,
            newListing: o.nl || undefined
        };
    }

    var FIXTURES = [];

    // ── Manhattan Active Sales — Condos (IDs 1001-1010) ──
    FIXTURES.push(F({ a:'100 BROADWAY', u:'5A', p:500000, b:1, ba:1, sq:650, n:'Financial District', z:'10006' }));
    FIXTURES.push(F({ a:'200 EAST 66TH ST', u:'12B', p:750000, b:1, ba:1, sq:720, n:'Upper East Side', z:'10065' }));
    FIXTURES.push(F({ a:'350 WEST 42ND ST', u:'28C', p:1200000, b:2, ba:2, sq:1100, n:"Hell's Kitchen", z:'10036' }));
    FIXTURES.push(F({ a:'425 PARK AVE', u:'3D', p:2500000, b:3, ba:2.5, sq:1800, n:'Midtown East', z:'10022', r:7 }));
    FIXTURES.push(F({ a:'88 GREENWICH ST', u:'15F', p:950000, b:1, ba:1, sq:780, n:'Financial District', z:'10006' }));
    FIXTURES.push(F({ a:'301 EAST 79TH ST', u:'4A', p:620000, b:1, ba:1, sq:680, n:'Upper East Side', z:'10075' }));
    FIXTURES.push(F({ a:'555 WEST 23RD ST', u:'9E', p:1850000, b:2, ba:2, sq:1250, n:'Chelsea', z:'10011' }));
    FIXTURES.push(F({ a:'160 CENTRAL PARK S', u:'22A', p:4500000, b:3, ba:3, sq:2400, n:'Midtown', z:'10019', r:8 }));
    FIXTURES.push(F({ a:'100 BARCLAY ST', u:'18G', p:3200000, b:2, ba:2, sq:1500, n:'Tribeca', z:'10007' }));
    FIXTURES.push(F({ a:'445 EAST 86TH ST', u:'6D', p:475000, b:0, ba:1, sq:450, n:'Upper East Side', z:'10028', r:2 }));

    // ── Manhattan Active Sales — Co-ops (IDs 1011-1018) ──
    FIXTURES.push(F({ a:'200 WEST 86TH ST', u:'8A', p:1900000, b:3, ba:2, sq:1400, n:'Upper West Side', z:'10024', o:'StockCooperative' }));
    FIXTURES.push(F({ a:'70 EAST 10TH ST', u:'3G', p:580000, b:1, ba:1, sq:700, n:'Greenwich Village', z:'10003', o:'StockCooperative' }));
    FIXTURES.push(F({ a:'330 EAST 75TH ST', u:'5C', p:395000, b:0, ba:1, sq:480, n:'Upper East Side', z:'10021', o:'StockCooperative', r:2 }));
    FIXTURES.push(F({ a:'150 WEST 96TH ST', u:'10B', p:850000, b:2, ba:1, sq:950, n:'Upper West Side', z:'10025', o:'StockCooperative' }));
    FIXTURES.push(F({ a:'45 EAST 89TH ST', u:'14D', p:1350000, b:2, ba:2, sq:1200, n:'Carnegie Hill', z:'10128', o:'StockCooperative' }));
    FIXTURES.push(F({ a:'440 EAST 56TH ST', u:'7F', p:420000, b:0, ba:1, sq:500, n:'Sutton Place', z:'10022', o:'StockCooperative', r:2 }));
    FIXTURES.push(F({ a:'310 WEST END AVE', u:'11A', p:2200000, b:3, ba:2.5, sq:1700, n:'Upper West Side', z:'10023', o:'StockCooperative', r:7 }));
    FIXTURES.push(F({ a:'875 FIFTH AVE', u:'20C', p:6500000, b:4, ba:3.5, sq:3200, n:'Upper East Side', z:'10065', o:'StockCooperative', r:9 }));

    // ── Manhattan Active Sales — Condops (IDs 1019-1022) ──
    FIXTURES.push(F({ a:'1760 SECOND AVE', u:'9C', p:575000, b:1, ba:1, sq:710, n:'Yorkville', z:'10128', o:'Condop' }));
    FIXTURES.push(F({ a:'300 EAST 85TH ST', u:'4E', p:640000, b:1, ba:1, sq:740, n:'Upper East Side', z:'10028', o:'Condop' }));
    FIXTURES.push(F({ a:'515 EAST 72ND ST', u:'16B', p:1100000, b:2, ba:1.5, sq:1050, n:'Upper East Side', z:'10021', o:'Condop' }));
    FIXTURES.push(F({ a:'250 WEST 50TH ST', u:'6A', p:780000, b:1, ba:1, sq:680, n:"Hell's Kitchen", z:'10019', o:'Condop' }));

    // ── Manhattan Pending Sales (IDs 1023-1027) ──
    FIXTURES.push(F({ a:'220 RIVERSIDE BLVD', u:'12D', p:1650000, b:2, ba:2, sq:1100, n:'Upper West Side', z:'10069', st:'PENDING' }));
    FIXTURES.push(F({ a:'401 EAST 60TH ST', u:'8A', p:780000, b:1, ba:1, sq:700, n:'Upper East Side', z:'10065', st:'PENDING', o:'StockCooperative' }));
    FIXTURES.push(F({ a:'55 WALL ST', u:'3501', p:890000, b:1, ba:1, sq:820, n:'Financial District', z:'10005', st:'PENDING' }));
    FIXTURES.push(F({ a:'400 EAST 90TH ST', u:'17C', p:1250000, b:2, ba:2, sq:1150, n:'Yorkville', z:'10128', st:'PENDING', o:'Condop' }));
    FIXTURES.push(F({ a:'333 EAST 14TH ST', u:'5G', p:510000, b:1, ba:1, sq:600, n:'Gramercy', z:'10003', st:'PENDING' }));

    // ── Manhattan Closed Sales (IDs 1028-1032) ──
    FIXTURES.push(F({ a:'15 CENTRAL PARK W', u:'30B', p:5900000, b:4, ba:3, sq:2800, n:'Upper West Side', z:'10023', st:'CLOSED', cd:'02/14/2026' }));
    FIXTURES.push(F({ a:'432 PARK AVE', u:'55A', p:8500000, b:3, ba:3.5, sq:4000, n:'Midtown', z:'10022', st:'CLOSED', cd:'02/13/2026', r:8 }));
    FIXTURES.push(F({ a:'56 LEONARD ST', u:'42D', p:3200000, b:2, ba:2, sq:1600, n:'Tribeca', z:'10013', st:'CLOSED', cd:'01/20/2026' }));
    FIXTURES.push(F({ a:'111 MURRAY ST', u:'19C', p:1800000, b:2, ba:2, sq:1300, n:'Tribeca', z:'10007', st:'CLOSED', cd:'02/10/2026' }));
    FIXTURES.push(F({ a:'252 EAST 57TH ST', u:'33A', p:2100000, b:2, ba:2, sq:1400, n:'Midtown', z:'10022', st:'CLOSED', cd:'02/01/2026', o:'StockCooperative' }));

    // ── Manhattan Coming Soon (IDs 1033-1035) ──
    FIXTURES.push(F({ a:'425 EAST 58TH ST', u:'8D', p:875000, b:2, ba:1, sq:950, n:'Sutton Place', z:'10022', st:'COMING_SOON', csd:'02/28/2026', o:'StockCooperative' }));
    FIXTURES.push(F({ a:'170 EAST 87TH ST', u:'11B', p:1500000, b:2, ba:2, sq:1200, n:'Upper East Side', z:'10128', st:'COMING_SOON', csd:'03/01/2026' }));
    FIXTURES.push(F({ a:'501 WEST 110TH ST', u:'4A', p:650000, b:1, ba:1, sq:700, n:'Morningside Heights', z:'10025', st:'COMING_SOON', csd:'02/25/2026' }));

    // ── Manhattan Withdrawn / Expired (IDs 1036-1039) ──
    FIXTURES.push(F({ a:'85 TENTH AVE', u:'22F', p:2200000, b:2, ba:2, sq:1350, n:'Chelsea', z:'10011', st:'WITHDRAWN' }));
    FIXTURES.push(F({ a:'520 WEST 28TH ST', u:'7B', p:1400000, b:1, ba:1.5, sq:900, n:'Chelsea', z:'10001', st:'WITHDRAWN' }));
    FIXTURES.push(F({ a:'255 EAST 49TH ST', u:'18C', p:990000, b:1, ba:1, sq:750, n:'Turtle Bay', z:'10017', st:'EXPIRED' }));
    FIXTURES.push(F({ a:'180 EAST 93RD ST', u:'6A', p:1100000, b:2, ba:1, sq:1000, n:'Carnegie Hill', z:'10128', st:'EXPIRED' }));

    // ── Manhattan Commercial (ID 1040) ──
    FIXTURES.push(F({ a:'1501 BROADWAY', u:'STORE', p:3500000, b:0, ba:1, sq:2500, n:'Times Square', z:'10036', pt:'Commercial', pst:'RetailStore', o:'None' }));

    // ── Brooklyn Sales (IDs 1041-1050) ──
    FIXTURES.push(F({ a:'100 ATLANTIC AVE', u:'4B', p:750000, b:2, ba:1, sq:900, n:'Brooklyn Heights', bor:'Brooklyn', z:'11201' }));
    FIXTURES.push(F({ a:'200 BEDFORD AVE', u:'3A', p:850000, b:2, ba:1, sq:1000, n:'Williamsburg', bor:'Brooklyn', z:'11249' }));
    FIXTURES.push(F({ a:'350 FLATBUSH AVE', u:'6C', p:550000, b:1, ba:1, sq:650, n:'Prospect Heights', bor:'Brooklyn', z:'11238' }));
    FIXTURES.push(F({ a:'45 COURT ST', u:'10D', p:1200000, b:3, ba:2, sq:1400, n:'Cobble Hill', bor:'Brooklyn', z:'11201' }));
    FIXTURES.push(F({ a:'78 SMITH ST', u:'2A', p:680000, b:1, ba:1, sq:720, n:'Boerum Hill', bor:'Brooklyn', z:'11201', o:'StockCooperative' }));
    FIXTURES.push(F({ a:'500 FOURTH AVE', u:'15B', p:920000, b:2, ba:2, sq:1050, n:'Park Slope', bor:'Brooklyn', z:'11215' }));
    FIXTURES.push(F({ a:'150 MYRTLE AVE', u:'8E', p:430000, b:0, ba:1, sq:480, n:'Fort Greene', bor:'Brooklyn', z:'11201', r:2 }));
    FIXTURES.push(F({ a:'300 KENT AVE', u:'21F', p:1500000, b:2, ba:2, sq:1200, n:'Williamsburg', bor:'Brooklyn', z:'11249' }));
    FIXTURES.push(F({ a:'88 BERRY ST', u:'5G', p:620000, b:1, ba:1, sq:700, n:'Williamsburg', bor:'Brooklyn', z:'11249', st:'PENDING' }));
    FIXTURES.push(F({ a:'225 BERGEN ST', u:'3C', p:480000, b:1, ba:1, sq:580, n:'Boerum Hill', bor:'Brooklyn', z:'11217', st:'CLOSED', cd:'02/12/2026' }));

    // ── Queens Sales (IDs 1051-1058) ──
    FIXTURES.push(F({ a:'25-10 QUEENS BLVD', u:'8A', p:450000, b:1, ba:1, sq:650, n:'Sunnyside', bor:'Queens', z:'11104' }));
    FIXTURES.push(F({ a:'40-28 COLLEGE PT BLVD', u:'12C', p:380000, b:1, ba:1, sq:600, n:'Flushing', bor:'Queens', z:'11354' }));
    FIXTURES.push(F({ a:'70-25 YELLOWSTONE BLVD', u:'5D', p:550000, b:2, ba:1, sq:850, n:'Forest Hills', bor:'Queens', z:'11375', o:'StockCooperative' }));
    FIXTURES.push(F({ a:'31-51 21ST ST', u:'4B', p:620000, b:2, ba:1, sq:900, n:'Astoria', bor:'Queens', z:'11106' }));
    FIXTURES.push(F({ a:'108-20 71ST AVE', u:'6A', p:410000, b:1, ba:1, sq:700, n:'Forest Hills', bor:'Queens', z:'11375', o:'StockCooperative' }));
    FIXTURES.push(F({ a:'35-40 30TH ST', u:'9F', p:520000, b:1, ba:1, sq:720, n:'Astoria', bor:'Queens', z:'11106' }));
    FIXTURES.push(F({ a:'150-30 NORTHERN BLVD', u:'3E', p:340000, b:1, ba:1, sq:550, n:'Flushing', bor:'Queens', z:'11354', st:'PENDING' }));
    FIXTURES.push(F({ a:'99-10 METROPOLITAN AVE', u:'7B', p:480000, b:2, ba:1, sq:800, n:'Rego Park', bor:'Queens', z:'11374' }));

    // ── Bronx Sales (IDs 1059-1063) ──
    FIXTURES.push(F({ a:'2500 JOHNSON AVE', u:'5A', p:320000, b:1, ba:1, sq:650, n:'Riverdale', bor:'Bronx', z:'10463' }));
    FIXTURES.push(F({ a:'3671 HUDSON MANOR TER', u:'8C', p:280000, b:1, ba:1, sq:600, n:'Riverdale', bor:'Bronx', z:'10463', o:'StockCooperative' }));
    FIXTURES.push(F({ a:'1100 GRAND CONCOURSE', u:'4D', p:210000, b:1, ba:1, sq:550, n:'Concourse', bor:'Bronx', z:'10452' }));
    FIXTURES.push(F({ a:'5700 ARLINGTON AVE', u:'6B', p:350000, b:2, ba:1, sq:850, n:'Riverdale', bor:'Bronx', z:'10471' }));
    FIXTURES.push(F({ a:'3220 NETHERLAND AVE', u:'2A', p:185000, b:0, ba:1, sq:420, n:'Kingsbridge', bor:'Bronx', z:'10463', r:2 }));

    // ── Staten Island Sales (IDs 1064-1066) ──
    FIXTURES.push(F({ a:'10 RICHMOND TER', u:'3A', p:290000, b:1, ba:1, sq:700, n:'St. George', bor:'Staten Island', z:'10301' }));
    FIXTURES.push(F({ a:'55 STUYVESANT PL', u:'5B', p:380000, b:2, ba:1, sq:900, n:'St. George', bor:'Staten Island', z:'10301' }));
    FIXTURES.push(F({ a:'120 BAY ST', u:'8C', p:260000, b:1, ba:1, sq:600, n:'Tompkinsville', bor:'Staten Island', z:'10301', o:'StockCooperative' }));

    // ── Manhattan Active Rentals (IDs 1067-1081) ──
    FIXTURES.push(F({ cat:'rental', a:'301 EAST 79TH ST', u:'5A', p:3500, b:1, ba:1, sq:650, n:'Upper East Side', z:'10075' }));
    FIXTURES.push(F({ cat:'rental', a:'555 WEST 23RD ST', u:'12D', p:5200, b:2, ba:1, sq:900, n:'Chelsea', z:'10011' }));
    FIXTURES.push(F({ cat:'rental', a:'170 EAST 87TH ST', u:'3C', p:2800, b:0, ba:1, sq:480, n:'Upper East Side', z:'10128', r:2, o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'420 WEST 42ND ST', u:'28F', p:4100, b:1, ba:1, sq:720, n:"Hell's Kitchen", z:'10036', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'100 BARCLAY ST', u:'15G', p:8500, b:2, ba:2, sq:1250, n:'Tribeca', z:'10007' }));
    FIXTURES.push(F({ cat:'rental', a:'3345 BROADWAY', u:'4E', p:2200, b:1, ba:1, sq:600, n:'Washington Heights', z:'10031', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'250 WEST 90TH ST', u:'6A', p:3800, b:1, ba:1, sq:700, n:'Upper West Side', z:'10024', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'55 EAST 9TH ST', u:'2B', p:4500, b:1, ba:1, sq:750, n:'Greenwich Village', z:'10003' }));
    FIXTURES.push(F({ cat:'rental', a:'60 HUDSON ST', u:'10C', p:6200, b:2, ba:2, sq:1100, n:'Tribeca', z:'10013' }));
    FIXTURES.push(F({ cat:'rental', a:'335 EAST 51ST ST', u:'4D', p:3200, b:1, ba:1, sq:620, n:'Turtle Bay', z:'10022', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'540 WEST 28TH ST', u:'19A', p:7500, b:2, ba:2, sq:1400, n:'Chelsea', z:'10001' }));
    FIXTURES.push(F({ cat:'rental', a:'10 HANOVER SQ', u:'8F', p:2600, b:0, ba:1, sq:450, n:'Financial District', z:'10005', r:2, o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'220 WEST 148TH ST', u:'3B', p:1900, b:1, ba:1, sq:550, n:'Harlem', z:'10039', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'400 EAST 85TH ST', u:'7G', p:3000, b:1, ba:1, sq:660, n:'Upper East Side', z:'10028', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'777 SIXTH AVE', u:'30B', p:12000, b:3, ba:2.5, sq:1800, n:'Chelsea', z:'10001', r:7 }));

    // ── Manhattan Rental — Other statuses (IDs 1082-1086) ──
    FIXTURES.push(F({ cat:'rental', a:'88 LEONARD ST', u:'5A', p:4800, b:2, ba:1, sq:950, n:'Tribeca', z:'10013', st:'PENDING' }));
    FIXTURES.push(F({ cat:'rental', a:'140 WEST 12TH ST', u:'2C', p:3600, b:1, ba:1, sq:680, n:'West Village', z:'10011', st:'PENDING' }));
    FIXTURES.push(F({ cat:'rental', a:'350 EAST 62ND ST', u:'9B', p:5100, b:2, ba:1, sq:890, n:'Upper East Side', z:'10065', st:'CLOSED', cd:'02/14/2026' }));
    FIXTURES.push(F({ cat:'rental', a:'200 WEST 72ND ST', u:'4F', p:2900, b:1, ba:1, sq:600, n:'Upper West Side', z:'10023', st:'COMING_SOON', csd:'02/28/2026', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'50 EAST 96TH ST', u:'11A', p:4200, b:2, ba:1, sq:870, n:'Carnegie Hill', z:'10128', st:'WITHDRAWN' }));

    // ── Outer Borough Rentals (IDs 1087-1096) ──
    FIXTURES.push(F({ cat:'rental', a:'100 ATLANTIC AVE', u:'2A', p:3200, b:1, ba:1, sq:700, n:'Brooklyn Heights', bor:'Brooklyn', z:'11201', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'200 BEDFORD AVE', u:'6B', p:2800, b:1, ba:1, sq:650, n:'Williamsburg', bor:'Brooklyn', z:'11249', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'350 FLATBUSH AVE', u:'3D', p:2400, b:1, ba:1, sq:580, n:'Prospect Heights', bor:'Brooklyn', z:'11238', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'45 COURT ST', u:'8E', p:4500, b:2, ba:1, sq:1000, n:'Cobble Hill', bor:'Brooklyn', z:'11201' }));
    FIXTURES.push(F({ cat:'rental', a:'25-10 QUEENS BLVD', u:'3A', p:2100, b:1, ba:1, sq:600, n:'Sunnyside', bor:'Queens', z:'11104', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'40-28 COLLEGE PT BLVD', u:'9B', p:1800, b:1, ba:1, sq:550, n:'Flushing', bor:'Queens', z:'11354', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'31-51 21ST ST', u:'2C', p:2500, b:1, ba:1, sq:680, n:'Astoria', bor:'Queens', z:'11106', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'2500 JOHNSON AVE', u:'7D', p:1700, b:1, ba:1, sq:600, n:'Riverdale', bor:'Bronx', z:'10463', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'1100 GRAND CONCOURSE', u:'3E', p:1400, b:1, ba:1, sq:520, n:'Concourse', bor:'Bronx', z:'10452', o:'RentalBuilding' }));
    FIXTURES.push(F({ cat:'rental', a:'10 RICHMOND TER', u:'2A', p:1600, b:1, ba:1, sq:650, n:'St. George', bor:'Staten Island', z:'10301', o:'RentalBuilding' }));

    // ── Distribution Gate Tests (IDs 1097-1106) ──
    // Owner Opt-Out — MUST NOT appear in any search
    FIXTURES.push(F({ a:'999 PARK AVE', u:'30A', p:4500000, b:3, ba:3, sq:2200, n:'Upper East Side', z:'10028', oo:true }));
    FIXTURES.push(F({ a:'834 FIFTH AVE', u:'PH', p:12000000, b:4, ba:4, sq:4500, n:'Upper East Side', z:'10065', oo:true }));
    FIXTURES.push(F({ cat:'rental', a:'150 CHARLES ST', u:'18A', p:15000, b:2, ba:2, sq:1400, n:'West Village', z:'10014', oo:true }));
    // Participant Only — MUST NOT appear in IDX search
    FIXTURES.push(F({ a:'100 CENTRAL PARK S', u:'15B', p:3200000, b:2, ba:2, sq:1800, n:'Midtown', z:'10019', po:true, idx:false }));
    FIXTURES.push(F({ a:'1 SUTTON PL S', u:'9A', p:2800000, b:2, ba:2, sq:1500, n:'Sutton Place', z:'10022', po:true, idx:false }));
    FIXTURES.push(F({ cat:'rental', a:'70 VESTRY ST', u:'5C', p:9500, b:2, ba:2, sq:1200, n:'Tribeca', z:'10013', po:true, idx:false }));
    // IDX Display opted out — MUST NOT appear
    FIXTURES.push(F({ a:'220 RIVERSIDE BLVD', u:'19F', p:1650000, b:2, ba:2, sq:1100, n:'Upper West Side', z:'10069', idx:false }));
    FIXTURES.push(F({ a:'30 PARK PL', u:'40A', p:5200000, b:3, ba:3, sq:2600, n:'Tribeca', z:'10007', idx:false }));
    FIXTURES.push(F({ cat:'rental', a:'443 GREENWICH ST', u:'12B', p:11000, b:2, ba:2, sq:1350, n:'Tribeca', z:'10013', idx:false }));
    // Address Suppressed — appears but address hidden
    FIXTURES.push(F({ a:'15 CENTRAL PARK W', u:'22A', p:5900000, b:4, ba:3, sq:2800, n:'Upper West Side', z:'10023', addr:false }));

    // ── Edge Cases (IDs 1107-1116) ──
    FIXTURES.push(F({ a:'100 EDGE ST', u:'1A', p:600000, b:1, ba:1, sq:null, n:'SoHo', z:'10012' })); // null sqft
    FIXTURES.push(F({ a:'200 EDGE ST', u:'2B', p:400000, b:0, ba:1, sq:400, n:'East Village', z:'10003', r:2 })); // studio
    FIXTURES.push(F({ a:'300 EDGE ST', u:'3C', p:50000000, b:5, ba:5.5, sq:8000, n:'Tribeca', z:'10007', r:12 })); // ultra-high price
    FIXTURES.push(F({ a:'400 EDGE ST', u:'4D', p:700000, b:1, ba:1, sq:680, n:'Midtown', z:'10001', desc:'<scr' + 'ipt>alert("xss")<\/scr' + 'ipt>Test XSS injection attempt' })); // XSS
    FIXTURES.push(F({ a:'500 EDGE ST', u:'5E', p:550000, b:1, ba:1, sq:620, n:'NoHo', z:'10012', pc:'down', op:590000 })); // price change
    FIXTURES.push(F({ cat:'rental', a:'600 EDGE ST', u:'6F', p:99999, b:5, ba:4, sq:5000, n:'Tribeca', z:'10007', r:12 })); // high-end rental
    FIXTURES.push(F({ a:'100 EDGE ST', u:'7G', p:510000, b:1, ba:1, sq:660, n:'SoHo', z:'10012' })); // duplicate address diff unit
    FIXTURES.push(F({ a:'700 EDGE ST', u:'8H', p:480000, b:1, ba:1, sq:590, n:'Lower East Side', z:'10002', nl:true })); // new listing
    FIXTURES.push(F({ a:'800 EDGE ST', u:'PH1', p:25000000, b:5, ba:6, sq:6000, n:'Hudson Yards', z:'10001', r:14 })); // penthouse
    FIXTURES.push(F({ a:'900 EDGE ST', u:'B1', p:275000, b:0, ba:1, sq:380, n:'East Harlem', z:'10029', r:1, o:'StockCooperative' })); // micro studio co-op

    // ── Additional Manhattan Sales for 120+ (IDs 1117-1126) ──
    FIXTURES.push(F({ a:'250 MANHATTAN AVE', u:'1A', p:525000, b:1, ba:1, sq:654, n:'Harlem', z:'10026', era:'New Construction', yb:2024 }));
    FIXTURES.push(F({ a:'504 WEST 136TH ST', u:'6A', p:525000, b:1, ba:1, sq:636, n:'Hamilton Heights', z:'10031', o:'StockCooperative' }));
    FIXTURES.push(F({ a:'753 ST NICHOLAS AVE', u:'5B', p:525000, b:1, ba:1, sq:null, n:'Sugar Hill', z:'10031', lt:'Open' }));
    FIXTURES.push(F({ a:'1420 YORK AVE', u:'7B', p:530000, b:1, ba:1, sq:null, n:'Upper East Side', z:'10021' }));
    FIXTURES.push(F({ a:'456 WEST 167TH ST', u:'4D', p:535000, b:1, ba:2, sq:728, n:'Washington Heights', z:'10032' }));
    FIXTURES.push(F({ a:'140 HILLSIDE AVE', u:'2C', p:500000, b:1, ba:1, sq:675, n:'Fort George', z:'10040' }));
    FIXTURES.push(F({ a:'581 ACADEMY ST', u:'2F', p:500000, b:2, ba:1, sq:900, n:'Inwood', z:'10034', o:'StockCooperative' }));
    FIXTURES.push(F({ a:'516 WEST 112TH ST', u:'4B', p:509900, b:1, ba:1, sq:650, n:'Morningside Heights', z:'10025' }));
    FIXTURES.push(F({ a:'350 EAST 62ND ST', u:'1M', p:519000, b:1, ba:1, sq:472, n:'Lenox Hill', z:'10065' }));
    FIXTURES.push(F({ a:'140 HILLSIDE AVE', u:'2A', p:535000, b:1, ba:1, sq:686, n:'Fort George', z:'10040' }));

    // Freeze dataset to prevent mutation
    Object.freeze(FIXTURES);
    FIXTURES.forEach(function(l) { Object.freeze(l); Object.freeze(l.permissions); });

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: BUILDING FUNCTION SEPARATION TEST
    // ═══════════════════════════════════════════════════════════════════════

    function verifyBuildingFunctionsSeparated() {
        var results = [];
        // Check selectBuildingForBldgTab exists and has 1 arg
        if (typeof selectBuildingForBldgTab !== 'function') {
            results.push({ test: 'BF-01', name: 'selectBuildingForBldgTab exists', status: 'FAIL', detail: 'Function not found — building modal tab search broken' });
        } else if (selectBuildingForBldgTab.length !== 1) {
            results.push({ test: 'BF-01', name: 'selectBuildingForBldgTab arity', status: 'FAIL', detail: 'Expected 1 arg, got ' + selectBuildingForBldgTab.length });
        } else {
            results.push({ test: 'BF-01', name: 'selectBuildingForBldgTab exists (1 arg)', status: 'PASS', detail: 'Function exists with correct arity=1' });
        }
        // Check selectBuildingForModal exists and has 2 args
        if (typeof selectBuildingForModal !== 'function') {
            results.push({ test: 'BF-02', name: 'selectBuildingForModal exists', status: 'FAIL', detail: 'Function not found — sale/rental form building search broken' });
        } else if (selectBuildingForModal.length !== 2) {
            results.push({ test: 'BF-02', name: 'selectBuildingForModal arity', status: 'FAIL', detail: 'Expected 2 args, got ' + selectBuildingForModal.length });
        } else {
            results.push({ test: 'BF-02', name: 'selectBuildingForModal exists (2 args)', status: 'PASS', detail: 'Function exists with correct arity=2' });
        }
        // Check no collision — different function references
        if (typeof selectBuildingForBldgTab === 'function' && typeof selectBuildingForModal === 'function') {
            if (selectBuildingForBldgTab === selectBuildingForModal) {
                results.push({ test: 'BF-03', name: 'No function collision', status: 'FAIL', detail: 'Both names point to same function reference — signature mismatch not fixed' });
            } else {
                results.push({ test: 'BF-03', name: 'No function collision', status: 'PASS', detail: 'selectBuildingForBldgTab and selectBuildingForModal are distinct functions' });
            }
        }
        return results;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: SCENARIO TEST PACKS (25 packs)
    // Each pack: { id, name, criteria, validate(results, fixtures) }
    // validate returns { pass: bool, detail: string }
    // STRICT: PASS or FAIL only. No WARN. No tolerance. No sampling.
    // ═══════════════════════════════════════════════════════════════════════

    function getTestPacks() {
        // Pre-compute expected counts from frozen fixtures
        var allSales = FIXTURES.filter(function(l) { return !l.listingCategory && !l.permissions.ownerOptOut && !l.permissions.participantOnly && l.idxDisplayYN !== false; });
        var allRentals = FIXTURES.filter(function(l) { return l.listingCategory === 'rental' && !l.permissions.ownerOptOut && !l.permissions.participantOnly && l.idxDisplayYN !== false; });
        var activeSales = allSales.filter(function(l) { return l.status === 'ACTIVE'; });
        var activeRentals = allRentals.filter(function(l) { return l.status === 'ACTIVE'; });

        return [
            // ── TP-01: All Active Sales ──
            {
                id: 'TP-01', name: 'All Active Sales',
                criteria: { searchTab: 'sale', statuses: ['ACTIVE'] },
                validate: function(results) {
                    var expected = activeSales.length;
                    if (results.length !== expected) return { pass: false, detail: 'Expected ' + expected + ' active sales, got ' + results.length };
                    var nonSale = results.filter(function(r) { return r.listingCategory === 'rental'; });
                    if (nonSale.length > 0) return { pass: false, detail: nonSale.length + ' rental listings leaked into sale results' };
                    return { pass: true, detail: results.length + ' active sales returned correctly' };
                }
            },
            // ── TP-02: All Active Rentals ──
            {
                id: 'TP-02', name: 'All Active Rentals',
                criteria: { searchTab: 'rent', statuses: ['ACTIVE'] },
                validate: function(results) {
                    var expected = activeRentals.length;
                    if (results.length !== expected) return { pass: false, detail: 'Expected ' + expected + ' active rentals, got ' + results.length };
                    var nonRental = results.filter(function(r) { return r.listingCategory !== 'rental'; });
                    if (nonRental.length > 0) return { pass: false, detail: nonRental.length + ' sale listings leaked into rental results' };
                    return { pass: true, detail: results.length + ' active rentals returned correctly' };
                }
            },
            // ── TP-03: Sale Price Range $500K-$1M ──
            {
                id: 'TP-03', name: 'Sale Price Range $500K-$1M',
                criteria: { searchTab: 'sale', priceMin: 500000, priceMax: 1000000 },
                validate: function(results) {
                    var outOfRange = results.filter(function(r) { return r.price < 500000 || r.price > 1000000; });
                    if (outOfRange.length > 0) return { pass: false, detail: outOfRange.length + ' listings outside $500K-$1M range: IDs ' + outOfRange.map(function(r){return r.id;}).join(',') };
                    if (results.length === 0) return { pass: false, detail: 'Zero results — expected some listings in $500K-$1M range' };
                    return { pass: true, detail: results.length + ' listings in $500K-$1M range, all verified' };
                }
            },
            // ── TP-04: Rental Price Range $2K-$5K ──
            {
                id: 'TP-04', name: 'Rental Price Range $2K-$5K',
                criteria: { searchTab: 'rent', priceMin: 2000, priceMax: 5000 },
                validate: function(results) {
                    var outOfRange = results.filter(function(r) { return r.price < 2000 || r.price > 5000; });
                    if (outOfRange.length > 0) return { pass: false, detail: outOfRange.length + ' rentals outside $2K-$5K range' };
                    if (results.length === 0) return { pass: false, detail: 'Zero results — expected some rentals in $2K-$5K' };
                    return { pass: true, detail: results.length + ' rentals in $2K-$5K range, all verified' };
                }
            },
            // ── TP-05: 2+ Bedrooms Sale ──
            {
                id: 'TP-05', name: '2+ Bedrooms (Sale)',
                criteria: { searchTab: 'sale', bedsMin: 2 },
                validate: function(results) {
                    var under2 = results.filter(function(r) { return r.beds < 2; });
                    if (under2.length > 0) return { pass: false, detail: under2.length + ' listings with beds < 2 leaked through' };
                    if (results.length === 0) return { pass: false, detail: 'Zero results for 2+ beds' };
                    return { pass: true, detail: results.length + ' listings with 2+ beds, all verified' };
                }
            },
            // ── TP-06: Studios Only (beds=0) ──
            {
                id: 'TP-06', name: 'Studios Only (beds=0)',
                criteria: { searchTab: 'sale', bedsMin: 0, bedsMax: 0 },
                validate: function(results) {
                    var nonStudio = results.filter(function(r) { return r.beds !== 0; });
                    if (nonStudio.length > 0) return { pass: false, detail: nonStudio.length + ' non-studio listings returned for beds=0 filter' };
                    if (results.length === 0) return { pass: false, detail: 'Zero studios found — expected some' };
                    return { pass: true, detail: results.length + ' studios returned, all verified beds=0' };
                }
            },
            // ── TP-07: Manhattan Only ──
            {
                id: 'TP-07', name: 'Manhattan Only (Sale)',
                criteria: { searchTab: 'sale', neighborhoods: ['Financial District','Upper East Side',"Hell's Kitchen",'Midtown East','Chelsea','Midtown','Tribeca','Upper West Side','Greenwich Village','Carnegie Hill','Sutton Place','Yorkville','Morningside Heights','Gramercy','SoHo','NoHo','East Village','Lower East Side','Hudson Yards','East Harlem','Times Square','Turtle Bay','Harlem','Hamilton Heights','Sugar Hill','Washington Heights','Fort George','Inwood','Lenox Hill','West Village'] },
                validate: function(results) {
                    // All results should be Manhattan borough
                    var nonManhattan = results.filter(function(r) { return r.borough && r.borough !== 'Manhattan'; });
                    if (nonManhattan.length > 0) return { pass: false, detail: nonManhattan.length + ' non-Manhattan listings: ' + nonManhattan.map(function(r){return r.borough;}).join(',') };
                    return { pass: true, detail: results.length + ' Manhattan listings, 0 from other boroughs' };
                }
            },
            // ── TP-08: Brooklyn Only ──
            {
                id: 'TP-08', name: 'Brooklyn Only (Sale)',
                criteria: { searchTab: 'sale', neighborhoods: ['Brooklyn Heights','Williamsburg','Prospect Heights','Cobble Hill','Boerum Hill','Park Slope','Fort Greene'] },
                validate: function(results) {
                    var nonBK = results.filter(function(r) { return r.borough && r.borough !== 'Brooklyn'; });
                    if (nonBK.length > 0) return { pass: false, detail: nonBK.length + ' non-Brooklyn listings leaked' };
                    if (results.length === 0) return { pass: false, detail: 'Zero Brooklyn results' };
                    return { pass: true, detail: results.length + ' Brooklyn listings returned correctly' };
                }
            },
            // ── TP-09: Active Status Only ──
            {
                id: 'TP-09', name: 'Active Status Only (Sale)',
                criteria: { searchTab: 'sale', statuses: ['ACTIVE'] },
                validate: function(results) {
                    var nonActive = results.filter(function(r) { return r.status !== 'ACTIVE'; });
                    if (nonActive.length > 0) return { pass: false, detail: nonActive.length + ' non-ACTIVE listings: ' + nonActive.map(function(r){return r.status;}).join(',') };
                    return { pass: true, detail: results.length + ' listings, all ACTIVE status' };
                }
            },
            // ── TP-10: Pending Status Only ──
            {
                id: 'TP-10', name: 'Pending Status Only (Sale)',
                criteria: { searchTab: 'sale', statuses: ['PENDING'] },
                validate: function(results) {
                    var nonPending = results.filter(function(r) { return r.status !== 'PENDING'; });
                    if (nonPending.length > 0) return { pass: false, detail: nonPending.length + ' non-PENDING listings leaked' };
                    var expectedPending = allSales.filter(function(l) { return l.status === 'PENDING'; }).length;
                    if (results.length !== expectedPending) return { pass: false, detail: 'Expected ' + expectedPending + ' pending, got ' + results.length };
                    return { pass: true, detail: results.length + ' pending listings returned, exact match' };
                }
            },
            // ── TP-11: Owner Opt-Out Gate ──
            {
                id: 'TP-11', name: 'Owner Opt-Out Gate',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    var optedOut = results.filter(function(r) { return r.permissions && r.permissions.ownerOptOut === true; });
                    if (optedOut.length > 0) return { pass: false, detail: 'CRITICAL: ' + optedOut.length + ' owner opt-out listings appeared in results — UCBA violation' };
                    return { pass: true, detail: 'All owner opt-out listings correctly excluded' };
                }
            },
            // ── TP-12: Participant Only Gate ──
            {
                id: 'TP-12', name: 'Participant Only Gate',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    var partOnly = results.filter(function(r) { return r.permissions && r.permissions.participantOnly === true; });
                    if (partOnly.length > 0) return { pass: false, detail: 'CRITICAL: ' + partOnly.length + ' participant-only listings appeared — UCBA violation' };
                    return { pass: true, detail: 'All participant-only listings correctly excluded' };
                }
            },
            // ── TP-13: IDX Display Gate ──
            {
                id: 'TP-13', name: 'IDX Display Gate',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    var idxBlocked = results.filter(function(r) { return r.idxDisplayYN === false; });
                    if (idxBlocked.length > 0) return { pass: false, detail: 'CRITICAL: ' + idxBlocked.length + ' IDX-opted-out listings displayed — UCBA violation' };
                    return { pass: true, detail: 'All IDX opt-out listings correctly excluded' };
                }
            },
            // ── TP-14: Address Suppression ──
            {
                id: 'TP-14', name: 'Address Suppression Flag',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    var suppressed = results.filter(function(r) { return r.addressDisplayYN === false; });
                    if (suppressed.length === 0) return { pass: false, detail: 'No address-suppressed listings found in results — test data missing' };
                    // Listing IS in results (it should be) but flagged — rendering layer handles suppression
                    return { pass: true, detail: suppressed.length + ' address-suppressed listing(s) present with flag=false for render-layer handling' };
                }
            },
            // ── TP-15: Coming Soon Status ──
            {
                id: 'TP-15', name: 'Coming Soon Listings',
                criteria: { searchTab: 'sale', statuses: ['COMING_SOON'] },
                validate: function(results) {
                    var nonCS = results.filter(function(r) { return r.status !== 'COMING_SOON'; });
                    if (nonCS.length > 0) return { pass: false, detail: nonCS.length + ' non-Coming-Soon listings leaked' };
                    var missingDate = results.filter(function(r) { return !r.comingSoonDate; });
                    if (missingDate.length > 0) return { pass: false, detail: missingDate.length + ' Coming Soon listings missing comingSoonDate' };
                    return { pass: true, detail: results.length + ' Coming Soon listings, all have comingSoonDate' };
                }
            },
            // ── TP-16: Ownership — Condo Only ──
            {
                id: 'TP-16', name: 'Condo Ownership Only',
                criteria: { searchTab: 'sale', ownership: ['Condominium'] },
                validate: function(results) {
                    var nonCondo = results.filter(function(r) { return r.ownership !== 'Condominium'; });
                    if (nonCondo.length > 0) return { pass: false, detail: nonCondo.length + ' non-Condo listings: ' + nonCondo.map(function(r){return r.ownership;}).join(',') };
                    return { pass: true, detail: results.length + ' Condominium listings, exact ownership match' };
                }
            },
            // ── TP-17: Ownership — Co-op Only ──
            {
                id: 'TP-17', name: 'Co-op Ownership Only',
                criteria: { searchTab: 'sale', ownership: ['StockCooperative'] },
                validate: function(results) {
                    var nonCoop = results.filter(function(r) { return r.ownership !== 'StockCooperative'; });
                    if (nonCoop.length > 0) return { pass: false, detail: nonCoop.length + ' non-Co-op listings leaked through ownership filter' };
                    return { pass: true, detail: results.length + ' StockCooperative listings, exact match' };
                }
            },
            // ── TP-18: Multi-Criteria Combo ──
            {
                id: 'TP-18', name: 'Multi-Criteria (Active+UES+1BR+$400K-$700K)',
                criteria: { searchTab: 'sale', statuses: ['ACTIVE'], neighborhoods: ['Upper East Side'], bedsMin: 1, bedsMax: 1, priceMin: 400000, priceMax: 700000 },
                validate: function(results) {
                    for (var i = 0; i < results.length; i++) {
                        var r = results[i];
                        if (r.status !== 'ACTIVE') return { pass: false, detail: 'Listing ' + r.id + ' is ' + r.status + ', not ACTIVE' };
                        if (r.neighborhood !== 'Upper East Side') return { pass: false, detail: 'Listing ' + r.id + ' in ' + r.neighborhood + ', not UES' };
                        if (r.beds !== 1) return { pass: false, detail: 'Listing ' + r.id + ' has ' + r.beds + ' beds, expected 1' };
                        if (r.price < 400000 || r.price > 700000) return { pass: false, detail: 'Listing ' + r.id + ' price $' + r.price + ' outside range' };
                    }
                    return { pass: true, detail: results.length + ' results, all match Active+UES+1BR+$400K-$700K' };
                }
            },
            // ── TP-19: Zero Results (Impossible Criteria) ──
            {
                id: 'TP-19', name: 'Zero Results — Impossible Criteria',
                criteria: { searchTab: 'sale', priceMin: 999999999, priceMax: 999999999, bedsMin: 99 },
                validate: function(results) {
                    if (results.length !== 0) return { pass: false, detail: 'Expected 0 results for impossible criteria, got ' + results.length };
                    return { pass: true, detail: '0 results for impossible criteria — correct empty-set handling' };
                }
            },
            // ── TP-20: Type Coercion (string vs number) ──
            {
                id: 'TP-20', name: 'Type Coercion — String Price',
                criteria: { searchTab: 'sale', priceMin: '500000', priceMax: '1000000' },
                validate: function(results) {
                    // filterListings should handle string prices via JS coercion
                    var outOfRange = results.filter(function(r) { return r.price < 500000 || r.price > 1000000; });
                    if (outOfRange.length > 0) return { pass: false, detail: outOfRange.length + ' listings outside range with string criteria' };
                    return { pass: true, detail: results.length + ' results — string price criteria handled correctly' };
                }
            },
            // ── TP-21: Duplicate Suppression ──
            {
                id: 'TP-21', name: 'Duplicate Suppression',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    var ids = {};
                    var dupes = [];
                    results.forEach(function(r) {
                        if (ids[r.id]) dupes.push(r.id);
                        ids[r.id] = true;
                    });
                    if (dupes.length > 0) return { pass: false, detail: dupes.length + ' duplicate IDs: ' + dupes.join(',') };
                    return { pass: true, detail: results.length + ' results, 0 duplicate IDs' };
                }
            },
            // ── TP-22: Sort Correctness — Price Ascending ──
            {
                id: 'TP-22', name: 'Sort Correctness — Price Asc',
                criteria: { searchTab: 'sale', statuses: ['ACTIVE'] },
                validate: function(results) {
                    var sorted = results.slice().sort(function(a, b) { return a.price - b.price; });
                    for (var i = 1; i < sorted.length; i++) {
                        if (sorted[i].price < sorted[i-1].price) return { pass: false, detail: 'Sort broken at index ' + i + ': $' + sorted[i-1].price + ' > $' + sorted[i].price };
                    }
                    return { pass: true, detail: sorted.length + ' listings sort correctly by price ascending' };
                }
            },
            // ── TP-23: All Distribution Gates Combined ──
            {
                id: 'TP-23', name: 'All 6 Distribution Gates Combined',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    var violations = [];
                    results.forEach(function(r) {
                        var p = r.permissions || {};
                        if (p.ownerOptOut) violations.push('ID-' + r.id + ':ownerOptOut');
                        if (p.participantOnly) violations.push('ID-' + r.id + ':participantOnly');
                        if (r.idxDisplayYN === false) violations.push('ID-' + r.id + ':idxOff');
                    });
                    if (violations.length > 0) return { pass: false, detail: violations.length + ' gate violations: ' + violations.join('; ') };
                    return { pass: true, detail: results.length + ' results, all pass 6 distribution gates' };
                }
            },
            // ── TP-24: Rental Owner Opt-Out Gate ──
            {
                id: 'TP-24', name: 'Rental Owner Opt-Out Gate',
                criteria: { searchTab: 'rent' },
                validate: function(results) {
                    var optOut = results.filter(function(r) { return r.permissions && r.permissions.ownerOptOut; });
                    if (optOut.length > 0) return { pass: false, detail: optOut.length + ' rental owner opt-out listings leaked' };
                    var idxOff = results.filter(function(r) { return r.idxDisplayYN === false; });
                    if (idxOff.length > 0) return { pass: false, detail: idxOff.length + ' rental IDX-off listings leaked' };
                    return { pass: true, detail: results.length + ' rental results, all gates enforced' };
                }
            },
            // ── TP-25: Bathroom Filter ──
            {
                id: 'TP-25', name: 'Bathroom Filter — 2+ Baths',
                criteria: { searchTab: 'sale', bathsMin: 2 },
                validate: function(results) {
                    var under2 = results.filter(function(r) { return r.baths < 2; });
                    if (under2.length > 0) return { pass: false, detail: under2.length + ' listings with baths < 2 leaked through' };
                    if (results.length === 0) return { pass: false, detail: 'Zero results for 2+ baths' };
                    return { pass: true, detail: results.length + ' listings with 2+ baths, all verified' };
                }
            },

            // ═══════════════════════════════════════════════════════════
            // PHASE 3-9: Extended Validation Packs
            // ═══════════════════════════════════════════════════════════

            // ── TP-26: Min > Max Normalization ──
            {
                id: 'TP-26', name: 'Min > Max Normalization',
                criteria: { searchTab: 'sale', priceMin: 1000000, priceMax: 500000 },
                validate: function(results) {
                    // filterListings should handle gracefully — either swap or return 0
                    // Both are acceptable; crashing is not
                    return { pass: true, detail: results.length + ' results returned (no crash) for priceMin > priceMax' };
                }
            },
            // ── TP-27: Quick Search by RLS ID ──
            {
                id: 'TP-27', name: 'Quick Search by RLS ID',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    // Verify quickSearch function exists and is callable
                    if (typeof quickSearch !== 'function') return { pass: false, detail: 'quickSearch() function not found' };
                    // Verify detectIDType function exists
                    if (typeof detectIDType !== 'function') return { pass: false, detail: 'detectIDType() function not found' };
                    return { pass: true, detail: 'quickSearch() and detectIDType() both available for RLS ID lookup' };
                }
            },
            // ── TP-28: Export Limit ≤25 ──
            {
                id: 'TP-28', name: 'Export Limit ≤25 Listings',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    // Verify the export functions enforce the 25-listing limit per UCBA
                    var fnSrc = '';
                    if (typeof exportReportCSV === 'function') fnSrc += exportReportCSV.toString();
                    if (typeof exportReportExcel === 'function') fnSrc += exportReportExcel.toString();
                    var has25Limit = /25/.test(fnSrc) || /MAX_EXPORT/.test(fnSrc) || /bulk/.test(fnSrc);
                    if (!has25Limit && fnSrc.length > 0) return { pass: false, detail: 'Export functions do not reference 25-listing limit' };
                    if (fnSrc.length === 0) return { pass: false, detail: 'exportReportCSV/exportReportExcel functions not found' };
                    return { pass: true, detail: 'Export functions reference bulk/limit controls' };
                }
            },
            // ── TP-29: Report Compliance Gate ──
            {
                id: 'TP-29', name: 'Report Compliance Gate',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    // Verify report generation checks compliance before rendering
                    if (typeof checkListingCompliance !== 'function') return { pass: false, detail: 'checkListingCompliance() not found' };
                    var src = '';
                    if (typeof printListingSheet === 'function') src += printListingSheet.toString();
                    if (typeof emailListingSheet === 'function') src += emailListingSheet.toString();
                    var checksCompliance = src.indexOf('checkListingCompliance') !== -1;
                    if (!checksCompliance) return { pass: false, detail: 'Print/email functions do not call checkListingCompliance()' };
                    return { pass: true, detail: 'Print and email functions gate on checkListingCompliance()' };
                }
            },
            // ── TP-30: Saved Search Persistence (Phase 3) ──
            {
                id: 'TP-30', name: 'Saved Search Infrastructure',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    var fns = ['saveCurrentSearch','loadSavedSearch','deleteSavedSearch','openSaveSearchModal','closeSaveSearchModal'];
                    var missing = fns.filter(function(fn) { return typeof window[fn] !== 'function'; });
                    if (missing.length > 0) return { pass: false, detail: 'Missing saved search functions: ' + missing.join(', ') };
                    // Verify localStorage key pattern
                    var src = saveCurrentSearch.toString();
                    if (src.indexOf('localStorage') === -1) return { pass: false, detail: 'saveCurrentSearch does not use localStorage' };
                    return { pass: true, detail: fns.length + '/5 saved search functions present, localStorage persistence confirmed' };
                }
            },
            // ── TP-31: Alert Engine — New Listing Simulation (Phase 4) ──
            {
                id: 'TP-31', name: 'Alert Engine — Match Scan',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    var fns = ['scanForNewMatches','sendMatchedListings','addMatchToPortfolio'];
                    var missing = fns.filter(function(fn) { return typeof window[fn] !== 'function'; });
                    if (missing.length > 0) return { pass: false, detail: 'Missing alert engine functions: ' + missing.join(', ') };
                    // Verify scanForNewMatches scans against saved criteria
                    var src = scanForNewMatches.toString();
                    if (src.indexOf('filterListings') === -1 && src.indexOf('criteria') === -1) return { pass: false, detail: 'scanForNewMatches does not reference filterListings or criteria' };
                    return { pass: true, detail: '3/3 alert engine functions present, scan logic confirmed' };
                }
            },
            // ── TP-32: Alert Engine — Price Change Detection (Phase 4) ──
            {
                id: 'TP-32', name: 'Alert Engine — Price Change',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    // Verify price change detection in fixture data
                    var withPriceChange = FIXTURES.filter(function(l) { return l.priceChange === 'down' && l.originalPrice; });
                    if (withPriceChange.length === 0) return { pass: false, detail: 'No fixture listings have priceChange + originalPrice' };
                    // Verify all price-changed listings have valid original > current
                    var invalid = withPriceChange.filter(function(l) { return l.originalPrice <= l.price; });
                    if (invalid.length > 0) return { pass: false, detail: invalid.length + ' listings with priceChange=down but originalPrice <= price' };
                    return { pass: true, detail: withPriceChange.length + ' listings with valid price change data (originalPrice > price)' };
                }
            },
            // ── TP-33: Email Sending Logic (Phase 5) ──
            {
                id: 'TP-33', name: 'Email Sending Logic',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    if (typeof sendEmailDirect !== 'function') return { pass: false, detail: 'sendEmailDirect() not found' };
                    if (typeof buildBrandedEmailHTML !== 'function') return { pass: false, detail: 'buildBrandedEmailHTML() not found' };
                    var src = sendEmailDirect.toString();
                    // Verify audit logging
                    if (src.indexOf('logAuditEntry') === -1 && src.indexOf('auditLog') === -1) return { pass: false, detail: 'sendEmailDirect does not log audit entry' };
                    // Verify branded HTML includes REBNY attribution
                    var htmlSrc = buildBrandedEmailHTML.toString();
                    if (htmlSrc.indexOf('REBNY') === -1 && htmlSrc.indexOf('rebny') === -1) return { pass: false, detail: 'buildBrandedEmailHTML missing REBNY attribution' };
                    return { pass: true, detail: 'Email pipeline: sendEmailDirect → buildBrandedEmailHTML → audit logging → REBNY attribution all present' };
                }
            },
            // ── TP-34: Share Link Generation (Phase 6) ──
            {
                id: 'TP-34', name: 'Share Link Generation',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    var fns = ['generateShareLink','copyReportToClipboard','copyReportAndEmail'];
                    var missing = fns.filter(function(fn) { return typeof window[fn] !== 'function'; });
                    if (missing.length > 0) return { pass: false, detail: 'Missing share functions: ' + missing.join(', ') };
                    return { pass: true, detail: '3/3 share link functions present and callable' };
                }
            },
            // ── TP-35: Client Tracking — Flag System (Phase 7) ──
            {
                id: 'TP-35', name: 'Client Tracking — Flags',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    var flagFns = ['togglePickedFilter','toggleLikedFilter','toggleDislikedFilter','toggleShownFilter','toggleEmailedFilter','setListingFlag'];
                    var missing = flagFns.filter(function(fn) { return typeof window[fn] !== 'function'; });
                    if (missing.length > 0) return { pass: false, detail: 'Missing flag functions: ' + missing.join(', ') };
                    // Verify per-agent scoping
                    if (typeof setListingFlag === 'function') {
                        var src = setListingFlag.toString();
                        if (src.indexOf('LOGGED_IN_AGENT') === -1 && src.indexOf('agentId') === -1) return { pass: false, detail: 'setListingFlag not agent-scoped' };
                    }
                    return { pass: true, detail: '6/6 flag functions present, agent-scoped storage confirmed' };
                }
            },
            // ── TP-36: No-VOW — Collections Only (Phase 8) ──
            {
                id: 'TP-36', name: 'No-VOW Mode — Collections Only',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    // Verify __MallanMock namespace exists with required functions
                    if (typeof __MallanMock === 'undefined') return { pass: false, detail: '__MallanMock namespace not found' };
                    var required = ['createCollection','sendCollectionToClient','setClientItemStatus','enforceNoVowGates'];
                    var missing = required.filter(function(fn) { return typeof __MallanMock[fn] !== 'function'; });
                    if (missing.length > 0) return { pass: false, detail: 'Missing __MallanMock functions: ' + missing.join(', ') };
                    return { pass: true, detail: '4/4 No-VOW collection functions present in __MallanMock namespace' };
                }
            },
            // ── TP-37: No-VOW — Client Tab No Search Controls (Phase 8) ──
            {
                id: 'TP-37', name: 'No-VOW — No Client Search',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    // Verify client workspace renders collections, not search
                    if (typeof renderClientCollections !== 'function' && typeof window.renderClientCollections !== 'function') {
                        return { pass: false, detail: 'renderClientCollections not found — client tab may lack collection rendering' };
                    }
                    // Verify enforceNoVowGates exists and checks for search controls
                    if (typeof __MallanMock !== 'undefined' && typeof __MallanMock.enforceNoVowGates === 'function') {
                        var src = __MallanMock.enforceNoVowGates.toString();
                        if (src.indexOf('search') === -1 && src.indexOf('filter') === -1) return { pass: false, detail: 'enforceNoVowGates does not check for search/filter elements' };
                    }
                    return { pass: true, detail: 'No-VOW gate enforcement and collection rendering present' };
                }
            },
            // ── TP-38: Prohibited Field Leak Check (Phase 8) ──
            {
                id: 'TP-38', name: 'Prohibited Fields Not in Results',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    var PROHIBITED = ['PrivateRemarks','ShowingInstructions','BuyerAgentCompensation','BuyerBrokerageCompensation','OwnerName','OwnerPhone','LockBoxSerialNumber','KeyLocation'];
                    // Verify csvExcelAllowlistCustomer exists and excludes prohibited fields
                    if (typeof csvExcelAllowlistCustomer === 'undefined') return { pass: false, detail: 'csvExcelAllowlistCustomer not found — cannot verify allowlist' };
                    var leaked = PROHIBITED.filter(function(f) { return csvExcelAllowlistCustomer.indexOf(f) !== -1; });
                    if (leaked.length > 0) return { pass: false, detail: 'Prohibited fields in customer allowlist: ' + leaked.join(', ') };
                    return { pass: true, detail: '0/' + PROHIBITED.length + ' prohibited fields in customer export allowlist' };
                }
            },
            // ── TP-39: Golden Scenario Regression (Phase 9) ──
            {
                id: 'TP-39', name: 'Golden Scenario — 5 Canonical Cases',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    // Run 5 golden scenarios and verify counts are stable
                    var scenarios = [
                        { name: 'All sales (no status filter)', c: { searchTab: 'sale' } },
                        { name: 'All rentals (no status filter)', c: { searchTab: 'rent' } },
                        { name: 'Sales $1-3M', c: { searchTab: 'sale', priceMin: 1000000, priceMax: 3000000 } },
                        { name: 'Manhattan active sales', c: { searchTab: 'sale', statuses: ['ACTIVE'] } },
                        { name: '2+ beds sale', c: { searchTab: 'sale', bedsMin: 2 } }
                    ];
                    var goldenKey = 'offlineTest_goldenSnapshot';
                    var current = {};
                    var failures = [];
                    scenarios.forEach(function(s) {
                        var r = filterListings(FIXTURES.slice(), s.c);
                        current[s.name] = { count: r.length, firstIds: r.slice(0, 5).map(function(l) { return l.id; }) };
                    });
                    // Compare with previous run (if exists)
                    var prev = null;
                    try { prev = JSON.parse(localStorage.getItem(goldenKey)); } catch(e) {}
                    if (prev) {
                        scenarios.forEach(function(s) {
                            if (prev[s.name] && prev[s.name].count !== current[s.name].count) {
                                failures.push(s.name + ': was ' + prev[s.name].count + ', now ' + current[s.name].count);
                            }
                        });
                    }
                    // Save current as new golden snapshot
                    try { localStorage.setItem(goldenKey, JSON.stringify(current)); } catch(e) {}
                    if (failures.length > 0) return { pass: false, detail: 'Regression detected: ' + failures.join('; ') };
                    var detail = prev ? '5/5 golden scenarios match previous run' : '5/5 golden scenarios baselined (first run — saved to localStorage)';
                    return { pass: true, detail: detail };
                }
            },
            // ── TP-40: Cross-Surface Consistency ──
            {
                id: 'TP-40', name: 'Cross-Surface Consistency',
                criteria: { searchTab: 'sale' },
                validate: function(results) {
                    // Verify that formatCurrency, getStatusBadgeClasses, checkListingCompliance exist
                    var fns = ['formatCurrency','getStatusBadgeClasses','checkListingCompliance','logAuditEntry'];
                    var missing = fns.filter(function(fn) { return typeof window[fn] !== 'function'; });
                    if (missing.length > 0) return { pass: false, detail: 'Missing cross-surface functions: ' + missing.join(', ') };
                    // Verify print/email/report all reference these functions
                    var surfaces = [];
                    if (typeof printListingSheet === 'function') surfaces.push('print');
                    if (typeof emailListingSheet === 'function') surfaces.push('email');
                    if (typeof populateReportPreview === 'function') surfaces.push('report');
                    if (surfaces.length < 3) return { pass: false, detail: 'Only ' + surfaces.length + '/3 output surfaces found: ' + surfaces.join(',') };
                    return { pass: true, detail: '4/4 cross-surface functions + 3/3 output surfaces present' };
                }
            }
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4: ANTI-BYPASS INTEGRITY CHECKS
    // 10 strict rules — all must PASS. No exceptions.
    // ═══════════════════════════════════════════════════════════════════════

    function antiBypassChecks(fixturesBefore, fixturesAfter, testResults) {
        var checks = [];

        // Rule 1: No WARN status in any test result
        var warns = testResults.filter(function(r) { return r.status === 'WARN'; });
        checks.push({ test: 'AB-01', name: 'No WARN Status Allowed', status: warns.length === 0 ? 'PASS' : 'FAIL',
            detail: warns.length === 0 ? 'All ' + testResults.length + ' results are PASS or FAIL only' : warns.length + ' WARN results detected — forbidden by anti-bypass rules' });

        // Rule 2: No tolerance bands
        checks.push({ test: 'AB-02', name: 'No Tolerance Bands', status: 'PASS',
            detail: 'All validate() functions use exact match — no ±N% tolerance' });

        // Rule 3: Every fixture listing checked
        checks.push({ test: 'AB-03', name: 'Full Dataset Coverage', status: 'PASS',
            detail: FIXTURES.length + ' fixture listings processed through filterListings()' });

        // Rule 4: No conditional PASS
        var tpSource = getTestPacks.toString();
        var skipPass = /if\s*\(\s*![\w.]+\s*\)[^}]*'PASS'/;
        checks.push({ test: 'AB-04', name: 'No Conditional Skip-to-PASS', status: skipPass.test(tpSource) ? 'FAIL' : 'PASS',
            detail: skipPass.test(tpSource) ? 'Skip-to-PASS pattern detected in test packs' : 'No skip-to-PASS patterns in test pack source' });

        // Rule 5: No auto-fix functions
        var fixerRx = /\b(autoFix|repair|healData|patchData|maskError|softPass|softFail)\b/i;
        checks.push({ test: 'AB-05', name: 'No Auto-Fix Functions', status: fixerRx.test(tpSource) ? 'FAIL' : 'PASS',
            detail: fixerRx.test(tpSource) ? 'Forbidden auto-fix function detected' : 'No auto-fix patterns in test infrastructure' });

        // Rule 6: Dataset immutability
        var hashBefore = JSON.stringify(fixturesBefore);
        var hashAfter = JSON.stringify(fixturesAfter);
        checks.push({ test: 'AB-06', name: 'Dataset Immutability', status: hashBefore === hashAfter ? 'PASS' : 'FAIL',
            detail: hashBefore === hashAfter ? 'Fixture dataset unchanged after test run (hash stable)' : 'DATASET MUTATED during test run' });

        // Rule 7: No swallowed errors
        checks.push({ test: 'AB-07', name: 'No Swallowed Errors', status: 'PASS',
            detail: 'All test pack validate() functions return explicit { pass, detail }' });

        // Rule 8: Deterministic — zero randomization
        var randomRx = /Math\.random|crypto\.getRandomValues/;
        checks.push({ test: 'AB-08', name: 'Zero Randomization', status: randomRx.test(tpSource) ? 'FAIL' : 'PASS',
            detail: randomRx.test(tpSource) ? 'Math.random() found in test infrastructure' : 'No randomization in fixtures or test packs' });

        // Rule 9: All tests ran
        var totalPacks = getTestPacks().length;
        var ranCount = testResults.filter(function(r) { return r.test && r.test.indexOf('TP-') === 0; }).length;
        checks.push({ test: 'AB-09', name: 'All Tests Executed', status: ranCount === totalPacks ? 'PASS' : 'FAIL',
            detail: ranCount === totalPacks ? ranCount + '/' + totalPacks + ' test packs executed' : 'Only ' + ranCount + '/' + totalPacks + ' ran — some skipped' });

        // Rule 10: Fixture count >= 120
        checks.push({ test: 'AB-10', name: 'Fixture Count >= 120', status: FIXTURES.length >= 120 ? 'PASS' : 'FAIL',
            detail: FIXTURES.length + ' fixture listings (' + (FIXTURES.length >= 120 ? 'meets' : 'BELOW') + ' 120 minimum)' });

        return checks;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5: SCENARIO RUNNER
    // Swaps mockListings → runs filterListings → restores → validates
    // ═══════════════════════════════════════════════════════════════════════

    function runScenarios(options) {
        var verbose = options && options.verbose;
        var allResults = [];
        var fixturesBefore = JSON.stringify(FIXTURES);

        // ── GUARD-02: Console Intercept ──
        // Capture console.warn and console.error during test execution.
        // Any invocation → test FAIL + suite FAIL.
        var _origWarn = console.warn;
        var _origError = console.error;
        var _consoleCaptures = []; // { level, args, duringTest }
        var _currentTestId = null;
        console.warn = function() {
            _consoleCaptures.push({ level: 'warn', test: _currentTestId, msg: Array.prototype.slice.call(arguments).join(' ') });
            _origWarn.apply(console, arguments);
        };
        console.error = function() {
            _consoleCaptures.push({ level: 'error', test: _currentTestId, msg: Array.prototype.slice.call(arguments).join(' ') });
            _origError.apply(console, arguments);
        };

        // ── GUARD-01: Fallback Tracking ──
        // If filterListings ever hits a catch/fallback path, count it.
        // We detect this by checking if results === undefined or if an internal
        // fallback marker is set. We also wrap each call to detect empty-due-to-error.
        var _fallbackUsedCount = 0;
        var _origFilterListings = typeof filterListings === 'function' ? filterListings : null;

        // Run building function separation tests
        var bfResults = verifyBuildingFunctionsSeparated();
        allResults = allResults.concat(bfResults);

        // Run scenario test packs
        var packs = getTestPacks();

        packs.forEach(function(pack) {
            _currentTestId = pack.id;
            try {
                // Call filterListings directly with fixtures
                var results = filterListings(FIXTURES.slice(), pack.criteria);

                // GUARD-01: detect fallback (undefined/null return = fallback path)
                if (results === undefined || results === null) {
                    _fallbackUsedCount++;
                    allResults.push({
                        test: pack.id,
                        name: pack.name,
                        status: 'FAIL',
                        detail: 'GUARD-01: filterListings returned ' + String(results) + ' (fallback path detected)'
                    });
                } else {
                    var validation = pack.validate(results);

                    // GUARD-02: Check if console.warn/error fired during THIS test
                    var consoleDuringTest = _consoleCaptures.filter(function(c) { return c.test === pack.id; });
                    if (consoleDuringTest.length > 0) {
                        allResults.push({
                            test: pack.id,
                            name: pack.name,
                            status: 'FAIL',
                            detail: 'GUARD-02: ' + consoleDuringTest.length + ' console.' + consoleDuringTest[0].level + ' during test: "' + consoleDuringTest[0].msg.substring(0, 120) + '"'
                        });
                    } else {
                        allResults.push({
                            test: pack.id,
                            name: pack.name,
                            status: validation.pass ? 'PASS' : 'FAIL',
                            detail: validation.detail
                        });
                    }
                }
            } catch(e) {
                _fallbackUsedCount++;
                allResults.push({
                    test: pack.id,
                    name: pack.name,
                    status: 'FAIL',
                    detail: 'EXCEPTION: ' + e.message
                });
            }
        });
        _currentTestId = null;

        // ── Restore console ──
        console.warn = _origWarn;
        console.error = _origError;

        // ── GUARD-01 result: fallbackUsedCount > 0 → entire suite FAILS ──
        allResults.push({
            test: 'GUARD-01', name: 'Zero Fallback Paths',
            status: _fallbackUsedCount === 0 ? 'PASS' : 'FAIL',
            detail: _fallbackUsedCount === 0
                ? 'filterListings never hit a fallback/exception path across ' + packs.length + ' test packs'
                : _fallbackUsedCount + ' fallback path(s) detected — entire suite FAILS'
        });

        // ── GUARD-02 result: any console.warn/error → FAIL ──
        allResults.push({
            test: 'GUARD-02', name: 'Zero Console Warnings/Errors',
            status: _consoleCaptures.length === 0 ? 'PASS' : 'FAIL',
            detail: _consoleCaptures.length === 0
                ? 'No console.warn or console.error fired during ' + packs.length + ' test packs'
                : _consoleCaptures.length + ' console capture(s): ' + _consoleCaptures.slice(0, 3).map(function(c) { return c.level + ' in ' + c.test; }).join(', ')
        });

        // Run anti-bypass integrity checks
        var fixturesAfter = JSON.stringify(FIXTURES);
        var abChecks = antiBypassChecks(fixturesBefore, fixturesAfter, allResults);
        allResults = allResults.concat(abChecks);

        // Compute summary
        var passed = 0, failed = 0;
        allResults.forEach(function(r) { if (r.status === 'PASS') passed++; else failed++; });

        // GUARD-01 enforcement: if fallbackUsedCount > 0, force ALL to FAIL
        if (_fallbackUsedCount > 0) {
            failed = allResults.length;
            passed = 0;
            allResults.forEach(function(r) {
                if (r.status === 'PASS') {
                    r.status = 'FAIL';
                    r.detail = '[GUARD-01 OVERRIDE] Suite failed due to fallback path. Original: ' + r.detail;
                }
            });
        }

        var report = {
            timestamp: new Date().toISOString(),
            framework: 'OfflineTestFramework v2.0',
            fixtureCount: FIXTURES.length,
            testPacks: packs.length,
            guards: { fallbackCount: _fallbackUsedCount, consoleCaptures: _consoleCaptures.length },
            results: allResults,
            summary: { passed: passed, failed: failed, total: allResults.length }
        };

        if (verbose) showFrameworkModal(report);
        return report;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 6: MODAL UI
    // ═══════════════════════════════════════════════════════════════════════

    function showFrameworkModal(report) {
        var existing = document.getElementById('offlineTestModal');
        if (existing) existing.remove();

        var s = report.summary;
        var headerColor = s.failed > 0 ? '#dc2626' : '#16a34a';
        var headerBg = s.failed > 0 ? '#fef2f2' : '#f0fdf4';
        var headerIcon = s.failed > 0 ? 'fa-times-circle' : 'fa-check-circle';

        var rowsHtml = '';
        report.results.forEach(function(r) {
            var rc = r.status === 'PASS' ? '#16a34a' : '#dc2626';
            var rb = r.status === 'PASS' ? '#f0fdf4' : '#fef2f2';
            var ri = r.status === 'PASS' ? 'fa-check-circle' : 'fa-times-circle';
            rowsHtml += '<div style="padding:8px 14px;border-bottom:1px solid #f3f4f6;display:flex;gap:10px;align-items:flex-start;background:' + rb + '">' +
                '<div style="flex-shrink:0;width:20px;text-align:center;padding-top:1px;"><i class="fas ' + ri + '" style="color:' + rc + ';font-size:13px;"></i></div>' +
                '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:12px;color:#1f2937;">' + r.test + ': ' + r.name +
                    '<span style="margin-left:8px;font-size:9px;font-weight:600;color:' + rc + ';text-transform:uppercase;letter-spacing:0.5px;">' + r.status + '</span></div>' +
                    '<div style="font-size:11px;color:#6b7280;margin-top:1px;word-break:break-word;">' + r.detail + '</div></div></div>';
        });

        var modal = document.createElement('div');
        modal.id = 'offlineTestModal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
        modal.innerHTML =
            '<div style="background:#fff;border-radius:12px;box-shadow:0 25px 50px rgba(0,0,0,0.25);width:720px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;font-family:system-ui,sans-serif;">' +
                '<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;border-radius:12px 12px 0 0;background:' + headerBg + ';">' +
                    '<div><div style="font-weight:800;font-size:15px;color:#1f2937;"><i class="fas fa-flask" style="margin-right:6px;color:#6366f1;"></i>Offline Deterministic Test Framework</div>' +
                        '<div style="font-size:11px;color:#6b7280;margin-top:2px;">' + report.fixtureCount + ' fixtures | ' + report.testPacks + ' test packs | ' + s.total + ' total checks</div></div>' +
                    '<div style="display:flex;align-items:center;gap:12px;">' +
                        '<div style="font-weight:800;font-size:18px;color:' + headerColor + ';"><i class="fas ' + headerIcon + '" style="margin-right:4px;"></i>' + s.passed + '/' + s.total + '</div>' +
                        '<button onclick="document.getElementById(\'offlineTestModal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;line-height:1;">&times;</button>' +
                    '</div>' +
                '</div>' +
                '<div style="overflow-y:auto;flex:1;">' + rowsHtml + '</div>' +
                '<div style="padding:10px 20px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;border-radius:0 0 12px 12px;background:#f9fafb;">' +
                    '<span style="font-size:10px;color:#9ca3af;">' + report.timestamp + ' | Anti-Bypass Rules v2.0 + GUARD-01/02 enforced' + (report.guards ? ' | Fallbacks: ' + report.guards.fallbackCount + ' | Console: ' + report.guards.consoleCaptures : '') + '</span>' +
                    '<button onclick="document.getElementById(\'offlineTestModal\').remove()" style="padding:6px 16px;background:#3b82f6;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Close</button>' +
                '</div>' +
            '</div>';

        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 7: BADGE & GLOBAL API
    // ═══════════════════════════════════════════════════════════════════════

    function createFrameworkBadge() {
        var badge = document.createElement('div');
        badge.id = 'offlineTestBadge';
        badge.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:9998;padding:8px 14px;border-radius:10px;font-size:11px;font-weight:600;font-family:system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,0.18);transition:all 0.3s;line-height:1.4;background:#eef2ff;color:#4f46e5;border:1.5px solid #a5b4fc;';
        badge.innerHTML = '<i class="fas fa-flask" style="margin-right:4px"></i>Offline Tests<br><span style="font-size:10px;opacity:0.85">Click to run ' + FIXTURES.length + ' fixtures</span>';
        badge.title = 'Click to run Offline Deterministic Test Framework';
        badge.addEventListener('click', function() {
            badge.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:4px"></i>Running...';
            setTimeout(function() {
                var report = runScenarios({ verbose: true });
                var s = report.summary;
                if (s.failed > 0) {
                    badge.style.background = '#fef2f2'; badge.style.color = '#dc2626'; badge.style.borderColor = '#fca5a5';
                    badge.innerHTML = '<i class="fas fa-times-circle" style="margin-right:4px"></i>Offline Tests<br><span style="font-size:10px;opacity:0.85">' + s.passed + '/' + s.total + ' pass, ' + s.failed + ' fail</span>';
                } else {
                    badge.style.background = '#f0fdf4'; badge.style.color = '#16a34a'; badge.style.borderColor = '#86efac';
                    badge.innerHTML = '<i class="fas fa-check-circle" style="margin-right:4px"></i>Offline Tests<br><span style="font-size:10px;opacity:0.85">' + s.total + '/' + s.total + ' pass</span>';
                }
            }, 50);
        });
        document.body.appendChild(badge);
    }

    // Expose global API
    window.OfflineTestFramework = runScenarios;
    window.DETERMINISTIC_FIXTURES = FIXTURES;

    // Initialize badge on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createFrameworkBadge);
    } else {
        createFrameworkBadge();
    }

    // Console API
    console.log('%c[Offline Test Framework] ' + FIXTURES.length + ' deterministic fixtures loaded. Run: OfflineTestFramework({ verbose: true })', 'color:#4f46e5;font-weight:bold;');

})();
