import XCTest
@testable import SproutRoute

@MainActor
final class TripPlannerProgressTests: XCTestCase {
    func testItineraryChunkMarksItineraryProgressDone() {
        let planner = TripPlanner()

        planner.apply(.itineraryUpdate(TripPlanResult(
            overview: "A useful family itinerary.",
            suggestedActivities: [],
            dailyItinerary: [],
            tips: []
        )))

        XCTAssertEqual(planner.progress["itinerary"], "done")
    }

    func testOpenSavedTripHydratesCurrentResultForOtherTabs() {
        let planner = TripPlanner()
        let savedResult = TripStreamResult(
            requestId: "saved-trip-1",
            trip: TripMeta(
                requestId: "saved-trip-1",
                destination: "San Diego",
                startDate: "2026-05-04",
                endDate: "2026-05-08",
                lat: 32.717,
                lon: -117.163
            ),
            weather: WeatherForecast(summary: "Mild", forecast: []),
            tripPlan: TripPlanResult(overview: "Family beach trip", suggestedActivities: [], dailyItinerary: [], tips: []),
            packingList: nil,
            parsed: nil
        )

        planner.openSavedTrip(savedResult)

        XCTAssertEqual(planner.phase, .showingResults)
        XCTAssertEqual(planner.currentResult.trip?.destination, "San Diego")
        XCTAssertEqual(planner.currentResult.trip?.lat, 32.717)
        XCTAssertEqual(planner.currentResult.requestId, "saved-trip-1")
    }
}
