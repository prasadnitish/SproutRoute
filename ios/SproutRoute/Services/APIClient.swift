import Foundation
import OSLog

actor SproutAPIClient {
    static let productionBaseURL = URL(string: "https://sproutroute-production.up.railway.app")!
    static func defaultBaseURL(environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
        guard
            let override = environment["SPROUT_API_BASE_URL"]?.trimmingCharacters(in: .whitespacesAndNewlines),
            let url = URL(string: override),
            let scheme = url.scheme?.lowercased(),
            ["http", "https"].contains(scheme),
            url.host != nil
        else {
            return productionBaseURL
        }

        return url
    }

    private let baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder.sproutRoute
    private let encoder = JSONEncoder.sproutRoute
    private let logger = Logger(subsystem: "com.sproutroute.app", category: "api")

    init(baseURL: URL = SproutAPIClient.defaultBaseURL(), session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func capabilities() async throws -> CapabilityPayload {
        try await get("/api/v1/meta/capabilities?client=ios")
    }

    func parseInput(text: String, detectedLat: Double?, detectedLon: Double?) async throws -> ParsedTripInput {
        struct Body: Encodable {
            var text: String
            var detectedLat: Double?
            var detectedLon: Double?
            var clientDate: String
            var client = "ios"
            var schemaVersion = "1"
            var timezone = TimeZone.current.identifier
            var locale = Locale.current.identifier
        }

        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"

        return try await post(
            "/api/v1/trip/parse-input",
            body: Body(
                text: text,
                detectedLat: detectedLat,
                detectedLon: detectedLon,
                clientDate: formatter.string(from: Date())
            )
        )
    }

    func streamTripPlan(
        payload: TripRequestPayload,
        onEvent: @escaping @MainActor (TripStreamEvent) -> Void
    ) async throws -> TripStreamResult {
        var request = try makeRequest(path: "/api/v1/trip/stream", method: "POST", body: payload)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

        let (bytes, response) = try await session.bytes(for: request)
        try validate(response: response)

        let parser = SSEParser()
        var result = TripStreamResult(parsed: nil)

        var lineBuffer = Data()
        for try await byte in bytes {
            lineBuffer.append(contentsOf: [byte])
            guard byte == 0x0A else { continue }

            let line = String(decoding: lineBuffer, as: UTF8.self)
            lineBuffer.removeAll(keepingCapacity: true)
            for event in parser.append(line) {
                if let streamEvent = decodeStreamEvent(event) {
                    apply(streamEvent, to: &result)
                    await onEvent(streamEvent)
                }
            }
        }

        if !lineBuffer.isEmpty {
            let line = String(decoding: lineBuffer, as: UTF8.self)
            for event in parser.append(line) {
                if let streamEvent = decodeStreamEvent(event) {
                    apply(streamEvent, to: &result)
                    await onEvent(streamEvent)
                }
            }
        }

        for event in parser.flush() {
            if let streamEvent = decodeStreamEvent(event) {
                apply(streamEvent, to: &result)
                await onEvent(streamEvent)
            }
        }

        return result
    }

    func bundleTripPlan(payload: TripRequestPayload) async throws -> TripBundleResponse {
        try await post("/api/v1/trip/bundle", body: payload)
    }

    func generatePackingList(payload: TripRequestPayload) async throws -> TripPackingResponse {
        try await post("/api/v1/trip/packing", body: payload)
    }

    func travelSafety(destination: String, childrenAges: [Int], countryCode: String?) async throws -> TravelSafetyResponse {
        struct Body: Encodable {
            var destination: String
            var childrenAges: [Int]
            var countryCode: String?
            var client = "ios"
            var schemaVersion = "1"
        }
        return try await post("/api/safety/travel-tips", body: Body(destination: destination, childrenAges: childrenAges, countryCode: countryCode))
    }

    func carSeatGuidance(destination: String, jurisdictionCode: String?, tripDate: String?, children: [ChildProfile]) async throws -> CarSeatGuidance {
        struct Body: Encodable {
            var destination: String
            var jurisdictionCode: String?
            var tripDate: String?
            var children: [ChildProfile]
            var client = "ios"
            var schemaVersion = "1"
        }
        return try await post("/api/safety/car-seat-check", body: Body(destination: destination, jurisdictionCode: jurisdictionCode, tripDate: tripDate, children: children))
    }

    func petTravelCheck(pets: [PetProfile], destination: String, countryCode: String?, travelMode: String) async throws -> PetTravelResponse {
        struct Body: Encodable {
            var pets: [PetProfile]
            var destination: String
            var countryCode: String?
            var travelMode: String
            var client = "ios"
            var schemaVersion = "1"
        }
        return try await post("/api/v1/safety/pet-travel-check", body: Body(pets: pets, destination: destination, countryCode: countryCode, travelMode: travelMode))
    }

    func validateProfile(rawText: String) async throws -> ProfileValidateResponse {
        struct Body: Encodable { var rawText: String; var client = "ios"; var schemaVersion = "1" }
        return try await post("/api/v1/profile/import/validate", body: Body(rawText: rawText))
    }

    func normalizeProfile(rawText: String, providerHint: String? = nil) async throws -> ProfileNormalizeResponse {
        struct Body: Encodable {
            var providerHint: String?
            var rawText: String
            var client = "ios"
            var schemaVersion = "1"
        }
        return try await post("/api/v1/profile/import/normalize", body: Body(providerHint: providerHint, rawText: rawText))
    }

    func enrichPlace(activity: TripActivity, destination: String) async throws -> PlaceEnrichmentResponse {
        try await enrichPlace(activityName: activity.name, destination: destination, category: activity.category)
    }

    func enrichPlace(activityName: String, destination: String, category: String?) async throws -> PlaceEnrichmentResponse {
        struct Body: Encodable {
            var activityName: String
            var destination: String
            var category: String?
            var client = "ios"
            var schemaVersion = "1"
        }
        return try await post("/api/v1/places/enrich", body: Body(activityName: activityName, destination: destination, category: category))
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let request = try makeRequest(path: path, method: "GET", body: Optional<String>.none)
        logger.info("GET \(path, privacy: .public)")
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try decode(T.self, from: data, path: path)
    }

    private func post<T: Decodable, Body: Encodable>(_ path: String, body: Body) async throws -> T {
        let request = try makeRequest(path: path, method: "POST", body: body)
        logger.info("POST \(path, privacy: .public)")
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try decode(T.self, from: data, path: path)
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data, path: String) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            logger.error("Decode failed for \(path, privacy: .public) as \(String(describing: type), privacy: .public): \(Self.describe(error), privacy: .public)")
            throw error
        }
    }

    private func makeRequest<Body: Encodable>(path: String, method: String, body: Body?) throws -> URLRequest {
        let url = URL(string: path, relativeTo: baseURL)!
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("SproutRoute-iOS/1", forHTTPHeaderField: "User-Agent")
        if let body {
            request.httpBody = try encoder.encode(body)
        }
        return request
    }

    private func validate(response: URLResponse, data: Data = Data()) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            if let envelope = try? decoder.decode(ApiErrorEnvelope.self, from: data) {
                throw envelope
            }
            throw ApiErrorEnvelope(code: nil, message: "Request failed with status \(http.statusCode)", category: nil, retryable: nil, requestId: nil)
        }
    }

    private struct WeatherEnvelope: Decodable { var weather: WeatherForecast? }
    private struct ItineraryEnvelope: Decodable {
        var tripPlan: TripPlanResult?
        var scheduledItinerary: [ScheduledItineraryDay]?
    }
    private struct PackingEnvelope: Decodable { var packingList: PackingList? }
    private struct DoneEnvelope: Decodable {
        var requestId: String?
        var trip: TripMeta?
        var weather: WeatherForecast?
        var tripPlan: TripPlanResult?
        var packingList: PackingList?
        var safetyGuidance: CarSeatGuidance?
        var scheduledItinerary: [ScheduledItineraryDay]?
    }

    private func decodeStreamEvent(_ event: ServerSentEvent) -> TripStreamEvent? {
        let eventName = event.event ?? ""
        let data = Data(event.data.utf8)
        defer {
            if eventName.isEmpty {
                logger.debug("Ignored empty SSE event")
            }
        }

        switch eventName {
        case "destination":
            return decodeSSE(TripMeta.self, from: data, eventName: eventName).map { .destination($0) }
        case "weather":
            if let envelope = try? decoder.decode(WeatherEnvelope.self, from: data), let weather = envelope.weather {
                return .weather(weather)
            }
            return decodeSSE(WeatherForecast.self, from: data, eventName: eventName).map { .weather($0) }
        case "itinerary":
            if let envelope = try? decoder.decode(ItineraryEnvelope.self, from: data), let tripPlan = envelope.tripPlan {
                var tripPlan = tripPlan
                tripPlan.scheduledItinerary = envelope.scheduledItinerary
                return .itinerary(tripPlan)
            }
            return decodeSSE(TripPlanResult.self, from: data, eventName: eventName).map { .itinerary($0) }
        case "itinerary-update", "itinerary-chunk":
            if let envelope = try? decoder.decode(ItineraryEnvelope.self, from: data), let tripPlan = envelope.tripPlan {
                var tripPlan = tripPlan
                tripPlan.scheduledItinerary = envelope.scheduledItinerary
                return .itineraryUpdate(tripPlan)
            }
            return decodeSSE(TripPlanResult.self, from: data, eventName: eventName).map { .itineraryUpdate($0) }
        case "packing":
            if let envelope = try? decoder.decode(PackingEnvelope.self, from: data), let packing = envelope.packingList {
                return .packing(packing)
            }
            return decodeSSE(PackingList.self, from: data, eventName: eventName).map { .packing($0) }
        case "safety":
            return decodeSSE(CarSeatGuidance.self, from: data, eventName: eventName).map { .safety($0) }
        case "fallback":
            return .fallback
        case "done":
            if let done = try? decoder.decode(DoneEnvelope.self, from: data) {
                var tripPlan = done.tripPlan
                if done.scheduledItinerary?.isEmpty == false {
                    tripPlan?.scheduledItinerary = done.scheduledItinerary
                }
                return .done(TripStreamResult(
                    requestId: done.requestId,
                    trip: done.trip,
                    weather: done.weather,
                    tripPlan: tripPlan,
                    packingList: done.packingList,
                    carSeatGuidance: done.safetyGuidance
                ))
            }
            return decodeSSE(TripStreamResult.self, from: data, eventName: eventName).map { .done($0) }
        case "error":
            if let error = try? decoder.decode(ApiErrorEnvelope.self, from: data) {
                return .error(error.message)
            }
            return .error(event.data)
        default:
            logger.debug("Ignored SSE event \(eventName, privacy: .public)")
            return nil
        }
    }

    private func decodeSSE<T: Decodable>(_ type: T.Type, from data: Data, eventName: String) -> T? {
        do {
            return try decoder.decode(type, from: data)
        } catch {
            logger.error("Decode failed for SSE event \(eventName, privacy: .public) as \(String(describing: type), privacy: .public): \(Self.describe(error), privacy: .public)")
            return nil
        }
    }

    private static func describe(_ error: Error) -> String {
        guard let decodingError = error as? DecodingError else {
            return error.localizedDescription
        }

        switch decodingError {
        case .typeMismatch(let type, let context):
            return "type mismatch \(type) at \(codingPath(context.codingPath)): \(context.debugDescription)"
        case .valueNotFound(let type, let context):
            return "value not found \(type) at \(codingPath(context.codingPath)): \(context.debugDescription)"
        case .keyNotFound(let key, let context):
            return "missing key \(key.stringValue) at \(codingPath(context.codingPath)): \(context.debugDescription)"
        case .dataCorrupted(let context):
            return "data corrupted at \(codingPath(context.codingPath)): \(context.debugDescription)"
        @unknown default:
            return error.localizedDescription
        }
    }

    private static func codingPath(_ path: [CodingKey]) -> String {
        guard !path.isEmpty else { return "$" }
        return path.map(\.stringValue).joined(separator: ".")
    }

    private func apply(_ event: TripStreamEvent, to result: inout TripStreamResult) {
        switch event {
        case .destination(let trip):
            result.requestId = trip.requestId ?? result.requestId
            result.trip = trip
        case .weather(let weather):
            result.weather = weather
        case .itinerary(let plan), .itineraryUpdate(let plan):
            result.tripPlan = plan
        case .packing(let packing):
            result.packingList = packing
        case .safety(let guidance):
            result.carSeatGuidance = guidance
        case .done(let done):
            result.requestId = done.requestId ?? result.requestId
            result.trip = done.trip ?? result.trip
            result.weather = done.weather ?? result.weather
            result.tripPlan = done.tripPlan ?? result.tripPlan
            result.packingList = done.packingList ?? result.packingList
            result.carSeatGuidance = done.carSeatGuidance ?? result.carSeatGuidance
        case .fallback, .error:
            break
        }
    }
}
