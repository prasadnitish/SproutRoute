import Foundation
import SwiftData

@MainActor
struct TripRepository {
    let modelContext: ModelContext

    func upsert(result: TripStreamResult, snapshotStore: AppGroupSnapshotStore) throws -> SavedTripModel {
        guard let trip = result.trip else {
            throw ApiErrorEnvelope(code: "NO_TRIP", message: "No trip is available to save.", category: "validation", retryable: false, requestId: result.requestId)
        }

        let id = result.requestId ?? trip.destination
        let snapshot = makeSnapshot(result: result, id: id)
        let rawData = try JSONEncoder.sproutRoute.encode(result)
        let snapshotData = try JSONEncoder.sproutRoute.encode(snapshot)

        let descriptor = FetchDescriptor<SavedTripModel>(
            predicate: #Predicate { $0.id == id }
        )
        if let existing = try modelContext.fetch(descriptor).first {
            existing.destination = trip.destination
            existing.startDate = trip.startDate
            existing.endDate = trip.endDate
            existing.updatedAt = Date()
            existing.rawResultData = rawData
            existing.snapshotData = snapshotData
            try modelContext.save()
            try snapshotStore.saveLatestTripSnapshot(snapshot)
            return existing
        }

        let saved = SavedTripModel(
            id: id,
            destination: trip.destination,
            startDate: trip.startDate,
            endDate: trip.endDate,
            rawResultData: rawData,
            snapshotData: snapshotData
        )
        modelContext.insert(saved)
        try modelContext.save()
        try snapshotStore.saveLatestTripSnapshot(snapshot)
        return saved
    }

    func delete(_ trip: SavedTripModel) throws {
        modelContext.delete(trip)
        try modelContext.save()
    }

    func deleteAllLocalData(snapshotStore: AppGroupSnapshotStore = AppGroupSnapshotStore()) throws {
        for trip in try modelContext.fetch(FetchDescriptor<SavedTripModel>()) {
            modelContext.delete(trip)
        }
        for draft in try modelContext.fetch(FetchDescriptor<TripDraftModel>()) {
            modelContext.delete(draft)
        }
        for profile in try modelContext.fetch(FetchDescriptor<ImportedProfileModel>()) {
            modelContext.delete(profile)
        }
        for state in try modelContext.fetch(FetchDescriptor<PackingCheckStateModel>()) {
            modelContext.delete(state)
        }
        for snapshot in try modelContext.fetch(FetchDescriptor<CachedWeatherSnapshotModel>()) {
            modelContext.delete(snapshot)
        }
        for notification in try modelContext.fetch(FetchDescriptor<NotificationPlanModel>()) {
            modelContext.delete(notification)
        }
        try modelContext.save()
        snapshotStore.clearLatestTripSnapshot()
    }

    func packedItemIds(forTripId tripId: String) throws -> Set<String> {
        let descriptor = FetchDescriptor<PackingCheckStateModel>(
            predicate: #Predicate { $0.tripId == tripId && $0.isPacked }
        )
        return Set(try modelContext.fetch(descriptor).map(\.itemId))
    }

    func setPackingItem(_ itemId: String, packed: Bool, forTripId tripId: String) throws {
        let stateId = "\(tripId)::\(itemId)"
        let descriptor = FetchDescriptor<PackingCheckStateModel>(
            predicate: #Predicate { $0.id == stateId }
        )

        if let existing = try modelContext.fetch(descriptor).first {
            existing.isPacked = packed
            existing.updatedAt = Date()
        } else {
            modelContext.insert(PackingCheckStateModel(
                id: stateId,
                tripId: tripId,
                itemId: itemId,
                isPacked: packed
            ))
        }

        try modelContext.save()
    }

    func latestImportedProfile() throws -> ImportedProfileModel? {
        var descriptor = FetchDescriptor<ImportedProfileModel>(
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        descriptor.fetchLimit = 1
        return try modelContext.fetch(descriptor).first
    }

    func saveImportedProfile(_ response: ProfileNormalizeResponse, rawText _: String) throws -> ImportedProfileModel {
        let profileData = try JSONEncoder.sproutRoute.encode(response.normalizedProfile)
        for existing in try modelContext.fetch(FetchDescriptor<ImportedProfileModel>()) {
            modelContext.delete(existing)
        }
        let model = ImportedProfileModel(
            providerHint: response.providerHint,
            summary: response.normalizedProfile.profileSummary,
            rawText: "",
            profileData: profileData
        )
        modelContext.insert(model)
        try modelContext.save()
        return model
    }

    func makeSnapshot(result: TripStreamResult, id: String? = nil) -> TripWidgetSnapshot {
        let packingItems = result.packingList?.categories.flatMap(\.items) ?? []
        let nextActivity = result.tripPlan?.scheduledItinerary?.first?.scheduled.first?.name
            ?? result.tripPlan?.dailyItinerary.first?.activities.first.flatMap { activityID in
                result.tripPlan?.suggestedActivities.first(where: { $0.id == activityID })?.name ?? activityID
            }
        let packedCount = ((try? packedItemIds(forTripId: id ?? result.requestId ?? result.trip?.destination ?? "")) ?? []).count

        return TripWidgetSnapshot(
            id: id ?? result.requestId ?? result.trip?.destination ?? UUID().uuidString,
            destination: result.trip?.destination ?? "Saved trip",
            startDate: result.trip?.startDate ?? "",
            endDate: result.trip?.endDate ?? "",
            nextActivity: nextActivity,
            packingPackedCount: packedCount,
            packingTotalCount: packingItems.count,
            weatherSummary: result.weather?.summary,
            weatherAlert: nil,
            updatedAt: Date()
        )
    }
}
