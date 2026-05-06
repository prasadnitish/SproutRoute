# SproutRoute Native iOS

This is the fresh SwiftUI port of the current SproutRoute web app. The old Expo workspace in `../../mobile` remains parked until native parity is proven.

## Shape

- iOS 18 minimum.
- SwiftUI, Observation, SwiftData, MapKit, WeatherKit, WidgetKit, ActivityKit, App Intents, Core Spotlight, and User Notifications.
- Local-first v1: no SproutRoute login, no CloudKit sync, and no APNs backend.
- Backend planning still follows the web source of truth: `parse-input -> trip/stream -> results`, with packing and safety work continuing after first results render.

## Generate And Test

```bash
cd ios/SproutRoute
xcodegen generate
xcodebuild test -scheme SproutRoute -destination 'platform=iOS Simulator,name=iPhone 16'
```

## TestFlight Readiness

Current local checks that should stay green before an archive:

```bash
npm test
cd src/frontend && npm run build
xcodebuild test -project ios/SproutRoute/SproutRoute.xcodeproj -scheme SproutRoute -destination 'platform=iOS Simulator,name=iPhone 17'
xcodebuild test -project ios/SproutRoute/SproutRoute.xcodeproj -scheme SproutRoute -destination 'platform=iOS Simulator,name=iPad (A16)'
xcodebuild -project ios/SproutRoute/SproutRoute.xcodeproj -scheme SproutRoute -configuration Release -destination 'generic/platform=iOS Simulator' build
```

To create a TestFlight archive, set a real Apple Developer Team for both the app and widget targets first. The project currently leaves `DEVELOPMENT_TEAM` blank in `project.yml` so it does not guess the account-specific value. After selecting the team in Xcode or passing it on the command line, archive with:

```bash
xcodebuild -project ios/SproutRoute/SproutRoute.xcodeproj \
  -scheme SproutRoute \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath /tmp/SproutRoute.xcarchive \
  DEVELOPMENT_TEAM=<APPLE_TEAM_ID> \
  archive
```

Required Apple capabilities for the bundle IDs:

- `com.sproutroute.app`: App Groups (`group.com.sproutroute.app`), WeatherKit, Live Activities.
- `com.sproutroute.app.widget`: App Groups (`group.com.sproutroute.app`).

Known release assets now present:

- App icon set in `Assets.xcassets/AppIcon.appiconset`.
- Privacy manifest in `Config/PrivacyInfo.xcprivacy`.
- Location purpose string for the Map user-location button.
- App Group entitlements generated from `project.yml` for app and widget targets.
