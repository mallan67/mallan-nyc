// Fair Housing and UCBA wording check for the listing forms' text boxes (SALE-FORM-REDESIGN.html, RENTAL-FORM-REDESIGN.html).
//
// An agent writing a description, showing instructions or remarks sees, as they type, which wording the server will REFUSE (so they can fix it before saving) and which
// words only deserve a second look. Two tiers, kept apart on purpose:
//
//   BLOCKED   the wording the server refuses. The tables in section 1 are GENERATED from the server's own sources (build-fair-housing.cjs) and
//             tests/runtime/crm-fair-housing.test.ts fails when they drift, so this page never calls clean something the server blocks and never calls blocked something
//             the server accepts. What the server does, and what each kind of box here gets of it:
//               - lib/compliance/rls-enforcement.ts FAIR_HOUSING_HARD_BLOCKS (whole-word patterns): every text box whose name looks like free text (the create route scans
//                 any field named remark / description / instruction / headline / comment / note / caption);
//               - lib/compliance/rebny-validator.ts validateFairHousing (the same terms, as plain substrings, so "1,055+ sq ft" holds "55+"): PublicRemarks,
//                 ShowingInstructions, PrivateRemarks;
//               - the UCBA agent-info / off-market / compensation / free-service patterns: PublicRemarks (the main description) only.
//   CHECK     words that can describe WHO a home is for, or who lives near it, rather than the home (race, color, ethnicity, religion, family status, disability, sex,
//             marital status, sexual orientation and gender identity, national origin, source of income, criminal record, neighborhood character) and a few wording habits.
//             The server accepts these (it warns about a few). They are advice, never a block, and they look at the words around the word: "white oak floors",
//             "single-family" and "mature trees" are about the house and are not flagged.
//
// Everything shown is written with textContent: what an agent typed or pasted is never interpreted as markup.
(function (global) {
  'use strict';

  // ── 1. What the server blocks (GENERATED: do not edit by hand) ────────────────────────────────────────────────────────────────────────────────────────────
  // GENERATED from the server's own rules at 72d9091b: lib/compliance/rls-enforcement.ts (HARDCODED_FH_PATTERNS, AGENT_INFO_PATTERNS, OFF_MARKET_PATTERNS,
  // COMPENSATION_PATTERNS), lib/compliance/rebny-field-tables.ts (contentRules.freeService) and data/compliance/prohibited-terms.json. Do not edit by hand:
  // tests/runtime/crm-fair-housing.test.ts reads those files and fails when this block differs.
  var SERVER = {
    "hardcoded": [
      {
        "source": "\\b(whites?\\s+only|no\\s+(blacks?|hispanics?|asians?|mexicans?|africans?))\\b",
        "flags": "i",
        "law": "Federal FHA (Race)"
      },
      {
        "source": "\\b(christian\\s+(home|family|neighborhood)|no\\s+(muslims?|jews?|hindus?|buddhists?))\\b",
        "flags": "i",
        "law": "Federal FHA (Religion)"
      },
      {
        "source": "\\bno\\s+(children|kids|families\\s+with\\s+children)\\b",
        "flags": "i",
        "law": "Federal FHA (Familial Status)"
      },
      {
        "source": "\\b(no\\s+(wheelchairs?|disabled|handicapped)|able[- ]bodied\\s+only)\\b",
        "flags": "i",
        "law": "Federal FHA (Disability)"
      },
      {
        "source": "\\b(males?\\s+only|females?\\s+only|no\\s+(men|women)|men\\s+only|women\\s+only)\\b",
        "flags": "i",
        "law": "Federal FHA (Sex)"
      },
      {
        "source": "\\b(no\\s+(seniors?|elderly|retirees?|young\\s+people)|seniors?\\s+only|under\\s+\\d+\\s+only|over\\s+\\d+\\s+only)\\b",
        "flags": "i",
        "law": "NY HRL (Age)"
      },
      {
        "source": "\\b(no\\s+(married|single|divorced)|married\\s+(couples?\\s+)?only|singles?\\s+only)\\b",
        "flags": "i",
        "law": "NY HRL (Marital Status)"
      },
      {
        "source": "\\b(no\\s+(gay|lesbian|homosexual|lgbtq?)|straight\\s+(couples?\\s+)?only|heterosexual\\s+only)\\b",
        "flags": "i",
        "law": "NY HRL (Sexual Orientation)"
      },
      {
        "source": "\\b(no\\s+(veterans?|military|service\\s*members?)|civilians?\\s+only)\\b",
        "flags": "i",
        "law": "NY HRL (Military/Veteran Status)"
      },
      {
        "source": "\\b(no\\s+(section\\s*8|vouchers?|housing\\s+choice))\\b",
        "flags": "i",
        "law": "NYC HRL Title 8 (Source of Income)"
      },
      {
        "source": "\\b(citizens?\\s+only|no\\s+immigrants?|legal\\s+residents?\\s+only)\\b",
        "flags": "i",
        "law": "NYC HRL Title 8 (Citizenship/Immigration)"
      },
      {
        "source": "\\b(no\\s+criminal|background\\s+check\\s+required|felons?\\s+need\\s+not)\\b",
        "flags": "i",
        "law": "NYC Fair Chance Housing Act"
      },
      {
        "source": "\\b(no\\s+(transgender|trans\\s+people|non[- ]?binary)|cisgender\\s+only)\\b",
        "flags": "i",
        "law": "NYC HRL Title 8 (Gender Identity)"
      },
      {
        "source": "\\b(no\\s+(students?|freelancers?|self[- ]employed|gig\\s+workers?))\\b",
        "flags": "i",
        "law": "NYC HRL Title 8 (Lawful Occupation)"
      },
      {
        "source": "\\b(no\\s+(domestic\\s+partners?|unmarried\\s+couples?))\\b",
        "flags": "i",
        "law": "NYC HRL Title 8 (Partnership Status)"
      },
      {
        "source": "\\b(no\\s+(caregivers?|parents?\\s+with))\\b",
        "flags": "i",
        "law": "NYC HRL Title 8 (Caregiver Status)"
      }
    ],
    "terms": {
      "demographics": {
        "reason": "Fair Housing Act - race, color, national origin",
        "terms": [
          "diverse neighborhood",
          "homogeneous",
          "ethnic enclave",
          "minority area",
          "white neighborhood",
          "black neighborhood",
          "asian community",
          "hispanic area",
          "latino neighborhood",
          "immigrant community",
          "integrated area"
        ]
      },
      "familial_status": {
        "reason": "Fair Housing Act - familial status discrimination",
        "terms": [
          "family-friendly neighborhood",
          "family-friendly",
          "adult community",
          "no children",
          "perfect for families",
          "great schools nearby",
          "top-rated schools",
          "top schools",
          "prime school district",
          "prime school districts",
          "great school district",
          "school district rating",
          "best schools",
          "near schools",
          "excellent schools",
          "kid-friendly",
          "child-friendly",
          "singles area",
          "young professionals only",
          "senior community",
          "retiree neighborhood",
          "empty nesters",
          "adults only",
          "adults preferred",
          "active adult",
          "active adult community",
          "age restricted",
          "age-restricted",
          "55+",
          "55 and older",
          "55 plus"
        ]
      },
      "religion": {
        "reason": "Fair Housing Act - religion discrimination",
        "terms": [
          "near church",
          "close to synagogue",
          "near mosque",
          "near temple",
          "christian community",
          "jewish neighborhood",
          "muslim area",
          "religious community",
          "church walking distance"
        ]
      },
      "disability": {
        "reason": "Fair Housing Act - disability discrimination",
        "terms": [
          "walking distance only",
          "must be able to climb",
          "no wheelchairs",
          "able-bodied only",
          "normal residents"
        ]
      },
      "steering": {
        "reason": "Fair Housing Act - steering/blockbusting",
        "terms": [
          "safe neighborhood",
          "low crime area",
          "dangerous area",
          "high crime",
          "unsafe neighborhood",
          "up-and-coming area",
          "gentrifying",
          "improving neighborhood",
          "transitional area",
          "changing neighborhood",
          "bad part of town",
          "good part of town",
          "wrong side of tracks"
        ]
      },
      "income_source": {
        "reason": "NY State/NYC Human Rights Law - source of income",
        "terms": [
          "no section 8",
          "no vouchers",
          "no welfare",
          "no public assistance",
          "working professionals only",
          "employed only",
          "must have job",
          "no government assistance",
          "no cityfheps",
          "no fheps",
          "no dss",
          "no hra",
          "no housing voucher",
          "no housing vouchers",
          "section 8 not accepted",
          "vouchers not accepted",
          "no subsidies",
          "no cash assistance"
        ]
      },
      "criminal_history": {
        "reason": "NYC Fair Chance for Housing Act (LL 24/2023) - criminal history",
        "terms": [
          "must pass background check",
          "must pass a background check",
          "criminal background check",
          "no felonies",
          "no felons",
          "no convictions",
          "no criminal record",
          "clean criminal record"
        ]
      },
      "exclusive_language": {
        "reason": "May imply discrimination",
        "terms": [
          "exclusive neighborhood",
          "prestigious area",
          "elite community",
          "upscale only",
          "high-end residents",
          "discerning buyers only",
          "select clientele"
        ]
      },
      "price_speculation": {
        "reason": "Investment advice liability",
        "terms": [
          "prices will rise",
          "great investment",
          "guaranteed appreciation",
          "property values increasing",
          "hot market",
          "prices only go up",
          "can't lose money",
          "better than stocks"
        ]
      },
      "nationality_culture": {
        "reason": "May imply national origin preference",
        "terms": [
          "chinatown feel",
          "little italy vibe",
          "ethnic food scene",
          "cultural enclave",
          "immigrant-friendly",
          "speaks your language"
        ]
      }
    },
    "publicRemarks": {
      "agentInfo": {
        "law": "Agent contact information (UCBA Art. I Sec. 5(C))",
        "rules": [
          {
            "source": "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b",
            "flags": ""
          },
          {
            "source": "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b",
            "flags": ""
          },
          {
            "source": "\\bhttps?:\\/\\/\\S+",
            "flags": "i"
          },
          {
            "source": "\\b(contact\\s+me|call\\s+me|listed\\s+by|exclusive\\s+with)\\b",
            "flags": "i"
          }
        ]
      },
      "offMarket": {
        "law": "Off-market language (UCBA Art. I Sec. 5(D))",
        "rules": [
          {
            "source": "\\boff[- ]?market\\b",
            "flags": "i"
          },
          {
            "source": "\\bpocket\\s+listing\\b",
            "flags": "i"
          },
          {
            "source": "\\bwhisper\\s+listing\\b",
            "flags": "i"
          },
          {
            "source": "\\bquiet\\s+listing\\b",
            "flags": "i"
          },
          {
            "source": "\\bpre[- ]?market\\b",
            "flags": "i"
          }
        ]
      },
      "compensation": {
        "law": "Compensation information (UCBA Art. I Sec. 5(E))",
        "rules": [
          {
            "source": "\\b\\d+(\\.\\d+)?%\\s*(commission|co-?broke?)\\b",
            "flags": "i"
          },
          {
            "source": "\\bbuyer\\s+pays?\\s+no\\b",
            "flags": "i"
          },
          {
            "source": "\\bclosing\\s+cost\\s+credit\\b",
            "flags": "i"
          },
          {
            "source": "\\bbonus\\s+commission\\b",
            "flags": "i"
          },
          {
            "source": "\\bseller\\s+concession\\b",
            "flags": "i"
          }
        ]
      },
      "freeService": {
        "law": "Free or no-cost service claim (UCBA Art. I Sec. 5)",
        "rules": [
          {
            "source": "\\b(no\\s*fee|no\\s*cost|free)\\b.{0,40}\\b(broker(age)?|agent|representation|service|commission|fee)\\b",
            "flags": "gi"
          },
          {
            "source": "\\b(broker(age)?|agent|representation|service|commission|fee)\\b.{0,40}\\b(no\\s*fee|no\\s*cost|free)\\b",
            "flags": "gi"
          }
        ]
      }
    }
  };

  // ── 2. Which box is which ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  //   substring   the server also looks for the terms as plain substrings (PublicRemarks, ShowingInstructions, PrivateRemarks)
  //   ucba        what the UCBA wording rules do here: 'blocked' (PublicRemarks), 'review' (public-facing text the server does not scan for them), '' (not public text)
  var KINDS = {
    description: { substring: true, ucba: 'blocked' },
    private: { substring: true, ucba: '' },
    text: { substring: false, ucba: 'review' },
    internal: { substring: false, ucba: '' },
  };
  // id: the text box; flags: where its findings show; saves: the server refuses wording in it when the listing is created (a name that looks like free text)
  var BOXES = [
    { id: 'rentalDescription', flags: 'rentalFairHousingFlags', label: 'Listing Description', kind: 'description', saves: true },
    { id: 'rentalShowingInstructions', flags: 'rentalShowingFlags', label: 'Showing Instructions', kind: 'private', saves: true },
    { id: 'rentalAgentRemarks', flags: 'rentalAgentRemarksFlags', label: 'Agent Remarks', kind: 'private', saves: true },
    { id: 'rentalTHDescription', flags: 'rentalTHFairHousingFlags', label: 'Description (syndication)', kind: 'text', saves: true },
    { id: 'rentalTHLayout', flags: 'rentalTHLayoutFlags', label: 'Layout', kind: 'text', saves: false },
    { id: 'rentalTHNotes', flags: 'rentalTHNotesFlags', label: 'Internal Notes', kind: 'internal', saves: true },
    { id: 'bldgDescription', flags: 'bldgDescriptionFlags', label: 'Building Description', kind: 'text', saves: true },
    { id: 'saleDescription', flags: 'saleFairHousingFlags', label: 'Listing Description', kind: 'description', saves: true },
    { id: 'saleShowingInstructions', flags: 'saleShowingFlags', label: 'Showing Instructions', kind: 'private', saves: true },
    { id: 'saleBrokerComments', flags: 'saleBrokerCommentsFlags', label: 'Broker Comments', kind: 'private', saves: true },
    { id: 'saleTHDescription', flags: 'saleTHDescriptionFlags', label: 'Description (syndication)', kind: 'text', saves: true },
    { id: 'saleTHLayout', flags: 'saleTHLayoutFlags', label: 'Layout', kind: 'text', saves: false },
    { id: 'saleTHFinancing', flags: 'saleTHFinancingFlags', label: 'Financing', kind: 'text', saves: false },
    { id: 'saleTHNotes', flags: 'saleTHNotesFlags', label: 'Internal Notes', kind: 'internal', saves: true },
    { id: 'saleBldgDescription', flags: 'saleBldgDescriptionFlags', label: 'Building Description', kind: 'text', saves: true },
  ];
  function boxFor(textareaId) {
    for (var i = 0; i < BOXES.length; i++) if (BOXES[i].id === textareaId) return BOXES[i];
    return null;
  }
  function kindOf(textareaId) { var box = boxFor(textareaId); return KINDS[box ? box.kind : 'text']; }

  // ── 3. Words to check (the server accepts all of these; they are advice) ─────────────────────────────────────────────────────────────────────────────────
  // Each rule: { id, group, category, advice, re (global), near, skipBefore, skipAt, skipAfter }
  //   group   'fh' (fair housing: every box) | 'ucba' and 'style' (public-facing boxes only)
  //   near    the match counts only when this pattern is found within two words either side (a word like "white" is about people only next to a word about people)
  //   skipBefore / skipAt / skipAfter   the match does not count when its text just before, from its start, or just after it matches ("Landmarks Preservation Commission")
  var GROUP_WORD = '(?:black|white|caucasian|african[- ]americans?|hispanics?|latinos?|latinas?|latinx|asians?|chinese|japanese|korean|indian|pakistani|arabs?|jewish|muslims?|christians?|catholics?|hindus?|buddhists?|sikhs?|irish|italian|polish|russian|greek|mexican|haitian|dominican|caribbean|puerto\\s+rican)';
  var PEOPLE_WORD = '(?:neighbou?rhoods?|communit(?:y|ies)|areas?|enclaves?|districts?|sections?|residents?|tenants?|renters?|buyers?|famil(?:y|ies)|people|folks|crowds?|population|couples?|professionals?|only|preferred|vibe|feel|blocks?|clientele|neighbou?rs?|households?)';
  var SUITED_FOR = '(?:ideal|perfect|great|best|suited|suitable|designed|made|ideally\\s+suited|well[- ]suited)\\s+(?:for|to)\\s+(?:an?\\s+|the\\s+|young\\s+|growing\\s+|small\\s+|large\\s+|single\\s+|working\\s+)*';

  var REVIEW = [
    // ── fair housing: who the home or the neighborhood is described for or about ──
    { id: 'people-group', group: 'fh', category: 'Race, color, ethnicity, national origin or religion',
      advice: 'Describe the home, not the people who live near it or who it would suit.',
      re: new RegExp('\\b' + GROUP_WORD + '\\b', 'gi'), near: new RegExp('\\b' + PEOPLE_WORD + '\\b', 'i'), skipAt: /^white[- ]collar\b/i },
    { id: 'religious-institution', group: 'fh', category: 'Religion',
      advice: 'A church, synagogue, mosque or temple named as a selling point can read as a religious preference. The server blocks "near church" style phrases.',
      re: /\b(?:near|close\s+to|next\s+to|steps\s+from|walking\s+(?:to|distance\s+(?:to|from))|around\s+the\s+corner\s+from|minutes\s+from|blocks?\s+from)\s+(?:an?\s+|the\s+)?(?:[\w'-]+\s+){0,2}(?:church(?:es)?|synagogues?|mosques?|temples?|cathedrals?|chapels?|parish|shuls?)\b/gi,
      skipAfter: /^\s+(?:ave(?:nue)?|st(?:reet)?|rd|road|blvd|boulevard|pl(?:ace)?|way|ln|lane|dr(?:ive)?|sq(?:uare)?|station|stop)\b/i },
    { id: 'suited-for', group: 'fh', category: 'Familial status, age, sex, marital status',
      advice: 'Say what the home has, not who it is for.',
      re: new RegExp('\\b' + SUITED_FOR + '(?:famil(?:y|ies)|kids?|children|couples?|singles?|professionals?|students?|retirees?|seniors?|empty[- ]nesters?|bachelors?|newlyweds?|roommates?|men|women|man|woman|guys?|girls?)\\b', 'gi') },
    { id: 'perfect-for', group: 'fh', category: 'Targeting',
      advice: 'Check what comes after "perfect for" / "ideal for": naming a group of people can imply targeting (the server warns about this wording).',
      re: /\b(?:perfect|ideal)\s+for\b/gi },
    { id: 'occupant', group: 'fh', category: 'Familial status, age',
      advice: 'Avoid naming the kind of person the home is for.',
      re: /\b(?:young\s+(?:professionals?|couples?|famil(?:y|ies)|singles?)|growing\s+famil(?:y|ies)|empty[- ]nesters?|newlyweds?|bachelor(?:ette)?\s+pad|retirees?|seniors|senior\s+(?:citizens?|housing|living|community|residents?|tenants?|buyers?|renters?)|elderly|singles)\b/gi },
    { id: 'mature-people', group: 'fh', category: 'Age',
      advice: 'Avoid naming the age of the people the home is for.',
      re: /\bmature\s+(?:adults?|tenants?|residents?|couples?|professionals?|buyers?|renters?|crowd|community|building|clientele)\b/gi },
    { id: 'no-children-variants', group: 'fh', category: 'Familial status',
      advice: 'Do not exclude children or families, in any wording.',
      re: /\b(?:no|not\s+for|without)\s+(?:strollers?|babies|baby|infants?|toddlers?|young\s+children)\b|\badult\s+(?:building|living)\b/gi },
    { id: 'disability-terms', group: 'fh', category: 'Disability',
      advice: 'Describe the feature (elevator, ramp, step-free entry), not the people it serves, and avoid the outdated terms.',
      re: /\b(?:handicap(?:ped)?|crippled|invalid|wheelchair[- ]bound|confined\s+to\s+a\s+wheelchair|retarded|mentally\s+(?:ill|disabled)|disabled\s+(?:tenants?|people|persons?|buyers?|renters?|residents?)|able[- ]bodied|physically\s+(?:fit|able))\b/gi },
    { id: 'sex-preference', group: 'fh', category: 'Sex',
      advice: 'Do not state a preference for or against men or women.',
      re: /\b(?:male|female|men|women|man|woman|guys?|girls?|ladies|gentlem[ae]n|boys?)\s+(?:only|preferred|roommates?|wanted|tenants?|renters?|buyers?)\b/gi },
    { id: 'marital-status', group: 'fh', category: 'Marital status, family status',
      advice: 'Do not describe the marital status of the people the home is for.',
      re: /\b(?:married|unmarried|divorced|widowed|single)\s+(?:couples?|people|persons?|tenants?|renters?|buyers?|professionals?|women|men|parents?|moms?|mothers?|dads?|fathers?)\b/gi },
    { id: 'orientation-identity', group: 'fh', category: 'Sexual orientation, gender identity',
      advice: 'Do not state a preference for or against anyone because of sexual orientation or gender identity (inclusive wording is still a statement about people).',
      re: /\b(?:gay|lesbian|lgbtq?\+?|bisexual|transgender|trans|queer|cisgender|non[- ]?binary|heterosexual|homosexual|straight\s+(?:couples?|people|tenants?|buyers?|only))\b/gi,
      skipAt: /^gay\s+(?:street|st\b)/i },
    { id: 'national-origin', group: 'fh', category: 'National origin, citizenship, immigration status',
      advice: 'Do not ask for or prefer a citizenship, immigration status, birthplace or language.',
      re: /\b(?:citizens?|citizenship|immigrants?|immigration|undocumented|illegals?|aliens?|green\s+card|visa\s+holders?|native[- ]born|foreign[- ]born|foreigners?|english[- ]speaking|(?:speaks?|speaking)\s+english|must\s+speak|no\s+english)\b/gi },
    { id: 'source-of-income', group: 'fh', category: 'Source of income, occupation',
      advice: 'In NYC a lawful source of income (vouchers, subsidies, benefits) cannot be refused. Do not exclude it, or require a kind of job.',
      re: /\b(?:no|not\s+accepting|doesn'?t\s+accept|don'?t\s+accept|without)\s+(?:section\s*8|vouchers?|subsid(?:y|ies|ized)|housing\s+(?:assistance|choice|vouchers?)|assistance|benefits|welfare|ssi|ssdi|snap|hasa|hra|dss|fheps|cityfheps|public\s+assistance|government\s+assistance|cash\s+assistance|hcv)\b|\b(?:wage\s+earners?|working\s+(?:class|people|professionals?)|employed|full[- ]time\s+job|steady\s+job)\s+(?:only|required|preferred)\b/gi },
    { id: 'military-status', group: 'fh', category: 'Military status',
      advice: 'Do not state a preference for or against military service.',
      re: /\b(?:veterans?|military|service\s*members?|armed\s+forces|national\s+guard)\s+(?:preferred|only|welcome)\b|\b(?:preferred|only)\s+for\s+veterans?\b|\bcivilians?\s+(?:preferred|welcome)\b/gi },
    { id: 'criminal-record', group: 'fh', category: 'Arrest or conviction record',
      advice: 'NYC limits when a criminal record can be considered. Do not mention it in a listing.',
      re: /\b(?:criminal|felon(?:y|ies|s)?|convict(?:ed|ion|ions|s)?|arrest(?:s|ed)?|ex[- ]?cons?|parole|probation|sex\s+offenders?|record\s+check)\b/gi },
    { id: 'victim-status', group: 'fh', category: 'Victim of domestic violence, stalking or a sex offense',
      advice: 'This status is protected in NYC. Do not use it to screen anyone.',
      re: /\b(?:domestic\s+violence|stalking|sex\s+offense|victims?\s+of)\b/gi },
    { id: 'neighborhood-character', group: 'fh', category: 'Neighborhood character (steering)',
      advice: 'Words about who lives in a neighborhood or what it is "like" can steer buyers and renters. Describe the place (transit, parks, shops), not its people.',
      re: /\b(?:desirable|undesirable|safe|safest|dangerous|sketchy|rough|shady|ghetto|slum|inner[- ]city|ethnic|exclusive|elite|prestigious|upscale|high[- ]class|working[- ]class|blue[- ]collar|white[- ]collar|up[- ]and[- ]coming|gentrif(?:y|ied|ying|ication)|transitional|changing|improving|revitaliz(?:ed|ing)|bad)\s+(?:neighbou?rhoods?|areas?|communit(?:y|ies)|blocks?|parts?\s+of\s+town|sides?\s+of\s+town|sections?|districts?|enclaves?|crowd|residents?|tenants?|clientele|people|folks)\b|\bcrime(?:[- ]free)?\b|\blow[- ]crime\b/gi },
    { id: 'quiet-neighborhood', group: 'fh', category: 'Familial status',
      advice: '"Quiet neighborhood" may imply discrimination against families (the server warns about this wording).',
      re: /\bquiet\s+neighbou?rhood\b/gi },
    { id: 'executive', group: 'fh', category: 'Source of income',
      advice: '"Executive" may imply income discrimination (the server warns about this wording).',
      re: /\bexecutive\b/gi },
    { id: 'prestigious', group: 'fh', category: 'Socioeconomic status',
      advice: '"Prestigious" may imply socioeconomic discrimination (the server warns about this wording).',
      re: /\bprestigious\b/gi },
    { id: 'schools', group: 'fh', category: 'Schools (familial status, steering)',
      advice: 'Do not rate schools. Point to the district\'s own information instead.',
      re: /\b(?:good|great|excellent|top|best|highly[- ]rated|award[- ]winning)\s+(?:public\s+)?(?:schools?|school\s+districts?)\b/gi },
    // ── style ──
    { id: 'master', group: 'style', category: 'Outdated term',
      advice: 'Use "primary" (primary bedroom, primary bath): "master" is being retired in listings.',
      re: /\bmaster\s+(?:bed(?:room)?s?|bath(?:room)?s?|suite|closet)\b/gi },
    { id: 'pressure', group: 'style', category: 'Pressure wording',
      advice: 'Check your brokerage\'s advertising policy: urgency claims such as "won\'t last" and "act fast" are often not allowed.',
      re: /\b(?:will\s+not\s+last|won'?t\s+last|hurry|act\s+(?:fast|now)|don'?t\s+miss|limited\s+time)\b/gi },
    // ── UCBA wording of public remarks (the server blocks the exact forms in section 1; these are the neighbors of those) ──
    { id: 'off-market-like', group: 'ucba', category: 'Off-market wording (UCBA Art. I Sec. 5(D))',
      advice: 'This can read as off-market language, which public remarks may not use.',
      re: /\b(?:private\s+listing|unlisted|not\s+(?:yet\s+)?(?:on|in)\s+(?:the\s+)?(?:MLS|RLS|market)|hidden\s+from\s+(?:the\s+)?public|secret\s+listing|private\s+showing\s+only|not\s+publicly\s+listed|quiet\s+sale|exclusive\s+listing)\b/gi },
    { id: 'agent-info-like', group: 'ucba', category: 'Agent information (UCBA Art. I Sec. 5(C))',
      advice: 'Agent contact details and credentials do not belong in public remarks.',
      re: /\b(?:call|text|email|e-mail|contact)\s+(?:me|us)\b|\bwww\.\S+|\b(?:license|lic)\s*#?\s*\d+\b|\bMLS\s*ID\s*:?\s*\w+\b|\b\d{3}\s\d{3}\s\d{4}\b|\b(?:presented|brought\s+to\s+you|represented)\s+by\b/gi },
    { id: 'call-name', group: 'ucba', category: 'Agent information (UCBA Art. I Sec. 5(C))',
      advice: 'Agent names and contact requests do not belong in public remarks.',
      re: /\b(?:[Cc]all|[Tt]ext|[Cc]ontact|[Ee]mail)\s+(?!(?:Now|Today|Us|Me|Anytime|Tonight|Soon|The|This|That|It|Home|Ahead|Early|For|To|At|Before|After)\b)[A-Z][a-z]+\b/g },
    { id: 'compensation-like', group: 'ucba', category: 'Compensation wording (UCBA Art. I Sec. 5(E))',
      advice: 'Public remarks may not discuss broker compensation.',
      re: /\b(?:commission|compensation|co[- ]?broke|co[- ]?op\s+fee|broker\s+fee|finder'?s?\s+fee|referral\s+fee|agent\s+bonus|bonus\s+to\s+(?:agent|broker)|incentive\s+to\s+broker|percentage\s+split|rebate|(?:buyer|seller)\s+pays?\s+closing(?:\s+costs?)?)\b/gi,
      skipBefore: /(?:preservation|planning|zoning|housing|landmarks?|public\s+service|city\s+planning)\s+$/i },
    { id: 'free-service-like', group: 'ucba', category: 'Free-service wording (UCBA Art. I Sec. 5)',
      advice: 'A "free" or "no cost" service claim is misleading unless it is unconditionally free.',
      re: /\b(?:free\s+closing\s+costs?|complimentary\s+(?:inspection|appraisal|services?)|at\s+no\s+cost|zero\s+(?:commission|fee))\b/gi },
    { id: 'coming-soon', group: 'ucba', category: 'Coming-soon wording',
      advice: 'Confirm that the listing\'s status allows coming-soon wording before you publish it.',
      re: /\b(?:coming\s+soon|not\s+yet\s+available|pre[- ]?lease|pre[- ]?listing|sneak\s+peek|first\s+look|early\s+access)\b/gi },
    { id: 'income-multiplier', group: 'ucba', category: 'Income requirement',
      advice: 'Check an income requirement against NYC\'s source-of-income protections before you publish it.',
      re: /\bincome\s+(?:must\s+be|required|requirement|minimum)\b.{0,12}?\d\s*(?:x|times)\b/gi },
    { id: 'owner-identity', group: 'ucba', category: 'Owner or seller identity',
      advice: 'Owner, seller or landlord details are usually left out of public remarks.',
      re: /\b(?:owner|seller|landlord)\s+(?:is|name|contact)\b/gi },
  ];

  // ── 4. Finding the words ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function allMatches(text, re) {
    var out = [];
    var m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; }
      out.push({ index: m.index, length: m[0].length, text: m[0] });
    }
    return out;
  }

  function global_(source, flags) { return new RegExp(source, flags.indexOf('g') < 0 ? flags + 'g' : flags); }

  // The server's term patterns: the term is escaped, and wrapped in word boundaries where it starts / ends with a letter or digit.
  function termRegExp(term) {
    var escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp((/^\w/.test(term) ? '\\b' : '') + escaped + (/\w$/.test(term) ? '\\b' : ''), 'gi');
  }

  var BLOCKED_FAIR_HOUSING = SERVER.hardcoded.map(function (r) { return { re: global_(r.source, r.flags), law: r.law }; });
  var BLOCKED_TERMS = [];
  Object.keys(SERVER.terms).forEach(function (name) {
    var cat = SERVER.terms[name];
    cat.terms.forEach(function (term) { BLOCKED_TERMS.push({ re: termRegExp(term), law: cat.reason, term: term, group: name === 'price_speculation' ? 'claims' : 'fh' }); });
  });
  var BLOCKED_PUBLIC = [];
  Object.keys(SERVER.publicRemarks).forEach(function (name) {
    SERVER.publicRemarks[name].rules.forEach(function (r) { BLOCKED_PUBLIC.push({ re: global_(r.source, r.flags), law: SERVER.publicRemarks[name].law }); });
  });

  function overlaps(a, b) { return a.index < b.index + b.length && b.index < a.index + a.length; }

  // The words within two words either side of a match, so a word like "white" can be judged by its neighbors.
  function around(text, m) {
    var before = text.slice(0, m.index).split(/\s+/).filter(Boolean).slice(-2).join(' ');
    var after = text.slice(m.index + m.length).split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
    return before + ' ' + after;
  }

  /**
   * @param text  what the agent wrote
   * @param kind  'description' (the main description: PublicRemarks), 'private' (showing instructions, agent remarks), 'text' (other public-facing text) or 'internal'
   * @returns { blocked: [{ group, law, text, index, length }], review: [{ id, group, category, advice, text, index, length }] }
   */
  function scan(text, kind) {
    text = typeof text === 'string' ? text : '';
    var how = KINDS[kind] || KINDS.text;
    var blocked = [];
    var seen = {};
    function addBlocked(group, law, m) {
      var key = group + '|' + m.index + '|' + m.length;
      if (seen[key]) return;
      seen[key] = true;
      blocked.push({ group: group, law: law, text: m.text, index: m.index, length: m.length });
    }
    BLOCKED_FAIR_HOUSING.forEach(function (rule) { allMatches(text, rule.re).forEach(function (m) { addBlocked('fh', rule.law, m); }); });
    BLOCKED_TERMS.forEach(function (rule) { allMatches(text, rule.re).forEach(function (m) { addBlocked(rule.group, rule.law, m); }); });
    if (how.substring) {
      // validateFairHousing looks for each term as a plain, case-insensitive substring
      var lower = text.toLowerCase();
      BLOCKED_TERMS.forEach(function (rule) {
        var needle = rule.term.toLowerCase();
        for (var at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + 1)) {
          addBlocked(rule.group, rule.law, { index: at, length: needle.length, text: text.substr(at, needle.length) });
        }
      });
    }
    if (how.ucba === 'blocked') {
      BLOCKED_PUBLIC.forEach(function (rule) { allMatches(text, rule.re).forEach(function (m) { addBlocked('ucba', rule.law, m); }); });
    }

    var review = [];
    REVIEW.forEach(function (rule) {
      if (rule.group !== 'fh' && !how.ucba) return;
      allMatches(text, rule.re).forEach(function (m) {
        if (blocked.some(function (b) { return overlaps(b, m); })) return;      // already said, more strongly
        if (rule.skipBefore && rule.skipBefore.test(text.slice(Math.max(0, m.index - 30), m.index))) return;
        if (rule.skipAt && rule.skipAt.test(text.slice(m.index, m.index + 30))) return;
        if (rule.skipAfter && rule.skipAfter.test(text.slice(m.index + m.length, m.index + m.length + 30))) return;
        if (rule.near && !rule.near.test(around(text, m))) return;
        review.push({ id: rule.id, group: rule.group, category: rule.category, advice: rule.advice, text: m.text, index: m.index, length: m.length });
      });
    });
    if (how.ucba === 'review') {
      // public-facing text that is not the main description: the server does not refuse these there, but it does in the description
      BLOCKED_PUBLIC.forEach(function (rule) {
        allMatches(text, rule.re).forEach(function (m) {
          review.push({ id: 'public-text', group: 'ucba', category: rule.law, advice: 'Public text should not hold this either: the server refuses it in the main description.', text: m.text, index: m.index, length: m.length });
        });
      });
    }
    // one finding per place: where two rules found the same words, the longer one stays
    review.sort(function (a, b) { return a.index - b.index || b.length - a.length; });
    var kept = [];
    review.forEach(function (f) { if (!kept.some(function (k) { return overlaps(k, f); })) kept.push(f); });
    blocked.sort(function (a, b) { return a.index - b.index || b.length - a.length; });
    return { blocked: blocked, review: kept };
  }

  // ── 5. Showing it ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function context(text, index, length) {
    var start = Math.max(0, index - 24);
    var end = Math.min(text.length, index + length + 24);
    return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ') + (end < text.length ? '…' : '');
  }

  function showButton(textarea, f) {
    var button = el('button', 'ml-2 px-1.5 py-0.5 rounded border text-[10px] font-semibold bg-white hover:bg-gray-50', 'Show');
    button.type = 'button';
    button.setAttribute('data-fh-show', String(f.index));
    button.addEventListener('click', function () {
      textarea.focus();
      if (typeof textarea.setSelectionRange === 'function') textarea.setSelectionRange(f.index, f.index + f.length);
    });
    return button;
  }

  function row(textarea, text, f, tone, headline, detail) {
    var p = el('p', 'text-xs mb-1 ' + tone);
    p.setAttribute('data-fh-finding', f.group || '');
    p.appendChild(el('strong', '', headline));
    p.appendChild(document.createTextNode(' “' + f.text + '”'));
    p.appendChild(showButton(textarea, f));
    p.appendChild(el('span', 'block text-[11px] opacity-80', context(text, f.index, f.length)));
    if (detail) p.appendChild(el('span', 'block text-[11px]', detail));
    return p;
  }

  function panel(box, titleIcon, title, tone) {
    var div = el('div', box);
    var heading = el('p', 'text-sm font-bold mb-2 ' + tone);
    heading.appendChild(el('i', titleIcon + ' mr-1'));
    heading.appendChild(document.createTextNode(title));
    div.appendChild(heading);
    return div;
  }

  var FH_FOOTER = 'Fair Housing Act (42 U.S.C. 3604(c)), NY Executive Law Art. 15 Sec. 296, NYC Admin Code Title 8 Sec. 8-107. UCBA Sec. M: $250 first offense, $500 and termination second offense.';
  var UCBA_FOOTER = 'The server refuses this wording in public remarks (UCBA Art. I Sec. 5).';

  function clear(textarea, flagsEl) {
    textarea.classList.remove('border-red-400', 'border-orange-400', 'border-amber-400');
    while (flagsEl.firstChild) flagsEl.removeChild(flagsEl.firstChild);
  }

  function render(textarea, flagsEl, text, result, saves) {
    clear(textarea, flagsEl);
    var fh = result.blocked.filter(function (f) { return f.group === 'fh'; });
    var claims = result.blocked.filter(function (f) { return f.group === 'claims'; });
    var ucba = result.blocked.filter(function (f) { return f.group === 'ucba'; });
    var review = result.review;
    if (!result.blocked.length && !review.length) {
      if (text.trim().length >= 20) {
        flagsEl.classList.remove('hidden');
        var ok = el('div', 'flex items-center gap-2 text-green-600 text-xs');
        ok.appendChild(el('i', 'fas fa-check-circle'));
        ok.appendChild(document.createTextNode(' No blocked wording found'));
        flagsEl.appendChild(ok);
      } else {
        flagsEl.classList.add('hidden');
      }
      return;
    }

    var chips = el('div', 'flex items-center gap-2 mb-2');
    if (result.blocked.length) {
      var red = el('span', 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700');
      red.appendChild(el('i', 'fas fa-exclamation-circle'));
      red.appendChild(document.createTextNode(' ' + result.blocked.length + ' blocked' + (saves ? ' — fix before saving' : ' — fix before publishing')));
      chips.appendChild(red);
    }
    if (review.length) {
      var amber = el('span', 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700');
      amber.appendChild(el('i', 'fas fa-search'));
      amber.appendChild(document.createTextNode(' ' + review.length + ' to check'));
      chips.appendChild(amber);
    }
    flagsEl.appendChild(chips);

    if (fh.length) {
      var p1 = panel('bg-red-50 border border-red-300 rounded-lg p-3 mb-2', 'fas fa-gavel', 'Fair Housing — BLOCKED', 'text-red-700');
      fh.forEach(function (f) { p1.appendChild(row(textarea, text, f, 'text-red-600', f.law + ':', '')); });
      p1.appendChild(el('p', 'text-[10px] text-red-500 mt-2 leading-tight', FH_FOOTER));
      flagsEl.appendChild(p1);
    }
    if (claims.length) {
      var p2 = panel('bg-red-50 border border-red-300 rounded-lg p-3 mb-2', 'fas fa-ban', 'Investment claims — BLOCKED', 'text-red-700');
      claims.forEach(function (f) { p2.appendChild(row(textarea, text, f, 'text-red-600', f.law + ':', '')); });
      flagsEl.appendChild(p2);
    }
    if (ucba.length) {
      var p3 = panel('bg-orange-50 border border-orange-300 rounded-lg p-3 mb-2', 'fas fa-exclamation-triangle', 'REBNY RLS / UCBA — BLOCKED', 'text-orange-700');
      ucba.forEach(function (f) { p3.appendChild(row(textarea, text, f, 'text-orange-700', f.law + ':', '')); });
      p3.appendChild(el('p', 'text-[10px] text-orange-600 mt-2 leading-tight', UCBA_FOOTER));
      flagsEl.appendChild(p3);
    }
    if (review.length) {
      var p4 = panel('bg-amber-50 border border-amber-300 rounded-lg p-3', 'fas fa-search', 'Check these — not blocked, but worth a second look', 'text-amber-700');
      review.forEach(function (f) { p4.appendChild(row(textarea, text, f, 'text-amber-800', f.category + ':', f.advice)); });
      flagsEl.appendChild(p4);
    }

    flagsEl.classList.remove('hidden');
    if (fh.length || claims.length) textarea.classList.add('border-red-400');
    else if (ucba.length) textarea.classList.add('border-orange-400');
    else textarea.classList.add('border-amber-400');
  }

  /** Scan the text box `textareaId` and show what was found in `flagsId`. Returns the scan, or null when either element is missing. */
  function check(textareaId, flagsId) {
    var textarea = document.getElementById(textareaId);
    var flagsEl = document.getElementById(flagsId);
    if (!textarea || !flagsEl) return null;
    var text = textarea.value;
    if (!text.trim()) {
      clear(textarea, flagsEl);
      flagsEl.classList.add('hidden');
      return { blocked: [], review: [] };
    }
    var box = boxFor(textareaId);
    var result = scan(text, box ? box.kind : 'text');
    render(textarea, flagsEl, text, result, !box || box.saves);
    return result;
  }

  /**
   * Scan every text box this page has, show what was found under each, and return the boxes that hold wording the server refuses.
   * @returns [{ id, label, saves, blocked }]  saves: the server refuses the wording when the listing is created
   */
  function blockedFields() {
    var out = [];
    BOXES.forEach(function (box) {
      var textarea = document.getElementById(box.id);
      if (!textarea || !textarea.value.trim()) return;
      var result = check(box.id, box.flags);
      if (result && result.blocked.length) out.push({ id: box.id, label: box.label, saves: box.saves, blocked: result.blocked });
    });
    return out;
  }

  global.MallanFairHousing = { scan: scan, check: check, blockedFields: blockedFields, boxes: BOXES, rules: { server: SERVER, review: REVIEW } };
})(window);
