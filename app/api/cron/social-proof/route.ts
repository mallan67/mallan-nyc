import { createCronHandler } from '@/lib/api/cron-handler';
import { batchComputeSocialProof } from '@/lib/social-proof/aggregator';

export const dynamic = 'force-dynamic';

export const { GET } = createCronHandler('social-proof', () => batchComputeSocialProof());
