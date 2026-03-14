import { createCronHandler } from '@/lib/api/cron-handler';
import { batchComputeConvictionScores } from '@/lib/conviction/scorer';

export const dynamic = 'force-dynamic';

export const { GET } = createCronHandler('conviction-scores', () => batchComputeConvictionScores());
