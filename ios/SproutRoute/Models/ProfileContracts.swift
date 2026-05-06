import Foundation

struct ProfileSectionMeta: Codable, Hashable {
    var confidence: String?
    var sourceBasis: [String]?
    var summary: String?
    var updatedAt: String?
}

struct FoodProfile: Codable, Hashable {
    var cuisinesLiked: [String]
    var cuisinesDisliked: [String]
    var dietaryRestrictions: [String]
    var kidFoods: [String]
    var foodAdventurousness: String
    var notes: String
    var meta: ProfileSectionMeta?
}

struct TravelStyleProfile: Codable, Hashable {
    var pace: String
    var planningStyle: String
    var accommodationPreference: String
    var transportPreference: String
    var notes: String
    var meta: ProfileSectionMeta?
}

struct ActivityProfile: Codable, Hashable {
    var preferredActivities: [String]
    var dislikedActivities: [String]
    var activityIntensity: String
    var notes: String
    var meta: ProfileSectionMeta?
}

struct PersonalityTravelProfile: Codable, Hashable {
    var travelerType: String
    var noveltyVsComfort: Int?
    var crowdTolerance: String
    var notes: String
    var meta: ProfileSectionMeta?
}

struct FamilyContextProfile: Codable, Hashable {
    var travelingWith: String
    var kidsDetails: String
    var kidPreferences: String
    var petContext: String?
    var notes: String
    var meta: ProfileSectionMeta?
}

struct ConstraintProfile: Codable, Hashable {
    var budgetRange: String
    var timeConstraints: String
    var accessibilityNeeds: String
    var notes: String
    var meta: ProfileSectionMeta?
}

struct TripPriorityProfile: Codable, Hashable {
    var mustHaves: [String]
    var avoidances: [String]
    var notes: String
    var meta: ProfileSectionMeta?
}

struct UserTravelProfile: Codable, Hashable {
    var id: String?
    var userId: String?
    var version: Int?
    var food: FoodProfile?
    var travelStyle: TravelStyleProfile?
    var activities: ActivityProfile?
    var personality: PersonalityTravelProfile?
    var family: FamilyContextProfile?
    var constraints: ConstraintProfile?
    var priorities: TripPriorityProfile?
    var profileSummary: String?
    var unknowns: [String]?
    var createdAt: String?
    var updatedAt: String?
}

struct ProfileValidateResponse: Codable, Hashable {
    var valid: Bool
    var errors: [String]
    var warnings: [String]
    var detectedFormat: String
}

struct ProfileNormalizeResponse: Codable, Hashable {
    var normalizedProfile: UserTravelProfile
    var providerHint: String?
}
