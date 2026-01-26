import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface CSVRow {
  [key: string]: string;
}

interface ListingData {
  id: string;
  mlsId: string;
  mlsStatus: string;
  listingType: string;
  status: string;
  address: {
    streetNumber: string;
    streetName: string;
    unit: string;
    city: string;
    state: string;
    zip: string;
    county: string;
    borough: string;
    cityRegion: string;
    neighborhood: string;
    neighborhoodDisplay: string;
    buildingTaxLot: string;
  };
  price: {
    listPrice: number;
    pricePerSqft: number | null;
    originalListPrice: number;
    closePrice: number | null;
    closePricePerSqft: number | null;
  };
  propertyInfo: {
    propertyType: string;
    propertySubType: string;
    buildingType: string;
    architecturalStyle: string;
    yearBuilt: number;
    totalRooms: number;
    bedroomsTotal: number;
    bathroomsFull: number;
    bathroomsHalf: number;
    aboveGradeFinishedArea: number;
    belowGradeFinishedArea: number;
    lotSizeArea: number | null;
    storiesTotal: number;
    floorsInBuilding: number;
    unitFloor: number;
  };
  nycSpecific: {
    coopCondo: string | null;
    maintenanceFee: number | null;
    commonCharges: number | null;
    realEstateTaxes: number | null;
    taxesAnnual: number | null;
    assessedValue: number | null;
    flipTax: boolean | null;
    flipTaxPercent: number | null;
    percentOwned: number | null;
    sublettingAllowed: boolean | null;
    sublettingRestrictions: string | null;
    piedATerre: boolean | null;
    guarantorsAllowed: boolean | null;
    giftAllowed: boolean | null;
    financingAllowed: boolean | null;
    maxFinancing: number | null;
    boardApprovalRequired: boolean | null;
  };
  association: {
    associationName: string | null;
    associationFee: number | null;
    associationFeeFrequency: string | null;
    associationFeeIncludes: string[] | null;
    associationPhone: string | null;
  };
  features: {
    interior: {
      flooring: string[];
      appliances: string[];
      laundry: string;
      cooling: string[];
      heating: string[];
      fireplace: boolean;
      basement: string;
      windowFeatures: string[];
      accessibility: string[];
    };
    building: {
      doorman: boolean;
      doormanType: string | null;
      concierge: boolean;
      elevator: boolean;
      gym: boolean;
      pool: boolean;
      roofDeck: boolean;
      garage: boolean;
      parkingType: string | null;
      parkingSpaces: number;
      storage: boolean;
      bikeRoom: boolean;
      laundryRoom: boolean;
      playroom: boolean;
      communityRoom: boolean;
      security: string[];
      attendanceType: string;
    };
    pets: {
      allowed: boolean;
      policy: string;
      comments: string | null;
      breedRestrictions: boolean | null;
      sizeRestrictions: boolean | null;
      maxPets: number | null;
    };
    outdoor: {
      balcony: boolean;
      terrace: boolean;
      privateOutdoor: boolean;
      garden: boolean;
      roofRights: boolean;
    };
    views: string[];
    exposure: string[];
  };
  financials: null;
  listing: {
    listingDate: string;
    expirationDate: string;
    daysOnMarket: number;
    originalEntryTimestamp: string;
    modificationTimestamp: string;
    listingAgreementType: string;
    showingInstructions: string;
    showingContactPhone: string;
    virtualTourUrl: string | null;
    videoTourUrl: string | null;
  };
  agent: {
    listAgentId: string;
    listAgentName: string;
    listAgentEmail: string;
    listAgentPhone: string;
    listOfficeName: string;
    listOfficePhone: string;
    coListAgentId: string | null;
    coListAgentName: string | null;
  };
  buyer: {
    buyerAgentCompensation: string;
    buyerAgentCompensationType: string;
    buyerAgentId: string | null;
    buyerAgentName: string | null;
    buyerFinancing: string | null;
    closeDate: string | null;
  };
  media: {
    images: Array<{
      url: string;
      caption: string;
      order: number;
      isPrimary: boolean;
    }>;
    floorPlanUrl: string | null;
    virtualTourUrl: string | null;
    videoUrl: string | null;
  };
  description: string;
  privateRemarks: string | null;
  showingRemarks: string | null;
  openHouse: null;
  flags: {
    isExclusive: boolean;
    isFeatured: boolean;
    isNewListing: boolean;
    isPriceReduced: boolean;
    isOpenHouse: boolean;
    participantOnlyNetwork: boolean;
  };
  compliance: {
    idxOptOut: boolean;
    vowOptOut: boolean;
    syndicationOptOut: boolean;
    lastVerified: string;
  };
}

function parseCSV(text: string): { headers: string[]; rows: CSVRow[] } {
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.length === headers.length && values.some((v) => v.trim())) {
      const row: CSVRow = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx];
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

function parseAddress(address: string): { streetNumber: string; streetName: string } {
  const parts = address.trim().split(' ');
  const streetNumber = parts[0] || '';
  const streetName = parts.slice(1).join(' ') || '';
  return { streetNumber, streetName };
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function csvRowToListing(row: CSVRow, index: number): ListingData {
  const { streetNumber, streetName } = parseAddress(row.address || '');
  const listingType = (row.listing_type || 'sale').toLowerCase();
  const status = (row.status || 'active').toLowerCase();
  const today = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString();

  // Generate unique ID
  const prefix = listingType === 'rent' ? 'rent' : 'sale';
  const id = `${prefix}-csv-${Date.now()}-${index}`;

  // Map property type
  let propertyType = row.property_type || 'Condo';
  if (propertyType.toLowerCase().includes('co-op') || propertyType.toLowerCase() === 'coop') {
    propertyType = 'Co-op';
  } else if (propertyType.toLowerCase().includes('condo')) {
    propertyType = 'Condo';
  }

  // Map borough
  let borough = row.borough || 'Manhattan';
  const boroughMap: { [key: string]: string } = {
    manhattan: 'Manhattan',
    brooklyn: 'Brooklyn',
    queens: 'Queens',
    bronx: 'Bronx',
    'staten island': 'Staten Island',
  };
  borough = boroughMap[borough.toLowerCase()] || borough;

  // Default agent info
  const agentName = row.agent_name || 'Maya Allan';
  const agentEmail = row.agent_email || 'maya@mallan.nyc';
  const agentPhone = row.agent_phone || '(646) 258-4460';
  const agentId = generateSlug(agentName);

  const listing: ListingData = {
    id,
    mlsId: `REBNY-CSV-${Date.now()}-${index}`,
    mlsStatus: status === 'active' ? 'Active' : status === 'sold' ? 'Sold' : status === 'rented' ? 'Rented' : 'Active',
    listingType: listingType === 'rent' || listingType === 'rental' ? 'rent' : 'sale',
    status,

    address: {
      streetNumber,
      streetName,
      unit: row.unit || '',
      city: 'New York',
      state: 'NY',
      zip: row.zip || '10001',
      county: borough === 'Manhattan' ? 'New York' : borough === 'Brooklyn' || borough === 'Queens' ? 'Kings' : 'New York',
      borough,
      cityRegion: borough,
      neighborhood: generateSlug(row.neighborhood || 'midtown'),
      neighborhoodDisplay: row.neighborhood || 'Midtown',
      buildingTaxLot: '',
    },

    price: {
      listPrice: parseInt(row.price) || 0,
      pricePerSqft: row.sqft ? Math.round(parseInt(row.price) / parseInt(row.sqft)) : null,
      originalListPrice: parseInt(row.price) || 0,
      closePrice: status === 'sold' || status === 'rented' ? parseInt(row.price) || null : null,
      closePricePerSqft: null,
    },

    propertyInfo: {
      propertyType,
      propertySubType: listingType === 'rent' ? 'Rental' : 'Residential',
      buildingType: row.building_type || 'High Rise',
      architecturalStyle: row.style || 'Contemporary',
      yearBuilt: parseInt(row.year_built) || 2000,
      totalRooms: (parseInt(row.bedrooms) || 1) + 2,
      bedroomsTotal: parseInt(row.bedrooms) || 1,
      bathroomsFull: parseInt(row.bathrooms) || 1,
      bathroomsHalf: parseInt(row.half_baths) || 0,
      aboveGradeFinishedArea: parseInt(row.sqft) || 0,
      belowGradeFinishedArea: 0,
      lotSizeArea: null,
      storiesTotal: 1,
      floorsInBuilding: parseInt(row.floors_in_building) || 10,
      unitFloor: parseInt(row.floor) || 1,
    },

    nycSpecific: {
      coopCondo: propertyType === 'Co-op' ? 'Co-op' : propertyType === 'Condo' ? 'Condo' : null,
      maintenanceFee: parseInt(row.maintenance_fee) || null,
      commonCharges: parseInt(row.common_charges) || null,
      realEstateTaxes: parseInt(row.taxes) || null,
      taxesAnnual: parseInt(row.taxes_annual) || null,
      assessedValue: null,
      flipTax: null,
      flipTaxPercent: null,
      percentOwned: null,
      sublettingAllowed: null,
      sublettingRestrictions: null,
      piedATerre: null,
      guarantorsAllowed: true,
      giftAllowed: null,
      financingAllowed: true,
      maxFinancing: null,
      boardApprovalRequired: propertyType === 'Co-op',
    },

    association: {
      associationName: null,
      associationFee: parseInt(row.maintenance_fee) || parseInt(row.common_charges) || null,
      associationFeeFrequency: 'Monthly',
      associationFeeIncludes: null,
      associationPhone: null,
    },

    features: {
      interior: {
        flooring: ['Hardwood'],
        appliances: ['Dishwasher', 'Refrigerator', 'Range'],
        laundry: row.laundry_in_unit === 'true' || row.laundry_in_unit === '1' ? 'In Unit' : 'Common',
        cooling: ['Central Air'],
        heating: ['Central'],
        fireplace: row.fireplace === 'true' || row.fireplace === '1',
        basement: 'None',
        windowFeatures: [],
        accessibility: [],
      },
      building: {
        doorman: row.doorman === 'true' || row.doorman === '1',
        doormanType: row.doorman === 'true' || row.doorman === '1' ? 'Full Time' : null,
        concierge: row.concierge === 'true' || row.concierge === '1',
        elevator: row.elevator === 'true' || row.elevator === '1',
        gym: row.gym === 'true' || row.gym === '1',
        pool: row.pool === 'true' || row.pool === '1',
        roofDeck: row.roof_deck === 'true' || row.roof_deck === '1',
        garage: row.garage === 'true' || row.garage === '1',
        parkingType: null,
        parkingSpaces: 0,
        storage: row.storage === 'true' || row.storage === '1',
        bikeRoom: false,
        laundryRoom: true,
        playroom: false,
        communityRoom: false,
        security: row.doorman === 'true' || row.doorman === '1' ? ['24 Hour Doorman'] : ['Intercom'],
        attendanceType: row.doorman === 'true' || row.doorman === '1' ? 'Full Time Doorman' : 'None',
      },
      pets: {
        allowed: row.pets_allowed === 'true' || row.pets_allowed === '1',
        policy: row.pets_allowed === 'true' || row.pets_allowed === '1' ? 'Allowed' : 'Not Allowed',
        comments: null,
        breedRestrictions: null,
        sizeRestrictions: null,
        maxPets: null,
      },
      outdoor: {
        balcony: row.balcony === 'true' || row.balcony === '1',
        terrace: row.terrace === 'true' || row.terrace === '1',
        privateOutdoor: false,
        garden: false,
        roofRights: false,
      },
      views: [],
      exposure: [],
    },

    financials: null,

    listing: {
      listingDate: today,
      expirationDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      daysOnMarket: 0,
      originalEntryTimestamp: timestamp,
      modificationTimestamp: timestamp,
      listingAgreementType: 'Exclusive Right to Sell',
      showingInstructions: 'Contact listing agent for appointment.',
      showingContactPhone: agentPhone,
      virtualTourUrl: row.virtual_tour_url || null,
      videoTourUrl: null,
    },

    agent: {
      listAgentId: agentId,
      listAgentName: agentName,
      listAgentEmail: agentEmail,
      listAgentPhone: agentPhone,
      listOfficeName: 'Mallan Real Estate',
      listOfficePhone: '(646) 258-4460',
      coListAgentId: null,
      coListAgentName: null,
    },

    buyer: {
      buyerAgentCompensation: listingType === 'rent' ? 'One Month' : '3%',
      buyerAgentCompensationType: listingType === 'rent' ? 'Fixed' : 'Percentage',
      buyerAgentId: null,
      buyerAgentName: null,
      buyerFinancing: null,
      closeDate: null,
    },

    media: {
      images: [
        {
          url: row.image_url || '/images/listing-placeholder.jpg',
          caption: 'Primary Photo',
          order: 1,
          isPrimary: true,
        },
      ],
      floorPlanUrl: row.floor_plan_url || null,
      virtualTourUrl: row.virtual_tour_url || null,
      videoUrl: null,
    },

    description: row.description || `${parseInt(row.bedrooms) || 1}-bedroom ${propertyType.toLowerCase()} in ${row.neighborhood || 'New York City'}.`,

    privateRemarks: null,
    showingRemarks: null,
    openHouse: null,

    flags: {
      isExclusive: false,
      isFeatured: false,
      isNewListing: true,
      isPriceReduced: false,
      isOpenHouse: false,
      participantOnlyNetwork: false,
    },

    compliance: {
      idxOptOut: false,
      vowOptOut: false,
      syndicationOptOut: false,
      lastVerified: timestamp,
    },
  };

  return listing;
}

/**
 * POST /api/admin/listings/upload
 * Accepts CSV file upload and imports listings
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file provided' },
        { status: 400 }
      );
    }

    // Read file content
    const text = await file.text();
    const { headers, rows } = parseCSV(text);

    // Validate required columns
    const requiredColumns = ['address', 'price', 'bedrooms', 'bathrooms', 'listing_type', 'status'];
    const missingColumns = requiredColumns.filter((col) => !headers.includes(col));

    if (missingColumns.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Missing required columns: ${missingColumns.join(', ')}`,
          errors: [`Required columns: ${requiredColumns.join(', ')}`],
        },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No data rows found in CSV' },
        { status: 400 }
      );
    }

    // Convert CSV rows to listing objects
    const newListings = rows.map((row, index) => csvRowToListing(row, index));

    // Read existing listings
    const listingsPath = path.join(process.cwd(), 'data', 'listings.json');
    let existingData: { listings: ListingData[]; _comment?: string; _schema_version?: string; _last_updated?: string };

    try {
      const existingContent = await fs.readFile(listingsPath, 'utf-8');
      existingData = JSON.parse(existingContent);
    } catch {
      existingData = { listings: [] };
    }

    // Append new listings
    existingData.listings = [...existingData.listings, ...newListings];
    existingData._last_updated = new Date().toISOString();

    // Write updated listings
    await fs.writeFile(listingsPath, JSON.stringify(existingData, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${newListings.length} listings`,
      imported: newListings.length,
    });
  } catch (error) {
    console.error('CSV upload error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to process CSV file',
        errors: [String(error)],
      },
      { status: 500 }
    );
  }
}
