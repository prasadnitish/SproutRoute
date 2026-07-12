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
            VStack(alignment: .leading, spacing: SproutTheme.spacing.lg) {
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
                    .buttonStyle(SproutSecondaryButtonStyle())
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
            .padding(.horizontal, SproutTheme.spacing.lg)
            .padding(.top, SproutTheme.spacing.md)
            .padding(.bottom, SproutTheme.spacing.xxl)
        }
        .sproutScreenBackground()
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
        SproutHeroCard {
            VStack(alignment: .leading, spacing: SproutTheme.spacing.md) {
                Label(SproutTheme.designLanguage.name, systemImage: "map.fill")
                    .font(.caption.weight(.bold))
                    .textCase(.uppercase)
                    .foregroundStyle(.white.opacity(0.78))
                Text("Plan a family trip")
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.78)
                Text("Drop in dates, kids, pets, pace, and must-dos. SproutRoute turns it into weather-aware days, packing, safety, and group-ready logistics.")
                    .font(.callout)
                    .foregroundStyle(.white.opacity(0.84))
                HStack(spacing: 8) {
                    headerPill("Weather", systemImage: "cloud.sun")
                    headerPill("Itinerary", systemImage: "list.bullet.rectangle")
                    headerPill("Packing", systemImage: "backpack")
                }
                .padding(.top, 2)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func headerPill(_ title: String, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.78)
            .foregroundStyle(.white)
            .padding(.vertical, 8)
            .padding(.horizontal, 10)
            .background(.white.opacity(0.14), in: Capsule(style: .continuous))
    }

    private var promptCard: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Describe the trip")
                    .font(.headline)
                    .foregroundStyle(SproutTheme.primaryText)
                Text("Natural language works best. Include the constraints you would normally text to the group.")
                    .font(.caption)
                    .foregroundStyle(SproutTheme.secondaryText)
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $draft)
                        .frame(minHeight: 132)
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
                                .buttonStyle(SproutChipButtonStyle())
                        }
                    }
                }

                HStack {
                    Button {
                        showingProfileImport = true
                    } label: {
                        Label("Import profile", systemImage: "person.crop.circle.badge.plus")
                    }
                    .buttonStyle(SproutSecondaryButtonStyle())

                    Spacer()

                    Button {
                        Task {
                            composingAfterResult = false
                            await planner.submit(text: draft, modelContext: modelContext)
                        }
                    } label: {
                        Label("Plan trip", systemImage: "arrow.right.circle.fill")
                    }
                    .buttonStyle(SproutPrimaryButtonStyle())
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
