import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case weather
    case itinerary
    case packing
    case safety

    var id: String { rawValue }

    var title: String {
        switch self {
        case .weather: "Weather"
        case .itinerary: "Itinerary"
        case .packing: "Packing"
        case .safety: "Safety"
        }
    }

    var systemImage: String {
        switch self {
        case .weather: "cloud.sun"
        case .itinerary: "list.bullet.rectangle"
        case .packing: "backpack"
        case .safety: "shield.checkered"
        }
    }
}

struct AppRootView: View {
    @Environment(TripPlanner.self) private var planner
    @State private var selectedTab: AppTab = .itinerary
    @State private var showingSettings = false
    @State private var showingSavedTrips = false

    var body: some View {
        selectedTabContent
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if planner.hasResult {
                    appTabBar
                }
            }
        .tint(SproutTheme.accent)
        .task { await planner.loadCapabilities() }
        .onChange(of: planner.selectedDeepLink) { _, deepLink in
            switch deepLink {
            case .plan:
                selectedTab = .itinerary
            case .trip, .day:
                selectedTab = .itinerary
            case .packing:
                selectedTab = .packing
            case .settings:
                showingSettings = true
            case nil:
                break
            }
        }
        .sheet(isPresented: $showingSettings) {
            NavigationStack {
                SettingsView()
                    .navigationTitle("Settings")
            }
        }
        .sheet(isPresented: $showingSavedTrips) {
            NavigationStack {
                SavedTripsView()
                    .navigationTitle("Saved Trips")
            }
        }
    }

    @ViewBuilder
    private var selectedTabContent: some View {
        NavigationStack {
            PlanView(selectedSection: selectedTab)
                .navigationTitle("SproutRoute")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button {
                                showingSavedTrips = true
                            } label: {
                                Label("Saved trips", systemImage: "suitcase")
                            }
                            Button {
                                showingSettings = true
                            } label: {
                                Label("Settings", systemImage: "gearshape")
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .accessibilityLabel("More")
                        }
                    }
                }
        }
        .accessibilityIdentifier("result-section-\(selectedTab.rawValue)")
    }

    private var appTabBar: some View {
        HStack(spacing: 4) {
            ForEach(AppTab.allCases) { tab in
                Button {
                    selectedTab = tab
                    ProductAnalytics.shared.track(.tabViewed(tab.rawValue))
                } label: {
                    VStack(spacing: 5) {
                        Image(systemName: tab.systemImage)
                            .font(.title2.weight(.semibold))
                        Text(tab.title)
                            .font(.caption.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity, minHeight: 58)
                    .foregroundStyle(selectedTab == tab ? SproutTheme.primaryText : SproutTheme.secondaryText)
                    .background {
                        if selectedTab == tab {
                            Capsule(style: .continuous)
                                .fill(SproutTheme.accentSoft)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
                .accessibilityValue(selectedTab == tab ? "Selected" : "Not selected")
                .accessibilityIdentifier("tab-item-\(tab.rawValue)")
            }
        }
        .padding(8)
        .background(.regularMaterial, in: Capsule(style: .continuous))
        .overlay {
            Capsule(style: .continuous)
                .stroke(SproutTheme.primaryText.opacity(0.08))
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("app-tab-bar")
    }
}
