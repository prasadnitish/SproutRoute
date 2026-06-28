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
          "featureFlags": {"shareLinks":true,"customItems":true,"darkMode":false,"pwa":false,"internationalSupport":true},
          "ios26Features": {"liquidGlass":false,"weatherKitFastPath":true,"foundationModelRecap":true,"appIntents":true}
        }
        """

        let capabilities = try JSONDecoder.sproutRoute.decode(CapabilityPayload.self, from: Data(json.utf8))

        XCTAssertEqual(capabilities.supportedCountries.count, 4)
        XCTAssertEqual(capabilities.featureFlags.shareLinks, true)
        XCTAssertEqual(capabilities.featureFlags.customItems, true)
        XCTAssertEqual(capabilities.ios26Features?.weatherKitFastPath, true)
        XCTAssertEqual(capabilities.ios26Features?.foundationModelRecap, true)
        XCTAssertEqual(capabilities.ios26Features?.appIntents, true)
        XCTAssertEqual(capabilities.featureFlags.internationalSupport, true)
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

    func testDecodesGroupTripSnapshotFixture() throws {
        let json = """
        {
          "requestId": "req-1",
          "trip": {
            "id": "trip_abc123",
            "title": "Vegas 2026",
            "destination": "Las Vegas, NV",
            "startDate": "2026-09-18",
            "endDate": "2026-09-21",
            "inviteCode": "VEGAS1",
            "status": "active",
            "createdAt": "2026-06-28T12:00:00.000Z",
            "updatedAt": "2026-06-28T12:00:00.000Z"
          },
          "participants": [
            {
              "id": "participant_1",
              "tripId": "trip_abc123",
              "displayName": "Nitish",
              "role": "owner",
              "joinedAt": "2026-06-28T12:00:00.000Z"
            }
          ],
          "items": [
            {
              "id": "item_1",
              "tripId": "trip_abc123",
              "kind": "flight",
              "title": "Arrive at LAS",
              "startAt": "2026-09-18T17:30:00Z",
              "endAt": "2026-09-18T18:45:00Z",
              "locationName": "Harry Reid International Airport",
              "notes": "Share confirmation numbers.",
              "status": "planned",
              "createdByParticipantId": "participant_1",
              "createdAt": "2026-06-28T12:10:00.000Z",
              "updatedAt": "2026-06-28T12:10:00.000Z"
            }
          ],
          "decisions": [
            {
              "id": "decision_1",
              "tripId": "trip_abc123",
              "title": "Friday dinner",
              "status": "open",
              "options": [
                {"id": "option_1", "title": "Best Friend"},
                {"id": "option_2", "title": "Din Tai Fung"}
              ],
              "votes": [
                {
                  "participantId": "participant_1",
                  "optionId": "option_2",
                  "updatedAt": "2026-06-28T12:15:00.000Z"
                }
              ],
              "createdByParticipantId": "participant_1",
              "createdAt": "2026-06-28T12:12:00.000Z",
              "updatedAt": "2026-06-28T12:15:00.000Z"
            }
          ],
          "expenses": [
            {
              "id": "expense_1",
              "tripId": "trip_abc123",
              "title": "Hotel deposit",
              "amountCents": 48000,
              "currency": "USD",
              "paidByParticipantId": "participant_1",
              "splitParticipantIds": ["participant_1"],
              "createdByParticipantId": "participant_1",
              "createdAt": "2026-06-28T12:20:00.000Z",
              "updatedAt": "2026-06-28T12:20:00.000Z"
            }
          ],
          "balances": [
            {
              "fromParticipantId": "participant_2",
              "toParticipantId": "participant_1",
              "amountCents": 24000,
              "currency": "USD"
            }
          ],
          "activity": [
            {
              "id": "activity_1",
              "tripId": "trip_abc123",
              "type": "item_created",
              "actorParticipantId": "participant_1",
              "summary": "Nitish added Arrive at LAS",
              "createdAt": "2026-06-28T12:10:00.000Z"
            }
          ],
          "aiSuggestions": [
            {
              "id": "suggestion_trip_abc123_setup",
              "tripId": "trip_abc123",
              "type": "setup",
              "severity": "info",
              "title": "Add the core logistics",
              "summary": "Flights, hotel, airport transfers, and first meetup details should be added before inviting the full group.",
              "status": "open",
              "relatedItemIds": []
            }
          ]
        }
        """

        let snapshot = try JSONDecoder.sproutRoute.decode(GroupTripSnapshotResponse.self, from: Data(json.utf8))

        XCTAssertEqual(snapshot.trip.title, "Vegas 2026")
        XCTAssertEqual(snapshot.participants.first?.role, .owner)
        XCTAssertEqual(snapshot.items.first?.createdByParticipantId, "participant_1")
        XCTAssertEqual(snapshot.decisions.first?.options.count, 2)
        XCTAssertEqual(snapshot.decisions.first?.votes.first?.optionId, "option_2")
        XCTAssertEqual(snapshot.expenses.first?.amountCents, 48000)
        XCTAssertEqual(snapshot.balances.first?.amountCents, 24000)
        XCTAssertEqual(snapshot.activity.first?.type, "item_created")
        XCTAssertEqual(snapshot.aiSuggestions.first?.type, "setup")
    }
}
