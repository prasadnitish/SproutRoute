# SproutRoute App Store Submission Compliance Notes

Last updated: May 6, 2026

This document is a product and submission-readiness checklist, not legal advice. Have counsel review the public pages and App Store Connect answers before external launch.

## Public URLs

Use these canonical URLs in App Store Connect and in reviewer notes:

- Privacy Policy URL: `https://www.sproutroute.app/privacy.html`
- User Privacy Choices URL: `https://www.sproutroute.app/privacy-choices.html`
- Support URL: `https://www.sproutroute.app/support.html`
- Terms of Service: `https://www.sproutroute.app/terms.html`
- Safety and AI Disclosures: `https://www.sproutroute.app/safety-disclosures.html`

## Positioning

SproutRoute should be described as:

> A family trip planning assistant for parents and guardians that creates itinerary, weather, packing, pet travel, and safety planning summaries.

Avoid positioning that implies SproutRoute is:

- A legal authority for car-seat, airline, pet entry, or travel rules.
- A child-directed app or Kids Category app.
- An emergency, medical, veterinary, aviation, or professional safety tool.
- A source of guaranteed real-time weather, routing, venue, or safety truth.

## App Review notes

Suggested reviewer note:

> SproutRoute is account-free in this build. To test the primary flow, open the app, enter "Two days in San Diego with a toddler and a dog", and tap Plan Trip. The app streams planning results from the live SproutRoute backend, then shows Weather, Itinerary, Packing, and Safety tabs. Saved trips, profile import, packing progress, notifications, widgets, Spotlight, and Live Activity data are local-first. The app includes links to Privacy Policy, Privacy Choices, Terms, and Support in Settings. Safety, car-seat, pet travel, weather, and itinerary output is informational and includes human-review expectations; users are told to verify legal and safety-sensitive information with official sources.

## App privacy label guidance

Final App Store Connect answers must match the shipped build and live backend configuration. Based on the current iOS app and backend, review these data types carefully:

- User Content: trip prompt, generated saved trip content, profile import text, packing state, support messages.
- Location: typed destination and origin; precise device location only if a feature requests it and the user grants permission.
- Identifiers: device or diagnostic identifiers if collected by analytics, Apple services, PostHog, or operational logging.
- Usage Data and Diagnostics: app events, crash/error data, performance, and reliability logs.
- Contact Info: only if the user contacts support or uses an account-backed web feature.
- Sensitive Info: avoid collecting it. If users voluntarily enter medical, accessibility, or special-needs notes, disclose according to App Store Connect guidance.

For the iOS app, on-device-only data that is never sent to a server is not treated as collected for App Store privacy answers, but any derived data sent off device should be considered separately.

## Children and age rating

SproutRoute is for parents and guardians and is not directed to children under 13. Do not submit as a Kids Category app unless the product, analytics, third-party services, links, and parental gates are redesigned for that category.

The public Privacy Policy states that children under 13 should not use SproutRoute directly and that parents should not enter unnecessary child identifiers.

## Safety and regulated-content posture

Car-seat guidance, pet travel guidance, travel advisories, weather, maps, and neighborhood safety guidance must remain informational. User-facing copy should preserve these principles:

- Static/human-reviewed rules override AI summaries.
- AI can summarize, organize, and contextualize; it must not claim legal authority.
- Output should keep source, confidence/status, disclaimer, and human-review expectations where available.
- Users must verify rules with local authorities, airlines, veterinarians, government agencies, venues, and official weather sources.

## Required before App Review submission

- Public URLs return `200` on `https://www.sproutroute.app`.
- App Store Connect metadata uses the canonical URLs above.
- App privacy label answers match the actual iOS build and backend.
- Real-device TestFlight pass covers WeatherKit, widgets, App Intents, Spotlight, local notifications, Live Activities, and Settings links.
- Review screenshots and description avoid overclaiming legal, safety, weather, pet-entry, or venue accuracy.
- Backend is live and accessible during review.

## Reference sources checked

- Apple App Review Guidelines: `https://developer.apple.com/app-store/review/guidelines/`
- Apple App Privacy Details: `https://developer.apple.com/app-store/app-privacy-details/`
- Apple App Store Connect App Privacy reference: `https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy`
- FTC COPPA FAQ: `https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions`
- California CCPA overview: `https://oag.ca.gov/privacy/ccpa`
