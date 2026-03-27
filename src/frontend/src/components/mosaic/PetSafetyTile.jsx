function EligibilityIcon({ eligible }) {
  if (eligible === true) {
    return <span className="text-green-600 font-bold text-sm">{"\u2705"}</span>;
  }
  if (eligible === false) {
    return <span className="text-red-500 font-bold text-sm">{"\u274C"}</span>;
  }
  return <span className="text-gray-400 text-xs">--</span>;
}

function AirlineTable({ airlines }) {
  if (!airlines || airlines.length === 0) return null;

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
              Airline
            </th>
            <th className="text-center py-2 px-2 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
              Cabin
            </th>
            <th className="text-center py-2 px-2 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
              Cargo
            </th>
            <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
              Fee
            </th>
            <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
              Breed Warning
            </th>
          </tr>
        </thead>
        <tbody>
          {airlines.map((airline, i) => (
            <tr
              key={airline.carrierCode || i}
              className={`border-b border-gray-100 ${
                i % 2 === 0 ? "bg-gray-50/50" : ""
              }`}
            >
              <td className="py-2 px-2 font-medium text-gray-800">
                {airline.carrier}
                <span className="text-gray-400 ml-1 text-[10px]">
                  ({airline.carrierCode})
                </span>
              </td>
              <td className="py-2 px-2 text-center">
                <EligibilityIcon eligible={airline.cabinEligible} />
              </td>
              <td className="py-2 px-2 text-center">
                <EligibilityIcon eligible={airline.cargoEligible} />
              </td>
              <td className="py-2 px-2 text-right text-gray-600 whitespace-nowrap">
                {airline.cabinFee || airline.cargoFee || "--"}
              </td>
              <td className="py-2 px-2">
                {airline.breedWarning ? (
                  <span className="text-amber-600 font-medium">
                    {"\u26A0\uFE0F"} {airline.breedWarning}
                  </span>
                ) : (
                  <span className="text-gray-300">None</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntryRequirementsSection({ entry }) {
  if (!entry) return null;

  const checks = [
    {
      label: "Microchip",
      required: entry.microchipRequired,
      detail: entry.microchipRequired ? "ISO 15-digit required" : null,
    },
    {
      label: "Rabies vaccine",
      required: entry.rabiesVaccine != null,
      detail: entry.rabiesVaccine,
    },
    {
      label: "Health certificate",
      required: !!entry.healthCertificate,
      detail: entry.healthCertificate,
    },
    {
      label: "Quarantine",
      required: entry.quarantine,
      detail: entry.quarantine
        ? `${entry.quarantineDays || "?"} day quarantine`
        : "Not required",
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
        {"\uD83C\uDDFA\uD83C\uDDF8"} Entry Requirements — {entry.country}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {checks.map((check) => (
          <div
            key={check.label}
            className={`rounded-lg px-3 py-2 border ${
              check.required
                ? "border-meadow-200 bg-meadow-50/50"
                : "border-gray-100 bg-gray-50"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">
                {check.required ? "\u2705" : "\u2796"}
              </span>
              <span className="text-xs font-medium text-gray-700">
                {check.label}
              </span>
            </div>
            {check.detail && (
              <p className="text-[10px] text-gray-500 mt-0.5 ml-5">
                {check.detail}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Banned breeds warning */}
      {entry.bannedBreeds && entry.bannedBreeds.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs font-medium text-red-700">
            {"\u{1F6AB}"} Banned breeds in {entry.country}
          </p>
          <p className="text-[10px] text-red-600 mt-0.5">
            {entry.bannedBreeds.join(", ")}
          </p>
        </div>
      )}

      {/* Timeline warning */}
      {entry.timelineWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-700">
            {"\u23F0"} {entry.timelineWarning}
          </p>
        </div>
      )}

      {/* Advance notice */}
      {entry.advanceNoticeDays && !entry.timelineWarning && (
        <p className="text-[10px] text-gray-500">
          {"\u{1F4C5}"} Start paperwork at least {entry.advanceNoticeDays} days
          before travel
        </p>
      )}
    </div>
  );
}

function RequiredDocumentsSection({ documents }) {
  if (!documents || documents.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
        {"\u{1F4CB}"} Required Documents
      </p>
      <ul className="space-y-1">
        {documents.map((doc, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
            <span className="text-meadow-500 flex-shrink-0 mt-0.5">
              {"\u2610"}
            </span>
            <span>{doc}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PetSafetyTile({ petSafetyData }) {
  if (!petSafetyData) return null;

  const {
    entryRequirements,
    requiredDocuments,
    source,
  } = petSafetyData;
  const airlineGuidance = petSafetyData.airlineGuidance || [];

  const hasAirlineData = airlineGuidance.length > 0;
  const hasEntryData = !!entryRequirements;
  const hasDocs =
    requiredDocuments?.length > 0 ||
    airlineGuidance.some(
      (g) => g.airlines?.some((a) => a.requiredDocuments?.length > 0)
    );

  const driveTips = petSafetyData.driveTips || [];
  const localTips = petSafetyData.localTips || [];
  const hasTips = driveTips.length > 0 || localTips.length > 0;

  if (!hasAirlineData && !hasEntryData && !hasTips) return null;

  // Collect all required documents from airline guidance + top-level
  const allDocs = new Set(requiredDocuments || []);
  for (const guidance of airlineGuidance) {
    for (const airline of guidance.airlines || []) {
      for (const doc of airline.requiredDocuments || []) {
        allDocs.add(doc);
      }
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600">
          {"\uD83D\uDC3E"} Pet Travel Safety
        </p>
        {source && (
          <a
            href={
              source.startsWith("http") ? source : `https://${source}`
            }
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-meadow-500 underline hover:text-meadow-700 transition-colors"
          >
            Source
          </a>
        )}
      </div>

      {/* Per-pet airline eligibility */}
      {airlineGuidance.map((petGuidance, idx) => (
        <div key={petGuidance.pet || idx} className="space-y-2">
          {airlineGuidance.length > 1 && (
            <p className="text-sm font-medium text-gray-700">
              {"\uD83D\uDC3E"} {petGuidance.pet || `Pet ${idx + 1}`}
            </p>
          )}

          <AirlineTable airlines={petGuidance.airlines} />

          {/* AI recommendation */}
          {petGuidance.recommendation && (
            <div className="rounded-lg bg-meadow-50 border border-meadow-100 px-3 py-2">
              <p className="text-xs text-meadow-700">
                {"\uD83D\uDCA1"} {petGuidance.recommendation}
              </p>
            </div>
          )}
        </div>
      ))}

      {/* International entry requirements */}
      <EntryRequirementsSection entry={entryRequirements} />

      {/* Required documents checklist */}
      {allDocs.size > 0 && (
        <RequiredDocumentsSection documents={[...allDocs]} />
      )}

      {/* Drive safety tips */}
      {driveTips.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
            {"\uD83D\uDE97"} Road Trip Safety
          </p>
          <ul className="space-y-1">
            {driveTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <span className="text-amber-500 flex-shrink-0 mt-0.5">{"\u26A0\uFE0F"}</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Local ordinance tips */}
      {localTips.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
            {"\uD83D\uDCCD"} Local Pet Tips
          </p>
          <ul className="space-y-1">
            {localTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <span className="text-meadow-500 flex-shrink-0 mt-0.5">{"\u2022"}</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-gray-300">
        {"\u26A0\uFE0F"} Policies change frequently. Verify with your airline
        and destination country before travel.
      </p>
    </div>
  );
}
