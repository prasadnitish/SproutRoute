import SwiftData
import SwiftUI

struct SettingsView: View {
    @Environment(TripPlanner.self) private var planner
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \ImportedProfileModel.updatedAt, order: .reverse) private var profiles: [ImportedProfileModel]
    @State private var showingProfileImport = false
    @State private var confirmingDelete = false
    @State private var deleteMessage: String?
    @State private var analyticsEnabled = ProductAnalytics.shared.isEnabled
    @State private var isDeletingData = false

    var body: some View {
        Form {
            Section("Profile") {
                if let profile = profiles.first {
                    Text(profile.summary ?? "Imported profile saved locally")
                        .foregroundStyle(SproutTheme.primaryText)
                } else {
                    Text("No local profile imported")
                        .foregroundStyle(SproutTheme.secondaryText)
                }
                Button("Import from ChatGPT or Claude") {
                    showingProfileImport = true
                }
            }

            Section("Trip reminders") {
                Button("Enable reminders for current trip") {
                    Task { await planner.requestNotificationsForCurrentTrip(modelContext: modelContext) }
                }
                .disabled(!planner.hasResult)
                Text("SproutRoute uses local reminders on this device. There is no remote push setup in this build.")
                    .font(.caption)
                    .foregroundStyle(SproutTheme.secondaryText)
            }

            Section("Product analytics") {
                Toggle("Share product analytics", isOn: Binding(
                    get: { analyticsEnabled },
                    set: { newValue in
                        analyticsEnabled = newValue
                        ProductAnalytics.shared.setEnabled(newValue)
                    }
                ))
                Text("Optional analytics helps improve planning speed, reliability, and navigation. It sends aggregate product events only, never trip prompts, profile JSON, child names, pet names, precise GPS, session replay, or advertising identifiers.")
                    .font(.caption)
                    .foregroundStyle(SproutTheme.secondaryText)
                if !ProductAnalytics.shared.isConfigured {
                    Text("Analytics is unavailable in this build until the public PostHog project key is configured.")
                        .font(.caption)
                        .foregroundStyle(SproutTheme.secondaryText)
                }
            }

            Section("Privacy, safety, and legal") {
                ForEach(CompliancePage.allCases) { page in
                    NavigationLink {
                        CompliancePageView(page: page)
                    } label: {
                        Label(page.title, systemImage: page.systemImage)
                    }
                }
            }

            Section("Data deletion") {
                Button(role: .destructive) {
                    confirmingDelete = true
                } label: {
                    Label("Delete all local trip data", systemImage: "trash")
                }
                .disabled(isDeletingData)
                Text("This removes saved trips, imported profile data, packing progress, cached weather, local notification plans, widget snapshots, Live Activity state, and the local analytics identifier from this device.")
                    .font(.caption)
                    .foregroundStyle(SproutTheme.secondaryText)
                if let deleteMessage {
                    Text(deleteMessage)
                        .font(.caption)
                        .foregroundStyle(SproutTheme.secondaryText)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(SproutTheme.canvas.ignoresSafeArea())
        .sheet(isPresented: $showingProfileImport) {
            NavigationStack { ProfileImportView() }
        }
        .confirmationDialog(
            "Delete all SproutRoute data on this device?",
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Delete local data", role: .destructive) {
                deleteLocalData()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes saved trips, imported profile data, packing progress, cached weather, local notification plans, widget snapshots, Live Activity state, and the local analytics identifier from this device.")
        }
    }

    private func deleteLocalData() {
        Task {
            isDeletingData = true
            defer { isDeletingData = false }
            do {
                _ = try await LocalDataDeletionService(modelContext: modelContext).deleteAllLocalData()
                analyticsEnabled = ProductAnalytics.shared.isEnabled
                planner.clearCurrentTrip()
                deleteMessage = "Local trip data deleted. Analytics was turned off and the local analytics identifier was reset."
            } catch {
                deleteMessage = error.localizedDescription
            }
        }
    }
}
