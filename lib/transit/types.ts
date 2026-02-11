/**
 * Transit & Commute Tool — Type Definitions
 * Covers MTA Subway, PATH, NYC Ferry, SI Ferry, SIR
 */

export type TransitType = 'subway' | 'path' | 'ferry' | 'sir';

export interface TransitStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: TransitType;
  lines: string[];
  borough: string;
  ada: boolean;
}

export interface NearbyStation {
  station: TransitStation;
  distanceMeters: number;
  distanceMiles: number;
  walkMinutes: number;
}

export type ArrivalDirection = 'Uptown' | 'Downtown' | 'Inbound' | 'Outbound';

export interface TrainArrival {
  line: string;
  destination: string;
  direction: ArrivalDirection;
  arrivalTime: number; // unix timestamp
  minutesAway: number;
}

export interface StationArrivalsData {
  stationId: string;
  stationName: string;
  arrivals: TrainArrival[];
  lastUpdated: number;
  feedStatus: 'ok' | 'unavailable';
}

export interface CommuteStep {
  mode: 'walk' | 'transit' | 'transfer';
  instruction: string;
  duration: number; // minutes
  line?: string;
  fromStation?: string;
  toStation?: string;
}

export interface CommuteResult {
  totalMinutes: number;
  steps: CommuteStep[];
  linesUsed: string[];
  departureTime: string;
  arrivalTime: string;
}

export interface NearbyTransitResponse {
  stations: NearbyStation[];
  transitScore: number;
  borough: string;
}
