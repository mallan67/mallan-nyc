// Pure classification of an agent's ethics-training RECORD for administrative
// reporting (UCBA Art. III §6). No DB, no throwing, no enforcement — this is
// used only by the read-only broker report and its tests.
//
// A record is "current" ONLY when it is COMPLETE and not expired:
//   - ethics_training_completed_at IS NOT NULL   (training actually recorded)
//   - ethics_training_expires_at   IS NOT NULL   (an expiry is on file)
//   - ethics_training_expires_at   >= now        (not past)
//
// Every other shape needs broker follow-up. In particular, a FUTURE expiry with
// NO completion date is INCOMPLETE (e.g. a placeholder expiry that a prior tool
// may have written) and must NOT be reported as current.

export type EthicsTrainingStatus = "current" | "follow_up";

/** Why a record needs follow-up (null when current). */
export type EthicsFollowUpReason =
  | "missing_completion"
  | "missing_expiry"
  | "expired"
  | null;

export interface EthicsTrainingRecord {
  completedAt: Date | null;
  expiresAt: Date | null;
}

/** The follow-up reason, or null when the record is complete and unexpired. */
export function ethicsFollowUpReason(
  record: EthicsTrainingRecord,
  now: Date,
): EthicsFollowUpReason {
  if (record.completedAt == null) return "missing_completion";
  if (record.expiresAt == null) return "missing_expiry";
  if (record.expiresAt.getTime() < now.getTime()) return "expired";
  return null;
}

/** "current" only when complete AND unexpired; otherwise "follow_up". */
export function classifyEthicsTraining(
  record: EthicsTrainingRecord,
  now: Date,
): EthicsTrainingStatus {
  return ethicsFollowUpReason(record, now) === null ? "current" : "follow_up";
}
