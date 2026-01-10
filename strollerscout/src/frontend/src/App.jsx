import { useState, useEffect } from "react";
import TripInputForm from "./components/TripInputForm";
import TripPlanDisplay from "./components/TripPlanDisplay";
import WeatherDisplay from "./components/WeatherDisplay";
import PackingChecklist from "./components/PackingChecklist";
import { generateTripPlan, generatePackingList } from "./services/api";

function App() {
  const [step, setStep] = useState("input");
  const [tripData, setTripData] = useState(null);
  const [tripPlan, setTripPlan] = useState(null);
  const [weather, setWeather] = useState(null);
  const [packingList, setPackingList] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const savedData = localStorage.getItem("strollerscout_trip");
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.packingList) {
          setTripData(parsed.trip);
          setTripPlan(parsed.tripPlan);
          setWeather(parsed.weather);
          setPackingList(parsed.packingList);
          setStep("packing");
        } else if (parsed.tripPlan) {
          setTripData(parsed.trip);
          setTripPlan(parsed.tripPlan);
          setWeather(parsed.weather);
          setStep("plan");
        }
      } catch (err) {
        console.error("Failed to load saved trip:", err);
      }
    }
  }, []);

  const handleGeneratePlan = async (formData) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await generateTripPlan(formData);

      setTripData(result.trip || formData);
      setWeather(result.weather);
      setTripPlan(result.tripPlan);
      setStep("plan");

      const dataToSave = {
        trip: result.trip || formData,
        weather: result.weather,
        tripPlan: result.tripPlan,
        lastModified: new Date().toISOString(),
      };
      localStorage.setItem("strollerscout_trip", JSON.stringify(dataToSave));
    } catch (err) {
      setError(err.message || "Failed to generate trip plan");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprovePlan = async (approvedActivities) => {
    setIsLoading(true);
    setError(null);

    try {
      const activityCategories = approvedActivities.map((a) => a.category);

      const packingData = {
        ...tripData,
        activities: activityCategories,
        approvedActivities,
      };

      const result = await generatePackingList(packingData);

      setPackingList(result.packingList);
      setStep("packing");

      const dataToSave = {
        trip: tripData,
        weather,
        tripPlan,
        packingList: result.packingList,
        lastModified: new Date().toISOString(),
      };
      localStorage.setItem("strollerscout_trip", JSON.stringify(dataToSave));
    } catch (err) {
      setError(err.message || "Failed to generate packing list");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setStep("input");
    setTripData(null);
    setTripPlan(null);
    setWeather(null);
    setPackingList(null);
    setError(null);
    localStorage.removeItem("strollerscout_trip");
  };

  const handleBackToPlan = () => {
    setStep("plan");
    setPackingList(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">
            StrollerScout 🧳
          </h1>
          <p className="text-lg text-gray-600">
            Smart Trip Planning & Packing for Parents
          </p>
        </header>

        <main>
          {step === "input" && (
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-6">
                Plan Your Trip
              </h2>
              <TripInputForm onSubmit={handleGeneratePlan} />
            </div>
          )}

          {(step === "plan" || step === "packing") && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-800">
                      Trip to {tripData.destination}
                    </h2>
                    <p className="text-gray-600">
                      {tripData.startDate} to {tripData.endDate} (
                      {tripData.duration} days)
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {step === "packing" && (
                      <button
                        onClick={handleBackToPlan}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Back to Plan
                      </button>
                    )}
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Start Over
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                {isLoading && (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">
                      {step === "plan"
                        ? "Generating your personalized trip plan..."
                        : "Generating your packing list..."}
                    </p>
                  </div>
                )}

                {!isLoading && weather && <WeatherDisplay weather={weather} />}

                {!isLoading && step === "plan" && tripPlan && (
                  <TripPlanDisplay
                    tripPlan={tripPlan}
                    onApprove={handleApprovePlan}
                  />
                )}

                {!isLoading && step === "packing" && packingList && (
                  <PackingChecklist packingList={packingList} />
                )}
              </div>
            </div>
          )}
        </main>

        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>Built with React, Vite, and Claude API</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
