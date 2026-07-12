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

    func testDeleteAllLocalDataClearsStoredDataSnapshotAndAnalyticsIdentifier() async throws {
        let schema = Schema(SproutRouteSchema.models)
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        let context = ModelContext(container)
        let repository = TripRepository(modelContext: context)

        let result = TripStreamResult(
            requestId: "trip-delete",
            trip: TripMeta(
                requestId: "trip-delete",
                destination: "San Diego",
                startDate: "2026-06-01",
                endDate: "2026-06-03"
            ),
            weather: WeatherForecast(summary: "Sunny", forecast: []),
            tripPlan: TripPlanResult(overview: "Beach trip", suggestedActivities: [], dailyItinerary: [], tips: []),
            packingList: PackingList(categories: []),
            parsed: nil
        )
        let snapshotDefaults = UserDefaults(suiteName: "SproutRouteDeletionSnapshotTests-\(UUID().uuidString)")!
        let snapshotStore = AppGroupSnapshotStore(defaults: snapshotDefaults)
        _ = try repository.upsert(result: result, snapshotStore: snapshotStore)
        try repository.setPackingItem("Diapers-", packed: true, forTripId: "trip-delete")

        let analyticsDefaults = UserDefaults(suiteName: "SproutRouteDeletionAnalyticsTests-\(UUID().uuidString)")!
        let analyticsSettings = AnalyticsSettings(defaults: analyticsDefaults)
        analyticsSettings.setEnabled(true)
        let originalIdentifier = analyticsSettings.distinctId

        let receipt = try await LocalDataDeletionService(
            modelContext: context,
            snapshotStore: snapshotStore,
            analyticsSettings: analyticsSettings,
            clearsSystemSurfaces: false
        ).deleteAllLocalData()

        XCTAssertEqual(receipt.deletedStoredDataKinds, [
            "saved trips",
            "trip drafts",
            "imported profiles",
            "packing progress",
            "cached weather",
            "notification plans",
            "widget snapshots",
            "analytics identifier"
        ])
        XCTAssertTrue(try context.fetch(FetchDescriptor<SavedTripModel>()).isEmpty)
        XCTAssertTrue(try context.fetch(FetchDescriptor<PackingCheckStateModel>()).isEmpty)
        XCTAssertNil(snapshotStore.loadLatestTripSnapshot())
        XCTAssertFalse(analyticsSettings.isEnabled)
        analyticsSettings.setEnabled(true)
        XCTAssertNotEqual(analyticsSettings.distinctId, originalIdentifier)
    }

    func testDeleteAllClearsTripHubSpotlightAndWidgetTimelines() async throws {
        let schema = Schema(SproutRouteSchema.models)
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        let context = ModelContext(container)
        let sessionStore = DeletionTripHubSessionStore()
        sessionStore.saveSession(TripHubSession(
            tripId: "trip-delete",
            participantId: "participant-1",
            participantAccessToken: "gtp_sensitive",
            displayName: "Nitish",
            inviteCode: "sensitive-invite",
            tripTitle: "Vegas"
        ))
        let spotlight = DeletionSpotlightSpy()
        let widgets = DeletionWidgetTimelineSpy()

        _ = try await LocalDataDeletionService(
            modelContext: context,
            tripHubSessionStore: sessionStore,
            spotlight: spotlight,
            widgetTimelines: widgets
        ).deleteAllLocalData()

        XCTAssertNil(sessionStore.loadSession())
        let spotlightDeleteAllCount = await spotlight.deleteAllCount
        XCTAssertEqual(spotlightDeleteAllCount, 1)
        XCTAssertEqual(widgets.reloadCount, 1)
    }

    func testImportedProfilePersistsOnlyOneMinimizedProfile() throws {
        let schema = Schema(SproutRouteSchema.models)
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        let context = ModelContext(container)
        let repository = TripRepository(modelContext: context)
        let profile = UserTravelProfile(
            id: nil,
            userId: nil,
            version: nil,
            food: nil,
            travelStyle: nil,
            activities: nil,
            personality: nil,
            family: nil,
            constraints: nil,
            priorities: nil,
            profileSummary: "Family traveler",
            unknowns: [],
            createdAt: nil,
            updatedAt: nil
        )
        let response = ProfileNormalizeResponse(normalizedProfile: profile, providerHint: "chatgpt")

        _ = try repository.saveImportedProfile(response, rawText: "sensitive-source-one")
        _ = try repository.saveImportedProfile(response, rawText: "sensitive-source-two")

        let stored = try context.fetch(FetchDescriptor<ImportedProfileModel>())
        XCTAssertEqual(stored.count, 1)
        XCTAssertEqual(stored.first?.rawText, "")
        XCTAssertFalse(stored.first?.rawText.contains("sensitive-source") == true)
    }
}

private final class DeletionTripHubSessionStore: TripHubSessionStoring {
    private var session: TripHubSession?

    func loadSession() -> TripHubSession? { session }
    func saveSession(_ session: TripHubSession) { self.session = session }
    func clearSession() { session = nil }
}

private actor DeletionSpotlightSpy: SpotlightDeleting {
    private(set) var deleteAllCount = 0
    func delete(id: String) async {}
    func deleteAllTrips() async { deleteAllCount += 1 }
}

private final class DeletionWidgetTimelineSpy: WidgetTimelineReloading {
    private(set) var reloadCount = 0
    func reloadSproutRouteTimelines() { reloadCount += 1 }
}
