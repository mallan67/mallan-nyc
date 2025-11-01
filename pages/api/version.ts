import type { NextApiRequest, NextApiResponse } from "next";
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    url: process.env.VERCEL_URL || null,
    node: process.version,
    hasDbUrl: Boolean(process.env.DATABASE_URL),
  });
}