import Foundation

enum SproutRouteDeepLink: Hashable {
    case plan(destination: String?)
    case trip(id: String)
    case packing(id: String)
    case day(id: String, date: String)
    case settings

    static func parse(_ url: URL) -> SproutRouteDeepLink? {
        guard url.scheme == "sproutroute" else { return nil }
        let host = url.host ?? ""
        let path = url.pathComponents.filter { $0 != "/" }

        if host == "plan" {
            let destination = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first(where: { $0.name == "destination" })?
                .value
            return .plan(destination: destination)
        }

        if host == "settings" {
            return .settings
        }

        if host == "trip", let id = path.first {
            if path.count >= 2, path[1] == "packing" {
                return .packing(id: id)
            }
            if path.count >= 3, path[1] == "day" {
                return .day(id: id, date: path[2])
            }
            return .trip(id: id)
        }

        return nil
    }

    static func tripURL(id: String) -> URL {
        URL(string: "sproutroute://trip/\(id)")!
    }

    static func packingURL(id: String) -> URL {
        URL(string: "sproutroute://trip/\(id)/packing")!
    }

    static func dayURL(id: String, date: String) -> URL {
        URL(string: "sproutroute://trip/\(id)/day/\(date)")!
    }

    static func planURL(destination: String) -> URL {
        var components = URLComponents()
        components.scheme = "sproutroute"
        components.host = "plan"
        components.queryItems = [URLQueryItem(name: "destination", value: destination)]
        return components.url!
    }
}
