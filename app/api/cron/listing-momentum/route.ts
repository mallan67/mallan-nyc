import { createCronHandler } from '@/lib/api/cron-handler';
import { batchComputeListingMomentum } from '@/lib/momentum/scorer';

export const dynamic = 'force-dynamic';

export const { GET } = createCronHandler('listing-momentum', () => batchComputeListingMomentum());
