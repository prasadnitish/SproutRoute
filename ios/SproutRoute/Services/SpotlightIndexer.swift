import CoreSpotlight
import Foundation
import UniformTypeIdentifiers

actor SpotlightIndexer {
    func index(snapshot: TripWidgetSnapshot) async {
        guard snapshot.id != "empty" else { return }
        let attributes = CSSearchableItemAttributeSet(contentType: .content)
        attributes.title = snapshot.destination
        attributes.contentDescription = [
            snapshot.weatherSummary,
            snapshot.nextActivity,
            "\(snapshot.packingPackedCount) of \(snapshot.packingTotalCount) packing items complete"
        ].compactMap { $0 }.joined(separator: ". ")
        attributes.keywords = ["SproutRoute", "trip", "packing", snapshot.destination]

        let item = CSSearchableItem(
            uniqueIdentifier: snapshot.id,
            domainIdentifier: "com.sproutroute.trips",
            attributeSet: attributes
        )
        item.expirationDate = Calendar.current.date(byAdding: .month, value: 6, to: Date())
        try? await CSSearchableIndex.default().indexSearchableItems([item])
    }

    func delete(id: String) async {
        try? await CSSearchableIndex.default().deleteSearchableItems(withIdentifiers: [id])
    }
}
