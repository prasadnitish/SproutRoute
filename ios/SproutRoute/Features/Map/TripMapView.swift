import MapKit
import SwiftUI

struct TripMapView: View {
    @Environment(TripPlanner.self) private var planner
    @State private var camera: MapCameraPosition = .automatic

    var body: some View {
        VStack(spacing: 0) {
            if let trip = planner.currentResult.trip {
                Map(position: $camera) {
                    if let lat = trip.lat, let lon = trip.lon {
                        Marker(trip.destination, coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon))
                            .tint(.green)
                    }
                    ForEach(planner.currentResult.tripPlan?.suggestedActivities ?? []) { activity in
                        if let lat = activity.lat, let lon = activity.lon {
                            Marker(activity.name, coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon))
                        }
                    }
                }
                .mapControls {
                    MapCompass()
                    MapScaleView()
                    MapUserLocationButton()
                }
                .safeAreaInset(edge: .bottom) {
                    NativeCard {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(trip.destination)
                                    .font(.headline)
                                Text("Open activities in Apple Maps for turn-by-turn planning.")
                                    .font(.caption)
                                    .foregroundStyle(SproutTheme.muted)
                            }
                            Spacer()
                            Button {
                                openInMaps(trip: trip)
                            } label: {
                                Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                                    .frame(width: SproutTheme.minimumTouchTarget, height: SproutTheme.minimumTouchTarget)
                            }
                            .buttonStyle(SproutPrimaryButtonStyle())
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top)
                    .padding(.bottom, 92)
                }
            } else {
                ContentUnavailableView("No active trip", systemImage: "map", description: Text("Plan or open a saved trip to see itinerary pins."))
            }
        }
    }

    private func openInMaps(trip: TripMeta) {
        guard let lat = trip.lat, let lon = trip.lon else { return }
        let placemark = MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon))
        let item = MKMapItem(placemark: placemark)
        item.name = trip.destination
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
    }
}
