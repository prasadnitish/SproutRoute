import Foundation
import SwiftData

@Model
final class SavedTripModel {
    @Attribute(.unique) var id: String
    var destination: String
    var startDate: String
    var endDate: String
    var createdAt: Date
    var updatedAt: Date
    var rawResultData: Data
    var snapshotData: Data
    var recap: String?

    init(
        id: String,
        destination: String,
        startDate: String,
        endDate: String,
        rawResultData: Data,
        snapshotData: Data,
        recap: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.destination = destination
        self.startDate = startDate
        self.endDate = endDate
        self.rawResultData = rawResultData
        self.snapshotData = snapshotData
        self.recap = recap
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var snapshot: TripWidgetSnapshot? {
        try? JSONDecoder.sproutRoute.decode(TripWidgetSnapshot.self, from: snapshotData)
    }

    var tripResult: TripStreamResult? {
        try? JSONDecoder.sproutRoute.decode(TripStreamResult.self, from: rawResultData)
    }
}

@Model
final class TripDraftModel {
    @Attribute(.unique) var id: String
    var prompt: String
    var createdAt: Date
    var updatedAt: Date

    init(id: String = UUID().uuidString, prompt: String, createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id
        self.prompt = prompt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

@Model
final class ImportedProfileModel {
    @Attribute(.unique) var id: String
    var providerHint: String?
    var summary: String?
    var rawText: String
    var profileData: Data
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        providerHint: String?,
        summary: String?,
        rawText: String,
        profileData: Data,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.providerHint = providerHint
        self.summary = summary
        self.rawText = rawText
        self.profileData = profileData
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var profile: UserTravelProfile? {
        try? JSONDecoder.sproutRoute.decode(UserTravelProfile.self, from: profileData)
    }
}

@Model
final class PackingCheckStateModel {
    @Attribute(.unique) var id: String
    var tripId: String
    var itemId: String
    var isPacked: Bool
    var updatedAt: Date

    init(id: String = UUID().uuidString, tripId: String, itemId: String, isPacked: Bool, updatedAt: Date = Date()) {
        self.id = id
        self.tripId = tripId
        self.itemId = itemId
        self.isPacked = isPacked
        self.updatedAt = updatedAt
    }
}

@Model
final class CachedWeatherSnapshotModel {
    @Attribute(.unique) var id: String
    var tripId: String
    var fetchedAt: Date
    var summary: String
    var snapshotData: Data

    init(id: String = UUID().uuidString, tripId: String, fetchedAt: Date, summary: String, snapshotData: Data) {
        self.id = id
        self.tripId = tripId
        self.fetchedAt = fetchedAt
        self.summary = summary
        self.snapshotData = snapshotData
    }
}

@Model
final class NotificationPlanModel {
    @Attribute(.unique) var id: String
    var tripId: String
    var kind: String
    var scheduledAt: Date
    var delivered: Bool

    init(id: String = UUID().uuidString, tripId: String, kind: String, scheduledAt: Date, delivered: Bool = false) {
        self.id = id
        self.tripId = tripId
        self.kind = kind
        self.scheduledAt = scheduledAt
        self.delivered = delivered
    }
}

enum SproutRouteSchema {
    static var models: [any PersistentModel.Type] {
        [
            SavedTripModel.self,
            TripDraftModel.self,
            ImportedProfileModel.self,
            PackingCheckStateModel.self,
            CachedWeatherSnapshotModel.self,
            NotificationPlanModel.self
        ]
    }
}
