import Foundation

struct ServerSentEvent: Equatable {
    var event: String?
    var data: String
}

final class SSEParser {
    private var buffer = ""

    func append(_ chunk: String) -> [ServerSentEvent] {
        buffer += chunk
        var events: [ServerSentEvent] = []

        while let boundary = nextBoundary(in: buffer) {
            let rawEvent = String(buffer[..<boundary.range.lowerBound])
            buffer.removeSubrange(..<boundary.range.upperBound)
            if let event = parse(rawEvent) {
                events.append(event)
            }
        }

        return events
    }

    func flush() -> [ServerSentEvent] {
        guard !buffer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            buffer = ""
            return []
        }
        let raw = buffer
        buffer = ""
        return parse(raw).map { [$0] } ?? []
    }

    private func nextBoundary(in text: String) -> (range: Range<String.Index>, token: String)? {
        let candidates = ["\r\n\r\n", "\n\n", "\r\r"].compactMap { token -> (Range<String.Index>, String)? in
            guard let range = text.range(of: token) else { return nil }
            return (range, token)
        }
        return candidates.min { $0.0.lowerBound < $1.0.lowerBound }.map { ($0.0, $0.1) }
    }

    private func parse(_ raw: String) -> ServerSentEvent? {
        var eventName: String?
        var dataLines: [String] = []

        for rawLine in raw.components(separatedBy: .newlines) {
            let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !line.isEmpty, !line.hasPrefix(":") else { continue }
            if line.hasPrefix("event:") {
                eventName = String(line.dropFirst("event:".count)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                dataLines.append(String(line.dropFirst("data:".count)).trimmingCharacters(in: .whitespaces))
            }
        }

        guard !dataLines.isEmpty else { return nil }
        return ServerSentEvent(event: eventName, data: dataLines.joined(separator: "\n"))
    }
}
