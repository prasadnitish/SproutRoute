import Foundation
import XCTest
@testable import SproutRoute

final class AnalyticsTests: XCTestCase {
    override func setUp() {
        super.setUp()
        AnalyticsMockURLProtocol.requestBody = nil
        AnalyticsMockURLProtocol.requestURL = nil
        AnalyticsMockURLProtocol.statusCode = 200
    }

    func testAnalyticsSettingsAreOptInAndResetIdentifierWhenDisabled() {
        let defaults = UserDefaults(suiteName: "SproutRouteAnalyticsTests-\(UUID().uuidString)")!
        let settings = AnalyticsSettings(defaults: defaults)

        XCTAssertFalse(settings.isEnabled)

        settings.setEnabled(true)
        let firstId = settings.distinctId
        XCTAssertFalse(firstId.isEmpty)

        settings.setEnabled(false)
        settings.setEnabled(true)
        XCTAssertNotEqual(settings.distinctId, firstId)
    }

    func testTripPromptSubmittedPayloadUsesOnlySafeAggregates() {
        let event = AnalyticsEvent.tripPromptSubmitted(
            prompt: "Five days in San Diego with toddler Emma, peanut allergy, and our dog",
            hasSavedProfile: true
        )

        XCTAssertEqual(event.name, "trip_prompt_submitted")
        XCTAssertEqual(event.properties["client"], .string("ios"))
        XCTAssertEqual(event.properties["prompt_length_bucket"], .string("51_100"))
        XCTAssertEqual(event.properties["has_saved_profile"], .bool(true))
        XCTAssertNil(event.properties["prompt"])
        XCTAssertNil(event.properties["raw_input"])
        XCTAssertFalse(event.properties.values.contains(.string("Emma")))
        XCTAssertFalse(event.properties.values.contains(.string("peanut allergy")))
    }

    func testParseSucceededPayloadBucketsChildrenAndPetsWithoutNamesOrExactFreeText() {
        let parsed = ParsedTripInput(
            rawInput: "Take Max and Emma to San Diego",
            destination: "San Diego, San Diego County, California, United States",
            startDate: "2026-06-01",
            endDate: "2026-06-05",
            adults: 2,
            childrenAges: [2, 8, 14],
            vibe: "beach",
            foodPreferences: nil,
            pets: [
                PetProfile(id: "pet-1", type: "dog", name: "Max", breed: "Poodle", weightLb: 20, ageYears: 4, specialNeeds: "meds")
            ],
            suggestedDestinations: nil,
            tripGoals: nil,
            mustHaves: nil,
            avoidances: nil,
            pacePreference: "slow",
            budgetSignals: nil,
            accommodationPreferences: nil,
            transportPreferences: nil,
            accessibilityNeeds: nil,
            scheduleConstraints: nil,
            celebrationContext: nil,
            specialNotes: nil,
            extraContext: nil
        )

        let event = AnalyticsEvent.parseSucceeded(parsed)

        XCTAssertEqual(event.properties["destination_country"], .string("US"))
        XCTAssertEqual(event.properties["destination_region"], .string("CA"))
        XCTAssertEqual(event.properties["child_age_buckets"], .stringArray(["toddler", "child", "teen"]))
        XCTAssertEqual(event.properties["pet_types"], .stringArray(["dog"]))
        XCTAssertEqual(event.properties["pace"], .string("slow"))
        XCTAssertNil(event.properties["rawInput"])
        XCTAssertFalse(event.properties.values.contains(.string("Max")))
        XCTAssertFalse(event.properties.values.contains(.string("Emma")))
        XCTAssertFalse(event.properties.values.contains(.string("Poodle")))
        XCTAssertFalse(event.properties.values.contains(.string("meds")))
    }

    func testPostHogClientSkipsWhenUserHasNotOptedInOrKeyIsMissing() async {
        let defaults = UserDefaults(suiteName: "SproutRouteAnalyticsTests-\(UUID().uuidString)")!
        let settings = AnalyticsSettings(defaults: defaults)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AnalyticsMockURLProtocol.self]
        let session = URLSession(configuration: configuration)

        let disabledClient = PostHogAnalyticsClient(
            configuration: .init(apiKey: "phc_public", host: URL(string: "https://us.i.posthog.com")!),
            settings: settings,
            session: session
        )
        await disabledClient.capture(.tabViewed("weather"))
        XCTAssertNil(AnalyticsMockURLProtocol.requestBody)

        settings.setEnabled(true)
        let missingKeyClient = PostHogAnalyticsClient(
            configuration: .init(apiKey: nil, host: URL(string: "https://us.i.posthog.com")!),
            settings: settings,
            session: session
        )
        await missingKeyClient.capture(.tabViewed("weather"))
        XCTAssertNil(AnalyticsMockURLProtocol.requestBody)
    }

    func testPostHogClientSendsOptInEventsToCaptureEndpoint() async throws {
        let defaults = UserDefaults(suiteName: "SproutRouteAnalyticsTests-\(UUID().uuidString)")!
        let settings = AnalyticsSettings(defaults: defaults)
        settings.setEnabled(true)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AnalyticsMockURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let client = PostHogAnalyticsClient(
            configuration: .init(apiKey: "phc_public", host: URL(string: "https://us.i.posthog.com")!),
            settings: settings,
            session: session
        )

        await client.capture(.tabViewed("weather"))

        XCTAssertEqual(AnalyticsMockURLProtocol.requestURL?.absoluteString, "https://us.i.posthog.com/capture/")
        let body = try XCTUnwrap(AnalyticsMockURLProtocol.requestBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["api_key"] as? String, "phc_public")
        XCTAssertEqual(json["event"] as? String, "tab_viewed")
        let properties = try XCTUnwrap(json["properties"] as? [String: Any])
        XCTAssertEqual(properties["tab"] as? String, "weather")
        XCTAssertEqual(properties["client"] as? String, "ios")
        XCTAssertEqual(properties["analytics_opt_in"] as? Bool, true)
        XCTAssertNil(properties["prompt"])
        XCTAssertNil(properties["raw_input"])
    }
}

private final class AnalyticsMockURLProtocol: URLProtocol {
    static var requestBody: Data?
    static var requestURL: URL?
    static var statusCode = 200

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        Self.requestURL = request.url
        Self.requestBody = request.httpBody ?? request.httpBodyStream.flatMap(Self.readBodyStream)
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.statusCode, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func readBodyStream(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count > 0 {
                data.append(buffer, count: count)
            } else {
                break
            }
        }
        return data
    }
}
