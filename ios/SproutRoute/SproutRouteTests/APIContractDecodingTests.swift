import XCTest
@testable import SproutRoute

final class APIContractDecodingTests: XCTestCase {
    func testDecodesTripBundleFixture() throws {
        let json = """
        {
          "requestId": "req-1",
          "trip": {
            "destination": "San Diego, CA",
            "jurisdictionCode": "CA",
            "jurisdictionName": "California",
            "startDate": "2026-06-01",
            "endDate": "2026-06-03",
            "duration": 3,
            "activities": ["beach"],
            "children": [{"id":"child-0","age":3}],
            "countryCode": "US",
            "unitSystem": "imperial",
            "client": "ios",
            "schemaVersion": "1",
            "lat": 32.7157,
            "lon": -117.1611
          },
          "weather": {
            "summary": "Warm and sunny",
            "forecast": [
              {"name":"Mon","high":72,"low":62,"precipitation":10,"condition":"sunny"}
            ]
          },
          "tripPlan": {
            "overview": "A family beach trip.",
            "suggestedActivities": [
              {"id":"a1","name":"Balboa Park","category":"parks","description":"Museums and gardens","duration":"2 hours","kidFriendly":true,"weatherDependent":false,"bestDays":["Mon"],"reason":"Easy family pacing"}
            ],
            "dailyItinerary": [
              {"day":1,"activities":["a1"],"meals":"Dinner nearby","notes":"Bring stroller"}
            ],
            "tips": ["Start early"]
          },
          "packingList": {
            "categories": [
              {"name":"Kids","items":[{"name":"Sunscreen","quantity":"1","reason":"Sunny","searchQuery":"kids sunscreen","shopLinks":[{"store":"Amazon","url":"https://example.com"}]}]}
            ]
          }
        }
        """

        let response = try JSONDecoder.sproutRoute.decode(TripBundleResponse.self, from: Data(json.utf8))

        XCTAssertEqual(response.trip.client, "ios")
        XCTAssertEqual(response.tripPlan?.dailyItinerary.first?.day, "Day 1")
        XCTAssertEqual(response.packingList?.categories.first?.items.first?.shopLinks?.first?.store, "Amazon")
    }

    func testDecodesCapabilitiesWithIosFlags() throws {
        let json = """
        {
          "requestId": "req-2",
          "schemaVersion": "1",
          "supportedCountries": ["US", "CA", "GB", "AU"],
          "weatherProviders": {"US":"weathergov","other":"openweathermap"},
          "safetyModes": {"US":"us_state_law"},
          "featureFlags": {"shareLinks":false,"customItems":false,"darkMode":false,"pwa":false},
          "ios26Features": {"liquidGlass":false,"weatherKitFastPath":false,"foundationModelRecap":false,"appIntents":false}
        }
        """

        let capabilities = try JSONDecoder.sproutRoute.decode(CapabilityPayload.self, from: Data(json.utf8))

        XCTAssertEqual(capabilities.supportedCountries.count, 4)
        XCTAssertEqual(capabilities.ios26Features?.appIntents, false)
    }

    func testDecodesProductionParseInputFoodPreferencesShape() throws {
        let json = """
        {
          "destination": "San Diego, CA",
          "suggestedDestinations": [],
          "startDate": "2026-05-04",
          "endDate": "2026-05-09",
          "adults": 2,
          "childrenAges": [2],
          "pets": [{"type":"dog","breed":null,"ageMonths":null,"weightLb":null,"name":null}],
          "vibe": "beach",
          "tripGoals": ["Enjoy kid-friendly beach and parks time"],
          "mustHaves": ["Dog-friendly activities and lodging options"],
          "avoidances": [],
          "pacePreference": "moderate",
          "budgetSignals": [],
          "accommodationPreferences": ["Pet-friendly hotel or vacation rental"],
          "transportPreferences": ["Car"],
          "accessibilityNeeds": [],
          "scheduleConstraints": [],
          "celebrationContext": null,
          "specialNotes": ["Confirm each stop's dog policy."],
          "extraContext": ["5 days in San Diego works well."],
          "foodPreferences": {
            "dietary": [],
            "cuisines": [],
            "avoidances": [],
            "kidFoods": [],
            "budget": null
          },
          "detectedRegion": null,
          "tripShape": "single_destination",
          "stops": [],
          "countryTour": null
        }
        """

        let parsed = try JSONDecoder.sproutRoute.decode(ParsedTripInput.self, from: Data(json.utf8))

        XCTAssertEqual(parsed.destination, "San Diego, CA")
        XCTAssertEqual(parsed.childrenAges, [2])
        XCTAssertEqual(parsed.pets?.first?.type, "dog")
        XCTAssertEqual(parsed.foodPreferences?.dietary, [])
    }
}
