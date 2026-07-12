import SwiftData
import SwiftUI

struct SavedTripsView: View {
    @Environment(TripPlanner.self) private var planner
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \SavedTripModel.updatedAt, order: .reverse) private var trips: [SavedTripModel]

    var body: some View {
        List {
            if trips.isEmpty {
                ContentUnavailableView("No saved trips", systemImage: "suitcase", description: Text("Planned trips save locally for offline access, widgets, Spotlight, and shortcuts."))
            } else {
                ForEach(trips) { trip in
                    NavigationLink {
                        SavedTripDetailView(trip: trip)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(trip.destination)
                                .font(.headline)
                            Text("\(trip.startDate) to \(trip.endDate)")
                                .font(.caption)
                                .foregroundStyle(SproutTheme.muted)
                            if let recap = trip.recap {
                                Text(recap)
                                    .font(.caption)
                                    .lineLimit(2)
                            }
                        }
                    }
                    .swipeActions {
                        Button(role: .destructive) {
                            Task {
                                try? await TripDeletionService(modelContext: modelContext).delete(trip)
                            }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .sproutScreenBackground()
        .toolbar {
            Button {
                Task { try? planner.saveCurrentTrip(modelContext: modelContext) }
            } label: {
                Label("Save Current", systemImage: "square.and.arrow.down")
            }
            .disabled(!planner.hasResult)
        }
    }
}

struct SavedTripDetailView: View {
    @Environment(TripPlanner.self) private var planner
    let trip: SavedTripModel

    var body: some View {
        ScrollView {
            if let result = trip.tripResult {
                ResultsView(result: result, nativeWeather: nil, weatherNotice: nil)
                    .padding()
            } else {
                ContentUnavailableView("Trip data unavailable", systemImage: "exclamationmark.triangle")
            }
        }
        .sproutScreenBackground()
        .navigationTitle(trip.destination)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: trip.id) {
            if let result = trip.tripResult {
                planner.openSavedTrip(result)
            }
        }
    }
}
