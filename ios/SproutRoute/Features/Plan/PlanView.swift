import SwiftData
import SwiftUI

enum PlanPresentationPolicy {
    static let promptPlaceholder = "Describe destination, dates, kids, pets, pace, and must-dos."

    static func shouldShowResults(hasResult: Bool, isWorking: Bool, composingAfterResult: Bool) -> Bool {
        hasResult && !isWorking && !composingAfterResult
    }

    static func shouldShowProgress(isWorking: Bool, hasFailure: Bool) -> Bool {
        isWorking || hasFailure
    }
}

struct PlanView: View {
    @Environment(TripPlanner.self) private var planner
    @Environment(\.modelContext) private var modelContext
    let selectedSection: AppTab
    @State private var draft = ""
    @State private var showingProfileImport = false
    @State private var composingAfterResult = false

    private let examples = [
        "Five days in San Diego with a toddler and a dog",
        "Spring break in London with museums and parks",
        "Road trip from Seattle to Banff with kids",
        "Beach vacation in Florida with car seat guidance"
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header
                if !planner.hasResult || isWorking || composingAfterResult {
                    promptCard
                    if PlanPresentationPolicy.shouldShowProgress(isWorking: isWorking, hasFailure: hasFailure) {
                        progressCard
                    }
                } else {
                    Button {
                        draft = ""
                        composingAfterResult = true
                    } label: {
                        Label("Plan another trip", systemImage: "plus.circle")
                    }
                    .buttonStyle(.bordered)
                }
                if PlanPresentationPolicy.shouldShowResults(
                    hasResult: planner.hasResult,
                    isWorking: isWorking,
                    composingAfterResult: composingAfterResult
                ) {
                    ResultsView(
                        result: planner.currentResult,
                        nativeWeather: planner.latestNativeWeather,
                        weatherNotice: planner.weatherMismatchNotice,
                        selectedSection: selectedSection
                    )
                }
            }
            .padding()
        }
        .background(SproutTheme.canvas.ignoresSafeArea())
        .sheet(isPresented: $showingProfileImport) {
            NavigationStack {
                ProfileImportView()
            }
        }
        .onAppear {
            if case .plan(let destination) = planner.selectedDeepLink, let destination {
                draft = destination
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Plan a family trip")
                .font(.title2.bold())
                .foregroundStyle(SproutTheme.primaryText)
            Text("Add dates, kids, pets, pace, and must-dos. SproutRoute builds weather, itinerary, packing, and safety guidance.")
                .font(.callout)
                .foregroundStyle(SproutTheme.secondaryText)
        }
        .accessibilityElement(children: .combine)
    }

    private var promptCard: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Describe the trip")
                    .font(.headline)
                    .foregroundStyle(SproutTheme.primaryText)
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $draft)
                        .frame(minHeight: 106)
                        .padding(10)
                        .scrollContentBackground(.hidden)
                        .background(SproutTheme.elevatedSurface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(SproutTheme.primaryText)
                        .overlay {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(SproutTheme.accent.opacity(0.28))
                        }
                        .accessibilityLabel("Trip prompt")

                    if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(PlanPresentationPolicy.promptPlaceholder)
                            .font(.body)
                            .foregroundStyle(SproutTheme.tertiaryText)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 18)
                            .allowsHitTesting(false)
                    }
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(examples, id: \.self) { example in
                            Button(example) { draft = example }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                        }
                    }
                }

                HStack {
                    Button {
                        showingProfileImport = true
                    } label: {
                        Label("Import profile", systemImage: "person.crop.circle.badge.plus")
                    }
                    .buttonStyle(.bordered)

                    Spacer()

                    Button {
                        Task {
                            composingAfterResult = false
                            await planner.submit(text: draft, modelContext: modelContext)
                        }
                    } label: {
                        Label("Plan trip", systemImage: "arrow.right.circle.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(SproutTheme.accent)
                    .disabled(isWorking)
                }
            }
        }
    }

    private var progressCard: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(planner.phase.label)
                        .font(.headline)
                        .foregroundStyle(SproutTheme.primaryText)
                    Spacer()
                    if isWorking {
                        ProgressView()
                    }
                }

                if case .failed(let message) = planner.phase {
                    Label(message, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(SproutTheme.danger)
                        .font(.subheadline)
                } else {
                    HStack {
                        stepLabel("resolve", title: "Parse")
                        stepLabel("weather", title: "Weather")
                        stepLabel("itinerary", title: "Itinerary")
                        stepLabel("packing", title: "Packing")
                        stepLabel("safety", title: "Safety")
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var isWorking: Bool {
        planner.phase == .parsing || planner.phase == .generating
    }

    private var hasFailure: Bool {
        if case .failed = planner.phase {
            return true
        }
        return false
    }

    private func stepLabel(_ key: String, title: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: planner.progress[key] == "done" ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(planner.progress[key] == "done" ? SproutTheme.accent : SproutTheme.secondaryText)
            Text(title)
                .font(.caption2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(SproutTheme.secondaryText)
        }
        .frame(maxWidth: .infinity)
    }
}
