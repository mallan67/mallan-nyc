// Fixed: was POST-only (Vercel Cron sends GET)
import { createCronHandler } from '@/lib/api/cron-handler';
import { batchReindex } from '@/lib/demand-heatmap/indexer';

export const dynamic = 'force-dynamic';

export const { GET } = createCronHandler('demand-signals', () => batchReindex());
