import schoolData from '@/data/neighborhood-schools.json';

/**
 * School facts for the neighborhood guides (Master 21.12, 21.11, 23.10).
 *
 * The only source is data/neighborhood-schools.json, produced by scripts/refresh-neighborhood-schools.js from the
 * NYC Department of City Planning Facilities Database. The rule is the same for every guide: every school record
 * with one of the guide's ZIP codes, none omitted, ordered by name. Nothing is ranked, scored or chosen by quality.
 */
export interface SchoolRecord {
  id: string;
  name: string;
  /** '' when the source record has no address */
  address: string;
  zip: string;
  /** "Elementary", "Middle", "High", "K-8", "Secondary", "K-12" or "Ungraded" */
  level: string;
  sector: 'public' | 'charter';
}

interface SchoolDataFile {
  source: {
    publisher: string;
    dataset: string;
    datasetId: string;
    url: string;
    recordsUpdated: string;
    retrieved: string;
  };
  zips: Record<string, Array<Omit<SchoolRecord, 'zip'>>>;
}

const data = schoolData as unknown as SchoolDataFile;

export const SCHOOL_SOURCE = data.source;

/** The Department of Education's own address-based school search. */
export const DOE_SCHOOL_SEARCH_URL = 'https://schoolsearch.schools.nyc/';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-07-16" -> "July 2026" */
function monthYear(iso: string): string {
  const [year, month] = iso.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** When the City Planning dataset was last updated. */
export function schoolRecordsUpdatedLabel(): string {
  return monthYear(SCHOOL_SOURCE.recordsUpdated);
}

/** When this list was taken from it. */
export function schoolListRetrievedLabel(): string {
  return monthYear(SCHOOL_SOURCE.retrieved);
}

/** Every school record for the given ZIP codes, once each, ordered by name. */
export function schoolsForZipCodes(zipCodes: readonly string[]): SchoolRecord[] {
  const seen = new Set<string>();
  const out: SchoolRecord[] = [];
  for (const zip of zipCodes) {
    for (const s of data.zips[zip] ?? []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({ ...s, zip });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }) || a.address.localeCompare(b.address, 'en', { numeric: true }));
}
