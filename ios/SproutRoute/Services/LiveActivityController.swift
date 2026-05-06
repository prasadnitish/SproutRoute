import ActivityKit
import Foundation

actor LiveActivityController {
    private var activeActivities: [String: Activity<TripActivityAttributes>] = [:]

    func startTripActivity(snapshot: TripWidgetSnapshot) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attributes = TripActivityAttributes(tripId: snapshot.id, destination: snapshot.destination)
        let content = ActivityContent(
            state: TripActivityAttributes.ContentState(
                title: snapshot.destination,
                subtitle: snapshot.nextActivity ?? "Trip plan ready",
                progress: snapshot.packingProgress,
                deepLink: SproutRouteDeepLink.tripURL(id: snapshot.id)
            ),
            staleDate: Calendar.current.date(byAdding: .hour, value: 6, to: Date())
        )
        if let activity = try? Activity.request(attributes: attributes, content: content, pushType: nil) {
            activeActivities[snapshot.id] = activity
        }
    }

    func update(snapshot: TripWidgetSnapshot) async {
        let activity = activeActivities[snapshot.id] ?? Activity<TripActivityAttributes>.activities.first { $0.attributes.tripId == snapshot.id }
        guard let activity else { return }
        await activity.update(ActivityContent(
            state: TripActivityAttributes.ContentState(
                title: snapshot.destination,
                subtitle: snapshot.nextActivity ?? "Trip plan ready",
                progress: snapshot.packingProgress,
                deepLink: SproutRouteDeepLink.tripURL(id: snapshot.id)
            ),
            staleDate: Calendar.current.date(byAdding: .hour, value: 6, to: Date())
        ))
    }

    func end(snapshotID: String) async {
        let matches = Activity<TripActivityAttributes>.activities.filter { $0.attributes.tripId == snapshotID }
        for activity in matches {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        activeActivities[snapshotID] = nil
    }
}
