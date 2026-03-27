import { useTrip } from "./hooks/useTrip.js";
import { useGeolocation } from "./hooks/useGeolocation.js";
import { usePlacesEnrich } from "./hooks/usePlacesEnrich.js";
import InputScreen from "./screens/InputScreen.jsx";
import GeneratingScreen from "./screens/GeneratingScreen.jsx";
import ResultsScreen from "./screens/ResultsScreen.jsx";

export default function App() {
  const geolocation = useGeolocation();
  const trip = useTrip();
  const { enrichedData, enrich } = usePlacesEnrich();

  return (
    <div className="min-h-screen bg-[#f9fafb] font-body">
      {/* Sticky Nav */}
      <nav className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={trip.screen !== "input" ? trip.goBack : undefined}
            className="flex items-center gap-2 font-display font-extrabold text-lg"
          >
            <img src="/logo.svg" alt="SproutRoute" className="w-8 h-8 rounded-lg" />
            <span className="text-gray-900">Sprout</span>
            <span className="text-meadow-600">Route</span>
          </button>

          <div className="flex items-center gap-3">
            {trip.screen === "results" && trip.tripData?.parsed?.destination && (
              <span className="bg-meadow-50 text-meadow-700 border border-meadow-200 rounded-full px-3 py-1 text-xs font-semibold hidden sm:inline-flex">
                {"\u{1F334}"} {trip.tripData.parsed.destination}
              </span>
            )}
            {trip.screen === "results" && (
              <button
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("q", trip.tripInput);
                  navigator.clipboard.writeText(url.toString());
                }}
                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-meadow-50 rounded-lg text-gray-600 hover:text-meadow-600 transition"
                title="Share trip"
              >
                {"\u2197"}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Screen Router */}
      <main className="max-w-5xl mx-auto">
        {trip.screen === "input" && (
          <InputScreen onSubmit={(text) => trip.submitTrip(text, geolocation)} />
        )}

        {trip.screen === "generating" && (
          <GeneratingScreen
            parsedInput={trip.parsedInput}
            progress={trip.progress}
            steps={trip.STEPS}
            error={trip.error}
            onPickDestination={trip.selectDestination}
            onGoBack={trip.goBack}
          />
        )}

        {trip.screen === "results" && trip.tripData && (
          <ResultsScreen
            tripData={trip.tripData}
            parsedInput={trip.parsedInput}
            packingList={trip.packingList}
            safetyData={trip.safetyData}
            enrichedData={enrichedData}
            enrich={enrich}
            onGoBack={trip.goBack}
          />
        )}
      </main>
    </div>
  );
}
