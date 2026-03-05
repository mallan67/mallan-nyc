        // Stub: customerDB removed with client section
        var customerDB = {};
        var currentWorkspaceClientId = null;

        // Dev escape hatch: ?mock=true on localhost loads hardcoded mock data
        var _isDevMock = (function() {
            var host = window.location.hostname;
            var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
            var params = new URLSearchParams(window.location.search);
            return isLocal && params.get('mock') === 'true';
        })();

        var _MOCK_LISTINGS_DATA = [
            { id: 1, address: '140 HILLSIDE AVENUE', unit: '2C', price: 500000, totalMonthly: 1304, rooms: 2, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 694, maintCC: 610, intSqft: 675, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Fort George', zip: '10040', era: 'Post-War', yearBuilt: 1960, buildingName: '140 Hillside', listingType: 'Exclusive', lid: 'MOCK-S001', wid: 'MOCK-W001', dom: 13, cdom: 13, listedDate: '01/22/2026', updatedDate: '01/24/2026', company: 'Demo Brokerage A', agentName: 'Demo Agent A', agentEmail: 'agentA@example.com', priceChange: null, photoCount: 17, latitude: 40.8590, longitude: -73.9255, crossStreet: 'Hillside Ave & Ellwood St', exposures: 'South', walkScore: 88, floor: 2, description: 'Beautifully renovated 1BR condo in Fort George. Open kitchen, hardwood floors, natural light.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 2, address: '581 ACADEMY STREET', unit: '2F', price: 500000, totalMonthly: 1124, rooms: 4, beds: 2, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 371, maintCC: 753, intSqft: 900, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Inwood', zip: '10034', era: 'Pre-War', yearBuilt: 1929, buildingName: '581 Academy', listingType: 'Exclusive', lid: 'MOCK-S002', wid: 'MOCK-W002', dom: 145, cdom: 145, listedDate: '09/12/2025', updatedDate: '01/30/2026', company: 'Demo Brokerage B', agentName: 'Demo Agent B', agentEmail: 'agentB@example.com', agentPhone: '(555) 000-0001', priceChange: 'down', originalPrice: 525000, photoCount: 11, latitude: 40.8673, longitude: -73.9228, crossStreet: 'Academy St & Vermilyea Ave', exposures: 'East', walkScore: 92, floor: 2, description: 'Spacious 2BR pre-war condo in Inwood. High ceilings, original details, near parks.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 3, address: '516 WEST 112TH STREET', unit: '4B', price: 509900, totalMonthly: 998, rooms: 3, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 323, maintCC: 675, intSqft: 650, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Morningside Heights', zip: '10025', era: 'Post-War', yearBuilt: 1965, buildingName: null, listingType: 'Exclusive', lid: 'MOCK-S003', wid: null, dom: 30, cdom: 30, listedDate: '01/05/2026', updatedDate: '02/04/2026', company: 'Demo Brokerage C', agentName: 'Demo Agent C', agentEmail: 'agentC@example.com', agentPhone: '(555) 000-0002', priceChange: 'down', originalPrice: 524900, photoCount: 10, latitude: 40.8048, longitude: -73.9638, crossStreet: 'W 112th St & Amsterdam Ave', exposures: 'West', walkScore: 95, floor: 4, description: '1BR near Columbia University. Close to Riverside Park, Morningside Park. Quiet block.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 4, address: '350 EAST 62ND STREET', unit: '1M', price: 519000, totalMonthly: 959, rooms: 3, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 234.17, maintCC: 724.44, intSqft: 472, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Lenox Hill', zip: '10065', era: 'Pre-War', yearBuilt: 1938, buildingName: null, listingType: 'Exclusive', lid: 'MOCK-S004', wid: 'MOCK-W004', dom: 78, cdom: 78, listedDate: '11/18/2025', updatedDate: null, company: 'Demo Brokerage D', agentName: 'Demo Agent D', agentEmail: null, agentPhone: '(555) 000-0003', priceChange: null, photoCount: 18, latitude: 40.7629, longitude: -73.9618, crossStreet: 'E 62nd St & 1st Ave', exposures: 'North', walkScore: 97, floor: 1, description: 'Upper East Side pre-war condo. Doorman building, close to transit and shopping.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 5, address: '504 WEST 136TH STREET', unit: '6A', price: 525000, totalMonthly: 789, rooms: 4, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 4.25, maintCC: 785, intSqft: 636, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Hamilton Heights', zip: '10031', era: 'Pre-War', yearBuilt: 1920, buildingName: null, listingType: 'Exclusive', lid: null, wid: null, dom: 45, cdom: 45, listedDate: '12/20/2025', priceChange: 'down', photoCount: 8, latitude: 40.8222, longitude: -73.9504, crossStreet: 'W 136th St & Amsterdam Ave', exposures: 'South, West', walkScore: 94, floor: 6, description: 'Charming pre-war 1BR in Hamilton Heights. High ceilings, original moldings.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 6, address: '753 ST NICHOLAS AVENUE', unit: '5B', price: 525000, totalMonthly: 1393, rooms: 3, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 535, maintCC: 858, intSqft: null, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Sugar Hill', zip: '10031', era: 'Pre-War', yearBuilt: 1925, buildingName: null, listingType: 'Open', lid: null, wid: null, dom: 22, cdom: 22, listedDate: '01/13/2026', priceChange: null, photoCount: 6, latitude: 40.8245, longitude: -73.9432, crossStreet: 'St Nicholas Ave & W 148th St', exposures: 'East', walkScore: 96, floor: 5, description: 'Sugar Hill 1BR condo. Classic pre-war details in vibrant neighborhood.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 7, address: '250 MANHATTAN AVENUE', unit: '1A', price: 525000, totalMonthly: 1055, rooms: 3, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 291, maintCC: 764, intSqft: 654, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Harlem', zip: '10026', era: 'New Construction', yearBuilt: 2024, buildingName: '250 Manhattan', listingType: 'Exclusive', lid: null, wid: null, dom: 60, cdom: 60, listedDate: '12/05/2025', priceChange: 'down', photoCount: 12, latitude: 40.7982, longitude: -73.9551, crossStreet: 'Manhattan Ave & W 113th St', exposures: 'South, East', walkScore: 93, floor: 1, description: 'Brand new construction 1BR in Harlem. Modern finishes, washer/dryer in unit.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 8, address: '1420 YORK AVENUE', unit: '7B', price: 530000, totalMonthly: 1370, rooms: 3, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 733, maintCC: 637, intSqft: null, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Upper East Side', zip: '10021', era: 'Post-War', yearBuilt: 1958, buildingName: null, listingType: 'Exclusive', lid: null, wid: null, dom: 15, cdom: 15, listedDate: '01/20/2026', priceChange: null, photoCount: 9, latitude: 40.7714, longitude: -73.9496, crossStreet: 'York Ave & E 75th St', exposures: 'West', walkScore: 95, floor: 7, description: 'UES 1BR condo with open views. Close to Lenox Hill Hospital and E 77th St subway.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 9, address: '456 WEST 167TH STREET', unit: '4D', price: 535000, totalMonthly: 1662, rooms: 3, beds: 1, baths: 2, fullBaths: 1, halfBaths: 1, reTaxes: 924, maintCC: 738, intSqft: 728, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Washington Heights', zip: '10032', era: 'Pre-War', yearBuilt: 1928, buildingName: null, listingType: 'Exclusive', lid: null, wid: null, dom: 8, cdom: 8, listedDate: '01/27/2026', priceChange: null, photoCount: 14, newListing: true, latitude: 40.8402, longitude: -73.9390, crossStreet: 'W 167th St & Audubon Ave', exposures: 'North, East', walkScore: 91, floor: 4, description: 'Washington Heights 1BR with half bath. Pre-war charm, close to Columbia-Presbyterian.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 10, address: '140 HILLSIDE AVENUE', unit: '2A', price: 535000, totalMonthly: 1304, rooms: 3, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 694, maintCC: 610, intSqft: 686, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Fort George', zip: '10040', era: 'Post-War', yearBuilt: 1960, buildingName: '140 Hillside', listingType: 'Exclusive', lid: null, wid: null, dom: 20, cdom: 20, listedDate: '01/15/2026', priceChange: 'down', photoCount: 15, latitude: 40.8590, longitude: -73.9255, crossStreet: 'Hillside Ave & Ellwood St', exposures: 'North', walkScore: 88, floor: 2, description: 'Bright 1BR in Fort George. Recently updated kitchen, near A train.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            // ── Rental Listings ──
            { id: 11, listingCategory: 'rental', address: '301 EAST 79TH STREET', unit: '5A', price: 3500, totalMonthly: 3500, rooms: 3, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 0, maintCC: 0, intSqft: 650, status: 'ACTIVE', ownership: 'RentalBuilding', propertyType: 'Residential', propertySubType: 'Apartment', neighborhood: 'Upper East Side', zip: '10075', era: 'Pre-War', yearBuilt: 1935, buildingName: null, listingType: 'Exclusive', lid: '23810001', wid: '20080001', dom: 5, cdom: 5, listedDate: '02/07/2026', updatedDate: '02/07/2026', company: 'Mallan Real Estate Inc.', agentName: 'Demo Agent', agentEmail: 'demo@example.com', agentPhone: '555-000-0000', priceChange: null, photoCount: 8, latitude: 40.7735, longitude: -73.9555, crossStreet: 'E 79th St & 2nd Ave', exposures: 'South', walkScore: 96, floor: 5, description: 'Sunny 1BR in UES pre-war elevator building. Hardwood floors, updated kitchen.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 12, listingCategory: 'rental', address: '555 WEST 23RD STREET', unit: '12D', price: 5200, totalMonthly: 5200, rooms: 4, beds: 2, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 0, maintCC: 0, intSqft: 900, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Chelsea', zip: '10011', era: 'New Construction', yearBuilt: 2020, buildingName: 'The Cortland', listingType: 'Exclusive', lid: '23810002', wid: '20080002', dom: 12, cdom: 12, listedDate: '01/31/2026', updatedDate: '02/03/2026', company: 'Mallan Real Estate Inc.', agentName: 'Demo Agent', agentEmail: 'demo@example.com', agentPhone: '555-000-0000', priceChange: null, photoCount: 14, latitude: 40.7472, longitude: -74.0022, crossStreet: 'W 23rd St & 11th Ave', exposures: 'West, South', walkScore: 94, floor: 12, description: 'Luxury 2BR condo rental in Chelsea. Doorman, gym, rooftop deck. W/D in unit.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 13, listingCategory: 'rental', address: '170 EAST 87TH STREET', unit: '3C', price: 2800, totalMonthly: 2800, rooms: 2, beds: 0, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 0, maintCC: 0, intSqft: 480, status: 'ACTIVE', ownership: 'RentalBuilding', propertyType: 'Residential', propertySubType: 'Apartment', neighborhood: 'Upper East Side', zip: '10128', era: 'Post-War', yearBuilt: 1962, buildingName: null, listingType: 'Open', lid: '23810003', wid: null, dom: 3, cdom: 3, listedDate: '02/09/2026', updatedDate: null, company: 'Demo Brokerage E', agentName: 'Demo Agent E', agentEmail: 'agentE@example.com', priceChange: null, photoCount: 6, newListing: true, latitude: 40.7790, longitude: -73.9535, crossStreet: 'E 87th St & 3rd Ave', exposures: 'East', walkScore: 97, floor: 3, description: 'Alcove studio in UES. Close to 86th St subway. Laundry in building.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 14, listingCategory: 'rental', address: '420 WEST 42ND STREET', unit: '28F', price: 4100, totalMonthly: 4100, rooms: 3, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 0, maintCC: 0, intSqft: 720, status: 'ACTIVE', ownership: 'RentalBuilding', propertyType: 'Residential', propertySubType: 'Apartment', neighborhood: "Hell's Kitchen", zip: '10036', era: 'New Construction', yearBuilt: 2018, buildingName: 'Sky', listingType: 'Exclusive', lid: '23810004', wid: '20080004', dom: 8, cdom: 8, listedDate: '02/04/2026', updatedDate: '02/06/2026', company: 'Demo Brokerage F', agentName: 'Demo Agent F', agentEmail: 'agentF@example.com', agentPhone: '(555) 000-0004', priceChange: null, photoCount: 11, latitude: 40.7580, longitude: -73.9945, crossStreet: 'W 42nd St & 9th Ave', exposures: 'North, West', walkScore: 98, floor: 28, description: "High-floor 1BR in Hell's Kitchen luxury rental. Hudson River views, full amenity building.", idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 15, listingCategory: 'rental', address: '100 BARCLAY STREET', unit: '15G', price: 8500, totalMonthly: 8500, rooms: 5, beds: 2, baths: 2, fullBaths: 2, halfBaths: 0, reTaxes: 0, maintCC: 0, intSqft: 1250, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Tribeca', zip: '10007', era: 'New Construction', yearBuilt: 2019, buildingName: '100 Barclay', listingType: 'Exclusive', lid: '23810005', wid: '20080005', dom: 18, cdom: 18, listedDate: '01/25/2026', updatedDate: '02/01/2026', company: 'Demo Brokerage G', agentName: 'Demo Agent G', agentEmail: 'agentG@example.com', agentPhone: '(555) 000-0005', priceChange: 'down', originalPrice: 9000, photoCount: 20, latitude: 40.7133, longitude: -74.0104, crossStreet: 'Barclay St & Church St', exposures: 'South, East', walkScore: 99, floor: 15, description: 'Tribeca 2BR condo rental with open city views. Full-service building, Renzo Piano design.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            { id: 16, listingCategory: 'rental', address: '3345 BROADWAY', unit: '4E', price: 2200, totalMonthly: 2200, rooms: 3, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 0, maintCC: 0, intSqft: 600, status: 'ACTIVE', ownership: 'RentalBuilding', propertyType: 'Residential', propertySubType: 'Apartment', neighborhood: 'Washington Heights', zip: '10031', era: 'Pre-War', yearBuilt: 1930, buildingName: null, listingType: 'Open', lid: '23810006', wid: null, dom: 2, cdom: 2, listedDate: '02/10/2026', updatedDate: null, company: 'Demo Brokerage B', agentName: 'Demo Agent B', agentEmail: 'agentB@example.com', agentPhone: '(555) 000-0001', priceChange: null, photoCount: 7, newListing: true, latitude: 40.8230, longitude: -73.9480, crossStreet: 'Broadway & W 135th St', exposures: 'West', walkScore: 93, floor: 4, description: 'Affordable 1BR in Washington Heights. Pre-war details, near 1 train.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            // ── 3+ Bedroom Sale Listing ──
            { id: 17, address: '200 WEST 86TH STREET', unit: '12A', price: 1850000, totalMonthly: 3245, rooms: 7, beds: 3, baths: 2, fullBaths: 2, halfBaths: 0, reTaxes: 1120, maintCC: 2125, intSqft: 1450, status: 'ACTIVE', ownership: 'StockCooperative', propertyType: 'Residential', propertySubType: 'Cooperative', neighborhood: 'Upper West Side', borough: 'Manhattan', zip: '10024', era: 'Pre-War', yearBuilt: 1924, buildingName: 'The Belnord', listingType: 'Exclusive', lid: '23820001', wid: '20090001', dom: 10, cdom: 10, listedDate: '02/03/2026', updatedDate: '02/10/2026', company: 'Mallan Real Estate Inc.', agentName: 'Demo Agent', agentEmail: 'demo@example.com', agentPhone: '555-000-0000', priceChange: null, photoCount: 22, latitude: 40.7884, longitude: -73.9743, crossStreet: 'W 86th St & Amsterdam Ave', exposures: 'South, East', walkScore: 97, floor: 12, description: 'Stunning pre-war 3BR co-op on the Upper West Side. Grand proportions, doorman building, steps to Central Park.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            // ── Studio (beds=0) Sale Listing ──
            { id: 18, address: '330 EAST 75TH STREET', unit: '3F', price: 395000, totalMonthly: 892, rooms: 2, beds: 0, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 312, maintCC: 580, intSqft: 486, status: 'PENDING', ownership: 'StockCooperative', propertyType: 'Residential', propertySubType: 'Cooperative', neighborhood: 'Upper East Side', borough: 'Manhattan', zip: '10021', era: 'Post-War', yearBuilt: 1955, buildingName: null, listingType: 'Exclusive', lid: '23820002', wid: '20090002', dom: 35, cdom: 35, listedDate: '01/08/2026', updatedDate: '02/12/2026', company: 'Corcoran Group', agentName: 'Lisa Park', agentEmail: 'lpark@corcoran.com', agentPhone: '(212) 555-0188', priceChange: null, photoCount: 9, latitude: 40.7700, longitude: -73.9570, crossStreet: 'E 75th St & 1st Ave', exposures: 'South', walkScore: 96, floor: 3, description: 'Renovated studio co-op in UES. Doorman, laundry, close to 77th St subway.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            // ── Closed Sale Listing ──
            { id: 19, address: '88 GREENWICH STREET', unit: '22H', price: 1200000, totalMonthly: 2150, rooms: 4, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 850, maintCC: 1300, intSqft: 820, status: 'CLOSED', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Financial District', borough: 'Manhattan', zip: '10006', era: 'New Construction', yearBuilt: 2017, buildingName: '88 Greenwich', listingType: 'Exclusive', lid: '23820003', wid: '20090003', dom: 62, cdom: 62, listedDate: '12/01/2025', updatedDate: '02/01/2026', company: 'Mallan Real Estate Inc.', agentName: 'Demo Agent', agentEmail: 'demo@example.com', agentPhone: '555-000-0000', priceChange: 'down', originalPrice: 1295000, photoCount: 16, latitude: 40.7086, longitude: -74.0130, crossStreet: 'Greenwich St & Rector St', exposures: 'West', walkScore: 99, floor: 22, description: 'FiDi 1BR condo with Hudson River views. Luxury amenities, steps to Brookfield Place.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            // ── Condop Sale Listing ──
            { id: 20, address: '1760 SECOND AVENUE', unit: '9C', price: 575000, totalMonthly: 1100, rooms: 3, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 400, maintCC: 700, intSqft: 710, status: 'ACTIVE', ownership: 'Condop', propertyType: 'Residential', propertySubType: 'Condop', neighborhood: 'Upper East Side', borough: 'Manhattan', zip: '10128', era: 'Post-War', yearBuilt: 1963, buildingName: null, listingType: 'Open', lid: '23820004', wid: null, dom: 25, cdom: 25, listedDate: '01/18/2026', updatedDate: null, company: 'Compass', agentName: 'David Kim', agentEmail: 'dkim@compass.com', agentPhone: '(212) 555-0234', priceChange: null, photoCount: 10, latitude: 40.7795, longitude: -73.9490, crossStreet: '2nd Ave & E 92nd St', exposures: 'East, North', walkScore: 95, floor: 9, description: 'Spacious condop 1BR in Yorkville. Washer/dryer allowed, pet friendly, close to 86th St Q train.', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true },
            // ── Distribution Gate Test Listings ──
            { id: 21, address: '999 PARK AVENUE', unit: '30A', price: 4500000, totalMonthly: 5200, rooms: 8, beds: 3, baths: 3, fullBaths: 3, halfBaths: 0, reTaxes: 2100, maintCC: 3100, intSqft: 2200, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Upper East Side', borough: 'Manhattan', zip: '10028', era: 'Pre-War', yearBuilt: 1930, buildingName: null, listingType: 'Exclusive', lid: '23830001', wid: '20095001', dom: 5, cdom: 5, listedDate: '02/09/2026', company: 'Sotheby\'s', agentName: 'Test Agent', photoCount: 12, latitude: 40.7740, longitude: -73.9600, description: 'OWNER OPT-OUT TEST', idxDisplayYN: true, addressDisplayYN: true, permissions: { ownerOptOut: true, participantOnly: false, idxDisplay: true, syndication: true } },
            { id: 22, address: '100 CENTRAL PARK SOUTH', unit: '15B', price: 3200000, totalMonthly: 4100, rooms: 6, beds: 2, baths: 2, fullBaths: 2, halfBaths: 0, reTaxes: 1500, maintCC: 2600, intSqft: 1800, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Midtown', borough: 'Manhattan', zip: '10019', era: 'Pre-War', yearBuilt: 1928, buildingName: null, listingType: 'Exclusive', lid: '23830002', wid: '20095002', dom: 10, cdom: 10, listedDate: '02/04/2026', company: 'Douglas Elliman', agentName: 'Test Agent 2', photoCount: 8, latitude: 40.7660, longitude: -73.9790, description: 'PARTICIPANT ONLY TEST', idxDisplayYN: false, internetDisplayYN: true, addressDisplayYN: true, permissions: { ownerOptOut: false, participantOnly: true, idxDisplay: false, syndication: false } },
            { id: 23, address: '425 EAST 58TH STREET', unit: '8D', price: 875000, totalMonthly: 1550, rooms: 4, beds: 2, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 450, maintCC: 1100, intSqft: 950, status: 'COMING_SOON', ownership: 'StockCooperative', propertyType: 'Residential', propertySubType: 'Cooperative', neighborhood: 'Sutton Place', borough: 'Manhattan', zip: '10022', era: 'Pre-War', yearBuilt: 1935, buildingName: null, listingType: 'Exclusive', lid: '23830003', wid: '20095003', dom: 0, cdom: 0, listedDate: '02/14/2026', company: 'Mallan Real Estate Inc.', agentName: 'Demo Agent', agentEmail: 'demo@example.com', agentPhone: '555-000-0000', photoCount: 5, latitude: 40.7590, longitude: -73.9620, description: 'COMING SOON test listing.', idxDisplayYN: true, addressDisplayYN: true, permissions: { ownerOptOut: false, participantOnly: false, idxDisplay: true, syndication: true }, comingSoonDate: '02/21/2026' },
            { id: 24, address: '220 RIVERSIDE BOULEVARD', unit: '19F', price: 1650000, totalMonthly: 2800, rooms: 5, beds: 2, baths: 2, fullBaths: 2, halfBaths: 0, reTaxes: 900, maintCC: 1900, intSqft: 1100, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Upper West Side', borough: 'Manhattan', zip: '10069', era: 'New Construction', yearBuilt: 2005, buildingName: 'Trump Place', listingType: 'Exclusive', lid: '23830004', wid: '20095004', dom: 14, cdom: 14, listedDate: '01/31/2026', company: 'Compass', agentName: 'IDX Test Agent', photoCount: 11, latitude: 40.7770, longitude: -73.9890, description: 'IDX OPT-OUT TEST', idxDisplayYN: false, internetDisplayYN: true, addressDisplayYN: true, permissions: { ownerOptOut: false, participantOnly: false, idxDisplay: false, syndication: false } },
            { id: 25, address: '15 CENTRAL PARK WEST', unit: '22A', price: 5900000, totalMonthly: 6200, rooms: 9, beds: 4, baths: 3, fullBaths: 3, halfBaths: 0, reTaxes: 2800, maintCC: 3400, intSqft: 2800, status: 'ACTIVE', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Upper West Side', borough: 'Manhattan', zip: '10023', era: 'New Construction', yearBuilt: 2008, buildingName: '15 CPW', listingType: 'Exclusive', lid: '23830005', wid: '20095005', dom: 7, cdom: 7, listedDate: '02/07/2026', company: 'Brown Harris Stevens', agentName: 'Address Test Agent', photoCount: 18, latitude: 40.7700, longitude: -73.9810, description: 'ADDRESS SUPPRESSED TEST', idxDisplayYN: true, addressDisplayYN: false, permissions: { ownerOptOut: false, participantOnly: false, idxDisplay: true, syndication: true } },
            { id: 26, address: '401 EAST 60TH STREET', unit: '11C', price: 780000, totalMonthly: 1350, rooms: 3, beds: 1, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 380, maintCC: 970, intSqft: 700, status: 'CLOSED', ownership: 'Condominium', propertyType: 'Residential', propertySubType: 'Condominium', neighborhood: 'Upper East Side', borough: 'Manhattan', zip: '10065', era: 'Post-War', yearBuilt: 1960, buildingName: null, listingType: 'Exclusive', lid: '23830006', wid: '20095006', dom: 45, cdom: 45, listedDate: '01/01/2026', updatedDate: '02/13/2026', company: 'Mallan Real Estate Inc.', agentName: 'Demo Agent', closedDate: '02/13/2026', photoCount: 9, latitude: 40.7615, longitude: -73.9600, description: 'Recently closed listing for 24hr test.', idxDisplayYN: true, addressDisplayYN: true, permissions: { ownerOptOut: false, participantOnly: false, idxDisplay: true, syndication: true } },
            { id: 27, address: '350 WEST 71ST STREET', unit: '6B', price: 725000, totalMonthly: 1420, rooms: 4, beds: 2, baths: 1, fullBaths: 1, halfBaths: 0, reTaxes: 420, maintCC: 1000, intSqft: 850, status: 'ACTIVE', ownership: 'StockCooperative', propertyType: 'Residential', propertySubType: 'Cooperative', neighborhood: 'Upper West Side', borough: 'Manhattan', zip: '10023', era: 'Pre-War', yearBuilt: 1925, buildingName: null, listingType: 'Exclusive', lid: '23830007', wid: '20095007', dom: 11, cdom: 11, listedDate: '02/01/2026', updatedDate: '02/08/2026', company: 'Corcoran Group', agentName: 'Syndication Test Agent', agentEmail: 'syntest@corcoran.com', agentPhone: '(212) 555-0377', photoCount: 10, latitude: 40.7790, longitude: -73.9800, description: 'SYNDICATION OPT-OUT TEST', idxDisplayYN: true, addressDisplayYN: true, syndicateYN: false, permissions: { ownerOptOut: false, participantOnly: false, idxDisplay: true, syndication: false } },
        ];

        // Always start with mock data — API upgrades it when available.
        var _isLocalhost = (function() {
            var h = window.location.hostname;
            return h === 'localhost' || h === '127.0.0.1' || h === '';
        })();
        var mockListings = _MOCK_LISTINGS_DATA.slice();

        // ── REBNY Distribution Gate defaults ──
        // Add default permissions to all listings that don't have explicit permissions set
        mockListings.forEach(function(l) {
            if (!l.permissions) {
                l.permissions = { ownerOptOut: false, participantOnly: false, idxDisplay: l.idxDisplayYN !== false, internetDisplay: l.internetDisplayYN !== false, syndication: true };
            }
        });

        // Add borough to all listings that don't have it (Manhattan-only mock data)
        mockListings.forEach(function(l) { if (!l.borough) l.borough = 'Manhattan'; });

        // ── NeighborhoodCanonical: resolve SubdivisionName → canonical polygon name on ingest ──
        // This runs at ingest time so every listing has a stable canonical name for map-based search.
        // Uses the alias map (loaded async) — re-resolves when aliases arrive.
        var _canonicalAliasMap = null;
        (function loadCanonicalMap() {
            var base = window.location.pathname.replace(/\/[^/]*$/, '');
            var url = (base.endsWith('/crm') ? '/geo/' : '../geo/') + 'neighborhood-aliases.json';
            fetch(url)
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(data) {
                    if (data && data.aliases) {
                        _canonicalAliasMap = data.aliases;
                        // Resolve all existing listings
                        mockListings.forEach(function(l) { resolveNeighborhoodCanonical(l); });
                    }
                })
                .catch(function() { /* non-fatal — listings keep raw neighborhood */ });
        })();

        /**
         * resolveNeighborhoodCanonical(listing)
         * Sets listing.neighborhoodCanonical (string) and listing.neighborhoodCanonicals (array)
         * from listing.neighborhood using alias map.
         *
         * Alias values can be: string (single), array (multi-polygon), null (no polygon).
         * For multi-polygon (e.g. "Chelsea / Flatiron" → ["Chelsea", "Flatiron"]),
         * neighborhoodCanonical = first polygon, neighborhoodCanonicals = all polygons.
         */
        function resolveNeighborhoodCanonical(listing) {
            if (!listing.neighborhood) return;
            if (listing.neighborhoodCanonical) return; // already set
            if (!_canonicalAliasMap) {
                listing.neighborhoodCanonical = listing.neighborhood;
                return;
            }
            var val = _canonicalAliasMap[listing.neighborhood];
            if (Array.isArray(val)) {
                // Multi-polygon: first is primary, all stored in array
                listing.neighborhoodCanonical = val[0] || listing.neighborhood;
                listing.neighborhoodCanonicals = val;
            } else if (val) {
                listing.neighborhoodCanonical = val;
            } else {
                // null or not in map — passthrough (may be a polygon name itself)
                listing.neighborhoodCanonical = listing.neighborhood;
            }
        }

        // Apply to all current listings (before async aliases load — sets identity)
        mockListings.forEach(function(l) { resolveNeighborhoodCanonical(l); });

        // ── Cinematic Minimalism Photo URLs (Unsplash real estate interiors) ──
        var LISTING_PHOTOS = [
            'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00',  // 0  bright living room
            'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688',  // 1  open living room
            'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2',  // 2  open kitchen
            'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267',  // 3  grand living room
            'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c',  // 4  modern exterior
            'https://images.unsplash.com/photo-1556912172-45b7abe8b7e1',  // 5  modern kitchen
            'https://images.unsplash.com/photo-1600585154340-be6161a56a0c',  // 6  gourmet kitchen
            'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9',  // 7  sun-drenched living
            'https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e',  // 8  bedroom
            'https://images.unsplash.com/photo-1631049307264-da0ec9d70304',  // 9  second bedroom
            'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8',  // 10 primary bedroom
            'https://images.unsplash.com/photo-1540518614846-7eded433c457',  // 11 bedroom
            'https://images.unsplash.com/photo-1484154218962-a197022b5858',  // 12 chef kitchen
            'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14',  // 13 dining area
            'https://images.unsplash.com/photo-1613545325278-f24b0cae1224',  // 14 bathroom
            'https://images.unsplash.com/photo-1617104678098-de229db51175',  // 15 primary bedroom alt
            'https://images.unsplash.com/photo-1600210492493-0946911123ea',  // 16 view / kitchen
            'https://images.unsplash.com/photo-1584622650111-993a426fbf0a',  // 17 bathroom alt
            'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3',  // 18 city view
            'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136'   // 19 kitchen
        ];
        // RESO ImageOf categories — maps to Trestle Media entity enum values
        // Each photo gets a proper RESO category + display caption
        var PHOTO_ROOMS = [
            { imageOf: 'LivingRoom',      caption: 'Living Room' },        // 0
            { imageOf: 'Kitchen',         caption: 'Kitchen' },            // 1
            { imageOf: 'PrimaryBedroom',  caption: 'Primary Bedroom' },    // 2
            { imageOf: 'PrimaryBathroom', caption: 'Primary Bathroom' },   // 3
            { imageOf: 'DiningArea',      caption: 'Dining Area' },        // 4
            { imageOf: 'Bedroom',         caption: 'Second Bedroom' },     // 5
            { imageOf: 'Bathroom',        caption: 'Bathroom' },           // 6
            { imageOf: 'Kitchen',         caption: 'Kitchen Detail' },     // 7
            { imageOf: 'EntranceFoyer',   caption: 'Entry Foyer' },        // 8
            { imageOf: 'View',            caption: 'View' },               // 9
            { imageOf: 'Closet',          caption: 'Walk-In Closet' },     // 10
            { imageOf: 'LivingRoom',      caption: 'Living Room Detail' }, // 11
            { imageOf: 'Lobby',           caption: 'Building Lobby' },     // 12
            { imageOf: 'CommonAmenity',   caption: 'Building Amenity' },   // 13
            { imageOf: 'FrontOfStructure',caption: 'Building Exterior' },  // 14
            { imageOf: 'FloorPlan',       caption: 'Floor Plan' },         // 15
            { imageOf: 'Laundry',         caption: 'Laundry' },            // 16
            { imageOf: 'Balcony',         caption: 'Balcony / Terrace' }   // 17
        ];
        var PHOTO_PARAM = '?w=800&q=85&auto=format&fit=crop';
        var PHOTO_PARAM_THUMB = '?w=400&q=80&auto=format&fit=crop';

        // Generate 12-18 photos per listing (industry optimal: 22-27, MLS minimum: 1, recommended: 10-15)
        // Uses all 20 Unsplash URLs rotated per listing, with proper RESO ImageOf + sort order
        mockListings.forEach(function(l, i) {
            var pi = i % LISTING_PHOTOS.length;
            // Photo count varies by listing: studios get 12, 1BR 14, 2BR+ 16-18
            var beds = l.beds || 0;
            var count = beds === 0 ? 12 : beds === 1 ? 14 : beds === 2 ? 16 : 18;
            l.images = [];
            for (var p = 0; p < count; p++) {
                var photoIdx = (pi + p * 3) % LISTING_PHOTOS.length;
                var room = PHOTO_ROOMS[p % PHOTO_ROOMS.length];
                l.images.push({
                    url: LISTING_PHOTOS[photoIdx] + PHOTO_PARAM,
                    caption: room.caption,
                    imageOf: room.imageOf,     // RESO ImageOf enum
                    order: p + 1,              // Trestle sort order (1-based)
                    isPrimary: p === 0,        // PreferredPhotoYN
                    mediaType: 'Jpeg',         // RESO MediaType
                    mediaCategory: (p === count - 1) ? 'FloorPlan' : 'Photo'  // RESO MediaCategory — last photo is always floor plan
                });
            }
            // Update photoCount to match actual images
            l.photoCount = l.images.length;
        });

        // Diversify ownership: make listings 2, 5 Co-op; listing 4 Condop (only if still default Condominium)
        if (mockListings[1] && mockListings[1].ownership === 'Condominium') { mockListings[1].ownership = 'StockCooperative'; mockListings[1].propertySubType = 'Cooperative'; }
        if (mockListings[4] && mockListings[4].ownership === 'Condominium') { mockListings[4].ownership = 'StockCooperative'; mockListings[4].propertySubType = 'Cooperative'; }

        // Diversify statuses: make listing 3 PENDING, listing 6 CLOSED
        if (mockListings[2] && mockListings[2].status === 'ACTIVE') { mockListings[2].status = 'PENDING'; }
        if (mockListings[5] && mockListings[5].status === 'ACTIVE') { mockListings[5].status = 'CLOSED'; }

        // ── Add detail-page fields not in base records ──
        // Condition: RLS PropertyCondition (Trestle-only, not in RLS CSV)
        mockListings.forEach(function(l) {
            if (!l.condition) {
                var yr = l.yearBuilt || 1960;
                if (yr >= 2015) l.condition = 'New Construction';
                else if (yr >= 2000) l.condition = 'Recently Renovated';
                else if (yr >= 1960) l.condition = 'Good';
                else l.condition = 'Original';
            }
        });
        // Showing Instructions / Open House: populated from API data

        // Virtual Tour & Video Tour URLs: populated from API data

        // Building contact info: populated from API data

        // ── FARE Act Compliance (NYC Local Law, effective June 11, 2025) ──
        // All rental listings MUST disclose: who pays broker fee, application fee, move-in fees.
        // Per REBNY guidance: landlord-pays-compensation = Standard Active (syndicated);
        // landlord-does-not-pay = InternetEntireListingDisplayYN = No (non-syndicated).
        mockListings.forEach(function(l) {
            if (l.listingCategory === 'rental') {
                if (!l.fareActFees) {
                    l.fareActFees = {
                        brokerFeePaidBy: l.company === 'Mallan Real Estate Inc.' ? 'Landlord' : 'Tenant',
                        applicationFee: 20,
                        moveInFees: 'First month + security deposit',
                        otherFees: null
                    };
                }
            }
        });

        // State Management
        var searchResultsState = {
            viewMode: localStorage.getItem('searchResultsViewMode') || 'gallery',
            selectedListings: JSON.parse(localStorage.getItem('selectedListings')) || [],
            workingSet: JSON.parse(localStorage.getItem('workingSet')) || [],
            clients: [],
            savedSearches: JSON.parse(localStorage.getItem('savedSearches_' + LOGGED_IN_AGENT.id)) || [],
            filteredListings: null,
            currentPage: 1,
            perPage: 50,
            sortField: 'price',
            sortOrder: 'asc',
            visibleColumns: JSON.parse(localStorage.getItem('visibleColumns')) || ['address', 'unit', 'price', 'totalMonthly', 'rooms', 'beds', 'baths', 'reTaxes', 'maintCC', 'intSqft', 'status', 'ownership'],
            reportSettings: { format: 'grid', version: null, output: null, options: [] }
        };

        // ── reportState: Single source of truth for the Reports modal ──
        var reportState = {
            selectedListingIds: [],
            format: 'grid',
            version: 'customer',
            options: {
                listingTypeCompany: false, listingContact: false, dom: false,
                updatedSoldDate: false, priceSqft: false, originalPrice: false,
                nextOpenHouse: false, mediaViewerLink: false, listingWebLink: false,
                googleMapLink: false, acrisLink: false, listingImages: false,
                listingFloorplans: false, buildingImages: false, buildingSummaryCoverPage: false,
                customAgentComments: false, importPersonalComments: false,
                commentsAboutCustomer: false, appointmentTime: false,
                fullListingAddress: true, streetNameOnly: false, crossStreets: false,
                priceRoom: false, map: false, includeAverages: false, numberListings: false,
                photoGallery: false, virtualTour: false, videoTour: false,
                factSheetPhotoCount: 4, factSheetPhotoLayout: 'vertical'
            },
            output: 'print',
            sort: { key: 'price', dir: 'asc' },
            title: 'Property Report',
            preparedFor: '',
            customDescription: '',
            originalDescription: '',
            favorites: []
        };

        // Available fields for Grid Layout selection — organized by category
        var availableFields = [
            { id: 'address', label: 'Address', locked: true, priority: 2 },
            { id: 'unit', label: 'Unit', locked: true, priority: 3 },
            { id: 'price', label: 'Price', locked: true, priority: 4 },
            { id: 'totalMonthly', label: 'Total Monthly', locked: true, priority: 5 },
            { id: 'rooms', label: 'Rooms', locked: true, priority: 6 },
            { id: 'beds', label: 'Bedrooms', locked: true, priority: 7 },
            { id: 'baths', label: 'Total Bathrooms', locked: true, priority: 8 },
            { id: 'reTaxes', label: 'RE Taxes', locked: true, priority: 9 },
            { id: 'maintCC', label: 'Maint/CC', locked: true, priority: 10 },
            { id: 'intSqft', label: 'Approx Interior SqFt', locked: true, priority: 11 },
            { id: 'status', label: 'Status', locked: true, priority: 12 },
            { id: 'ownership', label: 'Ownership', locked: true, priority: 13 },
            { id: 'openHouse', label: 'Open House Date/Time', locked: true, priority: 14 },
            { id: 'dom', label: 'Days on Market', locked: true, priority: 15 },
            // Optional fields (all categories)
            { id: 'activityHistory', label: 'Activity History', locked: false, category: 'activity' },
            { id: 'pricePerRoom', label: '$ per Room', locked: false, category: 'financial' },
            { id: 'pricePerShare', label: '$ per Share', locked: false, category: 'financial' },
            { id: 'pricePerSqft', label: '$ per Sq Ft', locked: false, category: 'financial' },
            { id: 'originalPrice', label: 'Original Price', locked: false, category: 'financial' },
            { id: 'lastAskPrice', label: 'Last Ask Price', locked: false, category: 'financial' },
            { id: 'priceChange', label: 'Price Change', locked: false, category: 'financial' },
            { id: 'financingAllowed', label: 'Financing Allowed (%)', locked: false, category: 'financial' },
            { id: 'dealFinanced', label: 'Deal Financed', locked: false, category: 'financial' },
            { id: 'shares', label: 'Shares', locked: false, category: 'financial' },
            { id: 'apartmentType', label: 'Apartment Type', locked: false, category: 'property' },
            { id: 'buildingName', label: 'Building Name', locked: false, category: 'property' },
            { id: 'coopName', label: 'Co-Op Name', locked: false, category: 'property' },
            { id: 'condition', label: 'Condition', locked: false, category: 'property' },
            { id: 'fullBathrooms', label: 'Full Bathrooms', locked: false, category: 'property' },
            { id: 'halfBathrooms', label: 'Half Bathrooms', locked: false, category: 'property' },
            { id: 'exteriorSqft', label: 'Approx Exterior Sqft', locked: false, category: 'property' },
            { id: 'privateOutdoorSpace', label: 'Private Outdoor Space', locked: false, category: 'property' },
            { id: 'attendedLobby', label: 'Attended Lobby', locked: false, category: 'property' },
            { id: 'petsAllowed', label: 'Pets Allowed', locked: false, category: 'property' },
            { id: 'preWarPostWar', label: 'Pre War/Post War', locked: false, category: 'property' },
            { id: 'washerDryerBuilding', label: 'W/D in Building', locked: false, category: 'property' },
            { id: 'washerDryerUnit', label: 'W/D in Unit', locked: false, category: 'property' },
            { id: 'sponsorUnit', label: 'Sponsor Unit', locked: false, category: 'property' },
            { id: 'resaleNewDev', label: 'Resale/New Dev', locked: false, category: 'property' },
            { id: 'floor', label: 'Floor', locked: false, category: 'property' },
            { id: 'exposures', label: 'Exposures (Facing)', locked: false, category: 'property' },
            { id: 'company', label: 'Company', locked: false, category: 'agent' },
            { id: 'primaryAgentName', label: 'Agent Name', locked: false, category: 'agent' },
            { id: 'primaryAgentEmail', label: 'Agent Email', locked: false, category: 'agent' },
            { id: 'primaryAgentPhone', label: 'Agent Phone', locked: false, category: 'agent' },
            { id: 'listingType', label: 'Listing Type', locked: false, category: 'agent' },
            { id: 'neighborhood', label: 'Neighborhood', locked: false, category: 'location' },
            { id: 'crossStreet', label: 'Cross Street', locked: false, category: 'location' },
            { id: 'zipCode', label: 'Zip Code', locked: false, category: 'location' },
            { id: 'walkScore', label: 'Walk Score', locked: false, category: 'location' },
            { id: 'latitude', label: 'Latitude', locked: false, category: 'location' },
            { id: 'longitude', label: 'Longitude', locked: false, category: 'location' },
            { id: 'listedDate', label: 'Listed Date', locked: false, category: 'history' },
            { id: 'contractSignedDate', label: 'Contract Signed Date', locked: false, category: 'history' },
            { id: 'previousSoldDate', label: 'Previous Sold Date', locked: false, category: 'history' },
            { id: 'previousSoldPrice', label: 'Previous Sold Price', locked: false, category: 'history' },
            { id: 'updatedSold', label: 'Updated/Sold', locked: false, category: 'history' },
            { id: 'cdom', label: 'Cumulative DOM', locked: false, category: 'history' },
            { id: 'yearBuilt', label: 'Year Built', locked: false, category: 'history' },
            { id: 'picked', label: 'Picked', locked: false, category: 'activity' },
            { id: 'liked', label: 'Liked', locked: false, category: 'activity' },
            { id: 'disliked', label: 'Disliked', locked: false, category: 'activity' },
            { id: 'shown', label: 'Shown', locked: false, category: 'activity' },
            { id: 'emailed', label: 'Emailed', locked: false, category: 'activity' },
            { id: 'rlsId', label: 'RLS ID', locked: false, category: 'ids' },
            { id: 'webId', label: 'Web ID', locked: false, category: 'ids' },
            { id: 'internalListingNum', label: 'Internal Listing #', locked: false, category: 'ids' },
            { id: 'acrisId', label: 'ACRIS ID', locked: false, category: 'ids' },
            { id: 'acrisDocuments', label: 'ACRIS Documents', locked: false, category: 'ids' },
            { id: 'propertyType', label: 'Property Type (RLS/RESO/IDX)', locked: false, category: 'ids' },
            { id: 'propertySubType', label: 'Property Sub-Type (RLS/RESO/IDX)', locked: false, category: 'ids' },
            { id: 'verifiedEstimated', label: 'Verified/Estimated', locked: false, category: 'ids' },
            { id: 'verifiedBuyer', label: 'Verified Buyer', locked: false, category: 'ids' },
            { id: 'verifiedSeller', label: 'Verified Seller', locked: false, category: 'ids' },
            { id: 'description', label: 'Description (Public Remarks)', locked: false, category: 'ids' }
        ];

        // Category definitions for Grid Layouts modal
        var fieldCategories = {
            financial: { label: 'Financial', icon: 'fa-dollar-sign', color: 'text-green-600' },
            property:  { label: 'Property Details', icon: 'fa-building', color: 'text-blue-600' },
            agent:     { label: 'Agent & Company', icon: 'fa-user-tie', color: 'text-purple-600' },
            location:  { label: 'Location', icon: 'fa-map-marker-alt', color: 'text-red-500' },
            history:   { label: 'Dates & History', icon: 'fa-calendar-alt', color: 'text-orange-500' },
            activity:  { label: 'Client Activity', icon: 'fa-chart-line', color: 'text-indigo-500' },
            ids:       { label: 'IDs & Data', icon: 'fa-database', color: 'text-gray-500' }
        };

        // ═══════════════════════════════════════════════════════════════════════════════
        // API FETCH — Replace mockListings with server data when available
        // No fallback in production — fail fast with "No listings" message
        // ═══════════════════════════════════════════════════════════════════════════════

        /**
         * Transform API listing (Prisma/RESO format) into the flat object shape
         * that 905+ search functions expect.
         */
        function transformAPIListing(apiListing, index) {
            var addr = (typeof apiListing.address === 'object' && apiListing.address) ? apiListing.address : {};
            var feat = (typeof apiListing.features === 'object' && apiListing.features) ? apiListing.features : {};
            var agent = (typeof apiListing.agent_info === 'object' && apiListing.agent_info) ? apiListing.agent_info : {};
            var media = Array.isArray(apiListing.media) ? apiListing.media : [];
            var price = parseFloat(apiListing.list_price) || 0;
            var isRental = apiListing.listing_type === 'rent';

            return {
                id: parseInt(apiListing.id) || (index + 1),
                address: (addr.StreetNumber ? addr.StreetNumber + ' ' : '') + (addr.StreetName || '') + (addr.StreetSuffix ? ' ' + addr.StreetSuffix : ''),
                unit: addr.UnitNumber || '',
                price: price,
                totalMonthly: isRental ? price : (parseFloat(feat.RealEstateTax || 0) / 12 + parseFloat(feat.AssociationFee || 0)),
                rooms: parseInt(feat.Rooms || 0) || 0,
                beds: parseInt(apiListing.bedrooms_total) || 0,
                baths: (parseInt(apiListing.bathrooms_full) || 0) + ((parseInt(apiListing.bathrooms_half) || 0) * 0.5),
                fullBaths: parseInt(apiListing.bathrooms_full) || 0,
                halfBaths: parseInt(apiListing.bathrooms_half) || 0,
                reTaxes: parseFloat(feat.RealEstateTax || 0) / 12,
                maintCC: parseFloat(feat.AssociationFee || 0),
                intSqft: parseFloat(apiListing.living_area) || null,
                status: (apiListing.status || 'ACTIVE').toUpperCase(),
                ownership: feat.CommonInterest || apiListing.property_type || '',
                propertyType: apiListing.property_type || 'Residential',
                propertySubType: apiListing.property_sub_type || '',
                neighborhood: apiListing.neighborhood || '',
                borough: apiListing.borough || 'Manhattan',
                zip: apiListing.postal_code || addr.PostalCode || '',
                yearBuilt: parseInt(feat.YearBuilt) || null,
                era: parseInt(feat.YearBuilt) >= 2015 ? 'New Construction' : parseInt(feat.YearBuilt) >= 1960 ? 'Post-War' : 'Pre-War',
                listingType: 'Exclusive',
                lid: apiListing.listing_id || '',
                dom: 0,
                cdom: 0,
                listedDate: apiListing.created_at ? new Date(apiListing.created_at).toLocaleDateString('en-US') : '',
                updatedDate: apiListing.modification_timestamp ? new Date(apiListing.modification_timestamp).toLocaleDateString('en-US') : '',
                company: agent.ListOfficeName || '',
                agentName: agent.ListAgentFullName || '',
                agentEmail: agent.ListAgentEmail || '',
                agentPhone: agent.ListAgentDirectPhone || '',
                photoCount: media.length,
                description: feat.PublicRemarks || '',
                idxDisplayYN: apiListing.idx_display_yn !== false,
                internetDisplayYN: apiListing.internet_entire_listing_display_yn !== false,
                addressDisplayYN: apiListing.internet_address_display_yn !== false,
                listingCategory: isRental ? 'rental' : undefined,
                permissions: {
                    ownerOptOut: apiListing.owner_opt_out === true,
                    participantOnly: apiListing.participant_only === true,
                    idxDisplay: apiListing.idx_display_yn !== false,
                    internetDisplay: apiListing.internet_entire_listing_display_yn !== false,
                    syndication: true,
                },
                _apiId: apiListing.id,
                _listingId: apiListing.listing_id,
            };
        }

        // ── Production data loading ─────────────────────────────────────────────
        // Priority: 1) IDX/Trestle search  2) Prisma DB  3) keep mock data (localhost)
        // On localhost, mockListings already has mock data — API upgrades it if available.
        // On production, mockListings starts empty — API populates it.
        if (typeof MallanAPI !== 'undefined' && !_isDevMock) {
            MallanAPI.onReady(function() {
                _loadFromIDX().catch(function(idxErr) {
                    // IDX unavailable (503, no credentials, etc.) — fall back to Prisma DB
                    console.warn('[MockData] IDX unavailable, falling back to local DB:', idxErr && idxErr.message);
                    _showDataLoadBanner('IDX unavailable — trying local database...', 'warn');
                    return _loadFromPrisma();
                }).catch(function(err) {
                    // All API sources failed
                    var reason = err && err.message ? err.message : 'Unknown error';
                    console.error('[MockData] All data sources failed:', reason);
                    if (_isLocalhost) {
                        // On localhost, mock data is already loaded — just log it
                        console.warn('[MockData] API unavailable on localhost — using mock data');
                        _showDataLoadBanner('Using mock data (API unavailable: ' + reason + ')', 'warn');
                    } else {
                        _showNoListingsMessage('Unable to load listings. Check your connection.');
                        _showDataLoadBanner('Data load failed: ' + reason, 'error');
                    }
                });
            });
        } else if (typeof MallanAPI === 'undefined' && !_isDevMock && !_isLocalhost) {
            // MallanAPI not loaded — likely auth/script issue
            _showDataLoadBanner('MallanAPI not loaded — please log in or check your session.', 'error');
        }

        /**
         * Load listings from IDX/Trestle (primary source).
         * IDX response is already in CRM flat shape — push directly.
         */
        function _loadFromIDX() {
            return MallanAPI.idx.search({ limit: 200 }).then(function(result) {
                if (result.listings && result.listings.length > 0) {
                    _replaceListings(result.listings, 'IDX/Trestle');
                    // Show REBNY attribution
                    if (result.attribution) _showAttribution(result.attribution);
                    return result;
                }
                return Promise.reject(new Error('IDX returned 0 listings'));
            });
        }

        /**
         * Load listings from Prisma DB (fallback — local exclusives).
         */
        function _loadFromPrisma() {
            return MallanAPI.listings.list({ limit: 200 }).then(function(result) {
                if (result.listings && result.listings.length > 0) {
                    var apiListings = result.listings.map(transformAPIListing);
                    _replaceListings(apiListings, 'local DB');
                    return result;
                }
                _showNoListingsMessage('No listings available.');
                return Promise.reject(new Error('Local DB returned 0 listings'));
            });
        }

        /**
         * Replace mockListings in-place and refresh view if visible.
         */
        function _replaceListings(listings, source) {
            mockListings.length = 0;
            listings.forEach(function(l) { mockListings.push(l); });
            // Apply borough defaults + neighborhood resolution
            mockListings.forEach(function(l) { if (!l.borough) l.borough = 'Manhattan'; });
            mockListings.forEach(function(l) { resolveNeighborhoodCanonical(l); });
            console.log('[MockData] Loaded ' + listings.length + ' listings from ' + source);
            // Refresh the current view ONLY if user is already viewing results
            var resultsSection = document.getElementById('searchResultsSection');
            var isViewingResults = resultsSection && resultsSection.style.display !== 'none' && !resultsSection.classList.contains('hidden');
            if (isViewingResults && typeof performSearch === 'function') performSearch();
        }

        /**
         * Show REBNY attribution text at the bottom of results.
         */
        function _showAttribution(text) {
            var existing = document.getElementById('rebnyAttribution');
            if (existing) { existing.textContent = text; return; }
            var resultsEl = document.getElementById('searchResults') || document.getElementById('listingGrid');
            if (!resultsEl || !resultsEl.parentNode) return;
            var attrDiv = document.createElement('div');
            attrDiv.id = 'rebnyAttribution';
            attrDiv.style.cssText = 'text-align:center;padding:12px 20px;color:#9ca3af;font-size:11px;border-top:1px solid #e5e7eb;margin-top:16px;';
            attrDiv.textContent = text;
            resultsEl.parentNode.insertBefore(attrDiv, resultsEl.nextSibling);
        }

        /**
         * Show a dismissible banner at the top of the search area explaining data load status.
         * @param {string} msg - Message to display
         * @param {'warn'|'error'} level - 'warn' = amber, 'error' = red
         */
        function _showDataLoadBanner(msg, level) {
            var existing = document.getElementById('dataLoadBanner');
            if (existing) existing.remove();
            var colors = level === 'error'
                ? 'background:#fef2f2;border:1px solid #fecaca;color:#991b1b;'
                : 'background:#fffbeb;border:1px solid #fde68a;color:#92400e;';
            var banner = document.createElement('div');
            banner.id = 'dataLoadBanner';
            banner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;padding:10px 20px;border-radius:8px;font-size:13px;max-width:600px;display:flex;align-items:center;gap:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);' + colors;
            banner.innerHTML = '<i class="fas ' + (level === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle') + '"></i>' +
                '<span style="flex:1;">' + msg + '</span>' +
                '<button onclick="this.parentNode.remove()" style="background:none;border:none;cursor:pointer;font-size:16px;opacity:0.6;padding:0 4px;">&times;</button>';
            document.body.appendChild(banner);
            // Auto-dismiss warnings after 8 seconds
            if (level === 'warn') setTimeout(function() { if (banner.parentNode) banner.remove(); }, 8000);
        }

        function _showNoListingsMessage(msg) {
            var resultsEl = document.getElementById('searchResults') || document.getElementById('listingGrid');
            if (resultsEl) {
                resultsEl.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#6b7280;">' +
                    '<i class="fas fa-exclamation-circle" style="font-size:32px;margin-bottom:12px;display:block;color:#d1d5db;"></i>' +
                    '<p style="font-size:15px;font-weight:600;">' + msg + '</p></div>';
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // COMPREHENSIVE FIELD DICTIONARIES FOR REPORTS - ALL REBNY RLS FIELDS
        // These dictionaries contain ALL fields present in the mockup forms
