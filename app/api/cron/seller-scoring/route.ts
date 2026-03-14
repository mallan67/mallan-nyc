// Fixed: was POST-only (Vercel Cron sends GET)
import { createCronHandler } from '@/lib/api/cron-handler';
import { batchRescore } from '@/lib/seller-readiness/scorer';

export const dynamic = 'force-dynamic';

export const { GET } = createCronHandler('seller-scoring', () => batchRescore(50));
