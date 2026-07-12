import Foundation
import XCTest
@testable import SproutRoute

final class APIClientSSEStreamingTests: XCTestCase {
    override func tearDown() {
        MockSSEURLProtocol.responseData = Data()
        MockSSEURLProtocol.statusCode = 200
        super.tearDown()
    }

    func testStreamTripPlanParsesDoneEventAfterProgressiveEvents() async throws {
        MockSSEURLProtocol.responseData = Data(Self.progressiveSSEBody.utf8)

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockSSEURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let client = SproutAPIClient(baseURL: URL(string: "https://example.test")!, session: session)

        var eventNames: [String] = []
        let result = try await client.streamTripPlan(payload: Self.tripPayload) { event in
            switch event {
            case .destination: eventNames.append("destination")
            case .weather: eventNames.append("weather")
            case .itineraryUpdate: eventNames.append("itinerary-chunk")
            case .done: eventNames.append("done")
            default: break
            }
        }

        XCTAssertEqual(eventNames, ["destination", "weather", "itinerary-chunk", "done"])
        XCTAssertEqual(result.requestId, "req-123")
        XCTAssertEqual(result.trip?.destination, "San Diego, CA")
        XCTAssertEqual(result.weather?.summary, "Sunny")
        XCTAssertEqual(result.tripPlan?.overview, "Beach parks and easy meals.")
    }

    private static let progressiveSSEBody = """
    event: destination
    data: {"requestId":"req-123","destination":"San Diego, CA","startDate":"2026-06-01","endDate":"2026-06-05","duration":5,"activities":["beach"],"children":[{"id":"child-0","age":2}],"countryCode":"US","lat":32.7157,"lon":-117.1611}

    event: weather
    data: {"weather":{"summary":"Sunny","forecast":[{"name":"Mon","high":72,"low":62,"precipitation":0,"condition":"sunny"}]}}

    event: itinerary-chunk
    data: {"tripPlan":{"overview":"Beach parks and easy meals.","suggestedActivities":[{"id":"a1","name":"Balboa Park","category":"parks","description":"Gardens and museums","duration":"2 hours","kidFriendly":true,"petFriendly":true,"weatherDependent":false,"bestDays":["Mon"],"reason":"Good toddler pace"}],"dailyItinerary":[{"day":1,"activities":["a1"],"meals":"Picnic","notes":"Bring stroller"}],"tips":["Start early"]},"scheduledItinerary":null,"chunk":1,"totalChunks":1,"dayOffset":0}

    event: done
    data: {"requestId":"req-123"}

    """

    private static let tripPayload = TripRequestPayload(
        rawInput: "Five days in San Diego with a toddler and a dog",
        destination: "San Diego, CA",
        startDate: "2026-06-01",
        endDate: "2026-06-05",
        adults: 2,
        childrenAges: [2],
        children: [ChildProfile(id: "child-0", age: 2)],
        activities: ["beach"],
        foodPreferences: nil,
        pets: [PetProfile(id: "pet-0", type: "dog", name: nil, breed: nil, weightLb: nil, ageYears: nil, specialNeeds: nil)],
        tripGoals: [],
        mustHaves: [],
        avoidances: [],
        pacePreference: "moderate",
        budgetSignals: [],
        accommodationPreferences: [],
        transportPreferences: [],
        accessibilityNeeds: [],
        scheduleConstraints: [],
        celebrationContext: nil,
        specialNotes: [],
        extraContext: [],
        savedProfile: nil
    )
}

private final class MockSSEURLProtocol: URLProtocol {
    static var responseData = Data()
    static var statusCode = 200

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: Self.statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": "text/event-stream"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.responseData)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
