import CoreLocation
import Foundation
import WeatherKit

struct NativeWeatherSnapshot: Codable, Hashable {
    var fetchedAt: Date
    var attributionURL: URL?
    var summary: String
    var days: [NativeWeatherDay]
}

struct NativeWeatherDay: Codable, Hashable, Identifiable {
    var id: Date { date }
    var date: Date
    var condition: String
    var highF: Double?
    var lowF: Double?
    var precipitationChance: Double?
}

actor WeatherKitAdapter {
    func refreshForecast(lat: Double?, lon: Double?) async -> NativeWeatherSnapshot? {
        guard let lat, let lon else { return nil }
        do {
            let location = CLLocation(latitude: lat, longitude: lon)
            let weather = try await WeatherService.shared.weather(for: location)
            let days = weather.dailyForecast.forecast.prefix(10).map { day in
                NativeWeatherDay(
                    date: day.date,
                    condition: day.condition.description,
                    highF: day.highTemperature.converted(to: .fahrenheit).value,
                    lowF: day.lowTemperature.converted(to: .fahrenheit).value,
                    precipitationChance: day.precipitationChance
                )
            }
            let summary = days.first.map { "\($0.condition), high \(WeatherValueFormatter.temperature($0.highF))" } ?? "Forecast refreshed"
            let attribution = try? await WeatherService.shared.attribution
            return NativeWeatherSnapshot(
                fetchedAt: Date(),
                attributionURL: attribution?.legalPageURL,
                summary: summary,
                days: Array(days)
            )
        } catch {
            return nil
        }
    }

    func mismatchNotice(backend: WeatherForecast?, native: NativeWeatherSnapshot?) -> String? {
        guard
            let backendHigh = backend?.forecast.first?.high,
            let nativeHigh = native?.days.first?.highF
        else { return nil }
        if abs(backendHigh - nativeHigh) >= 8 {
            return "Apple Weather has changed since the plan was generated."
        }
        return nil
    }
}
