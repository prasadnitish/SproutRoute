import Foundation
import XCTest
@testable import SproutRoute

final class APIClientConfigurationTests: XCTestCase {
    override func tearDown() {
        MockAPIURLProtocol.requestBody = nil
        MockAPIURLProtocol.requestURL = nil
        MockAPIURLProtocol.requestHeaders = nil
        MockAPIURLProtocol.responseData = Data()
        MockAPIURLProtocol.statusCode = 200
        super.tearDown()
    }

    func testDefaultBaseURLUsesEnvironmentOverrideWhenPresent() {
        let url = SproutAPIClient.defaultBaseURL(environment: [
            "SPROUT_API_BASE_URL": "http://127.0.0.1:3001"
        ])

        XCTAssertEqual(url.absoluteString, "http://127.0.0.1:3001")
    }

    func testDefaultBaseURLFallsBackToProductionForInvalidOverride() {
        let url = SproutAPIClient.defaultBaseURL(environment: [
            "SPROUT_API_BASE_URL": "not a url"
        ])

        XCTAssertEqual(url, SproutAPIClient.productionBaseURL)
    }

    func testPlaceEnrichmentUsesBackendActivityNameContract() async throws {
        MockAPIURLProtocol.responseData = Data("""
        {
          "name": "Balboa Park",
          "address": "San Diego, CA",
          "rating": 4.8,
          "userRatingsTotal": 12345,
          "website": "https://example.com",
          "phone": "+16195551212",
          "photoUrl": "https://example.com/photo.jpg",
          "openingHours": ["Monday: 9 AM-5 PM"]
        }
        """.utf8)

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockAPIURLProtocol.self]
        let client = SproutAPIClient(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: configuration)
        )

        let response = try await client.enrichPlace(
            activityName: "Balboa Park",
            destination: "San Diego, CA",
            category: "parks"
        )

        let body = try XCTUnwrap(MockAPIURLProtocol.requestBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["activityName"] as? String, "Balboa Park")
        XCTAssertNil(json["activity"])
        XCTAssertEqual(json["destination"] as? String, "San Diego, CA")
        XCTAssertEqual(response.rating, 4.8)
    }

    func testCreateGroupTripUsesSharedTripContract() async throws {
        MockAPIURLProtocol.responseData = Data("""
        {
          "requestId": "req-1",
          "trip": {
            "id": "trip_abc123",
            "title": "Vegas 2026",
            "destination": "Las Vegas, NV",
            "startDate": "2026-09-18",
            "endDate": "2026-09-21",
            "inviteCode": "VEGAS1",
            "status": "active",
            "createdAt": "2026-06-28T12:00:00.000Z",
            "updatedAt": "2026-06-28T12:00:00.000Z"
          },
          "currentParticipant": {
            "id": "participant_1",
            "tripId": "trip_abc123",
            "displayName": "Nitish",
            "role": "owner",
            "accessToken": "gtp_owner_token",
            "joinedAt": "2026-06-28T12:00:00.000Z"
          },
          "participants": [
            {
              "id": "participant_1",
              "tripId": "trip_abc123",
              "displayName": "Nitish",
              "role": "owner",
              "joinedAt": "2026-06-28T12:00:00.000Z"
            }
          ]
        }
        """.utf8)

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockAPIURLProtocol.self]
        let client = SproutAPIClient(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: configuration)
        )

        let response = try await client.createGroupTrip(
            GroupTripCreateRequest(
                title: "Vegas 2026",
                destination: "Las Vegas, NV",
                startDate: "2026-09-18",
                endDate: "2026-09-21",
                ownerName: "Nitish"
            )
        )

        let body = try XCTUnwrap(MockAPIURLProtocol.requestBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["title"] as? String, "Vegas 2026")
        XCTAssertEqual(json["ownerName"] as? String, "Nitish")
        XCTAssertEqual(response.trip.inviteCode, "VEGAS1")
        XCTAssertEqual(response.currentParticipant.accessToken, "gtp_owner_token")
        XCTAssertNil(response.participants.first?.accessToken)
    }

    func testCreateGroupTripItemUsesSharedTripContract() async throws {
        MockAPIURLProtocol.responseData = Data("""
        {
          "requestId": "req-item",
          "item": {
            "id": "item_1",
            "tripId": "trip_abc123",
            "kind": "flight",
            "title": "Arrive at LAS",
            "startAt": "2026-09-18T17:30:00Z",
            "endAt": "2026-09-18T18:45:00Z",
            "locationName": "Harry Reid International Airport",
            "notes": "Share confirmation numbers.",
            "assignedParticipantIds": ["participant_1", "participant_2"],
            "status": "planned",
            "createdByParticipantId": "participant_1",
            "createdAt": "2026-06-28T12:10:00.000Z",
            "updatedAt": "2026-06-28T12:10:00.000Z"
          },
          "activity": {
            "id": "activity_1",
            "tripId": "trip_abc123",
            "type": "item_created",
            "actorParticipantId": "participant_1",
            "summary": "Nitish added Arrive at LAS",
            "createdAt": "2026-06-28T12:10:00.000Z"
          }
        }
        """.utf8)

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockAPIURLProtocol.self]
        let client = SproutAPIClient(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: configuration)
        )

        let response = try await client.createGroupTripItem(
            GroupTripItemCreateRequest(
                tripId: "trip_abc123",
                actorParticipantId: "participant_1",
                actorParticipantAccessToken: "gtp_owner_token",
                kind: "flight",
                title: "Arrive at LAS",
                startAt: "2026-09-18T17:30:00Z",
                endAt: "2026-09-18T18:45:00Z",
                locationName: "Harry Reid International Airport",
                notes: "Share confirmation numbers.",
                assignedParticipantIds: ["participant_1", "participant_2"]
            )
        )

        let body = try XCTUnwrap(MockAPIURLProtocol.requestBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(MockAPIURLProtocol.requestURL?.path, "/api/v1/group-trips/items")
        XCTAssertEqual(json["kind"] as? String, "flight")
        XCTAssertEqual(json["actorParticipantAccessToken"] as? String, "gtp_owner_token")
        XCTAssertEqual(json["assignedParticipantIds"] as? [String], ["participant_1", "participant_2"])
        XCTAssertEqual(response.item.createdByParticipantId, "participant_1")
        XCTAssertEqual(response.item.assignedParticipantIds, ["participant_1", "participant_2"])
        XCTAssertEqual(response.activity.type, "item_created")
    }

    func testUpdateGroupTripItemUsesSharedTripContract() async throws {
        MockAPIURLProtocol.responseData = Data("""
        {
          "requestId": "req-item-update",
          "item": {
            "id": "item_1",
            "tripId": "trip_abc123",
            "kind": "meal",
            "title": "Dinner reservation",
            "startAt": "2026-09-19T20:00:00Z",
            "endAt": "2026-09-19T22:00:00Z",
            "locationName": "Best Friend",
            "notes": "Moved after the cabana.",
            "assignedParticipantIds": ["participant_2"],
            "status": "planned",
            "createdByParticipantId": "participant_1",
            "createdAt": "2026-06-28T12:10:00.000Z",
            "updatedAt": "2026-06-28T12:30:00.000Z"
          },
          "activity": {
            "id": "activity_2",
            "tripId": "trip_abc123",
            "type": "item_updated",
            "actorParticipantId": "participant_2",
            "summary": "Priya updated Dinner reservation",
            "createdAt": "2026-06-28T12:30:00.000Z"
          }
        }
        """.utf8)

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockAPIURLProtocol.self]
        let client = SproutAPIClient(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: configuration)
        )

        let response = try await client.updateGroupTripItem(
            GroupTripItemUpdateRequest(
                tripId: "trip_abc123",
                actorParticipantId: "participant_2",
                actorParticipantAccessToken: "gtp_editor_token",
                itemId: "item_1",
                kind: "meal",
                title: "Dinner reservation",
                startAt: "2026-09-19T20:00:00Z",
                endAt: "2026-09-19T22:00:00Z",
                locationName: "Best Friend",
                notes: "Moved after the cabana.",
                assignedParticipantIds: ["participant_2"]
            )
        )

        let body = try XCTUnwrap(MockAPIURLProtocol.requestBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(MockAPIURLProtocol.requestURL?.path, "/api/v1/group-trips/items/update")
        XCTAssertEqual(json["itemId"] as? String, "item_1")
        XCTAssertEqual(json["kind"] as? String, "meal")
        XCTAssertEqual(json["assignedParticipantIds"] as? [String], ["participant_2"])
        XCTAssertEqual(response.item.title, "Dinner reservation")
        XCTAssertEqual(response.activity.type, "item_updated")
    }

    func testImportGroupTripItemsTextUsesSharedTripContract() async throws {
        MockAPIURLProtocol.responseData = Data("""
        {
          "requestId": "req-import",
          "importedCount": 2,
          "items": [
            {
              "id": "item_1",
              "tripId": "trip_abc123",
              "kind": "flight",
              "title": "Arrive at LAS",
              "startAt": "2026-09-18T17:30:00.000Z",
              "endAt": null,
              "locationName": null,
              "notes": null,
              "assignedParticipantIds": ["participant_1"],
              "status": "planned",
              "createdByParticipantId": "participant_1",
              "createdAt": "2026-06-28T12:10:00.000Z",
              "updatedAt": "2026-06-28T12:10:00.000Z"
            },
            {
              "id": "item_2",
              "tripId": "trip_abc123",
              "kind": "meal",
              "title": "Dinner at Best Friend with Priya",
              "startAt": "2026-09-19T20:00:00.000Z",
              "endAt": null,
              "locationName": null,
              "notes": null,
              "assignedParticipantIds": ["participant_2"],
              "status": "planned",
              "createdByParticipantId": "participant_1",
              "createdAt": "2026-06-28T12:10:00.000Z",
              "updatedAt": "2026-06-28T12:10:00.000Z"
            }
          ],
          "activity": {
            "id": "activity_import",
            "tripId": "trip_abc123",
            "type": "items_imported",
            "actorParticipantId": "participant_1",
            "summary": "Nitish imported 2 itinerary items",
            "createdAt": "2026-06-28T12:10:00.000Z"
          }
        }
        """.utf8)

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockAPIURLProtocol.self]
        let client = SproutAPIClient(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: configuration)
        )

        let response = try await client.importGroupTripItemsText(
            GroupTripItemsImportTextRequest(
                tripId: "trip_abc123",
                actorParticipantId: "participant_1",
                actorParticipantAccessToken: "gtp_owner_token",
                text: "Fri 9/18 5:30 PM - Arrive at LAS - Nitish"
            )
        )

        let body = try XCTUnwrap(MockAPIURLProtocol.requestBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(MockAPIURLProtocol.requestURL?.path, "/api/v1/group-trips/items/import-text")
        XCTAssertEqual(json["text"] as? String, "Fri 9/18 5:30 PM - Arrive at LAS - Nitish")
        XCTAssertEqual(response.importedCount, 2)
        XCTAssertEqual(response.items.first?.assignedParticipantIds, ["participant_1"])
        XCTAssertEqual(response.activity.type, "items_imported")
    }

    func testCreateGroupTripExpenseUsesLedgerContract() async throws {
        MockAPIURLProtocol.responseData = Data("""
        {
          "requestId": "req-expense",
          "expense": {
            "id": "expense_1",
            "tripId": "trip_abc123",
            "title": "Hotel deposit",
            "amountCents": 48000,
            "currency": "USD",
            "paidByParticipantId": "participant_1",
            "splitParticipantIds": ["participant_1", "participant_2"],
            "createdByParticipantId": "participant_1",
            "createdAt": "2026-06-28T12:20:00.000Z",
            "updatedAt": "2026-06-28T12:20:00.000Z"
          },
          "balances": [
            {
              "fromParticipantId": "participant_2",
              "toParticipantId": "participant_1",
              "amountCents": 24000,
              "currency": "USD"
            }
          ],
          "activity": {
            "id": "activity_2",
            "tripId": "trip_abc123",
            "type": "expense_created",
            "actorParticipantId": "participant_1",
            "summary": "Nitish added Hotel deposit",
            "createdAt": "2026-06-28T12:20:00.000Z"
          }
        }
        """.utf8)

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockAPIURLProtocol.self]
        let client = SproutAPIClient(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: configuration)
        )

        let response = try await client.createGroupTripExpense(
            GroupTripExpenseCreateRequest(
                tripId: "trip_abc123",
                actorParticipantId: "participant_1",
                actorParticipantAccessToken: "gtp_owner_token",
                paidByParticipantId: "participant_1",
                title: "Hotel deposit",
                amountCents: 48000,
                currency: "USD",
                splitParticipantIds: ["participant_1", "participant_2"]
            )
        )

        let body = try XCTUnwrap(MockAPIURLProtocol.requestBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(MockAPIURLProtocol.requestURL?.path, "/api/v1/group-trips/expenses")
        XCTAssertEqual(json["amountCents"] as? Int, 48000)
        XCTAssertEqual(json["actorParticipantAccessToken"] as? String, "gtp_owner_token")
        XCTAssertEqual(response.balances.first?.amountCents, 24000)
    }

    func testSetGroupTripLocationSharingUsesPrivacyOptInContract() async throws {
        MockAPIURLProtocol.responseData = Data("""
        {
          "requestId": "req-location",
          "participant": {
            "id": "participant_1",
            "tripId": "trip_abc123",
            "displayName": "Nitish",
            "role": "owner",
            "locationSharingEnabled": true,
            "lastLocation": {
              "latitude": 36.1699,
              "longitude": -115.1398,
              "accuracyMeters": 42,
              "updatedAt": "2026-06-28T12:30:00.000Z"
            },
            "joinedAt": "2026-06-28T12:00:00.000Z"
          },
          "activity": {
            "id": "activity_location",
            "tripId": "trip_abc123",
            "type": "location_sharing_enabled",
            "actorParticipantId": "participant_1",
            "summary": "Nitish turned location sharing on",
            "createdAt": "2026-06-28T12:30:00.000Z"
          }
        }
        """.utf8)

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockAPIURLProtocol.self]
        let client = SproutAPIClient(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: configuration)
        )

        let response = try await client.setGroupTripLocationSharing(
            GroupTripLocationSharingRequest(
                tripId: "trip_abc123",
                participantId: "participant_1",
                participantAccessToken: "gtp_owner_token",
                isEnabled: true,
                latitude: 36.1699,
                longitude: -115.1398,
                accuracyMeters: 42
            )
        )

        let body = try XCTUnwrap(MockAPIURLProtocol.requestBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(MockAPIURLProtocol.requestURL?.path, "/api/v1/group-trips/location-sharing")
        XCTAssertEqual(json["isEnabled"] as? Bool, true)
        XCTAssertEqual(json["participantAccessToken"] as? String, "gtp_owner_token")
        XCTAssertEqual(json["latitude"] as? Double, 36.1699)
        XCTAssertEqual(json["longitude"] as? Double, -115.1398)
        XCTAssertEqual(json["accuracyMeters"] as? Double, 42)
        XCTAssertEqual(response.participant.locationSharingEnabled, true)
        XCTAssertEqual(response.participant.lastLocation?.latitude, 36.1699)
        XCTAssertEqual(response.participant.lastLocation?.longitude, -115.1398)
        XCTAssertEqual(response.activity.type, "location_sharing_enabled")
    }

    func testGroupTripSnapshotUsesParticipantAccessTokenHeader() async throws {
        MockAPIURLProtocol.responseData = Data("""
        {
          "requestId": "req-snapshot",
          "trip": {
            "id": "trip_abc123",
            "title": "Vegas 2026",
            "destination": "Las Vegas, NV",
            "startDate": "2026-09-18",
            "endDate": "2026-09-21",
            "inviteCode": "VEGAS1",
            "status": "active"
          },
          "participants": [],
          "items": [],
          "decisions": [],
          "expenses": [],
          "balances": [],
          "activity": [],
          "aiSuggestions": []
        }
        """.utf8)

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockAPIURLProtocol.self]
        let client = SproutAPIClient(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: configuration)
        )

        _ = try await client.groupTripSnapshot(
            tripId: "trip_abc123",
            participantId: "participant_1",
            participantAccessToken: "gtp_owner_token"
        )

        let components = try XCTUnwrap(URLComponents(url: MockAPIURLProtocol.requestURL!, resolvingAgainstBaseURL: false))
        let queryItems = components.queryItems ?? []
        XCTAssertEqual(MockAPIURLProtocol.requestURL?.path, "/api/v1/group-trips/snapshot")
        XCTAssertTrue(queryItems.contains(URLQueryItem(name: "tripId", value: "trip_abc123")))
        XCTAssertTrue(queryItems.contains(URLQueryItem(name: "participantId", value: "participant_1")))
        XCTAssertFalse(queryItems.contains(URLQueryItem(name: "participantAccessToken", value: "gtp_owner_token")))
        XCTAssertEqual(
            MockAPIURLProtocol.requestHeaders?["X-Group-Trip-Participant-Token"],
            "gtp_owner_token"
        )
    }
}

private final class MockAPIURLProtocol: URLProtocol {
    static var requestBody: Data?
    static var requestURL: URL?
    static var requestHeaders: [String: String]?
    static var responseData = Data()
    static var statusCode = 200

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        Self.requestURL = request.url
        Self.requestHeaders = request.allHTTPHeaderFields
        Self.requestBody = request.httpBody ?? request.httpBodyStream.flatMap(Self.readBodyStream)
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: Self.statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.responseData)
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
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data
    }
}
