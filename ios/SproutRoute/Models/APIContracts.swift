import Foundation

enum ClientPlatform: String, Codable {
    case ios
    case web
    case android
}

struct V1RequestMetadata: Codable, Hashable {
    var client: ClientPlatform = .ios
    var schemaVersion: String = "1"
    var countryCode: String?
    var unitSystem: String = Locale.current.measurementSystem == .metric ? "metric" : "imperial"
    var timezone: String = TimeZone.current.identifier
    var locale: String = Locale.current.identifier
}

struct CapabilityPayload: Codable, Hashable {
    var requestId: String?
    var schemaVersion: String
    var supportedCountries: [String]
    var weatherProviders: [String: String]
    var safetyModes: [String: String]
    var featureFlags: FeatureFlags
    var ios26Features: Ios26Features?
}

struct FeatureFlags: Codable, Hashable {
    var shareLinks: Bool
    var customItems: Bool
    var darkMode: Bool
    var pwa: Bool
    var internationalSupport: Bool?
    var ios26Features: Ios26Features?
}

struct Ios26Features: Codable, Hashable {
    var liquidGlass: Bool
    var weatherKitFastPath: Bool
    var foundationModelRecap: Bool
    var appIntents: Bool
}

struct ParseInputRequest: Codable, Hashable {
    var text: String
    var detectedLat: Double?
    var detectedLon: Double?
    var clientDate: String
}

struct ParsedTripInput: Codable, Hashable {
    var rawInput: String?
    var destination: String?
    var startDate: String?
    var endDate: String?
    var adults: Int?
    var childrenAges: [Int]?
    var vibe: String?
    var foodPreferences: FoodPreferences?
    var pets: [PetProfile]?
    var suggestedDestinations: [DestinationSuggestion]?
    var tripGoals: [String]?
    var mustHaves: [String]?
    var avoidances: [String]?
    var pacePreference: String?
    var budgetSignals: [String]?
    var accommodationPreferences: [String]?
    var transportPreferences: [String]?
    var accessibilityNeeds: [String]?
    var scheduleConstraints: [String]?
    var celebrationContext: String?
    var specialNotes: [String]?
    var extraContext: [String]?
}

struct FoodPreferences: Codable, Hashable {
    var dietary: [String]
    var cuisines: [String]
    var avoidances: [String]
    var kidFoods: [String]
    var budget: String?

    init(
        dietary: [String] = [],
        cuisines: [String] = [],
        avoidances: [String] = [],
        kidFoods: [String] = [],
        budget: String? = nil
    ) {
        self.dietary = dietary
        self.cuisines = cuisines
        self.avoidances = avoidances
        self.kidFoods = kidFoods
        self.budget = budget
    }

    enum CodingKeys: String, CodingKey {
        case dietary, cuisines, avoidances, kidFoods, budget
    }

    init(from decoder: Decoder) throws {
        if let keyed = try? decoder.container(keyedBy: CodingKeys.self) {
            dietary = (try? keyed.decodeIfPresent([String].self, forKey: .dietary)) ?? []
            cuisines = (try? keyed.decodeIfPresent([String].self, forKey: .cuisines)) ?? []
            avoidances = (try? keyed.decodeIfPresent([String].self, forKey: .avoidances)) ?? []
            kidFoods = (try? keyed.decodeIfPresent([String].self, forKey: .kidFoods)) ?? []
            budget = try? keyed.decodeIfPresent(String.self, forKey: .budget)
            return
        }

        let legacyValues = (try? decoder.singleValueContainer().decode([String].self)) ?? []
        dietary = legacyValues
        cuisines = []
        avoidances = []
        kidFoods = []
        budget = nil
    }
}

struct DestinationSuggestion: Codable, Hashable, Identifiable {
    var id: String { displayName ?? name }
    var name: String
    var displayName: String?
    var distanceMiles: Double?
    var why: String?
    var tripType: String?
    var coords: GeoCoordinates?
}

struct GeoCoordinates: Codable, Hashable {
    var lat: Double
    var lon: Double
    var countryCode: String?
    var regionCode: String?
    var displayName: String?
}

struct PetProfile: Codable, Hashable, Identifiable {
    var id: String?
    var type: String?
    var name: String?
    var breed: String?
    var weightLb: Double?
    var ageYears: Double?
    var specialNeeds: String?
}

struct ChildProfile: Codable, Hashable, Identifiable {
    var id: String?
    var age: Int
    var weightLb: Double?
    var heightIn: Double?
}

struct TripRequestPayload: Codable, Hashable {
    var client: ClientPlatform = .ios
    var schemaVersion: String = "1"
    var countryCode: String?
    var unitSystem: String = Locale.current.measurementSystem == .metric ? "metric" : "imperial"
    var timezone: String = TimeZone.current.identifier
    var locale: String = Locale.current.identifier
    var rawInput: String
    var destination: String
    var startDate: String
    var endDate: String
    var adults: Int?
    var childrenAges: [Int]
    var children: [ChildProfile]
    var activities: [String]
    var foodPreferences: FoodPreferences?
    var pets: [PetProfile]
    var tripGoals: [String]
    var mustHaves: [String]
    var avoidances: [String]
    var pacePreference: String
    var budgetSignals: [String]
    var accommodationPreferences: [String]
    var transportPreferences: [String]
    var accessibilityNeeds: [String]
    var scheduleConstraints: [String]
    var celebrationContext: String?
    var specialNotes: [String]
    var extraContext: [String]
    var savedProfile: UserTravelProfile?
}

struct TripMeta: Codable, Hashable, Identifiable {
    var id: String { requestId ?? destination }
    var requestId: String?
    var destination: String
    var jurisdictionCode: String?
    var jurisdictionName: String?
    var startDate: String
    var endDate: String
    var duration: Int?
    var activities: [String]?
    var children: [ChildProfile]?
    var countryCode: String?
    var regionCode: String?
    var unitSystem: String?
    var client: String?
    var schemaVersion: String?
    var lat: Double?
    var lon: Double?
}

struct WeatherForecast: Codable, Hashable {
    var summary: String?
    var forecast: [WeatherPeriod]
}

struct WeatherPeriod: Codable, Hashable, Identifiable {
    var id: String { "\(name ?? date ?? UUID().uuidString)" }
    var name: String?
    var date: String?
    var high: Double?
    var low: Double?
    var precipitation: Double?
    var condition: String?
    var emoji: String?
}

enum WeatherValueFormatter {
    static func temperature(_ value: Double?) -> String {
        guard let value else { return "-" }
        return "\(Int(value.rounded()))°F"
    }

    static func percent(_ value: Double?, sourceUsesFraction: Bool) -> String {
        guard let value else { return "-" }
        let normalized = sourceUsesFraction ? value * 100 : value
        return "\(Int(normalized.rounded()))%"
    }
}

struct TripPlanResult: Codable, Hashable {
    var overview: String?
    var suggestedActivities: [TripActivity]
    var dailyItinerary: [ItineraryDay]
    var tips: [String]
    var scheduledItinerary: [ScheduledItineraryDay]? = nil
}

struct TripActivity: Codable, Hashable, Identifiable {
    var id: String
    var name: String
    var category: String?
    var description: String?
    var duration: String?
    var kidFriendly: Bool?
    var petFriendly: Bool?
    var weatherDependent: Bool?
    var bestDays: [String]?
    var reason: String?
    var lat: Double?
    var lon: Double?
}

struct ItineraryDay: Codable, Hashable, Identifiable {
    var id: String { date ?? day }
    var day: String
    var date: String?
    var activities: [String]
    var meals: String?
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case day, date, activities, meals, notes
    }

    init(day: String, date: String? = nil, activities: [String], meals: String? = nil, notes: String? = nil) {
        self.day = day
        self.date = date
        self.activities = activities
        self.meals = meals
        self.notes = notes
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let stringDay = try? container.decode(String.self, forKey: .day) {
            day = stringDay
        } else if let intDay = try? container.decode(Int.self, forKey: .day) {
            day = "Day \(intDay)"
        } else {
            day = "Day"
        }
        date = try? container.decodeIfPresent(String.self, forKey: .date)
        activities = (try? container.decode([String].self, forKey: .activities)) ?? []
        meals = try? container.decodeIfPresent(String.self, forKey: .meals)
        notes = try? container.decodeIfPresent(String.self, forKey: .notes)
    }
}

struct ScheduledItineraryDay: Codable, Hashable, Identifiable {
    var id: String { date ?? notes ?? scheduled.map(\.name).joined(separator: "-") }
    var date: String?
    var scheduled: [ScheduledActivity]
    var warnings: [ItineraryWarning]?
    var notes: String?
}

struct ScheduledActivity: Codable, Hashable, Identifiable {
    var id: String { explicitId ?? "\(name)-\(scheduledStart ?? "")" }
    var explicitId: String?
    var name: String
    var title: String?
    var category: String?
    var description: String?
    var scheduledStart: String?
    var scheduledEnd: String?
    var duration: Double?
    var status: String?
    var warning: String?
    var openingHours: String?
    var enriched: ScheduledPlaceEnrichment?
    var isMeal: Bool?
    var mealType: String?
    var cuisine: String?
    var note: String?
    var petFriendly: Bool?
    var mapQuery: String?

    enum CodingKeys: String, CodingKey {
        case explicitId = "id"
        case name, title, category, description, scheduledStart, scheduledEnd, duration, status, warning, openingHours, enriched, isMeal, mealType, cuisine, note, petFriendly, mapQuery
    }
}

struct ScheduledPlaceEnrichment: Codable, Hashable {
    var rating: Double?
    var priceLevel: Int?
    var address: String?
    var photos: [String]?
    var mapsUrl: String?
}

struct ItineraryWarning: Codable, Hashable, Identifiable {
    var id: String { [activity, type, message].compactMap { $0 }.joined(separator: "-") }
    var activity: String?
    var type: String?
    var message: String?
}

struct PackingList: Codable, Hashable {
    var categories: [PackingCategory]
}

struct PackingCategory: Codable, Hashable, Identifiable {
    var id: String { name }
    var name: String
    var items: [PackingItem]
}

struct PackingItem: Codable, Hashable, Identifiable {
    var id: String { "\(name)-\(quantity ?? "")" }
    var name: String
    var quantity: String?
    var reason: String?
    var source: String?
    var searchQuery: String?
    var shopLinks: [ShopLink]?
}

struct ShopLink: Codable, Hashable, Identifiable {
    var id: String { store + url }
    var store: String
    var url: String
    var color: String?
}

struct TripBundleResponse: Codable, Hashable {
    var requestId: String?
    var trip: TripMeta
    var weather: WeatherForecast?
    var tripPlan: TripPlanResult?
    var packingList: PackingList?
    var safetyGuidance: CarSeatGuidance?
    var scheduledItinerary: [ScheduledItineraryDay]?

    enum CodingKeys: String, CodingKey {
        case requestId, trip, weather, tripPlan, packingList, safetyGuidance, scheduledItinerary
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        requestId = try? container.decodeIfPresent(String.self, forKey: .requestId)
        trip = try container.decode(TripMeta.self, forKey: .trip)
        weather = try? container.decodeIfPresent(WeatherForecast.self, forKey: .weather)
        packingList = try? container.decodeIfPresent(PackingList.self, forKey: .packingList)
        safetyGuidance = try? container.decodeIfPresent(CarSeatGuidance.self, forKey: .safetyGuidance)
        scheduledItinerary = try? container.decodeIfPresent([ScheduledItineraryDay].self, forKey: .scheduledItinerary)
        tripPlan = try? container.decodeIfPresent(TripPlanResult.self, forKey: .tripPlan)
        if scheduledItinerary?.isEmpty == false {
            tripPlan?.scheduledItinerary = scheduledItinerary
        }
    }
}

struct TripPackingResponse: Codable, Hashable {
    var requestId: String?
    var trip: TripMeta
    var weather: WeatherForecast?
    var packingList: PackingList
}

struct TravelSafetyResponse: Codable, Hashable {
    var advisoryLevel: String?
    var emergencyNumber: String?
    var waterSafety: String?
    var healthTips: [String]?
    var familyTips: [String]?
    var localCustoms: [String]?
    var carSeatLaw: String?
    var source: String?
}

struct CarSeatGuidance: Codable, Hashable {
    var requestId: String?
    var status: String
    var jurisdictionCode: String?
    var jurisdictionName: String?
    var guidanceMode: String?
    var confidence: String?
    var sourceAuthority: String?
    var lastReviewed: String?
    var message: String?
    var sourceUrl: String?
    var effectiveDate: String?
    var results: [ChildCarSeatResult]
}

struct ChildCarSeatResult: Codable, Hashable, Identifiable {
    var id: String { childId }
    var childId: String
    var ageYears: Double?
    var weightLb: Double?
    var heightIn: Double?
    var status: String
    var requiredRestraint: String
    var requiredRestraintLabel: String?
    var seatPosition: String?
    var rationale: String?
    var sourceUrl: String?
    var effectiveDate: String?
}

struct PetTravelResponse: Codable, Hashable {
    var status: String?
    var recommendation: String?
    var driveTips: [String]?
    var localTips: [String]?
    var breedWarnings: [String]?
    var entryRequirements: JSONValue?
    var airlinePolicies: JSONValue?
}

struct PlaceEnrichmentResponse: Codable, Hashable {
    var name: String?
    var address: String?
    var rating: Double?
    var userRatingsTotal: Int?
    var website: String?
    var phone: String?
    var photoUrl: String?
    var openingHours: [String]?
}

struct GroupTripCreateRequest: Codable, Hashable {
    var title: String
    var destination: String
    var startDate: String
    var endDate: String
    var ownerName: String
}

struct GroupTripJoinRequest: Codable, Hashable {
    var inviteCode: String
    var displayName: String
}

struct GroupTripItemCreateRequest: Codable, Hashable {
    var tripId: String
    var actorParticipantId: String
    var actorParticipantAccessToken: String
    var kind: String
    var title: String
    var startAt: String?
    var endAt: String?
    var locationName: String?
    var notes: String?
}

struct GroupTripDecisionCreateRequest: Codable, Hashable {
    var tripId: String
    var actorParticipantId: String
    var actorParticipantAccessToken: String
    var title: String
    var options: [String]
}

struct GroupTripDecisionVoteRequest: Codable, Hashable {
    var tripId: String
    var decisionId: String
    var participantId: String
    var participantAccessToken: String
    var optionId: String
}

struct GroupTripExpenseCreateRequest: Codable, Hashable {
    var tripId: String
    var actorParticipantId: String
    var actorParticipantAccessToken: String
    var paidByParticipantId: String
    var title: String
    var amountCents: Int
    var currency: String
    var splitParticipantIds: [String]
}

struct GroupTripLocationSharingRequest: Codable, Hashable {
    var tripId: String
    var participantId: String
    var participantAccessToken: String
    var isEnabled: Bool
    var latitude: Double? = nil
    var longitude: Double? = nil
    var accuracyMeters: Double? = nil
}

struct GroupTripWorkspace: Codable, Hashable, Identifiable {
    var id: String
    var title: String
    var destination: String
    var startDate: String
    var endDate: String
    var inviteCode: String
    var status: String
    var createdAt: String?
    var updatedAt: String?
}

enum GroupTripParticipantRole: String, Codable, Hashable {
    case owner
    case editor
}

struct GroupTripParticipant: Codable, Hashable, Identifiable {
    var id: String
    var tripId: String
    var displayName: String
    var role: GroupTripParticipantRole
    var locationSharingEnabled: Bool? = nil
    var lastLocation: GroupTripParticipantLocation? = nil
    var accessToken: String? = nil
    var joinedAt: String?
}

struct GroupTripParticipantLocation: Codable, Hashable {
    var latitude: Double
    var longitude: Double
    var accuracyMeters: Double?
    var updatedAt: String?
}

struct GroupTripItem: Codable, Hashable, Identifiable {
    var id: String
    var tripId: String
    var kind: String
    var title: String
    var startAt: String?
    var endAt: String?
    var locationName: String?
    var notes: String?
    var status: String
    var createdByParticipantId: String
    var createdAt: String?
    var updatedAt: String?
}

struct GroupTripDecisionOption: Codable, Hashable, Identifiable {
    var id: String
    var title: String
}

struct GroupTripDecisionVote: Codable, Hashable {
    var participantId: String
    var optionId: String
    var updatedAt: String?
}

struct GroupTripDecision: Codable, Hashable, Identifiable {
    var id: String
    var tripId: String
    var title: String
    var status: String
    var options: [GroupTripDecisionOption]
    var votes: [GroupTripDecisionVote]
    var createdByParticipantId: String
    var createdAt: String?
    var updatedAt: String?
}

struct GroupTripExpense: Codable, Hashable, Identifiable {
    var id: String
    var tripId: String
    var title: String
    var amountCents: Int
    var currency: String
    var paidByParticipantId: String
    var splitParticipantIds: [String]
    var createdByParticipantId: String
    var createdAt: String?
    var updatedAt: String?
}

struct GroupTripBalance: Codable, Hashable {
    var fromParticipantId: String
    var toParticipantId: String
    var amountCents: Int
    var currency: String
}

struct GroupTripActivityEvent: Codable, Hashable, Identifiable {
    var id: String
    var tripId: String
    var type: String
    var actorParticipantId: String?
    var summary: String
    var createdAt: String?
}

struct GroupTripAISuggestion: Codable, Hashable, Identifiable {
    var id: String
    var tripId: String?
    var type: String
    var severity: String?
    var title: String
    var summary: String
    var status: String
    var relatedItemIds: [String]?
}

struct GroupTripWorkspaceResponse: Codable, Hashable {
    var requestId: String?
    var trip: GroupTripWorkspace
    var currentParticipant: GroupTripParticipant
    var participants: [GroupTripParticipant]
}

struct GroupTripSnapshotResponse: Codable, Hashable {
    var requestId: String?
    var trip: GroupTripWorkspace
    var participants: [GroupTripParticipant]
    var items: [GroupTripItem]
    var decisions: [GroupTripDecision]
    var expenses: [GroupTripExpense]
    var balances: [GroupTripBalance]
    var activity: [GroupTripActivityEvent]
    var aiSuggestions: [GroupTripAISuggestion]
}

struct GroupTripItemResponse: Codable, Hashable {
    var requestId: String?
    var item: GroupTripItem
    var activity: GroupTripActivityEvent
}

struct GroupTripDecisionResponse: Codable, Hashable {
    var requestId: String?
    var decision: GroupTripDecision
    var activity: GroupTripActivityEvent?
}

struct GroupTripExpenseResponse: Codable, Hashable {
    var requestId: String?
    var expense: GroupTripExpense
    var balances: [GroupTripBalance]
    var activity: GroupTripActivityEvent
}

struct GroupTripLocationSharingResponse: Codable, Hashable {
    var requestId: String?
    var participant: GroupTripParticipant
    var activity: GroupTripActivityEvent
}

struct ApiErrorEnvelope: Codable, Error, LocalizedError, Hashable {
    var code: String?
    var message: String
    var category: String?
    var retryable: Bool?
    var requestId: String?

    var errorDescription: String? { message }
}

struct TripStreamResult: Codable, Hashable {
    var requestId: String?
    var trip: TripMeta?
    var weather: WeatherForecast?
    var tripPlan: TripPlanResult?
    var packingList: PackingList?
    var travelSafety: TravelSafetyResponse?
    var carSeatGuidance: CarSeatGuidance?
    var petSafety: PetTravelResponse?
    var parsed: ParsedTripInput?
}

enum TripStreamEvent: Hashable {
    case destination(TripMeta)
    case weather(WeatherForecast)
    case itinerary(TripPlanResult)
    case itineraryUpdate(TripPlanResult)
    case packing(PackingList)
    case safety(CarSeatGuidance)
    case fallback
    case done(TripStreamResult)
    case error(String)
}

enum JSONValue: Codable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}
