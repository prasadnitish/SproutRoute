import XCTest
@testable import SproutRoute

final class NativeUXRegressionTests: XCTestCase {
    func testSproutThemeDefinesPremiumAtlasDesignSystem() {
        XCTAssertEqual(SproutTheme.designLanguage.name, "Atlas Journey")
        XCTAssertEqual(SproutTheme.designLanguage.mood, "premium family travel")
        XCTAssertEqual(SproutTheme.designLanguage.componentShape, "soft geometric")
        XCTAssertEqual(SproutTheme.brandAccentNames, ["Lagoon", "Coral", "Violet", "Leaf"])
        XCTAssertGreaterThanOrEqual(SproutTheme.minimumTouchTarget, 44)
        XCTAssertEqual(SproutTheme.spacing.unit, 4)
    }

    func testSproutThemeContrastPairsMeetMobileAccessibilityGuidance() {
        XCTAssertGreaterThanOrEqual(SproutTheme.primaryTextContrastLight, 4.5)
        XCTAssertGreaterThanOrEqual(SproutTheme.primaryTextContrastDark, 4.5)
        XCTAssertGreaterThanOrEqual(SproutTheme.secondaryTextContrastLight, 4.5)
        XCTAssertGreaterThanOrEqual(SproutTheme.secondaryTextContrastDark, 4.5)
    }

    func testSproutThemeNormalTextPairsMeetWCAGAAInLightAndDarkMode() {
        for pair in SproutTheme.normalTextContrastPairs {
            XCTAssertGreaterThanOrEqual(pair.ratio, 4.5, "\(pair.name) should meet WCAG AA normal text contrast.")
        }
    }

    func testSproutThemeNonTextPairsMeetWCAGAAInLightAndDarkMode() {
        for pair in SproutTheme.nonTextContrastPairs {
            XCTAssertGreaterThanOrEqual(pair.ratio, 3.0, "\(pair.name) should meet WCAG AA non-text contrast.")
        }
    }

    func testSproutThemeFormFieldsMeetWCAGAAInLightAndDarkMode() {
        for pair in SproutTheme.formFieldTextContrastPairs {
            XCTAssertGreaterThanOrEqual(pair.ratio, 4.5, "\(pair.name) should keep field text and placeholders readable.")
        }
        for pair in SproutTheme.formFieldNonTextContrastPairs {
            XCTAssertGreaterThanOrEqual(pair.ratio, 3.0, "\(pair.name) should keep field boundaries visible.")
        }
    }

    func testBottomNavigationCentersGeneratedResultSections() {
        XCTAssertEqual(AppTab.allCases.map(\.title), ["Weather", "Itinerary", "Packing", "Safety"])
        XCTAssertFalse(AppTab.allCases.map(\.title).contains("Map"))
        XCTAssertFalse(AppTab.allCases.map(\.title).contains("Settings"))
    }

    func testAppModeExposesPlannerAndTripHubEntryPoints() {
        XCTAssertEqual(AppMode.allCases.map(\.title), ["Planner", "Trip Hub"])
        XCTAssertEqual(AppMode.tripHub.systemImage, "person.3.sequence")
    }

    func testTripHubCreateDefaultsAvoidHardcodedPersonalTripData() {
        let calendar = Calendar(identifier: .gregorian)
        let fixedDate = calendar.date(from: DateComponents(year: 2026, month: 6, day: 28))!

        XCTAssertEqual(TripHubCreateDefaults.title, "")
        XCTAssertEqual(TripHubCreateDefaults.destination, "")
        XCTAssertEqual(TripHubCreateDefaults.isoDate(TripHubCreateDefaults.startDate(now: fixedDate)), "2026-07-28")
        XCTAssertEqual(TripHubCreateDefaults.isoDate(TripHubCreateDefaults.endDate(now: fixedDate)), "2026-07-31")
    }

    func testTripHubDeepLinkRoutesToOrganizerMode() {
        let url = SproutRouteDeepLink.tripHubURL(id: "trip_abc123")

        XCTAssertEqual(url.absoluteString, "sproutroute://trip-hub/trip_abc123")
        XCTAssertEqual(SproutRouteDeepLink.parse(url), .tripHub(id: "trip_abc123"))
    }

    func testTripHubInviteDeepLinkCarriesInviteCode() {
        let url = SproutRouteDeepLink.tripHubURL(id: "trip_abc123", inviteCode: "VEGAS1")

        XCTAssertEqual(url.absoluteString, "sproutroute://trip-hub/trip_abc123?inviteCode=VEGAS1")
        XCTAssertEqual(SproutRouteDeepLink.parse(url), .tripHub(id: "trip_abc123", inviteCode: "VEGAS1"))
    }

    func testTripHubPresentationSummarizesSharedState() {
        let snapshot = GroupTripSnapshotResponse(
            requestId: "req-1",
            trip: GroupTripWorkspace(
                id: "trip_abc123",
                title: "Vegas 2026",
                destination: "Las Vegas, NV",
                startDate: "2026-09-18",
                endDate: "2026-09-21",
                inviteCode: "VEGAS1",
                status: "active",
                createdAt: nil,
                updatedAt: nil
            ),
            participants: [
                GroupTripParticipant(
                    id: "participant_1",
                    tripId: "trip_abc123",
                    displayName: "Nitish",
                    role: .owner,
                    locationSharingEnabled: true,
                    joinedAt: nil
                )
            ],
            items: [
                GroupTripItem(
                    id: "item_1",
                    tripId: "trip_abc123",
                    kind: "flight",
                    title: "Arrive at LAS",
                    startAt: "2026-09-18T17:30:00Z",
                    endAt: "2026-09-18T18:45:00Z",
                    locationName: "Harry Reid International Airport",
                    notes: nil,
                    status: "planned",
                    createdByParticipantId: "participant_1",
                    createdAt: nil,
                    updatedAt: nil
                )
            ],
            decisions: [
                GroupTripDecision(
                    id: "decision_1",
                    tripId: "trip_abc123",
                    title: "Friday dinner",
                    status: "open",
                    options: [
                        GroupTripDecisionOption(id: "option_1", title: "Best Friend"),
                        GroupTripDecisionOption(id: "option_2", title: "Din Tai Fung")
                    ],
                    votes: [],
                    createdByParticipantId: "participant_1",
                    createdAt: nil,
                    updatedAt: nil
                )
            ],
            expenses: [
                GroupTripExpense(
                    id: "expense_1",
                    tripId: "trip_abc123",
                    title: "Hotel deposit",
                    amountCents: 48000,
                    currency: "USD",
                    paidByParticipantId: "participant_1",
                    splitParticipantIds: ["participant_1"],
                    createdByParticipantId: "participant_1",
                    createdAt: nil,
                    updatedAt: nil
                )
            ],
            balances: [],
            activity: [],
            aiSuggestions: [
                GroupTripAISuggestion(
                    id: "suggestion_1",
                    tripId: "trip_abc123",
                    type: "schedule_conflict",
                    severity: "warning",
                    title: "Resolve an itinerary overlap",
                    summary: "Pool cabana overlaps with Dinner reservation.",
                    status: "open",
                    relatedItemIds: ["item_1"]
                )
            ]
        )

        let tiles = TripHubPresentation.moduleTiles(for: snapshot)

        XCTAssertEqual(tiles.map(\.title), ["Timeline", "Logistics", "Decisions", "Expenses", "Location", "Photos"])
        XCTAssertEqual(tiles.first?.detail, "1 item")
        XCTAssertEqual(tiles[2].detail, "1 open")
        XCTAssertEqual(tiles[3].detail, "$480.00")
        XCTAssertEqual(tiles[4].detail, "1 sharing")
        XCTAssertEqual(TripHubPresentation.nextUpTitle(in: snapshot), "Arrive at LAS")
        XCTAssertEqual(TripHubPresentation.primarySuggestion(in: snapshot)?.severity, "warning")
    }

    func testTripHubAccessibilityCopyExplainsCompactControls() {
        XCTAssertEqual(TripHubPresentation.moduleAccessibilityLabel(title: "Timeline"), "Timeline")
        XCTAssertEqual(TripHubPresentation.moduleAccessibilityValue(detail: "1 item"), "1 item")
        XCTAssertEqual(TripHubPresentation.actionAccessibilityLabel(title: "Add"), "Add itinerary item")
        XCTAssertEqual(TripHubPresentation.actionAccessibilityLabel(title: "Decide"), "Create decision")
        XCTAssertEqual(TripHubPresentation.actionAccessibilityLabel(title: "Expense"), "Record expense")
        XCTAssertEqual(TripHubPresentation.decisionOptionAccessibilityLabel(optionTitle: "Din Tai Fung"), "Vote for Din Tai Fung")
        XCTAssertEqual(
            TripHubPresentation.decisionOptionAccessibilityValue(voteCount: 2, isSelected: true),
            "2 votes, selected"
        )
        XCTAssertEqual(
            TripHubPresentation.decisionOptionAccessibilityValue(voteCount: 1, isSelected: false),
            "1 vote, not selected"
        )
    }

    func testTripHubNotificationPlansPromoteHighSignalSuggestionsOnly() {
        let snapshot = GroupTripSnapshotResponse(
            requestId: "req-snapshot",
            trip: GroupTripWorkspace(
                id: "trip_abc123",
                title: "Vegas 2026",
                destination: "Las Vegas, NV",
                startDate: "2026-09-18",
                endDate: "2026-09-21",
                inviteCode: "VEGAS1",
                status: "active",
                createdAt: nil,
                updatedAt: nil
            ),
            participants: [],
            items: [],
            decisions: [],
            expenses: [],
            balances: [],
            activity: [],
            aiSuggestions: [
                GroupTripAISuggestion(
                    id: "suggestion_setup",
                    tripId: "trip_abc123",
                    type: "setup",
                    severity: "info",
                    title: "Add the first logistics",
                    summary: "Flights and hotel details are still missing.",
                    status: "open",
                    relatedItemIds: []
                ),
                GroupTripAISuggestion(
                    id: "suggestion_conflict",
                    tripId: "trip_abc123",
                    type: "schedule_conflict",
                    severity: "warning",
                    title: "Resolve an itinerary overlap",
                    summary: "Dinner overlaps with the show.",
                    status: "open",
                    relatedItemIds: ["item_1", "item_2"]
                )
            ]
        )

        let plans = NotificationScheduler.tripHubPlans(for: snapshot)

        XCTAssertEqual(plans.count, 1)
        XCTAssertEqual(plans.first?.identifier, "trip-hub-trip_abc123-suggestion_conflict")
        XCTAssertEqual(plans.first?.title, "Vegas 2026 needs attention")
        XCTAssertEqual(plans.first?.body, "Dinner overlaps with the show.")
        XCTAssertEqual(plans.first?.url.absoluteString, SproutRouteDeepLink.tripHubURL(id: "trip_abc123").absoluteString)
    }

    func testTripHubInviteShareMessageKeepsSecretsOutOfSharedCopy() {
        let snapshot = GroupTripSnapshotResponse(
            requestId: "req-share",
            trip: GroupTripWorkspace(
                id: "trip_abc123",
                title: "Vegas 2026",
                destination: "Las Vegas, NV",
                startDate: "2026-09-18",
                endDate: "2026-09-21",
                inviteCode: "VEGAS1",
                status: "active",
                createdAt: nil,
                updatedAt: nil
            ),
            participants: [
                GroupTripParticipant(
                    id: "participant_1",
                    tripId: "trip_abc123",
                    displayName: "Nitish",
                    role: .owner,
                    accessToken: "gtp_owner_token",
                    joinedAt: nil
                )
            ],
            items: [],
            decisions: [],
            expenses: [],
            balances: [],
            activity: [],
            aiSuggestions: []
        )

        let message = TripHubPresentation.inviteShareMessage(for: snapshot)

        XCTAssertTrue(message.contains("Vegas 2026"))
        XCTAssertTrue(message.contains("Las Vegas, NV"))
        XCTAssertTrue(message.contains("VEGAS1"))
        XCTAssertTrue(message.contains("sproutroute://trip-hub/trip_abc123"))
        XCTAssertTrue(message.contains("inviteCode=VEGAS1"))
        XCTAssertFalse(message.contains("gtp_owner_token"))
    }

    @MainActor
    func testTripHubControllerStartsOnboardingWhenNoSessionExists() async {
        let service = StubGroupTripService()
        let store = InMemoryTripHubSessionStore()
        let controller = TripHubController(service: service, sessionStore: store)

        await controller.restoreSession()

        XCTAssertEqual(controller.phase, .onboarding)
        XCTAssertNil(controller.snapshot)
        XCTAssertNil(controller.activeSession)
        XCTAssertEqual(service.recordedCalls, [])
    }

    @MainActor
    func testTripHubControllerRejectsIncompleteCreateInputsWithoutNetwork() async {
        let service = StubGroupTripService()
        let store = InMemoryTripHubSessionStore()
        let controller = TripHubController(service: service, sessionStore: store)

        await controller.createTrip(
            title: "   ",
            destination: "Las Vegas, NV",
            startDate: "2026-09-18",
            endDate: "2026-09-21",
            ownerName: "Nitish"
        )

        XCTAssertEqual(controller.phase, .failed("Trip name, destination, dates, and your name are required."))
        XCTAssertNil(controller.snapshot)
        XCTAssertEqual(service.recordedCalls, [])
    }

    @MainActor
    func testTripHubControllerShowsRecoveryMessageWhenSavedSessionCannotRestore() async {
        let service = StubGroupTripService()
        service.snapshotError = DecodingError.dataCorrupted(
            DecodingError.Context(codingPath: [], debugDescription: "Malformed response")
        )
        let store = InMemoryTripHubSessionStore()
        store.savedSession = TripHubSession(
            tripId: "trip_stale",
            participantId: "participant_stale",
            participantAccessToken: "gtp_stale_token",
            displayName: "Nitish",
            inviteCode: "STALE1",
            tripTitle: "Old Trip"
        )
        let controller = TripHubController(service: service, sessionStore: store)

        await controller.restoreSession()

        XCTAssertEqual(
            controller.phase,
            .failed("Trip Hub could not restore this saved session. Create or join a trip to continue.")
        )
        XCTAssertNil(controller.snapshot)
        XCTAssertEqual(service.recordedCalls, ["snapshot:trip_stale:participant_stale:gtp_stale_token"])
    }

    func testTripHubSessionStoreKeepsAccessTokenOutOfUserDefaults() throws {
        let suiteName = "TripHubSessionStoreTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let tokenStore = InMemoryTripHubAccessTokenStore()
        let store = UserDefaultsTripHubSessionStore(
            defaults: defaults,
            key: "trip-hub-session",
            tokenStore: tokenStore
        )

        store.saveSession(
            TripHubSession(
                tripId: "trip_abc123",
                participantId: "participant_1",
                participantAccessToken: "gtp_owner_token",
                displayName: "Nitish",
                inviteCode: "VEGAS1",
                tripTitle: "Vegas 2026"
            )
        )

        let rawData = try XCTUnwrap(defaults.data(forKey: "trip-hub-session"))
        let rawString = String(decoding: rawData, as: UTF8.self)
        XCTAssertFalse(rawString.contains("gtp_owner_token"))
        XCTAssertEqual(tokenStore.tokensByParticipantId["participant_1"], "gtp_owner_token")
        XCTAssertEqual(store.loadSession()?.participantAccessToken, "gtp_owner_token")
    }

    func testTripHubSessionStoreMigratesLegacyInlineAccessTokenOutOfUserDefaults() throws {
        let suiteName = "TripHubSessionStoreTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let tokenStore = InMemoryTripHubAccessTokenStore()
        let store = UserDefaultsTripHubSessionStore(
            defaults: defaults,
            key: "trip-hub-session",
            tokenStore: tokenStore
        )
        let legacy = TripHubSession(
            tripId: "trip_legacy",
            participantId: "participant_legacy",
            participantAccessToken: "gtp_legacy_token",
            displayName: "Nitish",
            inviteCode: "LEGACY",
            tripTitle: "Legacy Vegas"
        )
        defaults.set(try JSONEncoder.sproutRoute.encode(legacy), forKey: "trip-hub-session")

        let loaded = store.loadSession()

        XCTAssertEqual(loaded?.participantAccessToken, "gtp_legacy_token")
        XCTAssertEqual(tokenStore.tokensByParticipantId["participant_legacy"], "gtp_legacy_token")
        let rewrittenData = try XCTUnwrap(defaults.data(forKey: "trip-hub-session"))
        XCTAssertFalse(String(decoding: rewrittenData, as: UTF8.self).contains("gtp_legacy_token"))
    }

    @MainActor
    func testTripHubControllerCreatesTripPersistsSessionAndLoadsSnapshot() async {
        let service = StubGroupTripService()
        let store = InMemoryTripHubSessionStore()
        let controller = TripHubController(service: service, sessionStore: store)

        await controller.createTrip(
            title: " Vegas 2026 ",
            destination: " Las Vegas, NV ",
            startDate: "2026-09-18",
            endDate: "2026-09-21",
            ownerName: " Nitish "
        )

        XCTAssertEqual(controller.phase, .ready)
        XCTAssertEqual(controller.snapshot?.trip.title, "Vegas 2026")
        XCTAssertEqual(controller.currentParticipant?.id, "participant_1")
        XCTAssertEqual(controller.activeSession?.tripId, "trip_abc123")
        XCTAssertEqual(store.savedSession?.participantId, "participant_1")
        XCTAssertEqual(store.savedSession?.participantAccessToken, "gtp_owner_token")
        XCTAssertEqual(service.recordedCalls, [
            "create:Vegas 2026:Las Vegas, NV:Nitish",
            "snapshot:trip_abc123:participant_1:gtp_owner_token"
        ])
    }

    @MainActor
    func testTripHubControllerJoinsWithNormalizedInviteCodeAndLoadsSnapshot() async {
        let service = StubGroupTripService()
        let store = InMemoryTripHubSessionStore()
        let controller = TripHubController(service: service, sessionStore: store)

        await controller.joinTrip(inviteCode: " vegas1 ", displayName: " Priya ")

        XCTAssertEqual(controller.phase, .ready)
        XCTAssertEqual(controller.currentParticipant?.role, .editor)
        XCTAssertEqual(controller.activeSession?.inviteCode, "VEGAS1")
        XCTAssertEqual(controller.activeSession?.participantAccessToken, "gtp_editor_token")
        XCTAssertEqual(service.recordedCalls, [
            "join:VEGAS1:Priya",
            "snapshot:trip_abc123:participant_2:gtp_editor_token"
        ])
    }

    @MainActor
    func testTripHubControllerTogglesLocationSharingInLoadedSnapshot() async {
        let service = StubGroupTripService()
        let store = InMemoryTripHubSessionStore()
        let controller = TripHubController(service: service, sessionStore: store)

        await controller.createTrip(
            title: "Vegas 2026",
            destination: "Las Vegas, NV",
            startDate: "2026-09-18",
            endDate: "2026-09-21",
            ownerName: "Nitish"
        )
        await controller.setLocationSharingEnabled(true)

        XCTAssertEqual(controller.phase, .ready)
        XCTAssertEqual(controller.currentParticipant?.locationSharingEnabled, true)
        XCTAssertEqual(controller.snapshot?.participants.first?.locationSharingEnabled, true)
        XCTAssertEqual(TripHubPresentation.moduleTiles(for: controller.snapshot!).first { $0.title == "Location" }?.detail, "1 sharing")
        XCTAssertEqual(service.recordedCalls, [
            "create:Vegas 2026:Las Vegas, NV:Nitish",
            "snapshot:trip_abc123:participant_1:gtp_owner_token",
            "location:trip_abc123:participant_1:gtp_owner_token:true"
        ])
    }

    @MainActor
    func testTripHubControllerSharesCurrentLocationFromProvider() async {
        let service = StubGroupTripService()
        let store = InMemoryTripHubSessionStore()
        let locationProvider = StubTripHubLocationProvider(
            location: TripHubCurrentLocation(latitude: 36.1699, longitude: -115.1398, accuracyMeters: 12)
        )
        let controller = TripHubController(
            service: service,
            sessionStore: store,
            locationProvider: locationProvider
        )

        await controller.createTrip(
            title: "Vegas 2026",
            destination: "Las Vegas, NV",
            startDate: "2026-09-18",
            endDate: "2026-09-21",
            ownerName: "Nitish"
        )
        await controller.shareCurrentLocation()

        XCTAssertEqual(controller.phase, .ready)
        XCTAssertEqual(controller.currentParticipant?.locationSharingEnabled, true)
        XCTAssertEqual(controller.currentParticipant?.lastLocation?.latitude, 36.1699)
        XCTAssertEqual(controller.currentParticipant?.lastLocation?.longitude, -115.1398)
        XCTAssertEqual(controller.currentParticipant?.lastLocation?.accuracyMeters, 12)
        XCTAssertEqual(controller.snapshot?.participants.first?.lastLocation?.latitude, 36.1699)
        XCTAssertEqual(service.recordedCalls, [
            "create:Vegas 2026:Las Vegas, NV:Nitish",
            "snapshot:trip_abc123:participant_1:gtp_owner_token",
            "location:trip_abc123:participant_1:gtp_owner_token:true:36.1699:-115.1398:12.0"
        ])
    }

    @MainActor
    func testTripHubControllerTimesOutWhenCurrentLocationProviderStalls() async {
        let service = StubGroupTripService()
        let store = InMemoryTripHubSessionStore()
        let locationProvider = SlowTripHubLocationProvider(delayNanoseconds: 1_000_000_000)
        let controller = TripHubController(
            service: service,
            sessionStore: store,
            locationProvider: locationProvider,
            locationRequestTimeoutNanoseconds: 1_000_000
        )

        await controller.createTrip(
            title: "Vegas 2026",
            destination: "Las Vegas, NV",
            startDate: "2026-09-18",
            endDate: "2026-09-21",
            ownerName: "Nitish"
        )
        await controller.shareCurrentLocation()

        XCTAssertEqual(
            controller.phase,
            .failed("Current location took too long. Try again when your device has a location fix.")
        )
        XCTAssertEqual(controller.currentParticipant?.locationSharingEnabled, false)
        XCTAssertEqual(service.recordedCalls, [
            "create:Vegas 2026:Las Vegas, NV:Nitish",
            "snapshot:trip_abc123:participant_1:gtp_owner_token"
        ])
    }

    @MainActor
    func testTripHubControllerAddsTimelineItemToLoadedSnapshot() async {
        let service = StubGroupTripService()
        let store = InMemoryTripHubSessionStore()
        let controller = TripHubController(service: service, sessionStore: store)

        await controller.createTrip(
            title: "Vegas 2026",
            destination: "Las Vegas, NV",
            startDate: "2026-09-18",
            endDate: "2026-09-21",
            ownerName: "Nitish"
        )
        await controller.addTripHubItem(
            kind: " flight ",
            title: " Arrive at LAS ",
            startAt: "2026-09-18T17:30:00Z",
            endAt: nil,
            locationName: " Harry Reid International Airport ",
            notes: " Share confirmation numbers ",
            assignedParticipantIds: [" participant_1 ", "participant_2", "participant_2"]
        )

        XCTAssertEqual(controller.phase, .ready)
        XCTAssertEqual(controller.snapshot?.items.map(\.title), ["Arrive at LAS"])
        XCTAssertEqual(controller.snapshot?.items.first?.assignedParticipantIds, ["participant_1", "participant_2"])
        XCTAssertEqual(controller.snapshot?.activity.first?.type, "item_created")
        XCTAssertEqual(TripHubPresentation.nextUpTitle(in: controller.snapshot!), "Arrive at LAS")
        XCTAssertEqual(service.recordedCalls, [
            "create:Vegas 2026:Las Vegas, NV:Nitish",
            "snapshot:trip_abc123:participant_1:gtp_owner_token",
            "item:trip_abc123:participant_1:gtp_owner_token:flight:Arrive at LAS:participant_1|participant_2"
        ])
    }

    @MainActor
    func testTripHubControllerUpdatesTimelineItemAndParticipantTags() async throws {
        let service = StubGroupTripService()
        let store = InMemoryTripHubSessionStore()
        let controller = TripHubController(service: service, sessionStore: store)

        await controller.createTrip(
            title: "Vegas 2026",
            destination: "Las Vegas, NV",
            startDate: "2026-09-18",
            endDate: "2026-09-21",
            ownerName: "Nitish"
        )
        await controller.addTripHubItem(
            kind: "activity",
            title: "Pool cabana",
            startAt: "2026-09-19T18:00:00Z",
            endAt: nil,
            locationName: "Resort pool",
            notes: nil,
            assignedParticipantIds: ["participant_1"]
        )
        let item = try XCTUnwrap(controller.snapshot?.items.first)

        await controller.updateTripHubItem(
            itemId: item.id,
            kind: " meal ",
            title: " Dinner reservation ",
            startAt: "2026-09-19T20:00:00Z",
            endAt: "2026-09-19T22:00:00Z",
            locationName: " Best Friend ",
            notes: " Moved after cabana ",
            assignedParticipantIds: ["participant_2"]
        )

        XCTAssertEqual(controller.phase, .ready)
        XCTAssertEqual(controller.snapshot?.items.first?.id, item.id)
        XCTAssertEqual(controller.snapshot?.items.first?.title, "Dinner reservation")
        XCTAssertEqual(controller.snapshot?.items.first?.assignedParticipantIds, ["participant_2"])
        XCTAssertEqual(controller.snapshot?.activity.first?.type, "item_updated")
        XCTAssertEqual(service.recordedCalls, [
            "create:Vegas 2026:Las Vegas, NV:Nitish",
            "snapshot:trip_abc123:participant_1:gtp_owner_token",
            "item:trip_abc123:participant_1:gtp_owner_token:activity:Pool cabana:participant_1",
            "update-item:trip_abc123:participant_1:gtp_owner_token:item_1:meal:Dinner reservation:participant_2"
        ])
    }

    @MainActor
    func testTripHubControllerImportsPastedTextIntoTimeline() async {
        let service = StubGroupTripService()
        let store = InMemoryTripHubSessionStore()
        let controller = TripHubController(service: service, sessionStore: store)

        await controller.createTrip(
            title: "Vegas 2026",
            destination: "Las Vegas, NV",
            startDate: "2026-09-18",
            endDate: "2026-09-21",
            ownerName: "Nitish"
        )
        await controller.importTripHubItemsText("""
        Fri 9/18 5:30 PM - Arrive at LAS - Nitish
        Sat 9/19 8 PM - Dinner at Best Friend with Priya
        """)

        XCTAssertEqual(controller.phase, .ready)
        XCTAssertEqual(controller.snapshot?.items.map(\.title), ["Arrive at LAS", "Dinner at Best Friend with Priya"])
        XCTAssertEqual(controller.snapshot?.items.first?.assignedParticipantIds, ["participant_1"])
        XCTAssertEqual(controller.snapshot?.items.last?.assignedParticipantIds, ["participant_2"])
        XCTAssertEqual(controller.snapshot?.activity.first?.type, "items_imported")
        XCTAssertEqual(service.recordedCalls, [
            "create:Vegas 2026:Las Vegas, NV:Nitish",
            "snapshot:trip_abc123:participant_1:gtp_owner_token",
            "import-text:trip_abc123:participant_1:gtp_owner_token:Fri 9/18 5:30 PM - Arrive at LAS - Nitish\nSat 9/19 8 PM - Dinner at Best Friend with Priya"
        ])
    }

    @MainActor
    func testTripHubControllerCreatesDecisionAndRecordsVote() async throws {
        let service = StubGroupTripService()
        let store = InMemoryTripHubSessionStore()
        let controller = TripHubController(service: service, sessionStore: store)

        await controller.createTrip(
            title: "Vegas 2026",
            destination: "Las Vegas, NV",
            startDate: "2026-09-18",
            endDate: "2026-09-21",
            ownerName: "Nitish"
        )
        await controller.createDecision(
            title: " Friday dinner ",
            options: [" Best Friend ", " ", " Din Tai Fung "]
        )
        let decision = try XCTUnwrap(controller.snapshot?.decisions.first)
        await controller.voteDecision(decisionId: decision.id, optionId: decision.options[1].id)

        XCTAssertEqual(controller.phase, .ready)
        XCTAssertEqual(controller.snapshot?.decisions.first?.title, "Friday dinner")
        XCTAssertEqual(controller.snapshot?.decisions.first?.options.map(\.title), ["Best Friend", "Din Tai Fung"])
        XCTAssertEqual(controller.snapshot?.decisions.first?.votes.first?.participantId, "participant_1")
        XCTAssertEqual(controller.snapshot?.activity.first?.type, "decision_voted")
        XCTAssertEqual(service.recordedCalls, [
            "create:Vegas 2026:Las Vegas, NV:Nitish",
            "snapshot:trip_abc123:participant_1:gtp_owner_token",
            "decision:trip_abc123:participant_1:gtp_owner_token:Friday dinner:Best Friend|Din Tai Fung",
            "vote:trip_abc123:decision_1:participant_1:gtp_owner_token:option_2"
        ])
    }

    @MainActor
    func testTripHubControllerRecordsExpenseAndRefreshesBalances() async {
        let service = StubGroupTripService()
        let store = InMemoryTripHubSessionStore()
        let controller = TripHubController(service: service, sessionStore: store)

        await controller.createTrip(
            title: "Vegas 2026",
            destination: "Las Vegas, NV",
            startDate: "2026-09-18",
            endDate: "2026-09-21",
            ownerName: "Nitish"
        )
        await controller.createExpense(
            title: " Hotel deposit ",
            amountText: "480.00",
            currency: "usd",
            paidByParticipantId: "participant_1",
            splitParticipantIds: ["participant_1", "participant_2"]
        )

        XCTAssertEqual(controller.phase, .ready)
        XCTAssertEqual(controller.snapshot?.expenses.first?.title, "Hotel deposit")
        XCTAssertEqual(controller.snapshot?.expenses.first?.amountCents, 48000)
        XCTAssertEqual(controller.snapshot?.balances.first?.amountCents, 24000)
        XCTAssertEqual(TripHubPresentation.moduleTiles(for: controller.snapshot!).first { $0.title == "Expenses" }?.detail, "$480.00")
        XCTAssertEqual(service.recordedCalls, [
            "create:Vegas 2026:Las Vegas, NV:Nitish",
            "snapshot:trip_abc123:participant_1:gtp_owner_token",
            "expense:trip_abc123:participant_1:gtp_owner_token:participant_1:Hotel deposit:48000:USD:participant_1|participant_2"
        ])
    }

    func testProfileImportPromptGivesExternalAssistantWorkflow() {
        let prompt = ProfileImportPrompt.text

        XCTAssertTrue(prompt.contains("ChatGPT"))
        XCTAssertTrue(prompt.contains("Claude"))
        XCTAssertTrue(prompt.contains("profile_summary"))
        XCTAssertTrue(prompt.contains("unknowns"))
    }

    func testProfileImportSanitizerNormalizesSmartQuoteJsonFromChatGPT() {
        let pasted = """
        ```json
        {
          “food_preferences”: { “cuisines_liked”: [“Indian”] },
          “travel_style”: { “pace”: “moderate” },
          “activity_preferences”: { “preferred_activities”: [“parks”] }
        }
        ```
        """

        let sanitized = ProfileImportSanitizer.sanitizedPaste(pasted)

        XCTAssertFalse(sanitized.contains("“"))
        XCTAssertTrue(sanitized.contains("\"food_preferences\""))
        XCTAssertTrue(sanitized.hasPrefix("{"))
        XCTAssertTrue(sanitized.hasSuffix("}"))
    }

    func testItineraryPresentationAddsTimeSlotsAndMapActionsWhenBackendDoesNotSchedule() {
        let plan = TripPlanResult(
            overview: "A family beach trip.",
            suggestedActivities: [
                TripActivity(
                    id: "a1",
                    name: "Balboa Park",
                    category: "parks",
                    description: "Gardens, museums, and stroller-friendly paths.",
                    duration: "2 hours",
                    kidFriendly: true,
                    petFriendly: true,
                    weatherDependent: false,
                    bestDays: ["Monday"],
                    reason: "Easy toddler pacing."
                )
            ],
            dailyItinerary: [
                ItineraryDay(day: "Day 1", date: "2026-05-04", activities: ["a1"], notes: "Start early.")
            ],
            tips: []
        )

        let days = ItineraryPresentation.days(for: plan, destination: "San Diego")

        XCTAssertEqual(days.first?.scheduled.first?.scheduledStart, "9:00 AM")
        XCTAssertEqual(days.first?.scheduled.first?.scheduledEnd, "11:00 AM")
        XCTAssertEqual(days.first?.scheduled.first?.name, "Balboa Park")
        XCTAssertEqual(days.first?.scheduled.first?.mapQuery, "Balboa Park San Diego")
        XCTAssertEqual(days.first?.notes, "Start early.")
    }

    func testItineraryDaySelectionDefaultsAndSurvivesRefreshingDays() {
        let days = [
            ScheduledItineraryDay(date: "2026-05-04", scheduled: [], warnings: nil, notes: nil),
            ScheduledItineraryDay(date: "2026-05-05", scheduled: [], warnings: nil, notes: nil),
            ScheduledItineraryDay(date: "2026-05-06", scheduled: [], warnings: nil, notes: nil)
        ]

        XCTAssertEqual(ItineraryDaySelection.defaultSelection(in: days), "2026-05-04")
        XCTAssertEqual(ItineraryDaySelection.resolvedSelection("2026-05-05", in: days), "2026-05-05")
        XCTAssertEqual(ItineraryDaySelection.resolvedSelection("missing-day", in: days), "2026-05-04")
        XCTAssertNil(ItineraryDaySelection.defaultSelection(in: []))
    }

    func testWeatherValueFormatterUsesReadableDegreeAndPercentLabels() {
        XCTAssertEqual(WeatherValueFormatter.temperature(66.6), "67°F")
        XCTAssertEqual(WeatherValueFormatter.temperature(nil), "-")
        XCTAssertEqual(WeatherValueFormatter.percent(0.42, sourceUsesFraction: true), "42%")
        XCTAssertEqual(WeatherValueFormatter.percent(42, sourceUsesFraction: false), "42%")
    }

    func testPlaceEnrichmentPresentationPromotesLiveLookupIntoDetailFields() {
        let response = PlaceEnrichmentResponse(
            name: "Balboa Park",
            address: "San Diego, CA",
            rating: 4.8,
            userRatingsTotal: 12_345,
            website: "https://example.com",
            phone: "+16195551212",
            photoUrl: "https://example.com/photo.jpg",
            openingHours: ["Monday: 9 AM-5 PM", "Tuesday: 9 AM-5 PM"]
        )

        let detail = PlaceEnrichmentPresentation.detail(from: response)

        XCTAssertEqual(detail.address, "San Diego, CA")
        XCTAssertEqual(detail.ratingLabel, "4.8 (12,345)")
        XCTAssertEqual(detail.websiteURL?.absoluteString, "https://example.com")
        XCTAssertEqual(detail.phoneURL?.absoluteString, "tel:+16195551212")
        XCTAssertEqual(detail.photoURL?.absoluteString, "https://example.com/photo.jpg")
        XCTAssertEqual(detail.hoursSummary, "Monday: 9 AM-5 PM")
    }

    func testDecodesScheduledItineraryWithTimeSlots() throws {
        let json = """
        {
          "requestId": "req-1",
          "trip": {
            "destination": "San Diego, CA",
            "startDate": "2026-05-04",
            "endDate": "2026-05-08"
          },
          "tripPlan": {
            "overview": "A toddler-friendly plan.",
            "suggestedActivities": [],
            "dailyItinerary": [],
            "tips": []
          },
          "scheduledItinerary": [
            {
              "date": "2026-05-04",
              "scheduled": [
                {
                  "id": "a1",
                  "name": "Balboa Park",
                  "category": "parks",
                  "description": "Gardens and museums",
                  "scheduledStart": "9:00 AM",
                  "scheduledEnd": "11:00 AM",
                  "duration": 120,
                  "status": "scheduled",
                  "enriched": {
                    "rating": 4.8,
                    "address": "San Diego, CA",
                    "mapsUrl": "https://maps.apple.com/?q=Balboa%20Park"
                  }
                }
              ],
              "notes": "Start early."
            }
          ]
        }
        """

        let response = try JSONDecoder.sproutRoute.decode(TripBundleResponse.self, from: Data(json.utf8))

        XCTAssertEqual(response.tripPlan?.scheduledItinerary?.first?.scheduled.first?.scheduledStart, "9:00 AM")
        XCTAssertEqual(response.scheduledItinerary?.first?.scheduled.first?.enriched?.rating, 4.8)
    }

    func testPlanViewHidesStaleResultsWhileComposingAnotherTrip() {
        XCTAssertFalse(
            PlanPresentationPolicy.shouldShowResults(
                hasResult: true,
                isWorking: false,
                composingAfterResult: true
            )
        )
        XCTAssertTrue(
            PlanPresentationPolicy.shouldShowResults(
                hasResult: true,
                isWorking: false,
                composingAfterResult: false
            )
        )
    }

    func testPlanViewDoesNotShowProgressRailBeforePlanningStarts() {
        XCTAssertFalse(
            PlanPresentationPolicy.shouldShowProgress(
                isWorking: false,
                hasFailure: false
            )
        )
        XCTAssertTrue(
            PlanPresentationPolicy.shouldShowProgress(
                isWorking: true,
                hasFailure: false
            )
        )
        XCTAssertTrue(
            PlanPresentationPolicy.shouldShowProgress(
                isWorking: false,
                hasFailure: true
            )
        )
    }

    func testPlanPromptPlaceholderGuidesFastTripEntry() {
        XCTAssertTrue(PlanPresentationPolicy.promptPlaceholder.contains("dates"))
        XCTAssertTrue(PlanPresentationPolicy.promptPlaceholder.contains("kids"))
        XCTAssertTrue(PlanPresentationPolicy.promptPlaceholder.contains("pets"))
    }

    func testInAppCompliancePagesCoverSubmissionRequiredInformation() {
        XCTAssertEqual(
            CompliancePage.allCases.map(\.title),
            [
                "Privacy Policy",
                "Privacy Choices",
                "Terms of Service",
                "Safety and AI Disclosures",
                "Support"
            ]
        )

        let allCopy = CompliancePage.allCases
            .flatMap(\.sections)
            .flatMap { [$0.heading, $0.body] + $0.bullets }
            .joined(separator: " ")

        XCTAssertTrue(allCopy.contains("parents and guardians"))
        XCTAssertTrue(allCopy.contains("not directed to children"))
        XCTAssertTrue(allCopy.contains("Share Product Analytics"))
        XCTAssertTrue(allCopy.contains("off by default"))
        XCTAssertTrue(allCopy.contains("raw trip prompts"))
        XCTAssertTrue(allCopy.contains("Trip Hub location sharing"))
        XCTAssertTrue(allCopy.contains("only when you explicitly share"))
        XCTAssertTrue(allCopy.contains("Delete all local trip data"))
        XCTAssertTrue(allCopy.contains("not legal advice"))
        XCTAssertTrue(allCopy.contains("WeatherKit"))
        XCTAssertTrue(allCopy.contains("nitish.prasad@gmail.com"))
    }
}

private final class StubGroupTripService: GroupTripServicing {
    var recordedCalls: [String] = []
    var snapshotError: Error?

    func createGroupTrip(_ payload: GroupTripCreateRequest) async throws -> GroupTripWorkspaceResponse {
        recordedCalls.append("create:\(payload.title):\(payload.destination):\(payload.ownerName)")
        return GroupTripWorkspaceResponse(
            requestId: "req-create",
            trip: Self.workspace,
            currentParticipant: Self.ownerSessionParticipant,
            participants: [Self.owner]
        )
    }

    func joinGroupTrip(_ payload: GroupTripJoinRequest) async throws -> GroupTripWorkspaceResponse {
        recordedCalls.append("join:\(payload.inviteCode):\(payload.displayName)")
        return GroupTripWorkspaceResponse(
            requestId: "req-join",
            trip: Self.workspace,
            currentParticipant: Self.editorSessionParticipant,
            participants: [Self.owner, Self.editor]
        )
    }

    func groupTripSnapshot(tripId: String, participantId: String, participantAccessToken: String) async throws -> GroupTripSnapshotResponse {
        recordedCalls.append("snapshot:\(tripId):\(participantId):\(participantAccessToken)")
        if let snapshotError {
            throw snapshotError
        }
        return Self.snapshot
    }

    func createGroupTripItem(_ payload: GroupTripItemCreateRequest) async throws -> GroupTripItemResponse {
        recordedCalls.append("item:\(payload.tripId):\(payload.actorParticipantId):\(payload.actorParticipantAccessToken):\(payload.kind):\(payload.title):\(payload.assignedParticipantIds.joined(separator: "|"))")
        let item = GroupTripItem(
            id: "item_1",
            tripId: payload.tripId,
            kind: payload.kind,
            title: payload.title,
            startAt: payload.startAt,
            endAt: payload.endAt,
            locationName: payload.locationName,
            notes: payload.notes,
            assignedParticipantIds: payload.assignedParticipantIds,
            status: "planned",
            createdByParticipantId: payload.actorParticipantId,
            createdAt: nil,
            updatedAt: nil
        )
        return GroupTripItemResponse(
            requestId: "req-item",
            item: item,
            activity: GroupTripActivityEvent(
                id: "activity_item",
                tripId: payload.tripId,
                type: "item_created",
                actorParticipantId: payload.actorParticipantId,
                summary: "Nitish added \(payload.title)",
                createdAt: nil
            )
        )
    }

    func updateGroupTripItem(_ payload: GroupTripItemUpdateRequest) async throws -> GroupTripItemResponse {
        recordedCalls.append("update-item:\(payload.tripId):\(payload.actorParticipantId):\(payload.actorParticipantAccessToken):\(payload.itemId):\(payload.kind):\(payload.title):\(payload.assignedParticipantIds.joined(separator: "|"))")
        let item = GroupTripItem(
            id: payload.itemId,
            tripId: payload.tripId,
            kind: payload.kind,
            title: payload.title,
            startAt: payload.startAt,
            endAt: payload.endAt,
            locationName: payload.locationName,
            notes: payload.notes,
            assignedParticipantIds: payload.assignedParticipantIds,
            status: "planned",
            createdByParticipantId: "participant_1",
            createdAt: nil,
            updatedAt: nil
        )
        return GroupTripItemResponse(
            requestId: "req-item-update",
            item: item,
            activity: GroupTripActivityEvent(
                id: "activity_item_update",
                tripId: payload.tripId,
                type: "item_updated",
                actorParticipantId: payload.actorParticipantId,
                summary: "Nitish updated \(payload.title)",
                createdAt: nil
            )
        )
    }

    func importGroupTripItemsText(_ payload: GroupTripItemsImportTextRequest) async throws -> GroupTripItemsImportTextResponse {
        recordedCalls.append("import-text:\(payload.tripId):\(payload.actorParticipantId):\(payload.actorParticipantAccessToken):\(payload.text)")
        let items = [
            GroupTripItem(
                id: "item_1",
                tripId: payload.tripId,
                kind: "flight",
                title: "Arrive at LAS",
                startAt: "2026-09-18T17:30:00.000Z",
                endAt: nil,
                locationName: nil,
                notes: nil,
                assignedParticipantIds: ["participant_1"],
                status: "planned",
                createdByParticipantId: payload.actorParticipantId,
                createdAt: nil,
                updatedAt: nil
            ),
            GroupTripItem(
                id: "item_2",
                tripId: payload.tripId,
                kind: "meal",
                title: "Dinner at Best Friend with Priya",
                startAt: "2026-09-19T20:00:00.000Z",
                endAt: nil,
                locationName: nil,
                notes: nil,
                assignedParticipantIds: ["participant_2"],
                status: "planned",
                createdByParticipantId: payload.actorParticipantId,
                createdAt: nil,
                updatedAt: nil
            )
        ]
        return GroupTripItemsImportTextResponse(
            requestId: "req-import",
            items: items,
            importedCount: items.count,
            activity: GroupTripActivityEvent(
                id: "activity_import",
                tripId: payload.tripId,
                type: "items_imported",
                actorParticipantId: payload.actorParticipantId,
                summary: "Nitish imported \(items.count) itinerary items",
                createdAt: nil
            )
        )
    }

    func createGroupTripDecision(_ payload: GroupTripDecisionCreateRequest) async throws -> GroupTripDecisionResponse {
        recordedCalls.append("decision:\(payload.tripId):\(payload.actorParticipantId):\(payload.actorParticipantAccessToken):\(payload.title):\(payload.options.joined(separator: "|"))")
        let decision = GroupTripDecision(
            id: "decision_1",
            tripId: payload.tripId,
            title: payload.title,
            status: "open",
            options: [
                GroupTripDecisionOption(id: "option_1", title: payload.options[0]),
                GroupTripDecisionOption(id: "option_2", title: payload.options[1])
            ],
            votes: [],
            createdByParticipantId: payload.actorParticipantId,
            createdAt: nil,
            updatedAt: nil
        )
        return GroupTripDecisionResponse(
            requestId: "req-decision",
            decision: decision,
            activity: GroupTripActivityEvent(
                id: "activity_decision",
                tripId: payload.tripId,
                type: "decision_created",
                actorParticipantId: payload.actorParticipantId,
                summary: "Nitish opened \(payload.title)",
                createdAt: nil
            )
        )
    }

    func voteGroupTripDecision(_ payload: GroupTripDecisionVoteRequest) async throws -> GroupTripDecisionResponse {
        recordedCalls.append("vote:\(payload.tripId):\(payload.decisionId):\(payload.participantId):\(payload.participantAccessToken):\(payload.optionId)")
        let decision = GroupTripDecision(
            id: payload.decisionId,
            tripId: payload.tripId,
            title: "Friday dinner",
            status: "open",
            options: [
                GroupTripDecisionOption(id: "option_1", title: "Best Friend"),
                GroupTripDecisionOption(id: "option_2", title: "Din Tai Fung")
            ],
            votes: [
                GroupTripDecisionVote(participantId: payload.participantId, optionId: payload.optionId, updatedAt: nil)
            ],
            createdByParticipantId: "participant_1",
            createdAt: nil,
            updatedAt: nil
        )
        return GroupTripDecisionResponse(
            requestId: "req-vote",
            decision: decision,
            activity: GroupTripActivityEvent(
                id: "activity_vote",
                tripId: payload.tripId,
                type: "decision_voted",
                actorParticipantId: payload.participantId,
                summary: "Nitish voted on Friday dinner",
                createdAt: nil
            )
        )
    }

    func createGroupTripExpense(_ payload: GroupTripExpenseCreateRequest) async throws -> GroupTripExpenseResponse {
        recordedCalls.append("expense:\(payload.tripId):\(payload.actorParticipantId):\(payload.actorParticipantAccessToken):\(payload.paidByParticipantId):\(payload.title):\(payload.amountCents):\(payload.currency):\(payload.splitParticipantIds.joined(separator: "|"))")
        let expense = GroupTripExpense(
            id: "expense_1",
            tripId: payload.tripId,
            title: payload.title,
            amountCents: payload.amountCents,
            currency: payload.currency,
            paidByParticipantId: payload.paidByParticipantId,
            splitParticipantIds: payload.splitParticipantIds,
            createdByParticipantId: payload.actorParticipantId,
            createdAt: nil,
            updatedAt: nil
        )
        return GroupTripExpenseResponse(
            requestId: "req-expense",
            expense: expense,
            balances: [
                GroupTripBalance(
                    fromParticipantId: "participant_2",
                    toParticipantId: payload.paidByParticipantId,
                    amountCents: payload.amountCents / 2,
                    currency: payload.currency
                )
            ],
            activity: GroupTripActivityEvent(
                id: "activity_expense",
                tripId: payload.tripId,
                type: "expense_created",
                actorParticipantId: payload.actorParticipantId,
                summary: "Nitish added \(payload.title)",
                createdAt: nil
            )
        )
    }

    func setGroupTripLocationSharing(_ payload: GroupTripLocationSharingRequest) async throws -> GroupTripLocationSharingResponse {
        if let latitude = payload.latitude, let longitude = payload.longitude {
            recordedCalls.append("location:\(payload.tripId):\(payload.participantId):\(payload.participantAccessToken):\(payload.isEnabled):\(latitude):\(longitude):\(payload.accuracyMeters ?? 0)")
        } else {
            recordedCalls.append("location:\(payload.tripId):\(payload.participantId):\(payload.participantAccessToken):\(payload.isEnabled)")
        }
        var participant = Self.owner
        participant.locationSharingEnabled = payload.isEnabled
        participant.lastLocation = payload.isEnabled && payload.latitude != nil && payload.longitude != nil
            ? GroupTripParticipantLocation(
                latitude: payload.latitude!,
                longitude: payload.longitude!,
                accuracyMeters: payload.accuracyMeters,
                updatedAt: "2026-06-28T12:30:00.000Z"
            )
            : nil
        return GroupTripLocationSharingResponse(
            requestId: "req-location",
            participant: participant,
            activity: GroupTripActivityEvent(
                id: "activity_location",
                tripId: payload.tripId,
                type: payload.isEnabled ? "location_sharing_enabled" : "location_sharing_disabled",
                actorParticipantId: payload.participantId,
                summary: "Nitish updated location sharing",
                createdAt: nil
            )
        )
    }

    private static let workspace = GroupTripWorkspace(
        id: "trip_abc123",
        title: "Vegas 2026",
        destination: "Las Vegas, NV",
        startDate: "2026-09-18",
        endDate: "2026-09-21",
        inviteCode: "VEGAS1",
        status: "active",
        createdAt: nil,
        updatedAt: nil
    )

    private static let owner = GroupTripParticipant(
        id: "participant_1",
        tripId: "trip_abc123",
        displayName: "Nitish",
        role: .owner,
        locationSharingEnabled: false,
        joinedAt: nil
    )

    private static let ownerSessionParticipant = GroupTripParticipant(
        id: "participant_1",
        tripId: "trip_abc123",
        displayName: "Nitish",
        role: .owner,
        locationSharingEnabled: false,
        accessToken: "gtp_owner_token",
        joinedAt: nil
    )

    private static let editor = GroupTripParticipant(
        id: "participant_2",
        tripId: "trip_abc123",
        displayName: "Priya",
        role: .editor,
        locationSharingEnabled: false,
        joinedAt: nil
    )

    private static let editorSessionParticipant = GroupTripParticipant(
        id: "participant_2",
        tripId: "trip_abc123",
        displayName: "Priya",
        role: .editor,
        locationSharingEnabled: false,
        accessToken: "gtp_editor_token",
        joinedAt: nil
    )

    private static let snapshot = GroupTripSnapshotResponse(
        requestId: "req-snapshot",
        trip: workspace,
        participants: [owner, editor],
        items: [],
        decisions: [],
        expenses: [],
        balances: [],
        activity: [],
        aiSuggestions: []
    )
}

private struct StubTripHubLocationProvider: TripHubLocationProviding {
    var location: TripHubCurrentLocation

    func currentLocation() async throws -> TripHubCurrentLocation {
        location
    }
}

private struct SlowTripHubLocationProvider: TripHubLocationProviding {
    var delayNanoseconds: UInt64

    func currentLocation() async throws -> TripHubCurrentLocation {
        try await Task.sleep(nanoseconds: delayNanoseconds)
        return TripHubCurrentLocation(latitude: 36.1699, longitude: -115.1398, accuracyMeters: 12)
    }
}

private final class InMemoryTripHubSessionStore: TripHubSessionStoring {
    var savedSession: TripHubSession?

    func loadSession() -> TripHubSession? {
        savedSession
    }

    func saveSession(_ session: TripHubSession) {
        savedSession = session
    }

    func clearSession() {
        savedSession = nil
    }
}

private final class InMemoryTripHubAccessTokenStore: TripHubAccessTokenStoring {
    var tokensByParticipantId: [String: String] = [:]

    func loadToken(participantId: String) -> String? {
        tokensByParticipantId[participantId]
    }

    func saveToken(_ token: String, participantId: String) {
        tokensByParticipantId[participantId] = token
    }

    func clearToken(participantId: String) {
        tokensByParticipantId.removeValue(forKey: participantId)
    }
}
