// Direct-Neon branch-prune health policy is retired.
//
// PR #632 quarantined the direct Neon prune writer and removed its Vercel cron.
// This compatibility module intentionally returns no operational issues so stale
// imports cannot tell operators to provision NEON_API_KEY/NEON_PROJECT_ID or
// restart a retired direct-Neon control path.
//
// Current branch/resource health belongs to the authorized Vercel-managed Neon path.
function deriveBranchPruneIssues() {
  return [];
}

module.exports = { deriveBranchPruneIssues };
