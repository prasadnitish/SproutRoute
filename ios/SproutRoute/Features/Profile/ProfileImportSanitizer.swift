import Foundation

enum ProfileImportSanitizer {
    static func sanitizedPaste(_ text: String) -> String {
        var candidate = text.trimmingCharacters(in: .whitespacesAndNewlines)

        if candidate.hasPrefix("\u{FEFF}") {
            candidate.removeFirst()
        }

        if let fenced = fencedJSONBody(in: candidate) {
            candidate = fenced.trimmingCharacters(in: .whitespacesAndNewlines)
        } else if !candidate.hasPrefix("{"),
                  let start = candidate.firstIndex(of: "{"),
                  let end = candidate.lastIndex(of: "}"),
                  start < end {
            candidate = String(candidate[start...end])
        }

        return candidate
            .replacingOccurrences(of: "“", with: "\"")
            .replacingOccurrences(of: "”", with: "\"")
            .replacingOccurrences(of: "„", with: "\"")
            .replacingOccurrences(of: "‟", with: "\"")
            .replacingOccurrences(of: "‘", with: "'")
            .replacingOccurrences(of: "’", with: "'")
            .replacingOccurrences(of: "‚", with: "'")
            .replacingOccurrences(of: "‛", with: "'")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func fencedJSONBody(in text: String) -> String? {
        guard let fenceStart = text.range(of: "```") else { return nil }
        let afterOpeningFence = text[fenceStart.upperBound...]
        let bodyStart: String.Index

        if let newline = afterOpeningFence.firstIndex(of: "\n") {
            bodyStart = afterOpeningFence.index(after: newline)
        } else {
            bodyStart = fenceStart.upperBound
        }

        guard let fenceEnd = text[bodyStart...].range(of: "```") else { return nil }
        return String(text[bodyStart..<fenceEnd.lowerBound])
    }
}
