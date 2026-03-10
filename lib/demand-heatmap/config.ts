import type { DemandSignalType } from './types';

export const SIGNAL_WEIGHTS: Record<DemandSignalType, number> = {
  new_business_license: 0.20,
  liquor_license: 0.10,
  building_permit: 0.20,
  str_registration: 0.15,
  saved_search_activity: 0.20,
  page_view_activity: 0.15,
};

export const SODA_DATASETS = {
  dca_licenses: process.env.SODA_DATASET_DCA_LICENSES || 'w7w3-xahh',
  sla_liquor: process.env.SODA_DATASET_SLA_LIQUOR || 'r7ey-x2pa',
  dob_permits: process.env.SODA_DATASET_DOB_PERMITS!,
  str_registrations: process.env.SODA_DATASET_STR || 'tg4x-b46p',
};

export const COLLECTION_WINDOW_DAYS = 90;
export const SPIKE_THRESHOLD_DELTA = 15; // % change to trigger spike alert
