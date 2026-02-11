/**
 * MTA GTFS-RT Feed URL Mapping
 * Maps subway lines to their respective GTFS-Realtime feed endpoints
 * See: https://api.mta.info/#/subwayRealTimeFeeds
 */

const MTA_BASE = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F';

export const GTFS_FEEDS: Record<string, { url: string; lines: string[] }> = {
  'gtfs': {
    url: `${MTA_BASE}gtfs`,
    lines: ['1', '2', '3', '4', '5', '6', '7', 'S'],
  },
  'gtfs-ace': {
    url: `${MTA_BASE}gtfs-ace`,
    lines: ['A', 'C', 'E'],
  },
  'gtfs-bdfm': {
    url: `${MTA_BASE}gtfs-bdfm`,
    lines: ['B', 'D', 'F', 'M'],
  },
  'gtfs-g': {
    url: `${MTA_BASE}gtfs-g`,
    lines: ['G'],
  },
  'gtfs-jz': {
    url: `${MTA_BASE}gtfs-jz`,
    lines: ['J', 'Z'],
  },
  'gtfs-nqrw': {
    url: `${MTA_BASE}gtfs-nqrw`,
    lines: ['N', 'Q', 'R', 'W'],
  },
  'gtfs-l': {
    url: `${MTA_BASE}gtfs-l`,
    lines: ['L'],
  },
  'gtfs-si': {
    url: `${MTA_BASE}gtfs-si`,
    lines: ['SIR'],
  },
};

export const PATH_FEED_URL = 'https://path.api.hudsonyards.dev/api/v1/path/gtfs-rt';

/**
 * Given a set of subway lines, returns the feed IDs needed to fetch arrivals
 */
export function getFeedIdsForLines(lines: string[]): string[] {
  const feedIds = new Set<string>();
  for (const line of lines) {
    for (const [feedId, config] of Object.entries(GTFS_FEEDS)) {
      if (config.lines.includes(line)) {
        feedIds.add(feedId);
      }
    }
  }
  return Array.from(feedIds);
}

/**
 * Get the feed URL for a specific feed ID
 */
export function getFeedUrl(feedId: string): string | null {
  return GTFS_FEEDS[feedId]?.url ?? null;
}

/**
 * Subway direction labels based on line
 */
export const DIRECTION_LABELS: Record<string, [string, string]> = {
  '1': ['Uptown & The Bronx', 'Downtown & South Ferry'],
  '2': ['Uptown & The Bronx', 'Downtown & Brooklyn'],
  '3': ['Uptown & Harlem', 'Downtown & Brooklyn'],
  '4': ['Uptown & The Bronx', 'Downtown & Brooklyn'],
  '5': ['Uptown & The Bronx', 'Downtown & Brooklyn'],
  '6': ['Uptown & The Bronx', 'Downtown & Brooklyn Bridge'],
  '7': ['Flushing-bound', 'Manhattan-bound'],
  'A': ['Uptown & The Bronx', 'Downtown & Brooklyn'],
  'C': ['Uptown', 'Downtown & Brooklyn'],
  'E': ['Jamaica-bound', 'World Trade Center-bound'],
  'B': ['Uptown & The Bronx', 'Downtown & Brooklyn'],
  'D': ['Uptown & The Bronx', 'Downtown & Brooklyn'],
  'F': ['Jamaica-bound', 'Coney Island-bound'],
  'M': ['Middle Village-bound', 'Manhattan-bound'],
  'G': ['Queens-bound', 'Brooklyn-bound'],
  'J': ['Jamaica-bound', 'Manhattan-bound'],
  'Z': ['Jamaica-bound', 'Manhattan-bound'],
  'L': ['Canarsie-bound', '8 Ave-bound'],
  'N': ['Astoria-bound', 'Coney Island-bound'],
  'Q': ['Uptown & 96 St', 'Downtown & Coney Island'],
  'R': ['Queens-bound', 'Brooklyn-bound'],
  'W': ['Astoria-bound', 'Whitehall St-bound'],
  'S': ['Times Sq-bound', 'Grand Central-bound'],
  'SIR': ['Tottenville-bound', 'St George-bound'],
};
