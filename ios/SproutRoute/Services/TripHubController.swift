import Foundation
import CoreLocation
import Observation
import Security

protocol GroupTripServicing {
    func createGroupTrip(_ payload: GroupTripCreateRequest) async throws -> GroupTripWorkspaceResponse
    func joinGroupTrip(_ payload: GroupTripJoinRequest) async throws -> GroupTripWorkspaceResponse
    func createGroupTripItem(_ payload: GroupTripItemCreateRequest) async throws -> GroupTripItemResponse
    func updateGroupTripItem(_ payload: GroupTripItemUpdateRequest) async throws -> GroupTripItemResponse
    func importGroupTripItemsText(_ payload: GroupTripItemsImportTextRequest) async throws -> GroupTripItemsImportTextResponse
    func createGroupTripDecision(_ payload: GroupTripDecisionCreateRequest) async throws -> GroupTripDecisionResponse
    func voteGroupTripDecision(_ payload: GroupTripDecisionVoteRequest) async throws -> GroupTripDecisionResponse
    func createGroupTripExpense(_ payload: GroupTripExpenseCreateRequest) async throws -> GroupTripExpenseResponse
    func groupTripSnapshot(tripId: String, participantId: String, participantAccessToken: String) async throws -> GroupTripSnapshotResponse
    func setGroupTripLocationSharing(_ payload: GroupTripLocationSharingRequest) async throws -> GroupTripLocationSharingResponse
}

extension SproutAPIClient: GroupTripServicing {}

struct TripHubCurrentLocation: Equatable, Hashable {
    var latitude: Double
    var longitude: Double
    var accuracyMeters: Double?
}

@MainActor
protocol TripHubLocationProviding {
    func currentLocation() async throws -> TripHubCurrentLocation
}

enum TripHubLocationError: LocalizedError, Equatable {
    case permissionDenied
    case unavailable
    case timedOut

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            "Location permission is off. Enable it in iOS Settings to share your current location."
        case .unavailable:
            "Current location is unavailable. Try again when your device has a location fix."
        case .timedOut:
            "Current location took too long. Try again when your device has a location fix."
        }
    }
}

@MainActor
final class CoreLocationTripHubLocationProvider: NSObject, TripHubLocationProviding, @preconcurrency CLLocationManagerDelegate {
    private let manager: CLLocationManager
    private var continuation: CheckedContinuation<TripHubCurrentLocation, Error>?

    override init() {
        manager = CLLocationManager()
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func currentLocation() async throws -> TripHubCurrentLocation {
        if continuation != nil {
            throw TripHubLocationError.unavailable
        }

        let authorizationStatus = manager.authorizationStatus
        if authorizationStatus == .denied || authorizationStatus == .restricted {
            throw TripHubLocationError.permissionDenied
        }

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            if authorizationStatus == .notDetermined {
                manager.requestWhenInUseAuthorization()
            } else {
                manager.requestLocation()
            }
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .denied, .restricted:
            finish(with: .failure(TripHubLocationError.permissionDenied))
        case .notDetermined:
            break
        @unknown default:
            finish(with: .failure(TripHubLocationError.unavailable))
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            finish(with: .failure(TripHubLocationError.unavailable))
            return
        }

        finish(with: .success(
            TripHubCurrentLocation(
                latitude: location.coordinate.latitude,
                longitude: location.coordinate.longitude,
                accuracyMeters: location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : nil
            )
        ))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finish(with: .failure(error))
    }

    private func finish(with result: Result<TripHubCurrentLocation, Error>) {
        guard let continuation else { return }
        self.continuation = nil
        continuation.resume(with: result)
    }
}

struct TripHubSession: Codable, Equatable, Hashable {
    var tripId: String
    var participantId: String
    var participantAccessToken: String
    var displayName: String
    var inviteCode: String
    var tripTitle: String
}

private struct TripHubSessionMetadata: Codable, Equatable, Hashable {
    var tripId: String
    var participantId: String
    var displayName: String
    var inviteCode: String
    var tripTitle: String

    init(session: TripHubSession) {
        tripId = session.tripId
        participantId = session.participantId
        displayName = session.displayName
        inviteCode = session.inviteCode
        tripTitle = session.tripTitle
    }

    func session(accessToken: String) -> TripHubSession {
        TripHubSession(
            tripId: tripId,
            participantId: participantId,
            participantAccessToken: accessToken,
            displayName: displayName,
            inviteCode: inviteCode,
            tripTitle: tripTitle
        )
    }
}

protocol TripHubSessionStoring {
    func loadSession() -> TripHubSession?
    func saveSession(_ session: TripHubSession)
    func clearSession()
}

protocol TripHubAccessTokenStoring {
    func loadToken(participantId: String) -> String?
    func saveToken(_ token: String, participantId: String)
    func clearToken(participantId: String)
}

final class KeychainTripHubAccessTokenStore: TripHubAccessTokenStoring {
    private let service: String

    init(service: String = "com.sproutroute.app.tripHub.participantToken") {
        self.service = service
    }

    func loadToken(participantId: String) -> String? {
        var query = baseQuery(participantId: participantId)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else {
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    func saveToken(_ token: String, participantId: String) {
        guard let data = token.data(using: .utf8) else { return }
        let query = baseQuery(participantId: participantId)
        let attributes: [String: Any] = [kSecValueData as String: data]

        if SecItemUpdate(query as CFDictionary, attributes as CFDictionary) == errSecSuccess {
            return
        }

        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    func clearToken(participantId: String) {
        SecItemDelete(baseQuery(participantId: participantId) as CFDictionary)
    }

    private func baseQuery(participantId: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: participantId
        ]
    }
}

final class UserDefaultsTripHubSessionStore: TripHubSessionStoring {
    private let defaults: UserDefaults
    private let key: String
    private let tokenStore: any TripHubAccessTokenStoring

    init(
        defaults: UserDefaults = .standard,
        key: String = "sproutroute.tripHub.activeSession",
        tokenStore: any TripHubAccessTokenStoring = KeychainTripHubAccessTokenStore()
    ) {
        self.defaults = defaults
        self.key = key
        self.tokenStore = tokenStore
    }

    func loadSession() -> TripHubSession? {
        guard let data = defaults.data(forKey: key) else { return nil }
        guard let metadata = try? JSONDecoder.sproutRoute.decode(TripHubSessionMetadata.self, from: data) else {
            clearSession()
            return nil
        }

        if let token = tokenStore.loadToken(participantId: metadata.participantId), !token.isEmpty {
            return metadata.session(accessToken: token)
        }

        if let legacy = try? JSONDecoder.sproutRoute.decode(TripHubSession.self, from: data),
           !legacy.participantAccessToken.isEmpty {
            tokenStore.saveToken(legacy.participantAccessToken, participantId: legacy.participantId)
            saveMetadata(TripHubSessionMetadata(session: legacy))
            return legacy
        }

        clearSession(metadata: metadata)
        return nil
    }

    func saveSession(_ session: TripHubSession) {
        tokenStore.saveToken(session.participantAccessToken, participantId: session.participantId)
        saveMetadata(TripHubSessionMetadata(session: session))
    }

    func clearSession() {
        if let data = defaults.data(forKey: key),
           let metadata = try? JSONDecoder.sproutRoute.decode(TripHubSessionMetadata.self, from: data) {
            tokenStore.clearToken(participantId: metadata.participantId)
        }
        defaults.removeObject(forKey: key)
    }

    private func clearSession(metadata: TripHubSessionMetadata) {
        tokenStore.clearToken(participantId: metadata.participantId)
        defaults.removeObject(forKey: key)
    }

    private func saveMetadata(_ metadata: TripHubSessionMetadata) {
        guard let data = try? JSONEncoder.sproutRoute.encode(metadata) else { return }
        defaults.set(data, forKey: key)
    }
}

enum TripHubPhase: Equatable {
    case onboarding
    case loading(String)
    case ready
    case failed(String)

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }
}

@MainActor
@Observable
final class TripHubController {
    var phase: TripHubPhase = .onboarding
    var snapshot: GroupTripSnapshotResponse?
    var currentParticipant: GroupTripParticipant?
    var activeSession: TripHubSession?

    private let service: any GroupTripServicing
    private let sessionStore: any TripHubSessionStoring
    private let locationProvider: any TripHubLocationProviding
    private let locationRequestTimeoutNanoseconds: UInt64

    init(
        service: any GroupTripServicing = SproutAPIClient(),
        sessionStore: any TripHubSessionStoring = UserDefaultsTripHubSessionStore(),
        locationProvider: (any TripHubLocationProviding)? = nil,
        locationRequestTimeoutNanoseconds: UInt64 = 15_000_000_000
    ) {
        self.service = service
        self.sessionStore = sessionStore
        self.locationProvider = locationProvider ?? CoreLocationTripHubLocationProvider()
        self.locationRequestTimeoutNanoseconds = locationRequestTimeoutNanoseconds
    }

    var isLocationSharingEnabled: Bool {
        currentParticipant?.locationSharingEnabled == true
    }

    func restoreSession() async {
        guard let session = sessionStore.loadSession() else {
            activeSession = nil
            currentParticipant = nil
            snapshot = nil
            phase = .onboarding
            return
        }

        activeSession = session
        await loadSnapshot(
            failureMessage: "Trip Hub could not restore this saved session. Create or join a trip to continue."
        )
    }

    func createTrip(
        title: String,
        destination: String,
        startDate: String,
        endDate: String,
        ownerName: String
    ) async {
        let input = NormalizedCreateInput(
            title: normalized(title),
            destination: normalized(destination),
            startDate: normalized(startDate),
            endDate: normalized(endDate),
            ownerName: normalized(ownerName)
        )

        guard input.isComplete else {
            phase = .failed("Trip name, destination, dates, and your name are required.")
            return
        }

        guard input.startDate <= input.endDate else {
            phase = .failed("End date must be on or after start date.")
            return
        }

        phase = .loading("Creating Trip Hub")
        do {
            let response = try await service.createGroupTrip(
                GroupTripCreateRequest(
                    title: input.title,
                    destination: input.destination,
                    startDate: input.startDate,
                    endDate: input.endDate,
                    ownerName: input.ownerName
                )
            )
            guard activate(response: response) else { return }
            await refreshSnapshot()
        } catch {
            phase = .failed(message(for: error))
        }
    }

    func joinTrip(inviteCode: String, displayName: String) async {
        let code = normalized(inviteCode).uppercased()
        let name = normalized(displayName)

        guard !code.isEmpty, !name.isEmpty else {
            phase = .failed("Invite code and your name are required.")
            return
        }

        phase = .loading("Joining Trip Hub")
        do {
            let response = try await service.joinGroupTrip(
                GroupTripJoinRequest(inviteCode: code, displayName: name)
            )
            guard activate(response: response) else { return }
            await refreshSnapshot()
        } catch {
            phase = .failed(message(for: error))
        }
    }

    func refreshSnapshot() async {
        await loadSnapshot(failureMessage: nil)
    }

    private func loadSnapshot(failureMessage: String?) async {
        guard let session = activeSession else {
            phase = .onboarding
            return
        }

        phase = .loading("Refreshing Trip Hub")
        do {
            let response = try await service.groupTripSnapshot(
                tripId: session.tripId,
                participantId: session.participantId,
                participantAccessToken: session.participantAccessToken
            )
            snapshot = response
            currentParticipant = response.participants.first { $0.id == session.participantId } ?? currentParticipant
            phase = .ready
        } catch {
            phase = .failed(failureMessage ?? message(for: error))
        }
    }

    func addTripHubItem(
        kind: String,
        title: String,
        startAt: String?,
        endAt: String?,
        locationName: String?,
        notes: String?,
        assignedParticipantIds: [String] = []
    ) async {
        guard let session = activeSession else {
            phase = .failed("Open a Trip Hub before adding itinerary items.")
            return
        }

        let itemKind = normalized(kind).lowercased()
        let itemTitle = normalized(title)
        let assignedParticipantIds = uniqueNormalized(assignedParticipantIds)

        guard !itemKind.isEmpty, !itemTitle.isEmpty else {
            phase = .failed("Item type and title are required.")
            return
        }

        phase = .loading("Adding timeline item")
        do {
            let response = try await service.createGroupTripItem(
                GroupTripItemCreateRequest(
                    tripId: session.tripId,
                    actorParticipantId: session.participantId,
                    actorParticipantAccessToken: session.participantAccessToken,
                    kind: itemKind,
                    title: itemTitle,
                    startAt: normalizedOptional(startAt),
                    endAt: normalizedOptional(endAt),
                    locationName: normalizedOptional(locationName),
                    notes: normalizedOptional(notes),
                    assignedParticipantIds: assignedParticipantIds
                )
            )
            applyItem(response)
            phase = .ready
        } catch {
            phase = .failed(message(for: error))
        }
    }

    func updateTripHubItem(
        itemId: String,
        kind: String,
        title: String,
        startAt: String?,
        endAt: String?,
        locationName: String?,
        notes: String?,
        assignedParticipantIds: [String] = []
    ) async {
        guard let session = activeSession else {
            phase = .failed("Open a Trip Hub before editing itinerary items.")
            return
        }

        let itemId = normalized(itemId)
        let itemKind = normalized(kind).lowercased()
        let itemTitle = normalized(title)
        let assignedParticipantIds = uniqueNormalized(assignedParticipantIds)

        guard !itemId.isEmpty, !itemKind.isEmpty, !itemTitle.isEmpty else {
            phase = .failed("Item type, title, and item id are required.")
            return
        }

        phase = .loading("Updating timeline item")
        do {
            let response = try await service.updateGroupTripItem(
                GroupTripItemUpdateRequest(
                    tripId: session.tripId,
                    actorParticipantId: session.participantId,
                    actorParticipantAccessToken: session.participantAccessToken,
                    itemId: itemId,
                    kind: itemKind,
                    title: itemTitle,
                    startAt: normalizedOptional(startAt),
                    endAt: normalizedOptional(endAt),
                    locationName: normalizedOptional(locationName),
                    notes: normalizedOptional(notes),
                    assignedParticipantIds: assignedParticipantIds
                )
            )
            applyItem(response)
            phase = .ready
        } catch {
            phase = .failed(message(for: error))
        }
    }

    func importTripHubItemsText(_ text: String) async {
        guard let session = activeSession else {
            phase = .failed("Open a Trip Hub before importing itinerary text.")
            return
        }

        let text = normalized(text)
        guard !text.isEmpty else {
            phase = .failed("Paste itinerary text before importing.")
            return
        }

        phase = .loading("Importing itinerary")
        do {
            let response = try await service.importGroupTripItemsText(
                GroupTripItemsImportTextRequest(
                    tripId: session.tripId,
                    actorParticipantId: session.participantId,
                    actorParticipantAccessToken: session.participantAccessToken,
                    text: text
                )
            )
            applyItemsImport(response)
            phase = .ready
        } catch {
            phase = .failed(message(for: error))
        }
    }

    func createDecision(title: String, options: [String]) async {
        guard let session = activeSession else {
            phase = .failed("Open a Trip Hub before creating decisions.")
            return
        }

        let decisionTitle = normalized(title)
        let decisionOptions = options
            .map(normalized)
            .filter { !$0.isEmpty }

        guard !decisionTitle.isEmpty else {
            phase = .failed("Decision title is required.")
            return
        }

        guard decisionOptions.count >= 2 else {
            phase = .failed("Add at least two decision options.")
            return
        }

        phase = .loading("Creating decision")
        do {
            let response = try await service.createGroupTripDecision(
                GroupTripDecisionCreateRequest(
                    tripId: session.tripId,
                    actorParticipantId: session.participantId,
                    actorParticipantAccessToken: session.participantAccessToken,
                    title: decisionTitle,
                    options: decisionOptions
                )
            )
            applyDecision(response)
            phase = .ready
        } catch {
            phase = .failed(message(for: error))
        }
    }

    func voteDecision(decisionId: String, optionId: String) async {
        guard let session = activeSession else {
            phase = .failed("Open a Trip Hub before voting.")
            return
        }

        let decisionId = normalized(decisionId)
        let optionId = normalized(optionId)

        guard !decisionId.isEmpty, !optionId.isEmpty else {
            phase = .failed("Choose an option before voting.")
            return
        }

        phase = .loading("Saving vote")
        do {
            let response = try await service.voteGroupTripDecision(
                GroupTripDecisionVoteRequest(
                    tripId: session.tripId,
                    decisionId: decisionId,
                    participantId: session.participantId,
                    participantAccessToken: session.participantAccessToken,
                    optionId: optionId
                )
            )
            applyDecision(response)
            phase = .ready
        } catch {
            phase = .failed(message(for: error))
        }
    }

    func createExpense(
        title: String,
        amountText: String,
        currency: String,
        paidByParticipantId: String,
        splitParticipantIds: [String]
    ) async {
        guard let session = activeSession else {
            phase = .failed("Open a Trip Hub before adding expenses.")
            return
        }

        let expenseTitle = normalized(title)
        let currency = normalized(currency).uppercased()
        let paidByParticipantId = normalized(paidByParticipantId)
        let splitParticipantIds = uniqueNormalized(splitParticipantIds)

        guard !expenseTitle.isEmpty else {
            phase = .failed("Expense title is required.")
            return
        }

        guard let amountCents = cents(from: amountText), amountCents > 0 else {
            phase = .failed("Enter an expense amount greater than zero.")
            return
        }

        guard !currency.isEmpty, !paidByParticipantId.isEmpty, !splitParticipantIds.isEmpty else {
            phase = .failed("Expense payer and split participants are required.")
            return
        }

        phase = .loading("Recording expense")
        do {
            let response = try await service.createGroupTripExpense(
                GroupTripExpenseCreateRequest(
                    tripId: session.tripId,
                    actorParticipantId: session.participantId,
                    actorParticipantAccessToken: session.participantAccessToken,
                    paidByParticipantId: paidByParticipantId,
                    title: expenseTitle,
                    amountCents: amountCents,
                    currency: currency,
                    splitParticipantIds: splitParticipantIds
                )
            )
            applyExpense(response)
            phase = .ready
        } catch {
            phase = .failed(message(for: error))
        }
    }

    func setLocationSharingEnabled(_ isEnabled: Bool) async {
        guard let session = activeSession else {
            phase = .failed("Open a Trip Hub before changing location sharing.")
            return
        }

        phase = .loading("Updating location sharing")
        do {
            let response = try await service.setGroupTripLocationSharing(
                GroupTripLocationSharingRequest(
                    tripId: session.tripId,
                    participantId: session.participantId,
                    participantAccessToken: session.participantAccessToken,
                    isEnabled: isEnabled
                )
            )
            currentParticipant = response.participant
            applyLocationSharing(response)
            phase = .ready
        } catch {
            phase = .failed(message(for: error))
        }
    }

    func shareCurrentLocation() async {
        guard let session = activeSession else {
            phase = .failed("Open a Trip Hub before sharing location.")
            return
        }

        phase = .loading("Sharing current location")
        do {
            let location = try await currentLocationWithTimeout()
            let response = try await service.setGroupTripLocationSharing(
                GroupTripLocationSharingRequest(
                    tripId: session.tripId,
                    participantId: session.participantId,
                    participantAccessToken: session.participantAccessToken,
                    isEnabled: true,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    accuracyMeters: location.accuracyMeters
                )
            )
            currentParticipant = response.participant
            applyLocationSharing(response)
            phase = .ready
        } catch {
            phase = .failed(message(for: error))
        }
    }

    private func currentLocationWithTimeout() async throws -> TripHubCurrentLocation {
        try await withThrowingTaskGroup(of: TripHubCurrentLocation.self) { group in
            defer { group.cancelAll() }

            group.addTask { @MainActor [locationProvider] in
                try await locationProvider.currentLocation()
            }
            group.addTask { [locationRequestTimeoutNanoseconds] in
                try await Task.sleep(nanoseconds: locationRequestTimeoutNanoseconds)
                throw TripHubLocationError.timedOut
            }

            guard let result = try await group.next() else {
                throw TripHubLocationError.unavailable
            }
            return result
        }
    }

    func leaveTripHub() {
        sessionStore.clearSession()
        activeSession = nil
        currentParticipant = nil
        snapshot = nil
        phase = .onboarding
    }

    private func activate(response: GroupTripWorkspaceResponse) -> Bool {
        guard let accessToken = response.currentParticipant.accessToken, !accessToken.isEmpty else {
            phase = .failed("Trip Hub could not start because the participant access token was missing.")
            return false
        }

        currentParticipant = response.currentParticipant
        let session = TripHubSession(
            tripId: response.trip.id,
            participantId: response.currentParticipant.id,
            participantAccessToken: accessToken,
            displayName: response.currentParticipant.displayName,
            inviteCode: response.trip.inviteCode,
            tripTitle: response.trip.title
        )
        activeSession = session
        sessionStore.saveSession(session)
        snapshot = GroupTripSnapshotResponse(
            requestId: response.requestId,
            trip: response.trip,
            participants: response.participants,
            items: [],
            decisions: [],
            expenses: [],
            balances: [],
            activity: [],
            aiSuggestions: []
        )
        return true
    }

    private func applyLocationSharing(_ response: GroupTripLocationSharingResponse) {
        guard var updatedSnapshot = snapshot else { return }
        if let index = updatedSnapshot.participants.firstIndex(where: { $0.id == response.participant.id }) {
            updatedSnapshot.participants[index] = response.participant
        } else {
            updatedSnapshot.participants.append(response.participant)
        }
        updatedSnapshot.activity.insert(response.activity, at: 0)
        snapshot = updatedSnapshot
    }

    private func applyItem(_ response: GroupTripItemResponse) {
        guard var updatedSnapshot = snapshot else { return }
        if let index = updatedSnapshot.items.firstIndex(where: { $0.id == response.item.id }) {
            updatedSnapshot.items[index] = response.item
        } else {
            updatedSnapshot.items.append(response.item)
        }
        updatedSnapshot.items.sort { ($0.startAt ?? "") < ($1.startAt ?? "") }
        updatedSnapshot.activity.insert(response.activity, at: 0)
        snapshot = updatedSnapshot
    }

    private func applyItemsImport(_ response: GroupTripItemsImportTextResponse) {
        guard var updatedSnapshot = snapshot else { return }
        for item in response.items {
            if let index = updatedSnapshot.items.firstIndex(where: { $0.id == item.id }) {
                updatedSnapshot.items[index] = item
            } else {
                updatedSnapshot.items.append(item)
            }
        }
        updatedSnapshot.items.sort { ($0.startAt ?? "") < ($1.startAt ?? "") }
        updatedSnapshot.activity.insert(response.activity, at: 0)
        snapshot = updatedSnapshot
    }

    private func applyDecision(_ response: GroupTripDecisionResponse) {
        guard var updatedSnapshot = snapshot else { return }
        if let index = updatedSnapshot.decisions.firstIndex(where: { $0.id == response.decision.id }) {
            updatedSnapshot.decisions[index] = response.decision
        } else {
            updatedSnapshot.decisions.append(response.decision)
        }
        if let activity = response.activity {
            updatedSnapshot.activity.insert(activity, at: 0)
        }
        snapshot = updatedSnapshot
    }

    private func applyExpense(_ response: GroupTripExpenseResponse) {
        guard var updatedSnapshot = snapshot else { return }
        if let index = updatedSnapshot.expenses.firstIndex(where: { $0.id == response.expense.id }) {
            updatedSnapshot.expenses[index] = response.expense
        } else {
            updatedSnapshot.expenses.append(response.expense)
        }
        updatedSnapshot.balances = response.balances
        updatedSnapshot.activity.insert(response.activity, at: 0)
        snapshot = updatedSnapshot
    }

    private func normalized(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func normalizedOptional(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = normalized(value)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func uniqueNormalized(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for value in values.map(normalized) where !value.isEmpty && !seen.contains(value) {
            seen.insert(value)
            result.append(value)
        }
        return result
    }

    private func cents(from amountText: String) -> Int? {
        let sanitized = normalized(amountText)
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: ",", with: "")
        guard var amount = Decimal(string: sanitized, locale: Locale(identifier: "en_US_POSIX")) else { return nil }
        var cents = Decimal()
        amount *= 100
        NSDecimalRound(&cents, &amount, 0, .plain)
        return NSDecimalNumber(decimal: cents).intValue
    }

    private func message(for error: Error) -> String {
        if let envelope = error as? ApiErrorEnvelope {
            return envelope.message
        }
        return error.localizedDescription
    }

    private struct NormalizedCreateInput {
        var title: String
        var destination: String
        var startDate: String
        var endDate: String
        var ownerName: String

        var isComplete: Bool {
            !title.isEmpty && !destination.isEmpty && !startDate.isEmpty && !endDate.isEmpty && !ownerName.isEmpty
        }
    }
}
