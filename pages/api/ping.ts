// pages/api/ping.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    ok: true,
    route: 'pages/api/ping.ts',
    now: new Date().toISOString(),
    youSent: req.query,
  });
}
