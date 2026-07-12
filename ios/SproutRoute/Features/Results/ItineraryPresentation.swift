import Foundation

enum ItineraryPresentation {
    private static let fallbackSlots: [(start: String, end: String)] = [
        ("9:00 AM", "11:00 AM"),
        ("11:30 AM", "12:30 PM"),
        ("1:30 PM", "3:00 PM"),
        ("3:30 PM", "5:00 PM"),
        ("5:30 PM", "6:30 PM")
    ]

    static func days(for plan: TripPlanResult, destination: String) -> [ScheduledItineraryDay] {
        if let scheduled = plan.scheduledItinerary, !scheduled.isEmpty {
            return scheduled.map { day in
                ScheduledItineraryDay(
                    date: day.date,
                    scheduled: day.scheduled.map { activity in
                        var activity = activity
                        if activity.mapQuery == nil {
                            activity.mapQuery = mapQuery(for: activity.name, destination: destination)
                        }
                        return activity
                    },
                    warnings: day.warnings,
                    notes: day.notes
                )
            }
        }

        return plan.dailyItinerary.enumerated().map { _, day in
            ScheduledItineraryDay(
                date: day.date ?? day.day,
                scheduled: day.activities.enumerated().map { offset, activityID in
                    let source = plan.suggestedActivities.first { $0.id == activityID }
                    let slot = fallbackSlots[min(offset, fallbackSlots.count - 1)]
                    return ScheduledActivity(
                        explicitId: source?.id ?? activityID,
                        name: source?.name ?? activityID,
                        category: source?.category,
                        description: source?.description ?? source?.reason,
                        scheduledStart: slot.start,
                        scheduledEnd: slot.end,
                        duration: durationMinutes(from: source?.duration),
                        status: "scheduled",
                        warning: nil,
                        openingHours: nil,
                        enriched: nil,
                        isMeal: false,
                        mealType: nil,
                        cuisine: nil,
                        note: source?.reason,
                        petFriendly: source?.petFriendly,
                        mapQuery: mapQuery(for: source?.name ?? activityID, destination: destination)
                    )
                },
                warnings: nil,
                notes: day.notes
            )
        }
    }

    static func mapQuery(for activityName: String, destination: String) -> String {
        [activityName, destination]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    static func mapURL(for activity: ScheduledActivity, destination: String) -> URL? {
        if let mapsUrl = activity.enriched?.mapsUrl, let url = URL(string: mapsUrl) {
            return url
        }

        let query = activity.mapQuery ?? mapQuery(for: activity.name, destination: destination)
        return appleMapsSearchURL(for: query)
    }

    static func mapURL(for day: ScheduledItineraryDay, destination: String) -> URL? {
        guard let firstActivity = day.scheduled.first else {
            return appleMapsSearchURL(for: destination)
        }
        return mapURL(for: firstActivity, destination: destination)
    }

    private static func appleMapsSearchURL(for query: String) -> URL? {
        guard
            let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
            !encoded.isEmpty
        else { return nil }
        return URL(string: "https://maps.apple.com/?q=\(encoded)")
    }

    private static func durationMinutes(from duration: String?) -> Double? {
        guard let duration else { return nil }
        let lowercased = duration.lowercased()
        let firstNumber = lowercased
            .split(whereSeparator: { !$0.isNumber && $0 != "." })
            .compactMap { Double($0) }
            .first

        guard let firstNumber else { return nil }
        if lowercased.contains("hour") || lowercased.contains("hr") {
            return firstNumber * 60
        }
        return firstNumber
    }
}

enum ItineraryDaySelection {
    static func defaultSelection(in days: [ScheduledItineraryDay]) -> String? {
        days.first?.id
    }

    static func resolvedSelection(_ currentSelection: String?, in days: [ScheduledItineraryDay]) -> String? {
        if let currentSelection, days.contains(where: { $0.id == currentSelection }) {
            return currentSelection
        }
        return defaultSelection(in: days)
    }
}
