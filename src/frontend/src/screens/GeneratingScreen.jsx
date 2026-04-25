import { useMemo, useState } from "react";
import DestinationPicker from "../components/DestinationPicker";
import { Icon } from "../components/Icon.jsx";
import RouteReviewPanel from "../components/RouteReviewPanel.jsx";

const STEP_LABELS = {
  resolve: "Understanding your trip",
  weather: "Checking the weather",
  itinerary: "Crafting your itinerary",
  packing: "Building packing list",
  safety: "Looking up safety info",
};

const WAIT_FACTS = [
  "We cross-check opening hours against your travel dates.",
  "Packing list weights are tuned to the forecast high / low.",
  "For international trips we pull pet airline rules for every carrier.",
  "Car-seat law lookups use the state authority, not crowdsourced data.",
  "If it rains, we quietly swap 2 outdoor activities for indoor ones.",
];

function ProgressStrip({ steps, progress }) {
  const order = steps;
  const done = order.filter((s) => progress[s] === "done").length;
  const pct = Math.round((done / order.length) * 100);
  const activeStep = order.find((s) => progress[s] === "active");
  return (
    <div className="w-full">
      <div className="h-[3px] rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full bg-meadow-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Trip generation progress"
        />
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5 font-mono uppercase tracking-[0.12em]">
        {activeStep ? STEP_LABELS[activeStep] || activeStep : done === order.length ? "Done" : "Starting"}
      </p>
    </div>
  );
}

function Row({ label, value, onEdit }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-b-0">
      <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-gray-400 w-20 flex-shrink-0 mt-0.5">
        {label}
      </p>
      <p className="flex-1 text-[14px] font-medium text-gray-900 leading-snug">{value}</p>
      {onEdit && (
        <button
          onClick={onEdit}
          className="text-gray-400 hover:text-meadow-600 transition inline-flex items-center gap-1 text-[12px]"
          aria-label={`Edit ${label}`}
        >
          <Icon name="pencil" size={12} />
          <span className="hidden sm:inline">Edit</span>
        </button>
      )}
    </div>
  );
}

export default function GeneratingScreen({
  parsedInput,
  progress,
  steps,
  error,
  onPickDestination,
  onConfirmRoute,
  onGoBack,
}) {
  const factIndex = useMemo(() => Math.floor(Math.random() * WAIT_FACTS.length), []);

  // Destination picker takes over
  if (parsedInput?.suggestedDestinations?.length > 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <DestinationPicker
          suggestions={parsedInput.suggestedDestinations}
          onPick={onPickDestination}
        />
      </div>
    );
  }

  const peopleLine = parsedInput
    ? `${parsedInput.adults || 2} adult${(parsedInput.adults || 2) !== 1 ? "s" : ""}${
        parsedInput.childrenAges?.length
          ? ` · ${parsedInput.childrenAges.length} kid${parsedInput.childrenAges.length !== 1 ? "s" : ""} (age${parsedInput.childrenAges.length !== 1 ? "s" : ""} ${parsedInput.childrenAges.join(" & ")})`
          : ""
      }${parsedInput.pets?.length ? ` · ${parsedInput.pets.length} pet${parsedInput.pets.length !== 1 ? "s" : ""}` : ""}`
    : null;

  const dateLine = parsedInput?.startDate
    ? `${parsedInput.startDate}${parsedInput.endDate ? ` — ${parsedInput.endDate}` : ""}`
    : null;

  const needsRouteReview =
    parsedInput &&
    ["multi_stop", "country_tour"].includes(parsedInput.tripShape) &&
    progress?.itinerary !== "active" &&
    progress?.itinerary !== "done";

  return (
    <div className="max-w-xl mx-auto px-4 py-10 md:py-14 flex flex-col gap-6">
      {/* Thin progress strip (F3: demoted from hero) */}
      <ProgressStrip steps={steps} progress={progress} />

      {/* Heading — the audit makes the assumption card the hero; this is a small standing title */}
      <header>
        <h2 className="font-display font-bold text-[22px] md:text-[26px] leading-tight tracking-tight text-gray-900">
          Building your trip plan
        </h2>
        <p className="text-gray-500 text-[14px] mt-1.5">
          Here&rsquo;s what I heard — if any of this is wrong, edit it below.
        </p>
      </header>

      {/* Parsed assumption card — the hero (F3) */}
      {parsedInput && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5">
          <Row
            label="Where"
            value={parsedInput.destination || "Figuring out…"}
            onEdit={onGoBack}
          />
          <Row label="When" value={dateLine} onEdit={onGoBack} />
          <Row label="Who" value={peopleLine} onEdit={onGoBack} />
          {parsedInput.vibe && <Row label="Vibe" value={parsedInput.vibe} onEdit={onGoBack} />}
          {parsedInput.pets?.length > 0 && (
            <Row
              label="Pets"
              value={parsedInput.pets.map((p) => p.species || p.type || "pet").join(", ")}
              onEdit={onGoBack}
            />
          )}
        </div>
      )}

      {needsRouteReview && (
        <RouteReviewPanel
          parsedInput={parsedInput}
          onContinue={onConfirmRoute}
          onBack={onGoBack}
        />
      )}

      {/* While you wait — useful fact (F3) */}
      {!needsRouteReview && (
      <div className="flex items-start gap-3 bg-meadow-50/60 border border-meadow-200 rounded-2xl p-4">
        <span className="mt-0.5 text-meadow-700">
          <Icon name="sparkle" size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-meadow-800/70">
            While you wait
          </p>
          <p className="text-[14px] text-gray-800 leading-snug mt-0.5">
            {WAIT_FACTS[factIndex]}
          </p>
        </div>
      </div>
      )}

      {error && (
        <div
          className="w-full bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          <p className="font-semibold">Something went wrong</p>
          <p className="mt-1">{error}</p>
          <button
            onClick={onGoBack}
            className="mt-2 text-red-700 hover:text-red-900 font-medium text-xs cursor-pointer inline-flex items-center gap-1"
          >
            <Icon name="arrowLeft" size={12} /> Go back and try again
          </button>
        </div>
      )}
    </div>
  );
}
