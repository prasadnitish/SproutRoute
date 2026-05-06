import ActivityKit
import Foundation

struct TripActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var title: String
        var subtitle: String
        var progress: Double
        var deepLink: URL?
    }

    var tripId: String
    var destination: String
}
