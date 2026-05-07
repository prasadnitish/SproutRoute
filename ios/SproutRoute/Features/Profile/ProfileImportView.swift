import SwiftData
import SwiftUI
import UIKit

enum ProfileImportPrompt {
    static let text = """
    Please create a travel profile for me in JSON format. I will paste your response into SproutRoute, so return JSON only.

    Include these sections:
    - food_preferences: cuisines_liked, cuisines_disliked, dietary_restrictions, kid_foods, food_adventurousness (low/medium/high), notes, confidence (high/medium/low)
    - travel_style: pace (slow/moderate/fast), planning_style (structured/flexible/spontaneous), accommodation_preference, transport_preference, notes, confidence
    - activity_preferences: preferred_activities, disliked_activities, activity_intensity (relaxed/moderate/active), notes, confidence
    - personality_profile: traveler_type, novelty_vs_comfort (1-5), crowd_tolerance (low/medium/high), notes, confidence
    - family_context: traveling_with, kids_details, kid_preferences, notes, confidence
    - constraints: budget_range, time_constraints, accessibility_needs, notes, confidence
    - trip_priorities: must_haves, avoidances, notes, confidence
    - profile_summary: one sentence describing me as a traveler
    - unknowns: things you could not determine

    Base this on what you know about me from our conversations. This prompt works in ChatGPT, Claude, Gemini, or another assistant that can return structured JSON.
    """
}

struct ProfileImportView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @State private var rawText = ""
    @State private var validation: ProfileValidateResponse?
    @State private var normalized: ProfileNormalizeResponse?
    @State private var error: String?
    @State private var isWorking = false
    @State private var copiedPrompt = false

    private let apiClient = SproutAPIClient()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                instructionCard
                pasteCard

                if let validation {
                    validationCard(validation)
                }

                if let profile = normalized?.normalizedProfile {
                    reviewCard(profile)
                }

                if let error {
                    Text(error)
                        .font(.subheadline)
                        .foregroundStyle(SproutTheme.danger)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SproutTheme.danger.opacity(0.12), in: RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous))
                }
            }
            .padding()
        }
        .background(SproutTheme.canvas.ignoresSafeArea())
        .navigationTitle("Import Profile")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            ProductAnalytics.shared.track(.profileImportOpened())
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
            }
        }
    }

    private var instructionCard: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Use your AI assistant", systemImage: "sparkles")
                    .font(.headline)
                    .foregroundStyle(SproutTheme.primaryText)
                Text("Copy the prompt, paste it into ChatGPT, Claude, Gemini, or another assistant, then paste the JSON response back here.")
                    .font(.subheadline)
                    .foregroundStyle(SproutTheme.secondaryText)
                ScrollView {
                    Text(ProfileImportPrompt.text)
                        .font(.caption.monospaced())
                        .foregroundStyle(SproutTheme.primaryText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 210)
                .padding(12)
                .background(SproutTheme.elevatedSurface, in: RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous))

                Button {
                    UIPasteboard.general.string = ProfileImportPrompt.text
                    copiedPrompt = true
                } label: {
                    Label(copiedPrompt ? "Prompt copied" : "Copy prompt", systemImage: copiedPrompt ? "checkmark.circle.fill" : "doc.on.doc")
                }
                .buttonStyle(.borderedProminent)
                .tint(SproutTheme.accent)
            }
        }
    }

    private var pasteCard: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Paste the JSON result")
                    .font(.headline)
                    .foregroundStyle(SproutTheme.primaryText)
                TextEditor(text: $rawText)
                    .frame(minHeight: 180)
                    .padding(8)
                    .scrollContentBackground(.hidden)
                    .background(SproutTheme.elevatedSurface, in: RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous))
                    .foregroundStyle(SproutTheme.primaryText)
                    .accessibilityLabel("Profile JSON")
                Button {
                    Task { await validateAndNormalize() }
                } label: {
                    Label(isWorking ? "Checking profile" : "Validate and review", systemImage: "checkmark.seal")
                }
                .buttonStyle(.borderedProminent)
                .tint(SproutTheme.accent)
                .disabled(rawText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWorking)
            }
        }
    }

    private func validationCard(_ validation: ProfileValidateResponse) -> some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 8) {
                Label(validation.valid ? "Profile recognized" : "Profile needs changes", systemImage: validation.valid ? "checkmark.circle" : "exclamationmark.triangle")
                    .font(.headline)
                    .foregroundStyle(validation.valid ? SproutTheme.accent : SproutTheme.warning)
                ForEach(validation.warnings, id: \.self) { warning in
                    Text(warning)
                        .font(.caption)
                        .foregroundStyle(SproutTheme.secondaryText)
                }
                ForEach(validation.errors, id: \.self) { error in
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(SproutTheme.danger)
                }
            }
        }
    }

    private func reviewCard(_ profile: UserTravelProfile) -> some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Review")
                    .font(.headline)
                    .foregroundStyle(SproutTheme.primaryText)
                Text(profile.profileSummary ?? "Profile normalized")
                    .foregroundStyle(SproutTheme.secondaryText)
                Button("Save locally") {
                    saveProfile()
                }
                .buttonStyle(.borderedProminent)
                .tint(SproutTheme.accent)
            }
        }
    }

    private func validateAndNormalize() async {
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            let sanitizedText = ProfileImportSanitizer.sanitizedPaste(rawText)
            if sanitizedText != rawText {
                rawText = sanitizedText
            }

            validation = try await apiClient.validateProfile(rawText: sanitizedText)
            if let validation {
                ProductAnalytics.shared.track(.profileImportValidated(
                    valid: validation.valid,
                    warningCount: validation.warnings.count,
                    errorCount: validation.errors.count
                ))
            }
            guard validation?.valid == true else { return }
            normalized = try await apiClient.normalizeProfile(rawText: sanitizedText)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func saveProfile() {
        guard let normalized else { return }
        do {
            _ = try TripRepository(modelContext: modelContext).saveImportedProfile(normalized, rawText: rawText)
            ProductAnalytics.shared.track(.profileImportSaved())
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
