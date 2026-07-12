import Foundation
import Observation
import OSLog
import SwiftData

@MainActor
@Observable
final class TripPlanner {
    enum Phase: Equatable {
        case idle
        case parsing
        case generating
        case showingResults
        case failed(String)

        var label: String {
            switch self {
            case .idle: "Ready"
            case .parsing: "Understanding your trip"
            case .generating: "Building your plan"
            case .showingResults: "Results ready"
            case .failed: "Needs attention"
            }
        }
    }

    var phase: Phase = .idle
    var prompt: String = ""
    var parsedInput: ParsedTripInput?
    var currentResult = TripStreamResult()
    var capabilityPayload: CapabilityPayload?
    var latestNativeWeather: NativeWeatherSnapshot?
    var weatherMismatchNotice: String?
    var progress: [String: String] = [:]
    var selectedDeepLink: SproutRouteDeepLink?

    private let apiClient: SproutAPIClient
    private let weatherKit: WeatherKitAdapter
    private let notifications: NotificationScheduler
    private let spotlight: SpotlightIndexer
    private let liveActivities: LiveActivityController
    private let recapService: FoundationModelsRecapService
    private let snapshotStore: AppGroupSnapshotStore
    private let analytics: AnalyticsTracking
    private let logger = Logger(subsystem: "com.sproutroute.app", category: "planner")

    init(
        apiClient: SproutAPIClient = SproutAPIClient(),
        weatherKit: WeatherKitAdapter = WeatherKitAdapter(),
        notifications: NotificationScheduler = NotificationScheduler(),
        spotlight: SpotlightIndexer = SpotlightIndexer(),
        liveActivities: LiveActivityController = LiveActivityController(),
        recapService: FoundationModelsRecapService = FoundationModelsRecapService(),
        snapshotStore: AppGroupSnapshotStore = AppGroupSnapshotStore(),
        analytics: AnalyticsTracking = ProductAnalytics.shared
    ) {
        self.apiClient = apiClient
        self.weatherKit = weatherKit
        self.notifications = notifications
        self.spotlight = spotlight
        self.liveActivities = liveActivities
        self.recapService = recapService
        self.snapshotStore = snapshotStore
        self.analytics = analytics
    }

    var hasResult: Bool {
        currentResult.trip != nil || currentResult.tripPlan != nil
    }

    func loadCapabilities() async {
        do {
            capabilityPayload = try await apiClient.capabilities()
        } catch {
            capabilityPayload = nil
        }
    }

    func submit(text: String, modelContext: ModelContext) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            phase = .failed("Describe the trip you want to plan.")
            return
        }

        prompt = trimmed
        currentResult = TripStreamResult()
        parsedInput = nil
        latestNativeWeather = nil
        weatherMismatchNotice = nil
        progress = [:]

        do {
            let planningStartedAt = Date()
            let repository = TripRepository(modelContext: modelContext)
            let savedProfile = try? repository.latestImportedProfile()?.profile
            analytics.track(.tripPromptSubmitted(prompt: trimmed, hasSavedProfile: savedProfile != nil))
            phase = .parsing
            mark("resolve", "active")
            logger.info("Planning started")
            let parsed = try await apiClient.parseInput(text: trimmed, detectedLat: nil, detectedLon: nil)
            var enrichedParsed = parsed
            enrichedParsed.rawInput = trimmed
            parsedInput = enrichedParsed
            analytics.track(.parseSucceeded(enrichedParsed))
            logger.info("Parsed input destination=\(enrichedParsed.destination ?? "nil", privacy: .public) start=\(enrichedParsed.startDate ?? "nil", privacy: .public) end=\(enrichedParsed.endDate ?? "nil", privacy: .public)")
            mark("resolve", "done")

            guard let payload = buildPayload(from: enrichedParsed, savedProfile: savedProfile) else {
                phase = .failed("SproutRoute could not find a destination and dates in that prompt.")
                return
            }

            phase = .generating
            analytics.track(.planningStarted(payload))
            mark("weather", "active")
            do {
                let streamed = try await apiClient.streamTripPlan(payload: payload) { [weak self] event in
                    self?.apply(event)
                }
                merge(streamed)
            } catch {
                logger.error("Stream failed, trying bundle fallback: \(error.localizedDescription, privacy: .public)")
                mark("fallback", "active")
                let bundle = try await apiClient.bundleTripPlan(payload: payload)
                merge(bundle)
                mark("fallback", "done")
            }

            phase = .showingResults
            let elapsed = Int(Date().timeIntervalSince(planningStartedAt) * 1000)
            analytics.track(.planningCompleted(currentResult, elapsedMilliseconds: elapsed))
            await fetchBackgroundData(payload: payload, modelContext: modelContext)
            try saveCurrentTrip(modelContext: modelContext)
        } catch {
            logger.error("Planning failed: \(error.localizedDescription, privacy: .public)")
            analytics.track(.planningFailed(error))
            phase = .failed(error.localizedDescription)
        }
    }

    func saveCurrentTrip(modelContext: ModelContext) throws {
        guard currentResult.trip != nil else { return }
        let repository = TripRepository(modelContext: modelContext)
        let saved = try repository.upsert(result: currentResult, snapshotStore: snapshotStore)
        if let snapshot = saved.snapshot {
            Task {
                await spotlight.index(snapshot: snapshot)
                await liveActivities.update(snapshot: snapshot)
            }
        }
        analytics.track(.tripSaved(currentResult))
    }

    func requestNotificationsForCurrentTrip(modelContext: ModelContext) async {
        let authorized = await notifications.requestAuthorization()
        analytics.track(.remindersRequested(authorized: authorized))
        guard authorized else { return }
        let snapshot = TripRepository(modelContext: modelContext).makeSnapshot(result: currentResult)
        await notifications.schedulePackingReminder(for: snapshot)
    }

    func handleDeepLink(_ deepLink: SproutRouteDeepLink) {
        selectedDeepLink = deepLink
        if case .plan(let destination) = deepLink, let destination {
            prompt = destination
        }
    }

    func openSavedTrip(_ result: TripStreamResult) {
        currentResult = result
        parsedInput = result.parsed
        latestNativeWeather = nil
        weatherMismatchNotice = nil
        phase = .showingResults
        progress = [
            "resolve": "done",
            "weather": result.weather == nil ? "pending" : "done",
            "itinerary": result.tripPlan == nil ? "pending" : "done",
            "packing": result.packingList == nil ? "pending" : "done",
            "safety": (result.travelSafety == nil && result.carSeatGuidance == nil && result.petSafety == nil) ? "pending" : "done"
        ]
    }

    func clearCurrentTrip() {
        phase = .idle
        prompt = ""
        parsedInput = nil
        currentResult = TripStreamResult()
        latestNativeWeather = nil
        weatherMismatchNotice = nil
        progress = [:]
    }

    private func fetchBackgroundData(payload: TripRequestPayload, modelContext: ModelContext) async {
        async let packing: Void = fetchPacking(payload: payload)
        async let safety: Void = fetchTravelSafety(payload: payload)
        async let carSeat: Void = fetchCarSeat(payload: payload)
        async let petSafety: Void = fetchPetSafety(payload: payload)
        async let nativeWeather: Void = refreshNativeWeather(modelContext: modelContext)
        _ = await (packing, safety, carSeat, petSafety, nativeWeather)
    }

    private func fetchPacking(payload: TripRequestPayload) async {
        guard currentResult.packingList == nil else { return }
        mark("packing", "active")
        do {
            let response = try await apiClient.generatePackingList(payload: payload)
            currentResult.packingList = response.packingList
        } catch {
            logger.error("Packing refresh failed: \(error.localizedDescription, privacy: .public)")
        }
        mark("packing", "done")
    }

    private func fetchTravelSafety(payload: TripRequestPayload) async {
        mark("safety", "active")
        do {
            let response = try await apiClient.travelSafety(
                destination: payload.destination,
                childrenAges: payload.childrenAges,
                countryCode: currentResult.trip?.countryCode
            )
            currentResult.travelSafety = response
        } catch {
            logger.error("Travel safety refresh failed: \(error.localizedDescription, privacy: .public)")
        }
        mark("safety", "done")
    }

    private func fetchCarSeat(payload: TripRequestPayload) async {
        guard !payload.children.isEmpty else { return }
        do {
            let response = try await apiClient.carSeatGuidance(
                destination: currentResult.trip?.destination ?? payload.destination,
                jurisdictionCode: currentResult.trip?.jurisdictionCode,
                tripDate: currentResult.trip?.startDate ?? payload.startDate,
                children: payload.children
            )
            currentResult.carSeatGuidance = response
        } catch {
            logger.error("Car-seat guidance refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func fetchPetSafety(payload: TripRequestPayload) async {
        guard !payload.pets.isEmpty else { return }
        do {
            let response = try await apiClient.petTravelCheck(
                pets: payload.pets,
                destination: payload.destination,
                countryCode: currentResult.trip?.countryCode,
                travelMode: (currentResult.trip?.countryCode ?? "US") == "US" ? "drive" : "fly"
            )
            currentResult.petSafety = response
        } catch {
            logger.error("Pet safety refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func refreshNativeWeather(modelContext: ModelContext) async {
        let trip = currentResult.trip
        latestNativeWeather = await weatherKit.refreshForecast(lat: trip?.lat, lon: trip?.lon)
        weatherMismatchNotice = await weatherKit.mismatchNotice(backend: currentResult.weather, native: latestNativeWeather)
        if let latestNativeWeather, let tripId = currentResult.requestId ?? trip?.destination {
            if let data = try? JSONEncoder.sproutRoute.encode(latestNativeWeather) {
                modelContext.insert(CachedWeatherSnapshotModel(
                    tripId: tripId,
                    fetchedAt: latestNativeWeather.fetchedAt,
                    summary: latestNativeWeather.summary,
                    snapshotData: data
                ))
                try? modelContext.save()
            }
        }
    }

    private func buildPayload(from parsed: ParsedTripInput, savedProfile: UserTravelProfile?) -> TripRequestPayload? {
        guard
            let destination = parsed.destination,
            let startDate = parsed.startDate,
            let endDate = parsed.endDate
        else { return nil }

        let childrenAges = parsed.childrenAges ?? []
        return TripRequestPayload(
            rawInput: parsed.rawInput ?? prompt,
            destination: destination,
            startDate: startDate,
            endDate: endDate,
            adults: parsed.adults,
            childrenAges: childrenAges,
            children: childrenAges.enumerated().map { ChildProfile(id: "child-\($0.offset)", age: $0.element) },
            activities: parsed.vibe.map { [$0] } ?? [],
            foodPreferences: parsed.foodPreferences,
            pets: parsed.pets ?? [],
            tripGoals: parsed.tripGoals ?? [],
            mustHaves: parsed.mustHaves ?? [],
            avoidances: parsed.avoidances ?? [],
            pacePreference: parsed.pacePreference ?? "unknown",
            budgetSignals: parsed.budgetSignals ?? [],
            accommodationPreferences: parsed.accommodationPreferences ?? [],
            transportPreferences: parsed.transportPreferences ?? [],
            accessibilityNeeds: parsed.accessibilityNeeds ?? [],
            scheduleConstraints: parsed.scheduleConstraints ?? [],
            celebrationContext: parsed.celebrationContext,
            specialNotes: parsed.specialNotes ?? [],
            extraContext: parsed.extraContext ?? [],
            savedProfile: savedProfile
        )
    }

    func apply(_ event: TripStreamEvent) {
        switch event {
        case .destination(let trip):
            currentResult.trip = trip
            currentResult.requestId = trip.requestId ?? currentResult.requestId
            phase = .showingResults
            mark("weather", "active")
        case .weather(let weather):
            currentResult.weather = weather
            mark("weather", "done")
        case .itinerary(let plan):
            currentResult.tripPlan = plan
            mark("itinerary", "done")
        case .itineraryUpdate(let plan):
            currentResult.tripPlan = plan
            mark("itinerary", "done")
        case .packing(let packing):
            currentResult.packingList = packing
            mark("packing", "done")
        case .safety(let guidance):
            currentResult.carSeatGuidance = guidance
        case .done(let result):
            merge(result)
        case .fallback:
            mark("fallback", "active")
        case .error(let message):
            phase = .failed(message)
        }
    }

    private func merge(_ result: TripStreamResult) {
        currentResult.requestId = result.requestId ?? currentResult.requestId
        currentResult.trip = result.trip ?? currentResult.trip
        currentResult.weather = result.weather ?? currentResult.weather
        currentResult.tripPlan = result.tripPlan ?? currentResult.tripPlan
        currentResult.packingList = result.packingList ?? currentResult.packingList
        currentResult.travelSafety = result.travelSafety ?? currentResult.travelSafety
        currentResult.carSeatGuidance = result.carSeatGuidance ?? currentResult.carSeatGuidance
        currentResult.petSafety = result.petSafety ?? currentResult.petSafety
    }

    private func merge(_ bundle: TripBundleResponse) {
        currentResult.requestId = bundle.requestId
        currentResult.trip = bundle.trip
        currentResult.weather = bundle.weather
        currentResult.tripPlan = bundle.tripPlan
        currentResult.packingList = bundle.packingList
        currentResult.carSeatGuidance = bundle.safetyGuidance
    }

    private func mark(_ step: String, _ state: String) {
        progress[step] = state
    }
}
