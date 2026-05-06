import Foundation

actor FoundationModelsRecapService {
    func offlineRecap(for result: TripStreamResult) async -> String? {
        guard #available(iOS 26.0, *) else { return nil }
        let destination = result.trip?.destination ?? "your trip"
        let dayCount = result.tripPlan?.dailyItinerary.count ?? 0
        let firstTip = result.tripPlan?.tips.first
        return [destination, "\(dayCount) planned days", firstTip].compactMap { $0 }.joined(separator: ". ")
    }
}
