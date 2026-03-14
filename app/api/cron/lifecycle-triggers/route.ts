import { createCronHandler } from '@/lib/api/cron-handler';
import { evaluateAllTriggers } from '@/lib/lifecycle/engine';

export const dynamic = 'force-dynamic';

export const { GET } = createCronHandler('lifecycle-triggers', () => evaluateAllTriggers());
