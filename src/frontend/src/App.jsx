import { useState } from "react";
import { useTrip } from "./hooks/useTrip.js";
import { analytics } from "./utils/analytics.js";
import { useGeolocation } from "./hooks/useGeolocation.js";
import { usePlacesEnrich } from "./hooks/usePlacesEnrich.js";
import InputScreen from "./screens/InputScreen.jsx";
import GeneratingScreen from "./screens/GeneratingScreen.jsx";
import ResultsScreen from "./screens/ResultsScreen.jsx";
import ProfileImportModal from "./components/ProfileImportModal.jsx";
import { Icon } from "./components/Icon.jsx";

function loadSavedProfile() {
  try {
    const p = localStorage.getItem("sprout:profile");
    return p ? JSON.parse(p) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const geolocation = useGeolocation();
  const trip = useTrip();
  const { enrichedData, enrich } = usePlacesEnrich();
  const [showImport, setShowImport] = useState(false);
  const [savedProfile, setSavedProfile] = useState(loadSavedProfile);

  const goHome = () => {
    if (trip.screen !== "input") trip.goBack();
  };

  return (
    <div className="min-h-screen bg-[#f9fafb] font-body">
      {/* Sticky Nav */}
      <nav className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          {/* Logo — always returns to home (F9) */}
          <button
            onClick={goHome}
            className="flex items-center gap-2 font-display font-extrabold text-lg cursor-pointer"
            aria-label="SproutRoute home"
          >
            <img src="/logo.svg" alt="" className="w-8 h-8 rounded-lg" />
            <span className="text-gray-900">Sprout</span>
            <span className="text-meadow-600">Route</span>
          </button>

          <div className="flex items-center gap-2">
            {/* Explicit back arrow when past the input screen (F9) */}
            {trip.screen === "results" && (
              <button
                onClick={trip.goBack}
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg px-2.5 py-1.5 transition"
                aria-label="Back to input"
              >
                <Icon name="arrowLeft" size={14} /> Back
              </button>
            )}

            {trip.screen === "results" && trip.tripData?.parsed?.destination && (
              <span className="hidden sm:inline-flex items-center gap-1 bg-meadow-50 text-meadow-700 border border-meadow-200 rounded-full px-3 py-1 text-xs font-semibold">
                <Icon name="pin" size={12} /> {trip.tripData.parsed.destination}
              </span>
            )}

            {trip.screen === "results" && (
              <button
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("dest", trip.tripData?.parsed?.destination || "");
                  navigator.clipboard.writeText(url.toString());
                  analytics.shareClicked();
                }}
                className="w-8 h-8 inline-flex items-center justify-center bg-gray-100 hover:bg-meadow-50 rounded-lg text-gray-600 hover:text-meadow-600 transition"
                title="Share trip"
                aria-label="Share trip link"
              >
                <Icon name="share" size={14} />
              </button>
            )}

            {/* Profile — F10: moved to top-right nav */}
            {trip.screen === "input" && (
              <button
                onClick={() => setShowImport(true)}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition ${
                  savedProfile
                    ? "bg-meadow-50 border-meadow-200 text-meadow-700 hover:bg-meadow-100"
                    : "bg-white border-gray-200 text-gray-600 hover:border-meadow-400 hover:text-meadow-700"
                }`}
                aria-label={savedProfile ? "Edit profile" : "Import profile"}
              >
                <Icon name="kids" size={14} />
                <span className="hidden sm:inline">{savedProfile ? "Profile" : "Import profile"}</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Screen Router */}
      <main className="max-w-5xl mx-auto">
        {trip.screen === "input" && (
          <InputScreen
            savedProfile={savedProfile}
            onSubmit={(arg) => {
              const text = typeof arg === "string" ? arg : arg?.text;
              const profileOverride = typeof arg === "object" ? arg?.savedProfile : null;
              trip.submitTrip(text, geolocation, profileOverride || savedProfile);
            }}
          />
        )}

        {trip.screen === "generating" && (
          <GeneratingScreen
            parsedInput={trip.parsedInput}
            progress={trip.progress}
            steps={trip.STEPS}
            error={trip.error}
            onPickDestination={trip.selectDestination}
            onConfirmRoute={trip.confirmRouteTrip}
            onGoBack={trip.goBack}
          />
        )}

        {trip.screen === "results" && trip.tripData && (
          <ResultsScreen
            tripData={trip.tripData}
            parsedInput={trip.parsedInput}
            packingList={trip.packingList}
            packingError={trip.packingError}
            safetyData={trip.safetyData}
            petSafetyData={trip.petSafetyData}
            carSeatData={trip.carSeatData}
            enrichedData={enrichedData}
            enrich={enrich}
            onGoBack={trip.goBack}
            onRetryPacking={trip.retryPacking}
            progress={trip.progress}
            steps={trip.STEPS}
          />
        )}
      </main>

      <ProfileImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSaved={(profile) => setSavedProfile(profile)}
      />
    </div>
  );
}
