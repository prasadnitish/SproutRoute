import XCTest
@testable import SproutRoute

final class NativeUXRegressionTests: XCTestCase {
    func testBottomNavigationCentersGeneratedResultSections() {
        XCTAssertEqual(AppTab.allCases.map(\.title), ["Weather", "Itinerary", "Packing", "Safety"])
        XCTAssertFalse(AppTab.allCases.map(\.title).contains("Map"))
        XCTAssertFalse(AppTab.allCases.map(\.title).contains("Settings"))
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
        XCTAssertTrue(allCopy.contains("Delete all local trip data"))
        XCTAssertTrue(allCopy.contains("not legal advice"))
        XCTAssertTrue(allCopy.contains("WeatherKit"))
        XCTAssertTrue(allCopy.contains("nitish.prasad@gmail.com"))
    }
}
