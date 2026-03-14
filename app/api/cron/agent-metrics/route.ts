// Fixed: was POST-only (Vercel Cron sends GET)
import { createCronHandler } from '@/lib/api/cron-handler';
import { batchReindex } from '@/lib/agent-performance/indexer';

export const dynamic = 'force-dynamic';

export const { GET } = createCronHandler('agent-metrics', () => batchReindex());
