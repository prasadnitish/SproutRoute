import XCTest
@testable import SproutRoute

final class SnapshotStoreTests: XCTestCase {
    func testSavesAndLoadsLatestTripSnapshot() throws {
        let defaults = UserDefaults(suiteName: "SproutRouteSnapshotStoreTests-\(UUID().uuidString)")!
        let store = AppGroupSnapshotStore(defaults: defaults)
        let snapshot = TripWidgetSnapshot(
            id: "trip-1",
            destination: "Vancouver",
            startDate: "2026-07-01",
            endDate: "2026-07-05",
            nextActivity: "Stanley Park",
            packingPackedCount: 2,
            packingTotalCount: 5,
            weatherSummary: "Cool mornings",
            weatherAlert: nil,
            updatedAt: Date()
        )

        try store.saveLatestTripSnapshot(snapshot)
        let loaded = store.loadLatestTripSnapshot()

        XCTAssertEqual(loaded?.id, "trip-1")
        XCTAssertEqual(loaded?.packingProgress ?? 0, 0.4, accuracy: 0.001)
    }
}
