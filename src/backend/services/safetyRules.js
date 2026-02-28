import { CAR_SEAT_RULES } from "../data/carSeatRules.js";
import { researchCarSeatRulesFromOfficialSource } from "./safetyLawResearch.js";

// Safety rules engine:
// - Resolves destination to a jurisdiction.
// - Maps each child profile to likely legal restraint guidance.
// - Falls back to official-source research when local rule data is missing.

const STATUS_RANK = {
  Verified: 0,
  "Needs review": 1,
  Unavailable: 2,
};

const US_STATE_NAME_TO_CODE = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

const STATE_CODE_TO_NAME = Object.fromEntries(
  Object.entries(US_STATE_NAME_TO_CODE).map(([stateName, code]) => [
    code,
    stateName
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
  ]),
);

const STATE_NAME_MATCH_ORDER = Object.entries(US_STATE_NAME_TO_CODE).sort(
  (a, b) => b[0].length - a[0].length,
);

const OFFICIAL_SOURCE_REGISTRY = {
  CA: "https://www.chp.ca.gov/programs-services/programs/child-safety-seats",
  WA: "https://wtsc.wa.gov/child-passenger-safety/",
  TX: "https://www.dshs.texas.gov/injury-prevention/safe-riders",
  NY: "https://dmv.ny.gov/more-info/safety-restraints",
  FL: "https://www.flhsmv.gov/safety-center/child-safety/",
  CO: "https://www.codot.gov/safety/carseats",
  VA: "https://www.dmv.virginia.gov/safety/#occupant-protection/children.asp",
  GA: "https://www.gahighwaysafety.org/child-passenger-safety/",
  PA: "https://www.penndot.pa.gov/TravelInPA/Safety/TrafficSafetyAndDriverTopics/Pages/Child-Passenger-Safety.aspx",
  MN: "https://dps.mn.gov/divisions/ots/child-passenger-safety/Pages/default.aspx",
};

function normalizeAgeMonths(child) {
  // Uses months as canonical comparison unit because legal thresholds are often month-based.
  if (Number.isFinite(child.ageMonths)) {
    return Math.max(0, child.ageMonths);
  }

  if (Number.isFinite(child.age)) {
    return Math.max(0, child.age) * 12;
  }

  return 0;
}

function normalizeChildren(children) {
  // Produces a stable child shape so downstream evaluation logic stays deterministic.
  if (!Array.isArray(children)) return [];

  return children.map((child, index) => ({
    id: child.id || `child-${index + 1}`,
    ageMonths: normalizeAgeMonths(child),
    ageYears: Number.isFinite(child.age)
      ? child.age
      : Math.floor(normalizeAgeMonths(child) / 12),
    weightLb: Number.isFinite(child.weightLb) ? child.weightLb : null,
    heightIn: Number.isFinite(child.heightIn) ? child.heightIn : null,
  }));
}

function withinRange(value, min, max) {
  // Generic numeric-range matcher supporting open-ended min/max constraints.
  if (!Number.isFinite(value)) return false;
  if (Number.isFinite(min) && value < min) return false;
  if (Number.isFinite(max) && value > max) return false;
  return true;
}

function toHumanRestraint(restraint) {
  // Converts internal enum keys into user-facing labels for API responses/UI.
  const labels = {
    rear_facing: "Rear-facing car seat",
    forward_facing_harness: "Forward-facing seat with harness",
    booster: "Booster seat",
    seat_belt: "Seat belt",
    not_found: "Not found in repo",
  };

  return labels[restraint] || restraint;
}

function evaluateRuleMatch(rule, child) {
  // Evaluates one child against one rule with explicit handling for missing metrics.
  const ageMatches = withinRange(child.ageMonths, rule.minAgeMonths, rule.maxAgeMonths);
  if (!ageMatches) {
    return {
      fullMatch: false,
      ageOnlyCandidate: false,
      reason: "Age is outside rule range.",
    };
  }

  const hasWeightRequirement =
    Number.isFinite(rule.minWeightLb) || Number.isFinite(rule.maxWeightLb);
  const hasHeightRequirement =
    Number.isFinite(rule.minHeightIn) || Number.isFinite(rule.maxHeightIn);

  const missingWeightData = hasWeightRequirement && !Number.isFinite(child.weightLb);
  const missingHeightData = hasHeightRequirement && !Number.isFinite(child.heightIn);

  const weightMatches =
    !hasWeightRequirement ||
    withinRange(child.weightLb, rule.minWeightLb, rule.maxWeightLb);
  const heightMatches =
    !hasHeightRequirement ||
    withinRange(child.heightIn, rule.minHeightIn, rule.maxHeightIn);

  if (weightMatches && heightMatches) {
    return {
      fullMatch: true,
      ageOnlyCandidate: false,
      reason: "All available rule constraints matched.",
    };
  }

  if (missingWeightData || missingHeightData) {
    return {
      fullMatch: false,
      ageOnlyCandidate: true,
      reason:
        "Age matched, but weight and/or height data is missing for full legal confidence.",
    };
  }

  return {
    fullMatch: false,
    ageOnlyCandidate: false,
    reason: "Age matched, but weight/height does not meet this rule.",
  };
}

function evaluateChild(child, ruleSet) {
  // Applies prioritized jurisdiction rules and returns the best available recommendation.
  const rules = [...(ruleSet.rules || [])].sort((a, b) => a.priority - b.priority);
  const ageOnlyCandidates = [];

  for (const rule of rules) {
    const match = evaluateRuleMatch(rule, child);

    if (match.fullMatch) {
      return {
        status: ruleSet.verificationStatus || "Needs review",
        requiredRestraint: rule.requiredRestraint,
        requiredRestraintLabel: toHumanRestraint(rule.requiredRestraint),
        seatPosition: rule.seatPosition,
        rationale: `Matched ${toHumanRestraint(rule.requiredRestraint)} rule. ${match.reason}`,
      };
    }

    if (match.ageOnlyCandidate) {
      ageOnlyCandidates.push(rule);
    }
  }

  if (ageOnlyCandidates.length > 0) {
    const fallbackRule = ageOnlyCandidates[0];
    return {
      status: "Needs review",
      requiredRestraint: fallbackRule.requiredRestraint,
      requiredRestraintLabel: toHumanRestraint(fallbackRule.requiredRestraint),
      seatPosition: fallbackRule.seatPosition,
      rationale:
        "Age matched but weight/height details are incomplete. Verify official rules before travel.",
    };
  }

  return {
    status: "Unavailable",
    requiredRestraint: "not_found",
    requiredRestraintLabel: "Not found in repo",
    seatPosition: "not_found",
    rationale: "No matching rule found for this child profile in current repo data.",
  };
}

function toStateCodeFromDestination(destination) {
  // Resolves state code from free-form destination text using progressively looser matching.
  if (typeof destination !== "string" || !destination.trim()) return null;

  const tokens = destination
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (/^[A-Z]{2}$/.test(upper)) {
      return upper;
    }
  }

  const exactTokenMatches = tokens
    .map((token) => {
      const normalizedToken = token.toLowerCase();
      const code = US_STATE_NAME_TO_CODE[normalizedToken];
      return code ? { normalizedToken, code } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.normalizedToken.length - a.normalizedToken.length);

  if (exactTokenMatches.length > 0) {
    return exactTokenMatches[0].code;
  }

  const normalized = destination.toLowerCase();
  for (const [stateName, code] of STATE_NAME_MATCH_ORDER) {
    if (normalized.includes(stateName)) {
      return code;
    }
  }

  return null;
}

function aggregateStatus(statuses) {
  // Picks the most conservative status across all child evaluations.
  if (!statuses.length) return "Unavailable";

  let current = "Verified";
  for (const status of statuses) {
    if ((STATUS_RANK[status] ?? 2) > (STATUS_RANK[current] ?? 2)) {
      current = status;
    }
  }

  return current;
}

function buildUnavailableResult({
  resolvedJurisdictionCode,
  message,
  children,
  sourceUrl = null,
  tripDate = null,
}) {
  // Standardized fallback payload when jurisdiction data is missing/unusable.
  return {
    status: "Unavailable",
    jurisdictionCode: resolvedJurisdictionCode || null,
    jurisdictionName:
      resolvedJurisdictionCode && STATE_CODE_TO_NAME[resolvedJurisdictionCode]
        ? STATE_CODE_TO_NAME[resolvedJurisdictionCode]
        : "Not found in repo",
    message,
    sourceUrl,
    effectiveDate: "Not found in repo",
    lastUpdated: "Not found in repo",
    tripDate,
    results: children.map((child) => ({
      childId: child.id,
      status: "Unavailable",
      requiredRestraint: "not_found",
      requiredRestraintLabel: "Not found in repo",
      rationale:
        "No jurisdiction-specific rule set is available in the current repo dataset.",
    })),
  };
}

function buildGuidanceFromRuleSet({ ruleSet, children, tripDate }) {
  // Builds final API payload from a rule set plus normalized child profiles.
  const results = children.map((child) => {
    const evaluated = evaluateChild(child, ruleSet);

    return {
      childId: child.id,
      ageYears: child.ageYears,
      weightLb: child.weightLb,
      heightIn: child.heightIn,
      status: evaluated.status,
      requiredRestraint: evaluated.requiredRestraint,
      requiredRestraintLabel: evaluated.requiredRestraintLabel,
      seatPosition: evaluated.seatPosition,
      rationale: evaluated.rationale,
      sourceUrl: ruleSet.sourceUrl,
      effectiveDate: ruleSet.effectiveDate,
      citationSnippet: ruleSet.citationSnippet || undefined,
    };
  });

  return {
    status: aggregateStatus(results.map((result) => result.status)),
    jurisdictionCode: ruleSet.jurisdictionCode,
    jurisdictionName: ruleSet.jurisdictionName,
    message: ruleSet.notes,
    sourceUrl: ruleSet.sourceUrl,
    effectiveDate: ruleSet.effectiveDate,
    lastUpdated: ruleSet.lastUpdated,
    tripDate: tripDate || null,
    results,
  };
}

export function resolveJurisdictionCode({ jurisdictionCode, destination }) {
  // Trust explicit 2-letter code first; otherwise infer from destination text.
  if (
    typeof jurisdictionCode === "string" &&
    /^[A-Za-z]{2}$/.test(jurisdictionCode.trim())
  ) {
    return jurisdictionCode.trim().toUpperCase();
  }

  return toStateCodeFromDestination(destination);
}

// ── International car seat guidance ─────────────────────────────────────────
// Generic guidance for non-US countries. Families should always verify local laws.

const COUNTRY_GUIDANCE = {
  CA: {
    name: "Canada",
    summary: "Each province has its own car seat law, all broadly aligned with US safety standards.",
    rules: [
      { label: "Under 1 year / under 9 kg", guidance: "Rear-facing infant seat" },
      { label: "1–4 years / 9–18 kg", guidance: "Rear-facing as long as possible, then forward-facing with harness" },
      { label: "4–8 years", guidance: "Forward-facing with harness, then booster seat" },
      { label: "8+ years or over 145 cm", guidance: "Seat belt" },
    ],
    sourceUrl: "https://tc.canada.ca/en/road-transportation/child-car-safety-seats",
  },
  GB: {
    name: "United Kingdom",
    summary: "Children under 12 years or 135 cm must use an approved child car seat.",
    rules: [
      { label: "Birth to 15 months", guidance: "Rear-facing Group 0+ or R129 i-Size seat" },
      { label: "15 months to 4 years", guidance: "Rear-facing recommended; forward-facing Group 1 allowed" },
      { label: "4–12 years / under 135 cm", guidance: "Booster seat with seat belt or high-back booster" },
      { label: "12+ years or over 135 cm", guidance: "Adult seat belt" },
    ],
    sourceUrl: "https://www.gov.uk/child-car-seats-the-rules",
  },
  AU: {
    name: "Australia",
    summary: "Australian national standards require rear-facing until age 4, then forward-facing to age 7.",
    rules: [
      { label: "Under 4 years", guidance: "Rear-facing child restraint" },
      { label: "4–7 years", guidance: "Forward-facing child restraint or approved booster seat" },
      { label: "7+ years", guidance: "Booster seat until can fit in adult seat belt properly" },
    ],
    sourceUrl: "https://www.infrastructure.gov.au/roads/safety/child_restraints",
  },
};

const EU_COUNTRIES = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU",
  "IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
  // Non-EU but uses EU R129/R44 standards
  "CH","NO","IS","LI","TR",
]);

function buildInternationalGuidance({ countryCode, children, destination, tripDate }) {
  // Returns structured guidance for non-US destinations using country-level rules.
  // Note: Always advise users to verify current local regulations before travel.
  const normalizedChildren = normalizeChildren(children);
  const countryInfo = COUNTRY_GUIDANCE[countryCode];
  const isEU = EU_COUNTRIES.has(countryCode);

  let jurisdictionName, summary, rulesList, sourceUrl, guidanceMode;

  if (countryInfo) {
    // Known country with specific guidance (CA, GB, AU)
    jurisdictionName = countryInfo.name;
    summary = countryInfo.summary;
    rulesList = countryInfo.rules;
    sourceUrl = countryInfo.sourceUrl;
    guidanceMode = "country_general";
  } else if (isEU) {
    // EU/EEA countries — ECE R44/R129 (i-Size) standards
    jurisdictionName = `International (EU/EEA — Country: ${countryCode})`;
    summary = "EU Regulation ECE R44 or ECE R129 (i-Size) applies. Car seats must display an orange E-mark label.";
    rulesList = [
      { label: "Under 15 months", guidance: "Rear-facing only (mandatory under EU R129 i-Size)" },
      { label: "15 months to 18 kg", guidance: "Rear-facing recommended; forward-facing allowed after 15 months" },
      { label: "18–36 kg (approx. 4–10 years)", guidance: "Booster seat with seat belt (Group 2/3)" },
      { label: "Over 135 cm", guidance: "Adult seat belt" },
    ];
    sourceUrl = "https://unece.org/transport/vehicle-regulations/working-party-29-wp29/regulations-annexed-1958-agreement";
    guidanceMode = "eu_baseline";
  } else {
    // Generic international guidance
    jurisdictionName = `International (Country: ${countryCode || "Unknown"})`;
    summary = "General international child passenger safety standards recommend rear-facing seats for young children, then forward-facing with harness, then booster seats.";
    rulesList = [
      { label: "Under 2 years (or until seat limit)", guidance: "Rear-facing car seat — safest position for young children" },
      { label: "2–5 years", guidance: "Forward-facing car seat with 5-point harness" },
      { label: "5–12 years", guidance: "Booster seat with seat belt until child can fit adult seat belt properly" },
      { label: "12+ years", guidance: "Adult seat belt in back seat recommended" },
    ];
    sourceUrl = "https://www.who.int/publications/i/item/9789241502047";
    guidanceMode = "country_general";
  }

  const rationale =
    `${summary} Always verify current ${jurisdictionName} laws before travel — regulations may have changed. ` +
    `Rental car companies may provide car seats; book in advance and verify the seat meets local standards.`;

  return {
    status: "Needs review",
    jurisdictionCode: countryCode || null,
    jurisdictionName,
    guidanceMode,
    confidence: "general",
    message: rationale,
    sourceUrl,
    effectiveDate: null,
    lastUpdated: null,
    tripDate: tripDate || null,
    results: normalizedChildren.map((child) => {
      // Match child to the most appropriate rule by age
      const ageYears = child.ageYears;
      let matched = rulesList[rulesList.length - 1]; // default to last (oldest)
      if (isEU || guidanceMode === "eu_baseline") {
        if (child.ageMonths < 15) matched = rulesList[0];
        else if (child.weightLb != null && child.weightLb < 40) matched = rulesList[1];
        else if (ageYears < 10) matched = rulesList[2];
        else matched = rulesList[3];
      } else if (countryCode === "CA") {
        if (child.ageMonths < 12) matched = rulesList[0];
        else if (ageYears < 4) matched = rulesList[1];
        else if (ageYears < 8) matched = rulesList[2];
        else matched = rulesList[3];
      } else if (countryCode === "GB") {
        if (child.ageMonths < 15) matched = rulesList[0];
        else if (ageYears < 4) matched = rulesList[1];
        else if (ageYears < 12) matched = rulesList[2];
        else matched = rulesList[3];
      } else if (countryCode === "AU") {
        if (ageYears < 4) matched = rulesList[0];
        else if (ageYears < 7) matched = rulesList[1];
        else matched = rulesList[2];
      } else {
        // Generic
        if (child.ageMonths < 24) matched = rulesList[0];
        else if (ageYears < 5) matched = rulesList[1];
        else if (ageYears < 12) matched = rulesList[2];
        else matched = rulesList[3];
      }

      return {
        childId: child.id,
        ageYears: child.ageYears,
        weightLb: child.weightLb,
        heightIn: child.heightIn,
        status: "Needs review",
        requiredRestraint: "country_general",
        requiredRestraintLabel: matched.guidance,
        seatPosition: ageYears < 2 ? "rear_facing_only" : null,
        rationale: `${matched.label}: ${matched.guidance}. Verify with local ${jurisdictionName} regulations before travel.`,
        sourceUrl,
      };
    }),
  };
}

export async function getCarSeatGuidance(input, deps = {}) {
  // Orchestrates rule lookup and optional official-source fallback research.
  const {
    sourceRegistry = OFFICIAL_SOURCE_REGISTRY,
    researchFn = researchCarSeatRulesFromOfficialSource,
  } = deps;

  const { jurisdictionCode, destination, tripDate, children, countryCode } = input || {};
  const normalizedChildren = normalizeChildren(children);

  // Non-US country: return international guidance immediately (no state-rule lookup)
  const effectiveCountry = countryCode || null;
  if (effectiveCountry && effectiveCountry !== "US") {
    return buildInternationalGuidance({
      countryCode: effectiveCountry,
      children,
      destination,
      tripDate,
    });
  }

  const resolvedJurisdictionCode = resolveJurisdictionCode({
    jurisdictionCode,
    destination,
  });

  if (!resolvedJurisdictionCode) {
    return buildUnavailableResult({
      resolvedJurisdictionCode: null,
      message: "Could not determine a US jurisdiction from the destination.",
      children: normalizedChildren,
      tripDate,
    });
  }

  let ruleSet = CAR_SEAT_RULES[resolvedJurisdictionCode];

  if (!ruleSet) {
    const sourceUrl = sourceRegistry[resolvedJurisdictionCode] || null;

    if (!sourceUrl) {
      return buildUnavailableResult({
        resolvedJurisdictionCode,
        message:
          `Car seat rule set for ${resolvedJurisdictionCode} is not found in repo.`,
        children: normalizedChildren,
        tripDate,
      });
    }

    try {
      const researchedRuleSet = await researchFn({
        jurisdictionCode: resolvedJurisdictionCode,
        jurisdictionName:
          STATE_CODE_TO_NAME[resolvedJurisdictionCode] || "Not found in repo",
        sourceUrl,
      });

      if (researchedRuleSet?.rules?.length > 0) {
        ruleSet = researchedRuleSet;
      } else {
        return buildUnavailableResult({
          resolvedJurisdictionCode,
          message:
            "Official source was checked, but no structured threshold rules were extracted.",
          sourceUrl,
          children: normalizedChildren,
          tripDate,
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "Car seat fallback research failed:",
          resolvedJurisdictionCode,
          error.message,
        );
      }

      return buildUnavailableResult({
        resolvedJurisdictionCode,
        message:
          "Could not retrieve jurisdiction rules from configured official source.",
        sourceUrl,
        children: normalizedChildren,
        tripDate,
      });
    }
  }

  return buildGuidanceFromRuleSet({
    ruleSet,
    children: normalizedChildren,
    tripDate,
  });
}
