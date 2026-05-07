import Foundation
import SwiftData

struct LocalDataDeletionReceipt: Equatable {
    var deletedStoredDataKinds: [String]
}

@MainActor
struct LocalDataDeletionService {
    var modelContext: ModelContext
    var snapshotStore: AppGroupSnapshotStore = AppGroupSnapshotStore()
    var analyticsSettings: AnalyticsSettings = AnalyticsSettings()
    var notificationScheduler: NotificationScheduler = NotificationScheduler()
    var liveActivities: LiveActivityController = LiveActivityController()
    var clearsSystemSurfaces = true

    func deleteAllLocalData() async throws -> LocalDataDeletionReceipt {
        try TripRepository(modelContext: modelContext).deleteAllLocalData(snapshotStore: snapshotStore)
        analyticsSettings.setEnabled(false)

        if clearsSystemSurfaces {
            await notificationScheduler.clearSproutRouteNotifications()
            await liveActivities.endAll()
        }

        return LocalDataDeletionReceipt(deletedStoredDataKinds: [
            "saved trips",
            "trip drafts",
            "imported profiles",
            "packing progress",
            "cached weather",
            "notification plans",
            "widget snapshots",
            "analytics identifier"
        ])
    }
}
