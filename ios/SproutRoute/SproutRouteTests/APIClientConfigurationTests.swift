import Foundation
import XCTest
@testable import SproutRoute

final class APIClientConfigurationTests: XCTestCase {
    override func tearDown() {
        MockAPIURLProtocol.requestBody = nil
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
}

private final class MockAPIURLProtocol: URLProtocol {
    static var requestBody: Data?
    static var responseData = Data()
    static var statusCode = 200

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
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
