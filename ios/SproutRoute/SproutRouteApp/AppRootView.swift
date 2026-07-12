import SwiftUI

enum AppMode: String, CaseIterable, Identifiable {
    case planner
    case tripHub

    var id: String { rawValue }

    var title: String {
        switch self {
        case .planner: "Planner"
        case .tripHub: "Trip Hub"
        }
    }

    var systemImage: String {
        switch self {
        case .planner: "sparkles"
        case .tripHub: "person.3.sequence"
        }
    }
}

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
    @State private var selectedMode: AppMode = .planner
    @State private var selectedTab: AppTab = .itinerary
    @State private var prefilledTripHubInviteCode: String?
    @State private var showingSettings = false
    @State private var showingSavedTrips = false

    var body: some View {
        selectedTabContent
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if selectedMode == .planner && planner.hasResult {
                    appTabBar
                }
            }
        .tint(SproutTheme.accent)
        .task { await planner.loadCapabilities() }
        .onChange(of: planner.selectedDeepLink) { _, deepLink in
            switch deepLink {
            case .plan:
                selectedMode = .planner
                selectedTab = .itinerary
            case .trip, .day:
                selectedMode = .planner
                selectedTab = .itinerary
            case .tripHub(_, let inviteCode):
                selectedMode = .tripHub
                if let inviteCode, !inviteCode.isEmpty {
                    prefilledTripHubInviteCode = inviteCode
                }
            case .packing:
                selectedMode = .planner
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
            modeContent
                .navigationTitle("SproutRoute")
                .navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge: .top, spacing: 0) {
                    modePicker
                }
                .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
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

    @ViewBuilder
    private var modeContent: some View {
        switch selectedMode {
        case .planner:
            PlanView(selectedSection: selectedTab)
        case .tripHub:
            TripHubView(prefilledInviteCode: prefilledTripHubInviteCode)
        }
    }

    private var modePicker: some View {
        HStack(spacing: 6) {
            ForEach(AppMode.allCases) { mode in
                Button {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                        selectedMode = mode
                    }
                } label: {
                    Label(mode.title, systemImage: mode.systemImage)
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: SproutTheme.minimumTouchTarget)
                        .foregroundStyle(selectedMode == mode ? Color.white : SproutTheme.primaryText)
                        .background {
                            if selectedMode == mode {
                                RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous)
                                    .fill(SproutTheme.heroGradient)
                            }
                        }
                }
                .buttonStyle(.plain)
                .accessibilityValue(selectedMode == mode ? "Selected" : "Not selected")
            }
        }
        .padding(6)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: SproutTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SproutTheme.cardRadius, style: .continuous)
                .stroke(SproutTheme.border.opacity(0.40), lineWidth: 1)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .accessibilityIdentifier("app-mode-picker")
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
                    .foregroundStyle(selectedTab == tab ? Color.white : SproutTheme.secondaryText)
                    .background {
                        if selectedTab == tab {
                            Capsule(style: .continuous)
                                .fill(SproutTheme.actionFill)
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
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(SproutTheme.border.opacity(0.42))
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("app-tab-bar")
    }
}

struct TripHubModuleSummary: Identifiable, Hashable {
    var id: String { title }
    var title: String
    var systemImage: String
    var detail: String
}

enum TripHubPresentation {
    static func inviteShareMessage(for snapshot: GroupTripSnapshotResponse) -> String {
        let trip = snapshot.trip
        let url = SproutRouteDeepLink.tripHubURL(id: trip.id, inviteCode: trip.inviteCode).absoluteString
        return """
        Join \(trip.title) in SproutRoute Trip Hub.
        Destination: \(trip.destination)
        Dates: \(trip.startDate) to \(trip.endDate)
        Invite code: \(trip.inviteCode)
        Open: \(url)
        """
    }

    static func moduleTiles(for snapshot: GroupTripSnapshotResponse) -> [TripHubModuleSummary] {
        let logisticsCount = snapshot.items.filter { ["flight", "lodging", "transport"].contains($0.kind) }.count
        let openDecisionCount = snapshot.decisions.filter { $0.status == "open" }.count
        let totalExpenseCents = snapshot.expenses.reduce(0) { $0 + $1.amountCents }
        let currency = snapshot.expenses.first?.currency ?? "USD"
        let sharingCount = snapshot.participants.filter { $0.locationSharingEnabled == true }.count

        return [
            TripHubModuleSummary(
                title: "Timeline",
                systemImage: "list.bullet.rectangle",
                detail: countLabel(snapshot.items.count, singular: "item")
            ),
            TripHubModuleSummary(
                title: "Logistics",
                systemImage: "airplane.arrival",
                detail: logisticsCount == 0 ? "Needed" : "\(logisticsCount) logged"
            ),
            TripHubModuleSummary(
                title: "Decisions",
                systemImage: "checkmark.seal",
                detail: openDecisionCount == 0 ? "Clear" : "\(openDecisionCount) open"
            ),
            TripHubModuleSummary(
                title: "Expenses",
                systemImage: "dollarsign.circle",
                detail: moneyLabel(amountCents: totalExpenseCents, currency: currency)
            ),
            TripHubModuleSummary(
                title: "Location",
                systemImage: "location.circle",
                detail: sharingCount == 0 ? "Off" : "\(sharingCount) sharing"
            ),
            TripHubModuleSummary(title: "Photos", systemImage: "photo.on.rectangle", detail: "Shared Album")
        ]
    }

    static func primarySuggestion(in snapshot: GroupTripSnapshotResponse) -> GroupTripAISuggestion? {
        snapshot.aiSuggestions.first { $0.severity == "warning" } ?? snapshot.aiSuggestions.first
    }

    static func nextUpItem(in snapshot: GroupTripSnapshotResponse) -> GroupTripItem? {
        snapshot.items
            .filter { $0.status == "planned" }
            .sorted { ($0.startAt ?? "") < ($1.startAt ?? "") }
            .first
    }

    static func nextUpTitle(in snapshot: GroupTripSnapshotResponse) -> String {
        nextUpItem(in: snapshot)?.title ?? "Add arrival logistics"
    }

    static func moneyLabel(amountCents: Int, currency: String) -> String {
        let amount = Double(amountCents) / 100
        if currency == "USD" {
            return String(format: "$%.2f", amount)
        }
        return "\(currency) \(String(format: "%.2f", amount))"
    }

    static func moduleAccessibilityLabel(title: String) -> String {
        title
    }

    static func moduleAccessibilityValue(detail: String) -> String {
        detail
    }

    static func actionAccessibilityLabel(title: String) -> String {
        switch title {
        case "Add":
            return "Add itinerary item"
        case "Import":
            return "Import itinerary text"
        case "Decide":
            return "Create decision"
        case "Expense":
            return "Record expense"
        default:
            return title
        }
    }

    static func decisionOptionAccessibilityLabel(optionTitle: String) -> String {
        "Vote for \(optionTitle)"
    }

    static func decisionOptionAccessibilityValue(voteCount: Int, isSelected: Bool) -> String {
        let voteLabel = voteCount == 1 ? "1 vote" : "\(voteCount) votes"
        return "\(voteLabel), \(isSelected ? "selected" : "not selected")"
    }

    private static func countLabel(_ count: Int, singular: String) -> String {
        count == 1 ? "1 \(singular)" : "\(count) \(singular)s"
    }
}

enum TripHubSheetDestination: Identifiable, Hashable {
    case addItem
    case editItem(GroupTripItem)
    case importText
    case decision
    case expense

    var id: String {
        switch self {
        case .addItem:
            "add-item"
        case .editItem(let item):
            "edit-item-\(item.id)"
        case .importText:
            "import-text"
        case .decision:
            "decision"
        case .expense:
            "expense"
        }
    }
}

enum TripHubCreateDefaults {
    static let title = ""
    static let destination = ""

    static func startDate(now: Date = Date(), calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .day, value: 30, to: calendar.startOfDay(for: now)) ?? now
    }

    static func endDate(now: Date = Date(), calendar: Calendar = .current) -> Date {
        let start = startDate(now: now, calendar: calendar)
        return calendar.date(byAdding: .day, value: 3, to: start) ?? start
    }

    static func isoDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

struct TripHubView: View {
    private let prefilledInviteCode: String?
    @State private var controller: TripHubController
    @State private var didRestoreSession = false
    @State private var presentedSheet: TripHubSheetDestination?
    @State private var tripHubNotificationStatus: String?
    @State private var createTitle = TripHubCreateDefaults.title
    @State private var createDestination = TripHubCreateDefaults.destination
    @State private var createStartDate = TripHubCreateDefaults.startDate()
    @State private var createEndDate = TripHubCreateDefaults.endDate()
    @State private var createOwnerName = ""
    @State private var joinInviteCode = ""
    @State private var joinDisplayName = ""
    private let notificationScheduler = NotificationScheduler()

    @MainActor
    init(prefilledInviteCode: String? = nil) {
        self.prefilledInviteCode = prefilledInviteCode
        _controller = State(initialValue: TripHubController())
        _joinInviteCode = State(initialValue: prefilledInviteCode ?? "")
    }

    @MainActor
    init(controller: TripHubController, prefilledInviteCode: String? = nil) {
        self.prefilledInviteCode = prefilledInviteCode
        _controller = State(initialValue: controller)
        _joinInviteCode = State(initialValue: prefilledInviteCode ?? "")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SproutTheme.spacing.lg) {
                phaseCard
                if let snapshot = controller.snapshot {
                    dashboard(snapshot)
                } else {
                    setupCards
                }
            }
            .padding(.horizontal, SproutTheme.spacing.lg)
            .padding(.top, SproutTheme.spacing.md)
            .padding(.bottom, SproutTheme.spacing.xxl)
        }
        .sproutScreenBackground()
        .refreshable {
            await controller.refreshSnapshot()
        }
        .task {
            guard !didRestoreSession else { return }
            didRestoreSession = true
            await controller.restoreSession()
        }
        .onChange(of: prefilledInviteCode) { _, inviteCode in
            guard controller.snapshot == nil, let inviteCode, !inviteCode.isEmpty else { return }
            joinInviteCode = inviteCode
        }
        .sheet(item: $presentedSheet) { destination in
            tripHubSheet(destination)
        }
        .accessibilityIdentifier("trip-hub-view")
    }

    @ViewBuilder
    private var phaseCard: some View {
        switch controller.phase {
        case .failed(let message):
            NativeCard {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(SproutTheme.warning)
                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(SproutTheme.primaryText)
                    Spacer()
                }
            }
            .accessibilityIdentifier("trip-hub-error")
        case .loading(let message):
            NativeCard {
                HStack(spacing: 10) {
                    ProgressView()
                    Text(message)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SproutTheme.secondaryText)
                    Spacer()
                }
            }
            .accessibilityIdentifier("trip-hub-loading")
        case .onboarding, .ready:
            EmptyView()
        }
    }

    private var setupCards: some View {
        VStack(alignment: .leading, spacing: SproutTheme.spacing.lg) {
            SproutHeroCard {
                VStack(alignment: .leading, spacing: SproutTheme.spacing.md) {
                    Label("A shared trip command center", systemImage: "person.3.sequence.fill")
                        .font(.caption.weight(.bold))
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.82))
                    Text("Keep flights, stays, decisions, expenses, and location sharing in one live hub.")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                    Text("Create a hub for your group or join one with an invite code.")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.82))
                }
                .accessibilityElement(children: .combine)
            }
            createTripCard
            joinTripCard
        }
    }

    private var createTripCard: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Create Trip Hub", systemImage: "plus.circle")
                    .font(.headline)
                    .foregroundStyle(SproutTheme.primaryText)

                TextField("Trip name", text: $createTitle)
                    .textContentType(.name)
                    .sproutTextFieldSurface()
                TextField("Destination", text: $createDestination)
                    .textContentType(.addressCityAndState)
                    .sproutTextFieldSurface()
                TextField("Your name", text: $createOwnerName)
                    .textContentType(.givenName)
                    .sproutTextFieldSurface()

                DatePicker("Start", selection: $createStartDate, displayedComponents: .date)
                DatePicker("End", selection: $createEndDate, displayedComponents: .date)

                Button {
                    Task {
                        await controller.createTrip(
                            title: createTitle,
                            destination: createDestination,
                            startDate: TripHubCreateDefaults.isoDate(createStartDate),
                            endDate: TripHubCreateDefaults.isoDate(createEndDate),
                            ownerName: createOwnerName
                        )
                    }
                } label: {
                    Label("Create", systemImage: "arrow.right.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SproutPrimaryButtonStyle())
                .disabled(controller.phase.isLoading)
            }
        }
    }

    private var joinTripCard: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Join Trip Hub", systemImage: "person.badge.plus")
                    .font(.headline)
                    .foregroundStyle(SproutTheme.primaryText)

                TextField("Invite code", text: $joinInviteCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .sproutTextFieldSurface()
                TextField("Your name", text: $joinDisplayName)
                    .textContentType(.givenName)
                    .sproutTextFieldSurface()

                Button {
                    Task {
                        await controller.joinTrip(inviteCode: joinInviteCode, displayName: joinDisplayName)
                    }
                } label: {
                    Label("Join", systemImage: "arrow.right.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SproutSecondaryButtonStyle())
                .disabled(controller.phase.isLoading)
            }
        }
    }

    private func dashboard(_ snapshot: GroupTripSnapshotResponse) -> some View {
        VStack(alignment: .leading, spacing: SproutTheme.spacing.lg) {
            hero(snapshot)
            quickActions(snapshot)
            locationCard
            aiCard(snapshot)
            nextUpCard(snapshot)
            timelineSection(snapshot)
            decisionsSection(snapshot)
            expensesSection(snapshot)
            moduleGrid(snapshot)
        }
    }

    @ViewBuilder
    private func tripHubSheet(_ destination: TripHubSheetDestination) -> some View {
        if let snapshot = controller.snapshot {
            switch destination {
            case .addItem:
                TripHubItemEditor(controller: controller, participants: snapshot.participants)
            case .editItem(let item):
                TripHubItemEditor(controller: controller, item: item, participants: snapshot.participants)
            case .importText:
                TripHubTextImportEditor(controller: controller)
            case .decision:
                TripHubDecisionEditor(controller: controller)
            case .expense:
                TripHubExpenseEditor(controller: controller, snapshot: snapshot)
            }
        } else {
            NavigationStack {
                ContentUnavailableView("Trip Hub unavailable", systemImage: "exclamationmark.triangle")
            }
        }
    }

    private func quickActions(_ snapshot: GroupTripSnapshotResponse) -> some View {
        NativeCard {
            HStack(spacing: 10) {
                TripHubActionButton(title: "Add", systemImage: "plus.circle") {
                    presentedSheet = .addItem
                }
                TripHubActionButton(title: "Import", systemImage: "doc.text") {
                    presentedSheet = .importText
                }
                TripHubActionButton(title: "Decide", systemImage: "checkmark.seal") {
                    presentedSheet = .decision
                }
                TripHubActionButton(title: "Expense", systemImage: "dollarsign.circle") {
                    presentedSheet = .expense
                }
            }
            .disabled(controller.phase.isLoading || snapshot.participants.isEmpty)
        }
        .accessibilityIdentifier("trip-hub-actions")
    }

    private func hero(_ snapshot: GroupTripSnapshotResponse) -> some View {
        let trip = snapshot.trip

        return SproutHeroCard {
            VStack(alignment: .leading, spacing: SproutTheme.spacing.md) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Trip Hub", systemImage: "sparkles")
                            .font(.caption.weight(.bold))
                            .textCase(.uppercase)
                            .foregroundStyle(.white.opacity(0.78))
                        Text(trip.title)
                            .font(.title.bold())
                            .foregroundStyle(.white)
                        Text(trip.destination)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.82))
                    }
                    Spacer()
                    Menu {
                        ShareLink(item: TripHubPresentation.inviteShareMessage(for: snapshot)) {
                            Label("Share invite", systemImage: "square.and.arrow.up")
                        }
                        Button {
                            Task { await controller.refreshSnapshot() }
                        } label: {
                            Label("Refresh", systemImage: "arrow.clockwise")
                        }
                        Button(role: .destructive) {
                            Task { await controller.leaveTripHub() }
                        } label: {
                            Label("Leave", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    } label: {
                        VStack(alignment: .trailing, spacing: 4) {
                            Text("Code")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.66))
                            Text(trip.inviteCode)
                                .font(.caption.bold())
                                .foregroundStyle(.white)
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 10)
                        .background(.white.opacity(0.14), in: RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous))
                    }
                }

                HStack(spacing: 8) {
                    Label(trip.startDate, systemImage: "calendar")
                    Text("to")
                        Text(trip.endDate)
                }
                .font(.caption)
                .foregroundStyle(.white.opacity(0.76))

                Label("\(snapshot.participants.count) people planning together", systemImage: "person.2")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.84))
            }
        }
    }

    private var locationCard: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 10) {
                Toggle(isOn: Binding(
                    get: { controller.isLocationSharingEnabled },
                    set: { isEnabled in
                        Task { await controller.setLocationSharingEnabled(isEnabled) }
                    }
                )) {
                    Label("Location sharing", systemImage: controller.isLocationSharingEnabled ? "location.fill" : "location")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SproutTheme.primaryText)
                }

                if let lastLocation = controller.currentParticipant?.lastLocation {
                    Label(locationStatus(lastLocation), systemImage: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(SproutTheme.secondaryText)
                }

                Button {
                    Task { await controller.shareCurrentLocation() }
                } label: {
                    Label("Share current location", systemImage: "location.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SproutSecondaryButtonStyle())
                .disabled(controller.phase.isLoading)
            }
            .disabled(controller.phase.isLoading)
        }
        .accessibilityIdentifier("trip-hub-location-toggle")
    }

    private func aiCard(_ snapshot: GroupTripSnapshotResponse) -> some View {
        let suggestion = TripHubPresentation.primarySuggestion(in: snapshot)
        let notificationPlans = NotificationScheduler.tripHubPlans(for: snapshot)

        return NativeCard {
            VStack(alignment: .leading, spacing: 10) {
                Label("Sprout noticed", systemImage: "sparkles")
                    .font(.headline)
                    .foregroundStyle(SproutTheme.primaryText)
                Text(suggestion?.summary ?? "The shared plan has no urgent changes right now.")
                    .font(.subheadline)
                    .foregroundStyle(SproutTheme.secondaryText)
                if let tripHubNotificationStatus {
                    Text(tripHubNotificationStatus)
                        .font(.caption)
                        .foregroundStyle(SproutTheme.tertiaryText)
                }
                HStack {
                    Button {
                        Task { await controller.refreshSnapshot() }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(SproutPrimaryButtonStyle())

                    Button {
                        Task { await scheduleTripHubNotifications(for: snapshot, planCount: notificationPlans.count) }
                    } label: {
                        Label("Notify", systemImage: "bell.badge")
                    }
                    .buttonStyle(SproutSecondaryButtonStyle())
                    .disabled(notificationPlans.isEmpty)
                }
            }
        }
    }

    private func nextUpCard(_ snapshot: GroupTripSnapshotResponse) -> some View {
        let item = TripHubPresentation.nextUpItem(in: snapshot)

        return NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Next up", systemImage: "location.fill")
                    .font(.headline)
                    .foregroundStyle(SproutTheme.primaryText)
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 4) {
                        Circle()
                            .fill(SproutTheme.accent)
                            .frame(width: 10, height: 10)
                        Rectangle()
                            .fill(SproutTheme.accent.opacity(0.35))
                            .frame(width: 2, height: 46)
                    }
                    VStack(alignment: .leading, spacing: 5) {
                        Text(item?.title ?? "Add arrival logistics")
                            .font(.subheadline.bold())
                            .foregroundStyle(SproutTheme.primaryText)
                        Text(item?.locationName ?? "Track flights, hotel check-in, ride groups, and the first meetup in one shared timeline.")
                            .font(.caption)
                            .foregroundStyle(SproutTheme.secondaryText)
                    }
                }
            }
        }
    }

    private func timelineSection(_ snapshot: GroupTripSnapshotResponse) -> some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                TripHubSectionHeader(title: "Timeline", systemImage: "list.bullet.rectangle") {
                    presentedSheet = .addItem
                }

                if snapshot.items.isEmpty {
                    Text("No timeline items yet.")
                        .font(.subheadline)
                        .foregroundStyle(SproutTheme.secondaryText)
                } else {
                    ForEach(snapshot.items.sorted { ($0.startAt ?? "") < ($1.startAt ?? "") }) { item in
                        TripHubTimelineRow(item: item, participants: snapshot.participants) {
                            presentedSheet = .editItem(item)
                        }
                    }
                }
            }
        }
    }

    private func decisionsSection(_ snapshot: GroupTripSnapshotResponse) -> some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                TripHubSectionHeader(title: "Decisions", systemImage: "checkmark.seal") {
                    presentedSheet = .decision
                }

                if snapshot.decisions.isEmpty {
                    Text("No decisions yet.")
                        .font(.subheadline)
                        .foregroundStyle(SproutTheme.secondaryText)
                } else {
                    ForEach(snapshot.decisions) { decision in
                        TripHubDecisionCard(
                            decision: decision,
                            currentParticipantId: controller.currentParticipant?.id
                        ) { option in
                            Task { await controller.voteDecision(decisionId: decision.id, optionId: option.id) }
                        }
                    }
                }
            }
        }
    }

    private func expensesSection(_ snapshot: GroupTripSnapshotResponse) -> some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                TripHubSectionHeader(title: "Expenses", systemImage: "dollarsign.circle") {
                    presentedSheet = .expense
                }

                if snapshot.expenses.isEmpty {
                    Text("No expenses yet.")
                        .font(.subheadline)
                        .foregroundStyle(SproutTheme.secondaryText)
                } else {
                    ForEach(snapshot.expenses) { expense in
                        TripHubExpenseRow(expense: expense, participants: snapshot.participants)
                    }
                    if !snapshot.balances.isEmpty {
                        Divider()
                        ForEach(snapshot.balances, id: \.self) { balance in
                            TripHubBalanceRow(balance: balance, participants: snapshot.participants)
                        }
                    }
                }
            }
        }
    }

    private func moduleGrid(_ snapshot: GroupTripSnapshotResponse) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(TripHubPresentation.moduleTiles(for: snapshot)) { tile in
                TripHubModuleTile(title: tile.title, systemImage: tile.systemImage, detail: tile.detail)
            }
        }
    }

    private func scheduleTripHubNotifications(for snapshot: GroupTripSnapshotResponse, planCount: Int) async {
        let authorized = await notificationScheduler.requestAuthorization()
        guard authorized else {
            tripHubNotificationStatus = "Notifications are off."
            return
        }

        await notificationScheduler.scheduleTripHubSuggestions(for: snapshot)
        tripHubNotificationStatus = planCount == 1 ? "1 reminder scheduled." : "\(planCount) reminders scheduled."
    }

    private func locationStatus(_ location: GroupTripParticipantLocation) -> String {
        guard let updatedAt = location.updatedAt else { return "Location shared" }
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: updatedAt) else { return "Location shared" }
        return "Shared \(date.formatted(.dateTime.month(.abbreviated).day().hour().minute()))"
    }

}

struct TripHubModuleTile: View {
    let title: String
    let systemImage: String
    let detail: String

    var body: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(SproutTheme.accent)
                    .frame(width: 34, height: 34)
                    .background(SproutTheme.accentSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text(title)
                    .font(.subheadline.bold())
                    .foregroundStyle(SproutTheme.primaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(SproutTheme.secondaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(TripHubPresentation.moduleAccessibilityLabel(title: title))
        .accessibilityValue(TripHubPresentation.moduleAccessibilityValue(detail: detail))
    }
}

struct TripHubActionButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.title3.weight(.semibold))
                Text(title)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: 58)
        }
        .buttonStyle(SproutSecondaryButtonStyle())
        .accessibilityLabel(TripHubPresentation.actionAccessibilityLabel(title: title))
        .accessibilityHint("Opens the Trip Hub editor.")
    }
}

struct TripHubSectionHeader: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        HStack {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .foregroundStyle(SproutTheme.primaryText)
            Spacer()
            Button(action: action) {
                Image(systemName: "plus.circle")
                    .font(.body.weight(.semibold))
                    .frame(width: SproutTheme.minimumTouchTarget, height: SproutTheme.minimumTouchTarget)
            }
            .buttonStyle(.plain)
            .foregroundStyle(SproutTheme.accent)
            .accessibilityLabel("Add \(title)")
        }
    }
}

struct TripHubTimelineRow: View {
    let item: GroupTripItem
    let participants: [GroupTripParticipant]
    let edit: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: iconName)
                .font(.headline)
                .foregroundStyle(SproutTheme.accent)
                .frame(width: 28, height: 28)
                .background(SproutTheme.accentSoft, in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.subheadline.bold())
                    .foregroundStyle(SproutTheme.primaryText)
                if let locationName = item.locationName, !locationName.isEmpty {
                    Text(locationName)
                        .font(.caption)
                        .foregroundStyle(SproutTheme.secondaryText)
                }
                if let notes = item.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.caption)
                        .foregroundStyle(SproutTheme.tertiaryText)
                }
                let taggedParticipants = assignedParticipants
                if !taggedParticipants.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(taggedParticipants) { participant in
                            Label(participant.displayName, systemImage: "person.crop.circle.fill")
                                .font(.caption2.weight(.semibold))
                                .lineLimit(1)
                                .padding(.vertical, 4)
                                .padding(.horizontal, 7)
                                .background(SproutTheme.accentSoft, in: Capsule())
                                .foregroundStyle(SproutTheme.primaryText)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Tagged people: \(taggedParticipants.map(\.displayName).joined(separator: ", "))")
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 6) {
                Button(action: edit) {
                    Image(systemName: "pencil.circle")
                        .font(.body.weight(.semibold))
                        .frame(width: SproutTheme.minimumTouchTarget, height: SproutTheme.minimumTouchTarget)
                }
                .buttonStyle(.plain)
                .foregroundStyle(SproutTheme.accent)
                .accessibilityLabel("Edit \(item.title)")
                .accessibilityHint("Opens the itinerary item editor.")

                if let startAt = item.startAt, !startAt.isEmpty {
                    Text(compactDateTime(startAt))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(SproutTheme.tertiaryText)
                        .multilineTextAlignment(.trailing)
                }
            }
        }
        .padding(.vertical, 6)
    }

    private var assignedParticipants: [GroupTripParticipant] {
        let assignedIds = Set(item.assignedParticipantIds)
        return participants.filter { assignedIds.contains($0.id) }
    }

    private var iconName: String {
        switch item.kind {
        case "flight": "airplane.arrival"
        case "lodging": "bed.double"
        case "transport": "car"
        case "meal": "fork.knife"
        case "event": "ticket"
        default: "mappin.and.ellipse"
        }
    }

    private func compactDateTime(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: value) else { return value }
        return date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
    }
}

struct TripHubDecisionCard: View {
    let decision: GroupTripDecision
    let currentParticipantId: String?
    let vote: (GroupTripDecisionOption) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(decision.title)
                .font(.subheadline.bold())
                .foregroundStyle(SproutTheme.primaryText)
            ForEach(decision.options) { option in
                Button {
                    vote(option)
                } label: {
                    HStack {
                        Image(systemName: isSelected(option) ? "checkmark.circle.fill" : "circle")
                        Text(option.title)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                        Spacer()
                        Text("\(voteCount(for: option))")
                            .font(.caption.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(SproutChipButtonStyle())
                .accessibilityLabel(TripHubPresentation.decisionOptionAccessibilityLabel(optionTitle: option.title))
                .accessibilityValue(
                    TripHubPresentation.decisionOptionAccessibilityValue(
                        voteCount: voteCount(for: option),
                        isSelected: isSelected(option)
                    )
                )
                .accessibilityHint("Updates your vote for this decision.")
            }
        }
        .padding(.vertical, 6)
    }

    private func isSelected(_ option: GroupTripDecisionOption) -> Bool {
        guard let currentParticipantId else { return false }
        return decision.votes.contains { $0.participantId == currentParticipantId && $0.optionId == option.id }
    }

    private func voteCount(for option: GroupTripDecisionOption) -> Int {
        decision.votes.filter { $0.optionId == option.id }.count
    }
}

struct TripHubExpenseRow: View {
    let expense: GroupTripExpense
    let participants: [GroupTripParticipant]

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(expense.title)
                    .font(.subheadline.bold())
                    .foregroundStyle(SproutTheme.primaryText)
                Text("Paid by \(participantName(expense.paidByParticipantId))")
                    .font(.caption)
                    .foregroundStyle(SproutTheme.secondaryText)
            }
            Spacer()
            Text(TripHubPresentation.moneyLabel(amountCents: expense.amountCents, currency: expense.currency))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SproutTheme.primaryText)
        }
        .padding(.vertical, 5)
    }

    private func participantName(_ id: String) -> String {
        participants.first { $0.id == id }?.displayName ?? "Someone"
    }
}

struct TripHubBalanceRow: View {
    let balance: GroupTripBalance
    let participants: [GroupTripParticipant]

    var body: some View {
        HStack {
            Image(systemName: "arrow.left.arrow.right")
                .foregroundStyle(SproutTheme.accent)
            Text("\(participantName(balance.fromParticipantId)) owes \(participantName(balance.toParticipantId))")
                .font(.caption)
                .foregroundStyle(SproutTheme.secondaryText)
            Spacer()
            Text(TripHubPresentation.moneyLabel(amountCents: balance.amountCents, currency: balance.currency))
                .font(.caption.weight(.semibold))
                .foregroundStyle(SproutTheme.primaryText)
        }
    }

    private func participantName(_ id: String) -> String {
        participants.first { $0.id == id }?.displayName ?? "Someone"
    }
}

struct TripHubItemEditor: View {
    let controller: TripHubController
    let item: GroupTripItem?
    let participants: [GroupTripParticipant]
    @Environment(\.dismiss) private var dismiss
    @State private var kind: String
    @State private var title: String
    @State private var locationName: String
    @State private var notes: String
    @State private var hasStartTime: Bool
    @State private var startDate: Date
    @State private var hasEndTime: Bool
    @State private var endDate: Date
    @State private var selectedParticipantIds: Set<String>
    @State private var isSaving = false

    private let kinds = [
        ("flight", "Flight"),
        ("lodging", "Lodging"),
        ("transport", "Transport"),
        ("meal", "Meal"),
        ("event", "Event"),
        ("activity", "Activity")
    ]

    init(
        controller: TripHubController,
        item: GroupTripItem? = nil,
        participants: [GroupTripParticipant]
    ) {
        self.controller = controller
        self.item = item
        self.participants = participants

        let parsedStartDate = Self.date(from: item?.startAt)
        let parsedEndDate = Self.date(from: item?.endAt)
        let defaultStartDate = parsedStartDate ?? Date()

        _kind = State(initialValue: item?.kind ?? "flight")
        _title = State(initialValue: item?.title ?? "")
        _locationName = State(initialValue: item?.locationName ?? "")
        _notes = State(initialValue: item?.notes ?? "")
        _hasStartTime = State(initialValue: item == nil || parsedStartDate != nil)
        _startDate = State(initialValue: defaultStartDate)
        _hasEndTime = State(initialValue: parsedEndDate != nil)
        _endDate = State(initialValue: parsedEndDate ?? defaultStartDate.addingTimeInterval(3600))
        _selectedParticipantIds = State(initialValue: Set(item?.assignedParticipantIds ?? []))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Details") {
                    Picker("Type", selection: $kind) {
                        ForEach(kinds, id: \.0) { value, label in
                            Text(label).tag(value)
                        }
                    }
                    TextField("Title", text: $title)
                    TextField("Location", text: $locationName)
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(2...4)
                }

                Section("Time") {
                    Toggle("Starts at", isOn: $hasStartTime)
                    if hasStartTime {
                        DatePicker("Start", selection: $startDate)
                    }
                    Toggle("Ends at", isOn: $hasEndTime)
                    if hasEndTime {
                        DatePicker("End", selection: $endDate)
                    }
                }

                if !participants.isEmpty {
                    Section("People") {
                        ForEach(participants) { participant in
                            Button {
                                toggleParticipant(participant.id)
                            } label: {
                                HStack {
                                    Image(systemName: selectedParticipantIds.contains(participant.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(selectedParticipantIds.contains(participant.id) ? SproutTheme.accent : SproutTheme.tertiaryText)
                                    Text(participant.displayName)
                                        .foregroundStyle(SproutTheme.primaryText)
                                    Spacer()
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(participant.displayName)
                            .accessibilityValue(selectedParticipantIds.contains(participant.id) ? "Tagged" : "Not tagged")
                        }
                    }
                }
            }
            .navigationTitle(item == nil ? "Add Item" : "Edit Item")
            .navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden)
            .sproutScreenBackground()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving" : "Save") {
                        Task { await save() }
                    }
                    .disabled(!canSave || isSaving)
                }
            }
        }
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func toggleParticipant(_ participantId: String) {
        if selectedParticipantIds.contains(participantId) {
            selectedParticipantIds.remove(participantId)
        } else {
            selectedParticipantIds.insert(participantId)
        }
    }

    private func save() async {
        isSaving = true
        let assignedParticipantIds = participants
            .filter { selectedParticipantIds.contains($0.id) }
            .map(\.id)
        if let item {
            await controller.updateTripHubItem(
                itemId: item.id,
                kind: kind,
                title: title,
                startAt: hasStartTime ? Self.isoDateTime(startDate) : nil,
                endAt: hasEndTime ? Self.isoDateTime(endDate) : nil,
                locationName: locationName,
                notes: notes,
                assignedParticipantIds: assignedParticipantIds
            )
        } else {
            await controller.addTripHubItem(
                kind: kind,
                title: title,
                startAt: hasStartTime ? Self.isoDateTime(startDate) : nil,
                endAt: hasEndTime ? Self.isoDateTime(endDate) : nil,
                locationName: locationName,
                notes: notes,
                assignedParticipantIds: assignedParticipantIds
            )
        }
        isSaving = false
        if case .ready = controller.phase {
            dismiss()
        }
    }

    private static func date(from value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    private static func isoDateTime(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
}

struct TripHubTextImportEditor: View {
    let controller: TripHubController
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var isImporting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Itinerary Text") {
                    TextEditor(text: $text)
                        .frame(minHeight: 180)
                        .textInputAutocapitalization(.sentences)
                        .accessibilityIdentifier("trip-hub-import-text")
                }
            }
            .navigationTitle("Import Itinerary")
            .navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden)
            .sproutScreenBackground()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isImporting ? "Importing" : "Import") {
                        Task { await importText() }
                    }
                    .disabled(!canImport || isImporting)
                }
            }
        }
    }

    private var canImport: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func importText() async {
        isImporting = true
        await controller.importTripHubItemsText(text)
        isImporting = false
        if case .ready = controller.phase {
            dismiss()
        }
    }
}

struct TripHubDecisionEditor: View {
    let controller: TripHubController
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var options = ["", ""]
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Decision") {
                    TextField("Question", text: $title)
                }
                Section("Options") {
                    ForEach(options.indices, id: \.self) { index in
                        TextField("Option \(index + 1)", text: $options[index])
                    }
                    Button {
                        options.append("")
                    } label: {
                        Label("Add option", systemImage: "plus.circle")
                    }
                }
            }
            .navigationTitle("New Decision")
            .navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden)
            .sproutScreenBackground()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving" : "Save") {
                        Task { await save() }
                    }
                    .disabled(!canSave || isSaving)
                }
            }
        }
    }

    private var canSave: Bool {
        let normalizedOptions = options.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && normalizedOptions.count >= 2
    }

    private func save() async {
        isSaving = true
        await controller.createDecision(title: title, options: options)
        isSaving = false
        if case .ready = controller.phase {
            dismiss()
        }
    }
}

struct TripHubExpenseEditor: View {
    let controller: TripHubController
    let snapshot: GroupTripSnapshotResponse
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var amount = ""
    @State private var currency = "USD"
    @State private var splitParticipantIds: Set<String>
    @State private var isSaving = false

    init(controller: TripHubController, snapshot: GroupTripSnapshotResponse) {
        self.controller = controller
        self.snapshot = snapshot
        _splitParticipantIds = State(initialValue: Set(snapshot.participants.map(\.id)))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Expense") {
                    TextField("Title", text: $title)
                    TextField("Amount", text: $amount)
                        .keyboardType(.decimalPad)
                    TextField("Currency", text: $currency)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }

                Section("Paid by") {
                    Text(controller.currentParticipant?.displayName ?? "Current participant")
                }

                Section("Split") {
                    ForEach(snapshot.participants) { participant in
                        Toggle(isOn: splitBinding(for: participant.id)) {
                            Text(participant.displayName)
                        }
                    }
                }
            }
            .navigationTitle("Add Expense")
            .navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden)
            .sproutScreenBackground()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving" : "Save") {
                        Task { await save() }
                    }
                    .disabled(!canSave || isSaving)
                }
            }
        }
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !amount.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !currency.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !paidByParticipantId.isEmpty &&
            !splitParticipantIds.isEmpty
    }

    private var paidByParticipantId: String {
        controller.activeSession?.participantId ?? ""
    }

    private func splitBinding(for participantId: String) -> Binding<Bool> {
        Binding(
            get: { splitParticipantIds.contains(participantId) },
            set: { isSelected in
                if isSelected {
                    splitParticipantIds.insert(participantId)
                } else {
                    splitParticipantIds.remove(participantId)
                }
            }
        )
    }

    private func save() async {
        isSaving = true
        let orderedSplit = snapshot.participants.map(\.id).filter { splitParticipantIds.contains($0) }
        await controller.createExpense(
            title: title,
            amountText: amount,
            currency: currency,
            paidByParticipantId: paidByParticipantId,
            splitParticipantIds: orderedSplit
        )
        isSaving = false
        if case .ready = controller.phase {
            dismiss()
        }
    }
}
