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
 *
 * WORDING (compliance review of 2026-10-09): a public "No Pets" with a cross is a statement Mallan publishes about a limitation, and NYC's own guidance treats "no pets" / "no animals" policies as
 * subject to reasonable accommodation for assistance animals (42 U.S.C. 3604(c), (f)(3)(B); NY Executive Law 296(5); NYC Admin Code 8-107(5); the firm's own Fair Housing scanner flags the phrase). So an
 * answer that says there are no pets is shown as the listing's statement ("Not allowed per the listing"), nothing on the public site marks any answer with a tick or a cross, and the listing page
 * adds ASSISTANCE_ANIMAL_NOTE under the policy. The wording is a default for Maya or counsel to approve. UNRESOLVED - LIVE COTALITY/REBNY CONTRACT EVIDENCE REQUIRED for REBNY's own display rule.
 */

/** What an answer that says there are no pets reads as: the listing's statement, not Mallan's. */
export const NO_PETS_LABEL = "Not allowed per the listing";

/** Said under the Pet Policy of a listing page (the first sentence is NYC CCHR's guidance on animals that are not pets; the second names where the request goes). */
export const ASSISTANCE_ANIMAL_NOTE = "Assistance animals are not pets. Ask the listing broker about a reasonable accommodation.";

/** Letters only, lower case: "Building Cats Ok", "BuildingCatsOk" and "buildingcatsok" are one answer. */
function key(answer: string): string {
  return answer.toLowerCase().replace(/[^a-z]/g, "");
}

/** The answers that say there are no pets: the two live members, the old Unit spelling, and the older free-text spellings the listing page already read as "no". */
const NO_PETS = new Set(["no", "buildingno", "unitno", "none", "nopets", "notallowed", "petsnotallowed", "nopetsallowed"]);

/** Answers with a fixed reader-facing label (the live members that need one, their old Unit spellings, and the older free-text spellings). */
const LABELS: Record<string, string> = {
  yes: "Pets Allowed", buildingyes: "Pets Allowed", unityes: "Pets Allowed", allowed: "Pets Allowed", permitted: "Pets Allowed",
  no: NO_PETS_LABEL, buildingno: NO_PETS_LABEL, unitno: NO_PETS_LABEL, nopets: NO_PETS_LABEL, notallowed: NO_PETS_LABEL, petsnotallowed: NO_PETS_LABEL, nopetsallowed: NO_PETS_LABEL,
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

/** Answers that say nothing about whether a pet may come in: they send the reader to the remarks or to the broker. Alone they count as pet-friendly (Maya: only No and BuildingNo mean no pets). */
const NEUTRAL = new Set(["other", "call", "seeremarks"]);

/** Answers that limit one kind of pet and so do not say a pet may come in. Alone they count as pet-friendly (cats may be allowed: Maya's answer on NoDogs). */
const LIMITS_ONE_KIND = new Set(["nodogs"]);

/** An answer about the building (`BuildingYes`, `BuildingCatsOk`, `BuildingNo` ...): the live PetsAllowed list carries these beside the unit's own answers (`Yes`, `CatsOk`, `No` ...). */
function isBuildingAnswer(answerKey: string): boolean {
  return answerKey.startsWith("building");
}

/**
 * True when the policy lets some pet in. A policy with no answer at all (unknown) is not pet-friendly, as before.
 * Without a "no pets" answer, any answer counts: `Yes,CatsOk`, `NoPetRestrictions`, `NoDogs`, `Call`, `SeeRemarks` and `Other` are pet-friendly.
 * With one (`No`, `BuildingNo`), the no stands unless another answer POSITIVELY lets a pet in: `No,Other`, `No,Call`, `No,SeeRemarks` and `No,NoDogs` are not pet-friendly (an answer that says
 * nothing, or that only limits one kind of pet, cannot overrule an explicit no: found by the code review of 2026-10-09, which ran `No,Other` as pet-friendly under a "Not allowed" label);
 * `BuildingNo,CatsOk` and `No,Yes` are (the answer that lets a pet in, kept from the first version).
 * The unit's own no is not overruled by an answer about the building: `BuildingYes,No` and `BuildingYes,BuildingCatsOk,No` are not pet-friendly, because the building may take pets while this
 * unit's listing says no. That pairing is common in the live feed (44 of the first 200 rentals and 75 of the first 200 sales that the preview of 3aff9efb returned on 2026-10-10 were `BuildingYes,No`),
 * and `main` did not list it as pet-friendly (its substring test saw the "no"); counting the building's yes as the positive answer widened the filter without evidence. UNRESOLVED - LIVE
 * COTALITY/REBNY CONTRACT EVIDENCE REQUIRED for how the RLS data rules read a record that says both.
 */
export function allowsPets(raw: unknown): boolean {
  const keys = petAnswers(raw).map(key);
  if (keys.length === 0) return false;
  if (!keys.some((k) => NO_PETS.has(k))) return true;
  const unitSaysNo = keys.some((k) => NO_PETS.has(k) && !isBuildingAnswer(k));
  return keys.some((k) => !NO_PETS.has(k) && !NEUTRAL.has(k) && !LIMITS_ONE_KIND.has(k) && !(unitSaysNo && isBuildingAnswer(k)));
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

/**
 * What a listing page shows for a pet policy: the label line, and whether the policy lets pets in (the search verdict; the page marks nothing with a tick or a cross, see WORDING above);
 * null when there is nothing to show (the section stays out).
 */
export function petPolicyView(raw: unknown): { label: string; allowed: boolean } | null {
  const label = formatPetPolicy(raw);
  if (!label) return null;
  return { label, allowed: allowsPets(raw) };
}
