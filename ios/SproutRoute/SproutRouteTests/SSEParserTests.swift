import XCTest
@testable import SproutRoute

final class SSEParserTests: XCTestCase {
    func testParsesEventAcrossChunkBoundary() {
        let parser = SSEParser()

        XCTAssertEqual(parser.append("event: wea"), [])
        let events = parser.append("ther\ndata: {\"summary\":\"Sunny\"}\n\n")

        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events.first?.event, "weather")
        XCTAssertEqual(events.first?.data, "{\"summary\":\"Sunny\"}")
    }

    func testParsesMultipleDataLines() {
        let parser = SSEParser()
        let events = parser.append("event: itinerary\ndata: {\"a\":1}\ndata: {\"b\":2}\n\n")

        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].data, "{\"a\":1}\n{\"b\":2}")
    }

    func testIgnoresMalformedEventWithoutData() {
        let parser = SSEParser()
        let events = parser.append("event: ping\n\n")

        XCTAssertTrue(events.isEmpty)
    }
}
