import SwiftUI

struct ComplianceContentSection: Hashable, Identifiable {
    var id: String { heading }
    var heading: String
    var body: String
    var bullets: [String] = []
}

enum CompliancePage: String, CaseIterable, Identifiable {
    case privacy
    case privacyChoices
    case terms
    case safetyDisclosures
    case support

    var id: String { rawValue }

    var title: String {
        switch self {
        case .privacy: "Privacy Policy"
        case .privacyChoices: "Privacy Choices"
        case .terms: "Terms of Service"
        case .safetyDisclosures: "Safety and AI Disclosures"
        case .support: "Support"
        }
    }

    var systemImage: String {
        switch self {
        case .privacy: "lock.shield"
        case .privacyChoices: "slider.horizontal.3"
        case .terms: "doc.text"
        case .safetyDisclosures: "exclamationmark.shield"
        case .support: "questionmark.circle"
        }
    }

    var canonicalURL: URL {
        switch self {
        case .privacy:
            URL(string: "https://www.sproutroute.app/privacy.html")!
        case .privacyChoices:
            URL(string: "https://www.sproutroute.app/privacy-choices.html")!
        case .terms:
            URL(string: "https://www.sproutroute.app/terms.html")!
        case .safetyDisclosures:
            URL(string: "https://www.sproutroute.app/safety-disclosures.html")!
        case .support:
            URL(string: "https://www.sproutroute.app/support.html")!
        }
    }

    var sections: [ComplianceContentSection] {
        switch self {
        case .privacy:
            [
                ComplianceContentSection(
                    heading: "What SproutRoute is",
                    body: "SproutRoute is a family trip planning assistant for parents and guardians. It is not directed to children under 13, and children should not use the app directly."
                ),
                ComplianceContentSection(
                    heading: "Information used to plan trips",
                    body: "SproutRoute sends trip planning content to the SproutRoute backend when you ask it to generate a plan. That may include destination, dates, family composition, pets, food preferences, accessibility needs, packing context, and any free-text details you choose to type.",
                    bullets: [
                        "Avoid entering unnecessary child names, medical details, legal details, or other sensitive information.",
                        "Saved trips, imported profiles, packing progress, cached weather, widget snapshots, Spotlight records, local notification plans, and Live Activity payloads are stored locally on this device or in the app's App Group container.",
                        "Trip Hub location sharing sends your current location to the backend only when you explicitly share it, and turning sharing off clears the last location from the shared trip state."
                    ]
                ),
                ComplianceContentSection(
                    heading: "Optional analytics",
                    body: "Share Product Analytics is off by default. If you turn it on, SproutRoute may send aggregate product events such as selected tab, planning status, prompt length bucket, trip duration, destination country or region, child age buckets, and pet type categories.",
                    bullets: [
                        "iOS analytics does not send raw trip prompts, profile JSON, child names, pet names, pet breeds, special-needs notes, precise GPS, attraction text, custom packing item text, session replay, advertising identifiers, or cross-app tracking data.",
                        "Turning analytics off stops future product analytics and resets the local analytics identifier."
                    ]
                ),
                ComplianceContentSection(
                    heading: "Third-party services",
                    body: "SproutRoute may use AI providers, weather providers, geocoding and places providers, Apple services, Railway, Cloudflare, Supabase, and PostHog where configured to operate the product. Each provider should receive only the information reasonably needed for the task."
                )
            ]
        case .privacyChoices:
            [
                ComplianceContentSection(
                    heading: "Delete all local trip data",
                    body: "Use Delete all local trip data in Settings to remove saved trips, imported profiles, packing progress, cached weather, notification plans, widget snapshots, Live Activity state, and the local analytics identifier from this device."
                ),
                ComplianceContentSection(
                    heading: "Manage permissions",
                    body: "Location and notification permissions can be managed in iOS Settings. SproutRoute can still plan from a typed destination if location permission is off.",
                    bullets: [
                        "Trip Hub location sharing is off until you turn it on or share your current location.",
                        "Remove widgets from the Home Screen or delete local trip data to clear local extension surfaces.",
                        "Turn off Share Product Analytics in Settings to stop future iOS product analytics and reset the local analytics identifier."
                    ]
                ),
                ComplianceContentSection(
                    heading: "Server-side deletion",
                    body: "For server-side deletion or privacy questions, email nitish.prasad@gmail.com with the subject SproutRoute data deletion request. Include the email address you used with SproutRoute if any."
                )
            ]
        case .terms:
            [
                ComplianceContentSection(
                    heading: "Use of SproutRoute",
                    body: "SproutRoute is for parents and guardians planning family travel. You are responsible for the information you enter, the plans you choose to follow, and verifying important details before travel."
                ),
                ComplianceContentSection(
                    heading: "No professional advice",
                    body: "SproutRoute output is informational only and is not legal advice, medical advice, veterinary advice, aviation advice, emergency advice, or professional safety advice."
                ),
                ComplianceContentSection(
                    heading: "Availability and accuracy",
                    body: "AI output, weather forecasts, venue information, maps, packing suggestions, pet travel guidance, and safety summaries can be wrong, incomplete, delayed, or outdated. Always check official sources."
                )
            ]
        case .safetyDisclosures:
            [
                ComplianceContentSection(
                    heading: "AI and safety-sensitive output",
                    body: "AI can summarize and organize information, but it must not be treated as a legal authority. Safety, car-seat, pet travel, and advisory cards should be reviewed against official sources before you rely on them."
                ),
                ComplianceContentSection(
                    heading: "Car-seat and pet travel",
                    body: "Car-seat and pet travel guidance is informational only and not legal advice. Check local authorities, airlines, veterinarians, accommodations, and government agencies before travel."
                ),
                ComplianceContentSection(
                    heading: "Weather and WeatherKit",
                    body: "Weather forecasts change. Backend weather helps generate the original plan, while iOS may use Apple Weather and WeatherKit for destination forecast refreshes and local reminders. Always check official weather alerts and local conditions."
                )
            ]
        case .support:
            [
                ComplianceContentSection(
                    heading: "Contact",
                    body: "For support, privacy requests, deletion help, App Store review questions, or safety-content concerns, email nitish.prasad@gmail.com."
                ),
                ComplianceContentSection(
                    heading: "Useful details to include",
                    body: "Include your device model, iOS version, what you typed, what you expected, and what happened. Do not send unnecessary child names, medical details, or sensitive legal information."
                ),
                ComplianceContentSection(
                    heading: "Known review-sensitive areas",
                    body: "Weather, maps, places, car-seat, pet travel, travel advisories, notifications, widgets, Spotlight, App Intents, and Live Activities may behave differently by device, region, permission state, and network availability."
                )
            ]
        }
    }
}

struct CompliancePageView: View {
    let page: CompliancePage

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Label(page.title, systemImage: page.systemImage)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(SproutTheme.primaryText)

                ForEach(page.sections) { section in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(section.heading)
                            .font(.headline)
                            .foregroundStyle(SproutTheme.primaryText)
                        Text(section.body)
                            .font(.body)
                            .foregroundStyle(SproutTheme.secondaryText)
                        ForEach(section.bullets, id: \.self) { bullet in
                            Label(bullet, systemImage: "checkmark.circle")
                                .font(.subheadline)
                                .foregroundStyle(SproutTheme.secondaryText)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(SproutTheme.elevatedSurface, in: RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous))
                }

                Link(destination: page.canonicalURL) {
                    Label("Open web version", systemImage: "safari")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SproutSecondaryButtonStyle())
            }
            .padding(.horizontal, SproutTheme.spacing.lg)
            .padding(.top, SproutTheme.spacing.md)
            .padding(.bottom, SproutTheme.spacing.xxl)
        }
        .sproutScreenBackground()
        .navigationTitle(page.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
