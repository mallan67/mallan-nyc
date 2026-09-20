#!/usr/bin/env tsx
/**
 * QUARANTINED_DIRECT_NEON_CONTROL
 *
 * This command formerly listed/deleted Neon branches directly using
 * NEON_API_KEY + NEON_PROJECT_ID. Mallan Neon lifecycle control is Vercel-managed,
 * so this direct provider path is intentionally non-operational.
 *
 * Keep the entrypoint temporarily so old operator instructions fail loudly instead
 * of silently finding another provider path. It performs no provider read or write.
 */
export async function runPruneCli(
  _argv: string[],
  _env: Record<string, string | undefined>,
): Promise<number> {
  console.error(
    "[neon-prune-branches] QUARANTINED_DIRECT_NEON_CONTROL: direct Neon branch control is disabled. " +
      "Use the Vercel-managed Neon resource path through an authorized Git control packet.",
  );
  return 2;
}

const entry = process.argv[1] ?? "";
if (/neon-prune-branches\.(ts|mjs|js)$/.test(entry)) {
  runPruneCli(process.argv.slice(2), process.env)
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
