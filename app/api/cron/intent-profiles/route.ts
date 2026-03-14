// Fixed: was POST-only (Vercel Cron sends GET)
import { createCronHandler } from '@/lib/api/cron-handler';
import { batchRecompute } from '@/lib/buyer-intent/profiler';

export const dynamic = 'force-dynamic';

export const { GET } = createCronHandler('intent-profiles', () => batchRecompute(50));
