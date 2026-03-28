import DestinationPicker from "../components/DestinationPicker";

const STEP_LABELS = {
  resolve: "Understanding your trip",
  weather: "Checking the weather",
  itinerary: "Crafting your itinerary",
  packing: "Building packing list",
  safety: "Looking up safety info",
};

function StepIcon({ status }) {
  if (status === "done")
    return <span className="text-meadow-600 font-bold">{"\u2713"}</span>;
  if (status === "active")
    return <span className="animate-spin inline-block">{"\u27F3"}</span>;
  return <span className="text-gray-300">{"\u25CB"}</span>;
}

export default function GeneratingScreen({
  parsedInput,
  progress,
  steps,
  error,
  onPickDestination,
  onGoBack,
}) {
  // Destination picker mode
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

  return (
    <div className="max-w-md mx-auto px-4 py-12 flex flex-col items-center gap-5">
      {/* Animated icon */}
      <span className="text-4xl animate-bounce">{"\u{1F30D}"}</span>

      {/* Title */}
      <h2 className="font-display font-bold text-2xl text-center">
        Building your trip plan&hellip;
      </h2>
      <p className="text-gray-500 text-center text-sm">
        This takes about 10&ndash;15 seconds
      </p>

      {/* Assumption card */}
      {parsedInput && (
        <div className="w-full bg-meadow-50 border border-meadow-200 rounded-xl p-4 my-2 text-sm space-y-1">
          {parsedInput.destination && (
            <p>
              <span className="mr-1">{"\u{1F4CD}"}</span>
              {parsedInput.destination}
            </p>
          )}
          {parsedInput.startDate && (
            <p>
              <span className="mr-1">{"\u{1F4C5}"}</span>
              {parsedInput.startDate}
              {parsedInput.endDate ? ` \u2013 ${parsedInput.endDate}` : ""}
            </p>
          )}
          <p>
            <span className="mr-1">{"\u{1F468}\u200D\u{1F467}\u200D\u{1F466}"}</span>
            {parsedInput.adults || 2} adult{(parsedInput.adults || 2) !== 1 ? "s" : ""}
            {parsedInput.childrenAges?.length > 0 &&
              ` + kids ${parsedInput.childrenAges.join(" & ")}`}
          </p>
          {parsedInput.vibe && (
            <p>
              <span className="mr-1">{"\u{1F3D6}"}</span>
              {parsedInput.vibe}
            </p>
          )}
          <button
            onClick={onGoBack}
            className="text-meadow-600 hover:text-meadow-800 font-medium text-xs mt-1 cursor-pointer"
          >
            {"\u270F"} Something wrong? Edit &rarr;
          </button>
        </div>
      )}

      {/* Progress steps */}
      <div className="w-full space-y-2">
        {steps.map((step) => (
          <div key={step} className="flex items-center gap-3 px-2 py-1.5">
            <StepIcon status={progress[step]} />
            <span
              className={`text-sm ${
                progress[step] === "active"
                  ? "text-gray-900 font-medium"
                  : progress[step] === "done"
                  ? "text-gray-400"
                  : "text-gray-300"
              }`}
            >
              {STEP_LABELS[step] || step}
            </span>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="w-full bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700" role="alert" aria-live="assertive">
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1">{error}</p>
          <button
            onClick={onGoBack}
            className="mt-2 text-red-600 hover:text-red-800 font-medium text-xs cursor-pointer"
          >
            &larr; Go back and try again
          </button>
        </div>
      )}
    </div>
  );
}
