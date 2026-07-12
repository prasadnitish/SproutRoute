import AppIntents
import Foundation

struct OpenCurrentTripIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Current SproutRoute Trip"
    static var description = IntentDescription("Open the latest saved SproutRoute trip.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        .result()
    }
}

struct ShowTodayItineraryIntent: AppIntent {
    static var title: LocalizedStringResource = "Show Today in SproutRoute"
    static var description = IntentDescription("Open today's itinerary for the latest saved trip.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        .result()
    }
}

struct OpenPackingListIntent: AppIntent {
    static var title: LocalizedStringResource = "Open SproutRoute Packing List"
    static var description = IntentDescription("Open the packing list for the latest saved trip.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        .result()
    }
}

struct OpenTripHubIntent: AppIntent {
    static var title: LocalizedStringResource = "Open SproutRoute Trip Hub"
    static var description = IntentDescription("Open the shared trip organizer.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        .result()
    }
}

struct MarkPackingItemPackedIntent: AppIntent {
    static var title: LocalizedStringResource = "Mark Packing Item Packed"
    static var description = IntentDescription("Update local packing progress for the latest saved trip.")

    @Parameter(title: "Packed Count")
    var packedCount: Int

    func perform() async throws -> some IntentResult {
        let store = AppGroupSnapshotStore()
        guard var snapshot = store.loadLatestTripSnapshot() else {
            return .result(dialog: "No saved SproutRoute trip was found.")
        }
        snapshot.packingPackedCount = max(0, min(packedCount, snapshot.packingTotalCount))
        snapshot.updatedAt = Date()
        try? store.saveLatestTripSnapshot(snapshot)
        return .result(dialog: "Packing progress updated.")
    }
}

struct StartPlanningIntent: AppIntent {
    static var title: LocalizedStringResource = "Start SproutRoute Plan"
    static var description = IntentDescription("Open SproutRoute to start planning a trip.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Destination")
    var destination: String

    func perform() async throws -> some IntentResult {
        .result()
    }
}

struct SproutRouteShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenCurrentTripIntent(),
            phrases: [
                "Open my trip in \(.applicationName)",
                "Show \(.applicationName)"
            ],
            shortTitle: "Open Trip",
            systemImageName: "suitcase.rolling"
        )

        AppShortcut(
            intent: OpenPackingListIntent(),
            phrases: [
                "Open my packing list in \(.applicationName)",
                "Show packing in \(.applicationName)"
            ],
            shortTitle: "Packing",
            systemImageName: "backpack"
        )

        AppShortcut(
            intent: OpenTripHubIntent(),
            phrases: [
                "Open Trip Hub in \(.applicationName)",
                "Show Trip Hub in \(.applicationName)"
            ],
            shortTitle: "Trip Hub",
            systemImageName: "person.3.sequence"
        )

        AppShortcut(
            intent: StartPlanningIntent(),
            phrases: [
                "Plan a trip with \(.applicationName)"
            ],
            shortTitle: "Plan Trip",
            systemImageName: "sparkles"
        )
    }
}
