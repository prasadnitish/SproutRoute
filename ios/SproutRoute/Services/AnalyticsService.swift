import Foundation

enum AnalyticsPropertyValue: Codable, Equatable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case stringArray([String])

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value):
            try container.encode(value)
        case .int(let value):
            try container.encode(value)
        case .double(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .stringArray(let value):
            try container.encode(value)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Int.self) {
            self = .int(value)
        } else if let value = try? container.decode(Double.self) {
            self = .double(value)
        } else if let value = try? container.decode([String].self) {
            self = .stringArray(value)
        } else {
            self = .string(try container.decode(String.self))
        }
    }
}

struct AnalyticsEvent: Equatable {
    var name: String
    var properties: [String: AnalyticsPropertyValue]

    init(name: String, properties: [String: AnalyticsPropertyValue] = [:]) {
        self.name = name
        self.properties = Self.baseProperties().merging(properties) { _, new in new }
    }

    static func tripPromptSubmitted(prompt: String, hasSavedProfile: Bool) -> AnalyticsEvent {
        AnalyticsEvent(name: "trip_prompt_submitted", properties: [
            "prompt_length_bucket": .string(lengthBucket(prompt.count)),
            "has_saved_profile": .bool(hasSavedProfile)
        ])
    }

    static func parseSucceeded(_ parsed: ParsedTripInput) -> AnalyticsEvent {
        var properties: [String: AnalyticsPropertyValue] = [
            "has_destination": .bool(parsed.destination?.isEmpty == false),
            "has_dates": .bool(parsed.startDate?.isEmpty == false && parsed.endDate?.isEmpty == false),
            "adult_count": .int(parsed.adults ?? 0),
            "child_age_buckets": .stringArray(uniquePreservingOrder((parsed.childrenAges ?? []).map(childAgeBucket))),
            "pet_types": .stringArray(uniquePreservingOrder((parsed.pets ?? []).compactMap { safeToken($0.type) })),
            "trip_goal_count": .int(parsed.tripGoals?.count ?? 0),
            "must_have_count": .int(parsed.mustHaves?.count ?? 0),
            "avoidance_count": .int(parsed.avoidances?.count ?? 0)
        ]

        if let pace = safeToken(parsed.pacePreference) {
            properties["pace"] = .string(pace)
        }

        if let destination = parsed.destination {
            let region = destinationRegion(from: destination)
            if let country = region.country {
                properties["destination_country"] = .string(country)
            }
            if let regionCode = region.region {
                properties["destination_region"] = .string(regionCode)
            }
        }

        if let startDate = parsed.startDate, let endDate = parsed.endDate {
            properties["trip_duration_days"] = .int(durationDays(startDate: startDate, endDate: endDate))
        }

        return AnalyticsEvent(name: "parse_succeeded", properties: properties)
    }

    static func planningStarted(_ payload: TripRequestPayload) -> AnalyticsEvent {
        AnalyticsEvent(name: "planning_started", properties: [
            "destination_country": .string(payload.countryCode ?? "unknown"),
            "child_count": .int(payload.childrenAges.count),
            "pet_count": .int(payload.pets.count),
            "trip_duration_days": .int(durationDays(startDate: payload.startDate, endDate: payload.endDate)),
            "has_saved_profile": .bool(payload.savedProfile != nil)
        ])
    }

    static func planningCompleted(_ result: TripStreamResult, elapsedMilliseconds: Int) -> AnalyticsEvent {
        AnalyticsEvent(name: "planning_completed", properties: [
            "elapsed_ms": .int(elapsedMilliseconds),
            "has_weather": .bool(result.weather != nil),
            "has_itinerary": .bool(result.tripPlan != nil),
            "has_packing": .bool(result.packingList != nil),
            "has_safety": .bool(result.travelSafety != nil || result.carSeatGuidance != nil || result.petSafety != nil),
            "itinerary_day_count": .int(result.tripPlan?.scheduledItinerary?.count ?? result.tripPlan?.dailyItinerary.count ?? 0),
            "packing_category_count": .int(result.packingList?.categories.count ?? 0)
        ])
    }

    static func planningFailed(_ error: Error) -> AnalyticsEvent {
        AnalyticsEvent(name: "planning_failed", properties: [
            "error_code": .string(errorCode(error.localizedDescription))
        ])
    }

    static func tripSaved(_ result: TripStreamResult) -> AnalyticsEvent {
        AnalyticsEvent(name: "trip_saved", properties: [
            "has_weather": .bool(result.weather != nil),
            "has_itinerary": .bool(result.tripPlan != nil),
            "has_packing": .bool(result.packingList != nil)
        ])
    }

    static func remindersRequested(authorized: Bool) -> AnalyticsEvent {
        AnalyticsEvent(name: "reminders_requested", properties: [
            "authorized": .bool(authorized)
        ])
    }

    static func localDataDeleted() -> AnalyticsEvent {
        AnalyticsEvent(name: "local_data_deleted")
    }

    static func profileImportOpened() -> AnalyticsEvent {
        AnalyticsEvent(name: "profile_import_opened")
    }

    static func profileImportValidated(valid: Bool, warningCount: Int, errorCount: Int) -> AnalyticsEvent {
        AnalyticsEvent(name: "profile_import_validated", properties: [
            "valid": .bool(valid),
            "warning_count": .int(warningCount),
            "error_count": .int(errorCount)
        ])
    }

    static func profileImportSaved() -> AnalyticsEvent {
        AnalyticsEvent(name: "profile_import_saved")
    }

    static func tabViewed(_ tab: String) -> AnalyticsEvent {
        AnalyticsEvent(name: "tab_viewed", properties: [
            "tab": .string(safeToken(tab) ?? "unknown")
        ])
    }

    private static func baseProperties() -> [String: AnalyticsPropertyValue] {
        var properties: [String: AnalyticsPropertyValue] = [
            "client": .string("ios"),
            "schema_version": .string("1"),
            "platform": .string("ios")
        ]
        if let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String {
            properties["app_version"] = .string(version)
        }
        return properties
    }

    private static func lengthBucket(_ count: Int) -> String {
        switch count {
        case 0...25: "0_25"
        case 26...50: "26_50"
        case 51...100: "51_100"
        case 101...250: "101_250"
        default: "251_plus"
        }
    }

    private static func childAgeBucket(_ age: Int) -> String {
        switch age {
        case ..<2: "infant"
        case 2...4: "toddler"
        case 5...12: "child"
        case 13...17: "teen"
        default: "adult_or_unknown"
        }
    }

    private static func safeToken(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return trimmed
            .lowercased()
            .replacingOccurrences(of: #"[^a-z0-9_-]+"#, with: "_", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
    }

    private static func uniquePreservingOrder(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return values.filter { seen.insert($0).inserted }
    }

    private static func destinationRegion(from destination: String) -> (country: String?, region: String?) {
        let normalized = destination.lowercased()
        let country: String? = {
            if normalized.contains("united states") || normalized.contains(", usa") { return "US" }
            if normalized.contains("canada") { return "CA" }
            if normalized.contains("united kingdom") || normalized.contains(", uk") { return "GB" }
            if normalized.contains("australia") { return "AU" }
            return nil
        }()

        let region: String? = {
            guard country == "US" else { return nil }
            let regions = [
                "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
                "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
                "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
                "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
                "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
                "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
                "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
                "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
                "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
                "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
                "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
                "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
                "wisconsin": "WI", "wyoming": "WY"
            ]
            return regions.first { normalized.contains($0.key) }?.value
        }()

        return (country, region)
    }

    private static func durationDays(startDate: String, endDate: String) -> Int {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        guard
            let start = formatter.date(from: startDate),
            let end = formatter.date(from: endDate),
            let days = Calendar(identifier: .gregorian).dateComponents([.day], from: start, to: end).day
        else { return 0 }
        return max(days + 1, 1)
    }

    private static func errorCode(_ message: String) -> String {
        safeToken(message.split(separator: ":").first.map(String.init)) ?? "unknown"
    }
}

final class AnalyticsSettings {
    static let enabledKey = "sproutroute.analytics.enabled"
    static let distinctIdKey = "sproutroute.analytics.distinctId"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var isEnabled: Bool {
        defaults.bool(forKey: Self.enabledKey)
    }

    var distinctId: String {
        if let existing = defaults.string(forKey: Self.distinctIdKey), !existing.isEmpty {
            return existing
        }
        let generated = UUID().uuidString
        defaults.set(generated, forKey: Self.distinctIdKey)
        return generated
    }

    func setEnabled(_ enabled: Bool) {
        defaults.set(enabled, forKey: Self.enabledKey)
        if enabled {
            _ = distinctId
        } else {
            resetDistinctId()
        }
    }

    func resetDistinctId() {
        defaults.removeObject(forKey: Self.distinctIdKey)
    }
}

struct PostHogConfiguration {
    var apiKey: String?
    var host: URL

    static func fromBundle(_ bundle: Bundle = .main) -> PostHogConfiguration {
        let rawKey = bundle.object(forInfoDictionaryKey: "PostHogAPIKey") as? String
        let key = sanitizedKey(rawKey)
        let rawHost = bundle.object(forInfoDictionaryKey: "PostHogHost") as? String
        let host = rawHost.flatMap(URL.init(string:)) ?? URL(string: "https://us.i.posthog.com")!
        return PostHogConfiguration(apiKey: key, host: host)
    }

    private static func sanitizedKey(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains("$(") else { return nil }
        return trimmed
    }
}

final class PostHogAnalyticsClient {
    private struct CaptureRequest: Encodable {
        var apiKey: String
        var event: String
        var distinctId: String
        var properties: [String: AnalyticsPropertyValue]

        enum CodingKeys: String, CodingKey {
            case apiKey = "api_key"
            case event
            case distinctId = "distinct_id"
            case properties
        }
    }

    private let configuration: PostHogConfiguration
    private let settings: AnalyticsSettings
    private let session: URLSession

    init(
        configuration: PostHogConfiguration = .fromBundle(),
        settings: AnalyticsSettings = AnalyticsSettings(),
        session: URLSession = .shared
    ) {
        self.configuration = configuration
        self.settings = settings
        self.session = session
    }

    var isConfigured: Bool {
        configuration.apiKey?.isEmpty == false
    }

    func capture(_ event: AnalyticsEvent) async {
        guard settings.isEnabled, let apiKey = configuration.apiKey, !apiKey.isEmpty else { return }

        var properties = event.properties
        let distinctId = settings.distinctId
        properties["distinct_id"] = .string(distinctId)
        properties["analytics_opt_in"] = .bool(true)

        let payload = CaptureRequest(
            apiKey: apiKey,
            event: event.name,
            distinctId: distinctId,
            properties: properties
        )

        do {
            var request = URLRequest(url: captureURL())
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(payload)
            _ = try await session.data(for: request)
        } catch {
            return
        }
    }

    private func captureURL() -> URL {
        configuration.host.appending(path: "capture/")
    }
}

protocol AnalyticsTracking: AnyObject {
    func track(_ event: AnalyticsEvent)
}

final class ProductAnalytics: AnalyticsTracking {
    static let shared = ProductAnalytics()

    private let settings: AnalyticsSettings
    private let client: PostHogAnalyticsClient

    init(
        settings: AnalyticsSettings = AnalyticsSettings(),
        client: PostHogAnalyticsClient? = nil
    ) {
        self.settings = settings
        self.client = client ?? PostHogAnalyticsClient(settings: settings)
    }

    var isEnabled: Bool {
        settings.isEnabled
    }

    var isConfigured: Bool {
        client.isConfigured
    }

    func setEnabled(_ enabled: Bool) {
        settings.setEnabled(enabled)
    }

    func track(_ event: AnalyticsEvent) {
        Task {
            await client.capture(event)
        }
    }
}
