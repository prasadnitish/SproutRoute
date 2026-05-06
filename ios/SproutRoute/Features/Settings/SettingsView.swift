import SwiftData
import SwiftUI

struct SettingsView: View {
    @Environment(TripPlanner.self) private var planner
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \ImportedProfileModel.updatedAt, order: .reverse) private var profiles: [ImportedProfileModel]
    @State private var showingProfileImport = false
    @State private var confirmingDelete = false
    @State private var deleteMessage: String?

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

            Section("Privacy and terms") {
                Link("Privacy Policy", destination: URL(string: "https://sproutroute-production.up.railway.app/privacy.html")!)
                Link("Terms of Service", destination: URL(string: "https://sproutroute-production.up.railway.app/terms.html")!)
                Button(role: .destructive) {
                    confirmingDelete = true
                } label: {
                    Label("Delete all local trip data", systemImage: "trash")
                }
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
            Text("This removes saved trips, imported profile data, packing progress, cached weather, and local notification plans from this device.")
        }
    }

    private func deleteLocalData() {
        do {
            try TripRepository(modelContext: modelContext).deleteAllLocalData()
            planner.clearCurrentTrip()
            deleteMessage = "Local trip data deleted."
        } catch {
            deleteMessage = error.localizedDescription
        }
    }
}
