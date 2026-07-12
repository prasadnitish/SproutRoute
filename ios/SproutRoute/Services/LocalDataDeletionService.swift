import Foundation
import SwiftData
import WidgetKit

protocol WidgetTimelineReloading {
    func reloadSproutRouteTimelines()
}

struct WidgetCenterTimelineReloader: WidgetTimelineReloading {
    func reloadSproutRouteTimelines() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}

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
    var tripHubSessionStore: any TripHubSessionStoring = UserDefaultsTripHubSessionStore()
    var spotlight: any SpotlightDeleting = SpotlightIndexer()
    var widgetTimelines: any WidgetTimelineReloading = WidgetCenterTimelineReloader()
    var clearsSystemSurfaces = true

    func deleteAllLocalData() async throws -> LocalDataDeletionReceipt {
        try TripRepository(modelContext: modelContext).deleteAllLocalData(snapshotStore: snapshotStore)
        tripHubSessionStore.clearSession()
        analyticsSettings.setEnabled(false)
        ProductAnalytics.shared.setEnabled(false)

        if clearsSystemSurfaces {
            await spotlight.deleteAllTrips()
            widgetTimelines.reloadSproutRouteTimelines()
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
