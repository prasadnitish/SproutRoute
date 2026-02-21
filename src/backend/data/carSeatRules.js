export const CAR_SEAT_RULES = {
  CA: {
    jurisdictionCode: "CA",
    jurisdictionName: "California",
    sourceUrl: "https://www.chp.ca.gov/programs-services/programs/child-safety-seats",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 },
    ],
  },
  WA: {
    jurisdictionCode: "WA",
    jurisdictionName: "Washington",
    sourceUrl: "https://wtsc.wa.gov/child-passenger-safety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 47, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_13", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 },
    ],
  },
  TX: {
    jurisdictionCode: "TX",
    jurisdictionName: "Texas",
    sourceUrl: "https://www.dshs.texas.gov/injury-prevention/safe-riders",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 },
    ],
  },
  NY: {
    jurisdictionCode: "NY",
    jurisdictionName: "New York",
    sourceUrl: "https://dmv.ny.gov/more-info/safety-restraints",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 },
    ],
  },
  FL: {
    jurisdictionCode: "FL",
    jurisdictionName: "Florida",
    sourceUrl: "https://www.flhsmv.gov/safety-center/child-safety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 59, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 60, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 72, minHeightIn: 57 },
    ],
  },
  AL: {
    jurisdictionCode: "AL",
    jurisdictionName: "Alabama",
    sourceUrl: "https://www.alabamapublichealth.gov/injuryprevention/child-passenger-safety.html",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  AK: {
    jurisdictionCode: "AK",
    jurisdictionName: "Alaska",
    sourceUrl: "https://dot.alaska.gov/stwdplnng/hwysafe/child-safety-seat.shtml",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  AZ: {
    jurisdictionCode: "AZ",
    jurisdictionName: "Arizona",
    sourceUrl: "https://azdot.gov/motor-vehicles/vehicle-safety/child-passenger-safety",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  AR: {
    jurisdictionCode: "AR",
    jurisdictionName: "Arkansas",
    sourceUrl: "https://www.healthy.arkansas.gov/programs-services/topics/child-safety-seat-program",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  CO: {
    jurisdictionCode: "CO",
    jurisdictionName: "Colorado",
    sourceUrl: "https://www.codot.gov/safety/buckle-up-colorado/child-passenger-safety",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  CT: {
    jurisdictionCode: "CT",
    jurisdictionName: "Connecticut",
    sourceUrl: "https://portal.ct.gov/DMV/child-safety",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  DE: {
    jurisdictionCode: "DE",
    jurisdictionName: "Delaware",
    sourceUrl: "https://dph.delaware.gov/injury-prevention/child-passenger-safety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  GA: {
    jurisdictionCode: "GA",
    jurisdictionName: "Georgia",
    sourceUrl: "https://www.gahighwaysafety.org/child-passenger-safety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  HI: {
    jurisdictionCode: "HI",
    jurisdictionName: "Hawaii",
    sourceUrl: "https://hidot.hawaii.gov/highways/highway-safety/child-passenger-safety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  ID: {
    jurisdictionCode: "ID",
    jurisdictionName: "Idaho",
    sourceUrl: "https://itd.idaho.gov/safety/child-passenger-safety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  IL: {
    jurisdictionCode: "IL",
    jurisdictionName: "Illinois",
    sourceUrl: "https://www.isp.state.il.us/childsafety/childsafetyseats.cfm",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  IN: {
    jurisdictionCode: "IN",
    jurisdictionName: "Indiana",
    sourceUrl: "https://www.in.gov/bmv/safety-and-licensing/child-restraints/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  IA: {
    jurisdictionCode: "IA",
    jurisdictionName: "Iowa",
    sourceUrl: "https://iowadot.gov/mvd/child-restraint-information",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  KS: {
    jurisdictionCode: "KS",
    jurisdictionName: "Kansas",
    sourceUrl: "https://www.ksrevenue.gov/driverslicense-childpassengersafety.html",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  KY: {
    jurisdictionCode: "KY",
    jurisdictionName: "Kentucky",
    sourceUrl: "https://transportation.ky.gov/Highway-Safety/Pages/Child-Passenger-Safety.aspx",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  LA: {
    jurisdictionCode: "LA",
    jurisdictionName: "Louisiana",
    sourceUrl: "https://www.dotd.la.gov/highways/traffic_eng/safety/child_safety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  ME: {
    jurisdictionCode: "ME",
    jurisdictionName: "Maine",
    sourceUrl: "https://www.maine.gov/sos/bmv/motorist/safety/child-restraints.html",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  MD: {
    jurisdictionCode: "MD",
    jurisdictionName: "Maryland",
    sourceUrl: "https://mhso.md.gov/childpassengersafety.shtml",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  MA: {
    jurisdictionCode: "MA",
    jurisdictionName: "Massachusetts",
    sourceUrl: "https://www.mass.gov/child-passenger-safety",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  MI: {
    jurisdictionCode: "MI",
    jurisdictionName: "Michigan",
    sourceUrl: "https://www.michigan.gov/sos/vehicle-services/child-passenger-safety",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  MN: {
    jurisdictionCode: "MN",
    jurisdictionName: "Minnesota",
    sourceUrl: "https://www.dps.mn.gov/divisions/ots/Pages/child-passenger-safety.aspx",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  MS: {
    jurisdictionCode: "MS",
    jurisdictionName: "Mississippi",
    sourceUrl: "https://www.dps.ms.gov/traffic-safety/child-passenger-safety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  MO: {
    jurisdictionCode: "MO",
    jurisdictionName: "Missouri",
    sourceUrl: "https://www.mshp.dps.missouri.gov/MSHPWeb/SAC/index.html",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  MT: {
    jurisdictionCode: "MT",
    jurisdictionName: "Montana",
    sourceUrl: "https://www.mdt.mt.gov/safety/children.shtml",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  NE: {
    jurisdictionCode: "NE",
    jurisdictionName: "Nebraska",
    sourceUrl: "https://dmv.nebraska.gov/child-passenger-safety",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  NV: {
    jurisdictionCode: "NV",
    jurisdictionName: "Nevada",
    sourceUrl: "https://www.dmv.nv.gov/child-safety.htm",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  NH: {
    jurisdictionCode: "NH",
    jurisdictionName: "New Hampshire",
    sourceUrl: "https://www.nh.gov/safety/divisions/nhsp/troop-e/cps/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  NJ: {
    jurisdictionCode: "NJ",
    jurisdictionName: "New Jersey",
    sourceUrl: "https://www.nj.gov/mvc/drivertopics/child_restraints.htm",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  NM: {
    jurisdictionCode: "NM",
    jurisdictionName: "New Mexico",
    sourceUrl: "https://www.dot.nm.gov/highway-safety/child-safety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  NC: {
    jurisdictionCode: "NC",
    jurisdictionName: "North Carolina",
    sourceUrl: "https://www.ncdot.gov/programs/child-passenger-safety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  ND: {
    jurisdictionCode: "ND",
    jurisdictionName: "North Dakota",
    sourceUrl: "https://www.dot.nd.gov/divisions/trafsafety/childpassenger.htm",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  OH: {
    jurisdictionCode: "OH",
    jurisdictionName: "Ohio",
    sourceUrl: "https://www.ohiohighwaysafety.org/safety-topics/child-passenger-safety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  OK: {
    jurisdictionCode: "OK",
    jurisdictionName: "Oklahoma",
    sourceUrl: "https://www.ok.gov/triton/modules/newsroom/newsroom_article.php?id=186",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  OR: {
    jurisdictionCode: "OR",
    jurisdictionName: "Oregon",
    sourceUrl: "https://www.oregon.gov/odot/Safety/Pages/CPS.aspx",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  PA: {
    jurisdictionCode: "PA",
    jurisdictionName: "Pennsylvania",
    sourceUrl: "https://www.penndot.pa.gov/TravelInPA/Safety/Pages/Child-Passenger-Safety.aspx",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  RI: {
    jurisdictionCode: "RI",
    jurisdictionName: "Rhode Island",
    sourceUrl: "https://dmv.ri.gov/child-safety",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  SC: {
    jurisdictionCode: "SC",
    jurisdictionName: "South Carolina",
    sourceUrl: "https://www.scdps.gov/safety/safety-programs/child-passenger-safety",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  SD: {
    jurisdictionCode: "SD",
    jurisdictionName: "South Dakota",
    sourceUrl: "https://dps.sd.gov/office-of-highway-safety/traffic-safety/child-passenger-safety",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  TN: {
    jurisdictionCode: "TN",
    jurisdictionName: "Tennessee",
    sourceUrl: "https://www.tn.gov/tdosafety/traffic-safety-programs/child-passenger-safety.html",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  UT: {
    jurisdictionCode: "UT",
    jurisdictionName: "Utah",
    sourceUrl: "https://zerofatalities.com/child-safety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  VT: {
    jurisdictionCode: "VT",
    jurisdictionName: "Vermont",
    sourceUrl: "https://www.dmv.vermont.gov/safety-and-education/child-passenger-safety",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  VA: {
    jurisdictionCode: "VA",
    jurisdictionName: "Virginia",
    sourceUrl: "https://www.dmv.virginia.gov/vehicles/#vehicle_safety/child_safety_seat.asp",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  WV: {
    jurisdictionCode: "WV",
    jurisdictionName: "West Virginia",
    sourceUrl: "https://www.wvdhhr.org/childpassengersafety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  WI: {
    jurisdictionCode: "WI",
    jurisdictionName: "Wisconsin",
    sourceUrl: "https://www.dot.state.wi.us/safety/motorist/childsafety/",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  WY: {
    jurisdictionCode: "WY",
    jurisdictionName: "Wyoming",
    sourceUrl: "https://www.dot.state.wy.us/home/travel_info_roads/traffic_safety/child_passenger_safety.html",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_recommended", minAgeMonths: 48, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  },
  DC: {
    jurisdictionCode: "DC",
    jurisdictionName: "Washington, D.C.",
    sourceUrl: "https://dmv.dc.gov/service/child-safety-seats",
    effectiveDate: "Not found in repo",
    lastUpdated: "2026-02-15",
    verificationStatus: "Needs review",
    notes: "State laws change. Verify legal requirements before travel using the official source.",
    rules: [
      { priority: 1, requiredRestraint: "rear_facing", seatPosition: "rear_seat_required_if_available", minAgeMonths: 0, maxAgeMonths: 23, maxWeightLb: 40, maxHeightIn: 40 },
      { priority: 2, requiredRestraint: "forward_facing_harness", seatPosition: "rear_seat_required_if_available", minAgeMonths: 24, maxAgeMonths: 95, minWeightLb: 22, maxWeightLb: 65, maxHeightIn: 57 },
      { priority: 3, requiredRestraint: "booster", seatPosition: "rear_seat_required_under_8", minAgeMonths: 48, maxAgeMonths: 95, minWeightLb: 40, minHeightIn: 40, maxHeightIn: 57 },
      { priority: 4, requiredRestraint: "seat_belt", seatPosition: "rear_seat_preferred", minAgeMonths: 96, minHeightIn: 57 }
    ]
  }
};
