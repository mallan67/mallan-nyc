// Fixed: was POST-only (Vercel Cron sends GET)
import { createCronHandler } from '@/lib/api/cron-handler';
import { batchScoreLeads } from '@/lib/lead-scoring/scorer';

export const dynamic = 'force-dynamic';

export const { GET } = createCronHandler('lead-scoring', () => batchScoreLeads(100));
