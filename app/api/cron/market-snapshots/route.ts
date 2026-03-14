// Fixed: was POST-only (Vercel Cron sends GET)
import { createCronHandler } from '@/lib/api/cron-handler';
import { batchComputeSnapshots } from '@/lib/market-pulse/snapshot';

export const dynamic = 'force-dynamic';

export const { GET } = createCronHandler('market-snapshots', () => batchComputeSnapshots());
