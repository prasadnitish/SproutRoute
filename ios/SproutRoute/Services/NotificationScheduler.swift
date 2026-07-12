import Foundation
import UserNotifications

struct TripHubNotificationPlan: Hashable {
    var identifier: String
    var title: String
    var body: String
    var url: URL
}

actor NotificationScheduler {
    static func tripHubPlans(for snapshot: GroupTripSnapshotResponse) -> [TripHubNotificationPlan] {
        snapshot.aiSuggestions
            .filter { suggestion in
                suggestion.status == "open" &&
                    (suggestion.severity == "warning" || suggestion.type == "schedule_conflict")
            }
            .prefix(3)
            .map { suggestion in
                TripHubNotificationPlan(
                    identifier: "trip-hub-\(snapshot.trip.id)-\(suggestion.id)",
                    title: "\(snapshot.trip.title) needs attention",
                    body: suggestion.summary,
                    url: SproutRouteDeepLink.tripHubURL(id: snapshot.trip.id)
                )
            }
    }

    func requestAuthorization() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
        } catch {
            return false
        }
    }

    func schedulePackingReminder(for snapshot: TripWidgetSnapshot) async {
        guard !snapshot.startDate.isEmpty else { return }
        let content = UNMutableNotificationContent()
        content.title = "Pack for \(snapshot.destination)"
        content.body = "Your SproutRoute packing list is ready to finish."
        content.sound = .default
        content.userInfo = ["url": SproutRouteDeepLink.packingURL(id: snapshot.id).absoluteString]

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 60 * 60 * 4, repeats: false)
        let request = UNNotificationRequest(identifier: "packing-\(snapshot.id)", content: content, trigger: trigger)
        try? await UNUserNotificationCenter.current().add(request)
    }

    func scheduleWeatherChangeAlert(snapshot: TripWidgetSnapshot, message: String) async {
        let content = UNMutableNotificationContent()
        content.title = "Weather changed for \(snapshot.destination)"
        content.body = message
        content.sound = .default
        content.userInfo = ["url": SproutRouteDeepLink.tripURL(id: snapshot.id).absoluteString]

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
        let request = UNNotificationRequest(identifier: "weather-\(snapshot.id)-\(Date().timeIntervalSince1970)", content: content, trigger: trigger)
        try? await UNUserNotificationCenter.current().add(request)
    }

    func scheduleTripHubSuggestions(for snapshot: GroupTripSnapshotResponse) async {
        for plan in Self.tripHubPlans(for: snapshot) {
            let content = UNMutableNotificationContent()
            content.title = plan.title
            content.body = plan.body
            content.sound = .default
            content.userInfo = ["url": plan.url.absoluteString]

            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 60, repeats: false)
            let request = UNNotificationRequest(identifier: plan.identifier, content: content, trigger: trigger)
            try? await UNUserNotificationCenter.current().add(request)
        }
    }

    func clearSproutRouteNotifications() async {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
}
