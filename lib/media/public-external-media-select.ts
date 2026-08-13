/**
 * Narrow, shared Prisma relation shape for canonical hosted video/tour links.
 *
 * Every production `dbListingToPublicDTO` reader spreads this into its existing
 * listing query. That keeps the read batched (zero composer queries / no N+1),
 * prevents one surface from silently omitting the authority, and avoids loading
 * timestamps or the parent relation that public composition never consumes.
 */
export const PUBLIC_EXTERNAL_MEDIA_RELATION = {
  select: {
    source: true,
    source_key: true,
    url: true,
    branded: true,
    kind: true,
  },
} as const;
