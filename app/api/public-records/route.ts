import { NextRequest, NextResponse } from 'next/server';

// NYC Open Data (Socrata) endpoints — free, no key required (rate-limited)
const ACRIS_MASTER = 'https://data.cityofnewyork.us/resource/bnx9-e6tj.json';
const ACRIS_PARTIES = 'https://data.cityofnewyork.us/resource/636b-3b5g.json';
const DOB_VIOLATIONS = 'https://data.cityofnewyork.us/resource/3h2n-5cm9.json';
const DOB_COMPLAINTS = 'https://data.cityofnewyork.us/resource/eabe-havv.json';
const PROPERTY_ASSESSMENT = 'https://data.cityofnewyork.us/resource/8y4t-faws.json';

// In-memory cache: bbl → { data, timestamp }
const recordsCache = new Map<string, { data: PublicRecordsResponse; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface AcrisDocument {
  type: string;
  date: string;
  parties: string[];
  amount?: string;
}

interface DobSummary {
  status: 'good-standing' | 'issues' | 'unknown';
  activeViolations: number;
  openComplaints: number;
  recentPermits: number;
  details: string;
}

interface TaxAssessment {
  assessedValue: number | null;
  taxRate: string;
  annualTax: number | null;
  monthlyTax: number | null;
  taxYear: string;
  confirmed: boolean;
}

interface PublicRecordsResponse {
  acris: AcrisDocument[];
  dob: DobSummary;
  tax: TaxAssessment;
  bbl: string;
  lastFetched: string;
}

async function fetchJSON(url: string): Promise<unknown[]> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// Map document type codes to readable names
function docTypeName(code: string): string {
  const types: Record<string, string> = {
    'DEED': 'Deed',
    'DEEDO': 'Deed',
    'RPTT&RET': 'Transfer Tax',
    'MTGE': 'Mortgage',
    'AGMT': 'Agreement',
    'ASST': 'Assignment',
    'SAT': 'Satisfaction of Mortgage',
    'CMTGE': 'Consolidated Mortgage',
    'AL&R': 'Assignment of Leases & Rents',
    'UCC1': 'UCC Filing',
    'POWER': 'Power of Attorney',
    'CORRDE': 'Corrected Deed',
    'MCON': 'Mortgage Consolidation',
  };
  return types[code] || code;
}

async function fetchAcris(borough: string, block: string, lot: string): Promise<AcrisDocument[]> {
  // Fetch document master records for this BBL
  const masterUrl = `${ACRIS_MASTER}?borough=${borough}&block=${block.padStart(5, '0')}&lot=${lot.padStart(4, '0')}&$order=document_date DESC&$limit=10`;
  const masterData = (await fetchJSON(masterUrl)) as Array<Record<string, string>>;

  if (masterData.length === 0) return [];

  // For each document, try to get parties
  const docs: AcrisDocument[] = [];

  for (const doc of masterData.slice(0, 8)) {
    const docId = doc.document_id;
    const docType = docTypeName(doc.doc_type || '');
    const date = doc.document_date
      ? new Date(doc.document_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    const amount = doc.document_amt && parseFloat(doc.document_amt) > 0
      ? `$${parseFloat(doc.document_amt).toLocaleString()}`
      : undefined;

    // Fetch parties for this document
    let parties: string[] = [];
    if (docId) {
      const partiesUrl = `${ACRIS_PARTIES}?document_id=${docId}&$limit=4`;
      const partiesData = (await fetchJSON(partiesUrl)) as Array<Record<string, string>>;
      parties = partiesData.map((p) => p.name || '').filter(Boolean).slice(0, 3);
    }

    docs.push({ type: docType, date, parties, amount });
  }

  return docs;
}

async function fetchDob(borough: string, houseNumber: string, street: string): Promise<DobSummary> {
  // Borough code for DOB: Manhattan=1 etc matches our BBL borough
  const boroCode = borough;

  // Fetch active violations
  const violUrl = `${DOB_VIOLATIONS}?boro=${boroCode}&house__=${houseNumber}&street=${encodeURIComponent(street)}&$where=violation_status != 'RESOLVE'&$limit=100`;
  const violations = (await fetchJSON(violUrl)) as Array<Record<string, string>>;
  const activeViolations = violations.length;

  // Fetch open complaints
  const compUrl = `${DOB_COMPLAINTS}?community_board=${boroCode}&house_number=${houseNumber}&house_street=${encodeURIComponent(street)}&$where=status='OPEN'&$limit=100`;
  const complaints = (await fetchJSON(compUrl)) as Array<Record<string, string>>;
  const openComplaints = complaints.length;

  let status: DobSummary['status'] = 'unknown';
  let details = 'Unable to determine building status';

  if (activeViolations === 0 && openComplaints === 0) {
    status = 'good-standing';
    details = 'No active violations or open complaints on file';
  } else {
    status = 'issues';
    const parts = [];
    if (activeViolations > 0) parts.push(`${activeViolations} active violation${activeViolations > 1 ? 's' : ''}`);
    if (openComplaints > 0) parts.push(`${openComplaints} open complaint${openComplaints > 1 ? 's' : ''}`);
    details = parts.join(', ');
  }

  return { status, activeViolations, openComplaints, recentPermits: 0, details };
}

async function fetchTax(borough: string, block: string, lot: string): Promise<TaxAssessment> {
  const boroNames: Record<string, string> = {
    '1': 'MN', '2': 'BX', '3': 'BK', '4': 'QN', '5': 'SI',
  };
  const boroAbbr = boroNames[borough] || 'MN';

  // PLUTO data for actual assessment
  const url = `${PROPERTY_ASSESSMENT}?borocode=${borough}&block=${block}&lot=${lot}&$limit=1`;
  const data = (await fetchJSON(url)) as Array<Record<string, string>>;

  if (data.length === 0) {
    // Fallback: try with padded block/lot
    const url2 = `${PROPERTY_ASSESSMENT}?bbl=${borough}${block.padStart(5, '0')}${lot.padStart(4, '0')}&$limit=1`;
    const data2 = (await fetchJSON(url2)) as Array<Record<string, string>>;

    if (data2.length === 0) {
      return {
        assessedValue: null,
        taxRate: '',
        annualTax: null,
        monthlyTax: null,
        taxYear: '',
        confirmed: false,
      };
    }

    void boroAbbr;
    const record = data2[0];
    const assessed = parseFloat(record.assesstot || '0');
    const annualTax = parseFloat(record.taxamt || '0') || null;

    return {
      assessedValue: assessed || null,
      taxRate: '',
      annualTax,
      monthlyTax: annualTax ? Math.round(annualTax / 12) : null,
      taxYear: record.year || '',
      confirmed: annualTax !== null && annualTax > 0,
    };
  }

  const record = data[0];
  const assessed = parseFloat(record.assesstot || '0');
  const annualTax = parseFloat(record.taxamt || '0') || null;

  void boroAbbr;

  return {
    assessedValue: assessed || null,
    taxRate: '',
    annualTax,
    monthlyTax: annualTax ? Math.round(annualTax / 12) : null,
    taxYear: record.year || '',
    confirmed: annualTax !== null && annualTax > 0,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const bbl = searchParams.get('bbl') || '';
  const houseNumber = searchParams.get('houseNumber') || '';
  const street = searchParams.get('street') || '';

  if (!bbl) {
    return NextResponse.json({ error: 'bbl is required' }, { status: 400 });
  }

  // Check cache
  const cacheKey = bbl;
  const cached = recordsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // Parse BBL: "1-01234-0056" → borough=1, block=01234, lot=0056
  const parts = bbl.split('-');
  if (parts.length !== 3) {
    return NextResponse.json({ error: 'Invalid BBL format' }, { status: 400 });
  }
  const [borough, block, lot] = parts;

  // Fetch all three in parallel
  const [acris, dob, tax] = await Promise.all([
    fetchAcris(borough, block, lot),
    fetchDob(borough, houseNumber, street),
    fetchTax(borough, block, lot),
  ]);

  const result: PublicRecordsResponse = {
    acris,
    dob,
    tax,
    bbl,
    lastFetched: new Date().toISOString(),
  };

  recordsCache.set(cacheKey, { data: result, timestamp: Date.now() });

  return NextResponse.json(result);
}
