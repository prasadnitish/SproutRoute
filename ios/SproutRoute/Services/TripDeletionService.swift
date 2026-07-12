import SwiftData

@MainActor
struct TripDeletionService {
    var modelContext: ModelContext
    var snapshotStore: AppGroupSnapshotStore = AppGroupSnapshotStore()
    var spotlight: any SpotlightDeleting = SpotlightIndexer()
    var liveActivities: LiveActivityController = LiveActivityController()
    var widgetTimelines: any WidgetTimelineReloading = WidgetCenterTimelineReloader()

    func delete(_ trip: SavedTripModel) async throws {
        let deletedID = trip.id
        let wasLatestSnapshot = snapshotStore.loadLatestTripSnapshot()?.id == deletedID
        try TripRepository(modelContext: modelContext).delete(trip)
        await spotlight.delete(id: deletedID)
        await liveActivities.end(snapshotID: deletedID)

        if wasLatestSnapshot {
            snapshotStore.clearLatestTripSnapshot()
            widgetTimelines.reloadSproutRouteTimelines()
        }
    }
}
