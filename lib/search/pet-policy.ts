/**
 * How the public site reads Cotality's PetsAllowed answers: one place, so the search filter, the search projection, the listing page and the building pages cannot disagree.
 *
 * PetsAllowed is a multi-valued RESO field. Its live members (data/cotality-enums.live.json, a mirror of the live metadata) are BirdsOk, BreedRestrictions, BuildingBreedRestrictions,
 * BuildingCatsOk, BuildingDogsOk, BuildingNo, BuildingNumberLimit, BuildingSizeLimit, BuildingYes, Call, CatsOk, ChickensOk, Conditional, DogsOk, FishOk, Negotiable, No,
 * NoBreedRestrictions, NoDogs, NoPetRestrictions, NoSizeLimit, NumberLimit, Other, OwnerOnly, PetDeposit, PetFee, PetRestrictions, ReptileOk, SeeRemarks, SizeLimit and Yes.
 * Exactly two of them say there are no pets: `No` and `BuildingNo`. The others say pets are allowed, allowed on conditions, or something else (Call, SeeRemarks, Other).
 *
 * What this replaces: four copies of the substring test `!value.includes("no") || value.includes("catsok") || value.includes("dogsok")` (the DB post-filter, the Trestle post-filter and
 * two places of the search projection). A substring "no" is in `NoPetRestrictions`, `NoBreedRestrictions`, `NoSizeLimit` and `NoDogs`, so the answers that say pets are welcome with no
 * restriction were read as "no pets". And the listing page stripped a trailing "Yes" / "No" from every answer, so `Yes`, `No`, `BuildingYes` and `BuildingNo` printed nothing at all, and
 * `NoDogs` printed "Dogs Ok" (found 2026-10-09 by the review Maya pasted; the page's output for every member was run, not read).
 *
 * `NoDogs` counts as pet-friendly (cats may be allowed): Maya's answer of 2026-10-09 ("Yes (Recommended)", with that default stated in the question).
 * UNRESOLVED - LIVE COTALITY/REBNY CONTRACT EVIDENCE REQUIRED if the RLS data rules read it otherwise; the rule text was not supplied.
 *
 * Listings saved by the CRM Add forms before 2026-10-09 may still hold the old `Unit*` spellings (UnitYes, UnitNo, UnitCatsOK, UnitDogsOK, UnitBreedRestrictions, UnitSizeLimit,
 * UnitNumberLimit): they are read the way the forms meant them.
 */

/** Letters only, lower case: "Building Cats Ok", "BuildingCatsOk" and "buildingcatsok" are one answer. */
function key(answer: string): string {
  return answer.toLowerCase().replace(/[^a-z]/g, "");
}

/** The answers that say there are no pets: the two live members, the old Unit spelling, and the older free-text spellings the listing page already read as "no". */
const NO_PETS = new Set(["no", "buildingno", "unitno", "none", "nopets", "notallowed", "petsnotallowed", "nopetsallowed"]);

/** Answers with a fixed reader-facing label (the live members that need one, their old Unit spellings, and the older free-text spellings). */
const LABELS: Record<string, string> = {
  yes: "Pets Allowed", buildingyes: "Pets Allowed", unityes: "Pets Allowed", allowed: "Pets Allowed", permitted: "Pets Allowed",
  no: "No Pets", buildingno: "No Pets", unitno: "No Pets", nopets: "No Pets", notallowed: "No Pets", petsnotallowed: "No Pets", nopetsallowed: "No Pets",
  catsok: "Cats Ok", buildingcatsok: "Cats Ok", unitcatsok: "Cats Ok",
  dogsok: "Dogs Ok", buildingdogsok: "Dogs Ok", unitdogsok: "Dogs Ok",
  nodogs: "No Dogs",
  restricted: "Pets Conditional", conditional: "Pets Conditional",
};

/** Answers that say nothing a reader needs: not shown. */
const NOT_SHOWN = new Set(["none", "other"]);

/** The answers of a PetsAllowed value: a comma-separated string ("CatsOk,DogsOk"), a list of answers, or nothing. Blank entries are dropped. */
export function petAnswers(raw: unknown): string[] {
  const parts: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string") parts.push(...value.split(/[,;|]/));
  };
  if (Array.isArray(raw)) raw.forEach(add);
  else add(raw);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** True for an answer that says there are no pets: `No` and `BuildingNo` (and the old `UnitNo`, "No Pets", "Not Allowed"). */
export function isNoPetsAnswer(answer: string): boolean {
  return NO_PETS.has(key(answer));
}

/**
 * True when the policy lets some pet in: at least one answer that is not a "no pets" answer. A policy with no answer at all (unknown) is not pet-friendly, as before.
 * `Yes,CatsOk`, `NoPetRestrictions`, `NoDogs`, `Call` and `SeeRemarks` are; `No` and `BuildingNo` are not; `BuildingNo,CatsOk` is (the cats answer).
 */
export function allowsPets(raw: unknown): boolean {
  const answers = petAnswers(raw);
  return answers.length > 0 && answers.some((answer) => !isNoPetsAnswer(answer));
}

/** The reader-facing label of one answer: "Yes" is "Pets Allowed", "BuildingNo" is "No Pets", "NoDogs" is "No Dogs", and any other member is its own words ("BuildingSizeLimit" is "Size Limit"). */
export function petAnswerLabel(answer: string): string {
  const known = LABELS[key(answer)];
  if (known) return known;
  return answer.trim().replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^(Building|Unit)\s+/, "").trim();
}

/** The labels of all the answers that are worth showing, once each, in the order given; an empty list when there is nothing to show. The building pages list these. */
export function petPolicyLabels(raw: unknown): string[] {
  const labels: string[] = [];
  for (const answer of petAnswers(raw)) {
    if (NOT_SHOWN.has(key(answer))) continue;
    const label = petAnswerLabel(answer);
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

/** The labels of petPolicyLabels joined for display; "" when there is nothing to show. */
export function formatPetPolicy(raw: unknown): string {
  return petPolicyLabels(raw).join(", ");
}

/** What a listing page shows for a pet policy: the label line and whether the policy lets pets in; null when there is nothing to show (the section stays out). */
export function petPolicyView(raw: unknown): { label: string; allowed: boolean } | null {
  const label = formatPetPolicy(raw);
  if (!label) return null;
  return { label, allowed: allowsPets(raw) };
}
