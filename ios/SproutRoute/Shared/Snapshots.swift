import Foundation

struct TripWidgetSnapshot: Codable, Identifiable, Hashable {
    var id: String
    var destination: String
    var startDate: String
    var endDate: String
    var nextActivity: String?
    var packingPackedCount: Int
    var packingTotalCount: Int
    var weatherSummary: String?
    var weatherAlert: String?
    var updatedAt: Date

    var packingProgress: Double {
        guard packingTotalCount > 0 else { return 0 }
        return Double(packingPackedCount) / Double(packingTotalCount)
    }

    static let empty = TripWidgetSnapshot(
        id: "empty",
        destination: "No saved trip",
        startDate: "",
        endDate: "",
        nextActivity: nil,
        packingPackedCount: 0,
        packingTotalCount: 0,
        weatherSummary: nil,
        weatherAlert: nil,
        updatedAt: Date()
    )
}

final class AppGroupSnapshotStore {
    static let defaultSuiteName = "group.com.sproutroute.app"
    private let defaults: UserDefaults
    private let key = "sproutroute.latestTripSnapshot"

    init(suiteName: String = AppGroupSnapshotStore.defaultSuiteName) {
        self.defaults = UserDefaults(suiteName: suiteName) ?? .standard
    }

    init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    func saveLatestTripSnapshot(_ snapshot: TripWidgetSnapshot) throws {
        let data = try JSONEncoder.sproutRoute.encode(snapshot)
        defaults.set(data, forKey: key)
    }

    func loadLatestTripSnapshot() -> TripWidgetSnapshot? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder.sproutRoute.decode(TripWidgetSnapshot.self, from: data)
    }

    func clearLatestTripSnapshot() {
        defaults.removeObject(forKey: key)
    }
}

extension JSONEncoder {
    static var sproutRoute: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}

extension JSONDecoder {
    static var sproutRoute: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
