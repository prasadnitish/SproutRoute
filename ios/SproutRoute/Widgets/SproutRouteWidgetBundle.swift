import ActivityKit
import SwiftUI
import WidgetKit

@main
struct SproutRouteWidgetBundle: WidgetBundle {
    var body: some Widget {
        TripCountdownWidget()
        PackingProgressWidget()
        WeatherAlertWidget()
        TripLiveActivityWidget()
    }
}

struct TripSnapshotEntry: TimelineEntry {
    var date: Date
    var snapshot: TripWidgetSnapshot
}

struct TripSnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> TripSnapshotEntry {
        TripSnapshotEntry(date: Date(), snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (TripSnapshotEntry) -> Void) {
        completion(TripSnapshotEntry(date: Date(), snapshot: AppGroupSnapshotStore().loadLatestTripSnapshot() ?? .empty))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TripSnapshotEntry>) -> Void) {
        let snapshot = AppGroupSnapshotStore().loadLatestTripSnapshot() ?? .empty
        let entry = TripSnapshotEntry(date: Date(), snapshot: snapshot)
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct TripCountdownWidget: Widget {
    let kind = "TripCountdownWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TripSnapshotProvider()) { entry in
            TripCountdownWidgetView(entry: entry)
        }
        .configurationDisplayName("Trip Countdown")
        .description("Shows the latest saved SproutRoute trip.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct TripCountdownWidgetView: View {
    let entry: TripSnapshotEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("SproutRoute", systemImage: "leaf")
                .font(.caption.bold())
            Text(entry.snapshot.destination)
                .font(.headline)
                .lineLimit(2)
            Text(entry.snapshot.startDate.isEmpty ? "Plan a trip" : entry.snapshot.startDate)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Text(entry.snapshot.nextActivity ?? "Open your itinerary")
                .font(.caption2)
                .lineLimit(2)
        }
        .containerBackground(SproutTheme.sproutLight, for: .widget)
        .widgetURL(SproutRouteDeepLink.tripURL(id: entry.snapshot.id))
    }
}

struct PackingProgressWidget: Widget {
    let kind = "PackingProgressWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TripSnapshotProvider()) { entry in
            PackingProgressWidgetView(entry: entry)
        }
        .configurationDisplayName("Packing Progress")
        .description("Shows packing progress for the latest saved trip.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct PackingProgressWidgetView: View {
    let entry: TripSnapshotEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Packing", systemImage: "backpack")
                .font(.headline)
            ProgressView(value: entry.snapshot.packingProgress)
                .tint(SproutTheme.sproutDark)
            Text("\(entry.snapshot.packingPackedCount) of \(entry.snapshot.packingTotalCount) packed")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Text(entry.snapshot.destination)
                .font(.caption.bold())
                .lineLimit(1)
        }
        .containerBackground(.background, for: .widget)
        .widgetURL(SproutRouteDeepLink.packingURL(id: entry.snapshot.id))
    }
}

struct WeatherAlertWidget: Widget {
    let kind = "WeatherAlertWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TripSnapshotProvider()) { entry in
            WeatherAlertWidgetView(entry: entry)
        }
        .configurationDisplayName("Trip Weather")
        .description("Shows the latest destination weather note.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct WeatherAlertWidgetView: View {
    let entry: TripSnapshotEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Weather", systemImage: "cloud.sun")
                .font(.headline)
            Text(entry.snapshot.weatherAlert ?? entry.snapshot.weatherSummary ?? "No weather alert")
                .font(.subheadline)
                .lineLimit(4)
            Spacer()
            Text(entry.snapshot.destination)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .containerBackground(SproutTheme.warmWhite, for: .widget)
        .widgetURL(SproutRouteDeepLink.tripURL(id: entry.snapshot.id))
    }
}

struct TripLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TripActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 8) {
                Text(context.state.title)
                    .font(.headline)
                Text(context.state.subtitle)
                    .font(.caption)
                ProgressView(value: context.state.progress)
            }
            .padding()
            .activityBackgroundTint(SproutTheme.sproutLight)
            .widgetURL(context.state.deepLink)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.attributes.destination)
                        .font(.caption)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.caption.bold())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.subtitle)
                        .font(.caption)
                }
            } compactLeading: {
                Image(systemName: "leaf")
            } compactTrailing: {
                Text("\(Int(context.state.progress * 100))")
            } minimal: {
                Image(systemName: "leaf")
            }
            .widgetURL(context.state.deepLink)
        }
    }
}
