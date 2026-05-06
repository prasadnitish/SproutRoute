import Foundation
import UserNotifications

actor NotificationScheduler {
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
}
