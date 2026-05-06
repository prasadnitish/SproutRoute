import SwiftData
import XCTest
@testable import SproutRoute

@MainActor
final class SwiftDataPersistenceTests: XCTestCase {
    func testSavedTripPersistsAndDeletes() throws {
        let schema = Schema(SproutRouteSchema.models)
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        let context = ModelContext(container)

        let result = TripStreamResult(
            requestId: "trip-1",
            trip: TripMeta(
                requestId: "trip-1",
                destination: "San Diego",
                startDate: "2026-06-01",
                endDate: "2026-06-03"
            ),
            weather: WeatherForecast(summary: "Sunny", forecast: []),
            tripPlan: TripPlanResult(overview: "Beach trip", suggestedActivities: [], dailyItinerary: [], tips: []),
            packingList: PackingList(categories: []),
            parsed: nil
        )

        let defaults = UserDefaults(suiteName: "SproutRoutePersistenceTests-\(UUID().uuidString)")!
        let saved = try TripRepository(modelContext: context).upsert(result: result, snapshotStore: AppGroupSnapshotStore(defaults: defaults))
        XCTAssertEqual(saved.destination, "San Diego")

        let trips = try context.fetch(FetchDescriptor<SavedTripModel>())
        XCTAssertEqual(trips.count, 1)

        try TripRepository(modelContext: context).delete(saved)
        let remaining = try context.fetch(FetchDescriptor<SavedTripModel>())
        XCTAssertTrue(remaining.isEmpty)
    }

    func testPackingCheckStateTogglesAndRestoresPackedItems() throws {
        let schema = Schema(SproutRouteSchema.models)
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        let context = ModelContext(container)
        let repository = TripRepository(modelContext: context)

        try repository.setPackingItem("Diapers-", packed: true, forTripId: "trip-1")
        XCTAssertEqual(try repository.packedItemIds(forTripId: "trip-1"), ["Diapers-"])

        try repository.setPackingItem("Diapers-", packed: false, forTripId: "trip-1")
        XCTAssertTrue(try repository.packedItemIds(forTripId: "trip-1").isEmpty)
    }
}
