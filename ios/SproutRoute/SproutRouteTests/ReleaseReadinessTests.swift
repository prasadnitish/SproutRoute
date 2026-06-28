import XCTest
import ImageIO
import SwiftData
@testable import SproutRoute

final class ReleaseReadinessTests: XCTestCase {
    private var projectRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    func testAppInfoPlistContainsReviewerVisiblePurposeStrings() throws {
        let plist = try loadPropertyList(at: projectRoot.appending(path: "Config/SproutRoute-Info.plist"))

        XCTAssertEqual(plist["CFBundleDisplayName"] as? String, "SproutRoute")
        XCTAssertEqual(plist["NSSupportsLiveActivities"] as? Bool, true)
        let locationPurpose = try XCTUnwrap(plist["NSLocationWhenInUseUsageDescription"] as? String)
        XCTAssertTrue(locationPurpose.contains("Trip Hub"))
    }

    func testAppInfoPlistSupportsAllIPadOrientations() throws {
        let plist = try loadPropertyList(at: projectRoot.appending(path: "Config/SproutRoute-Info.plist"))
        let orientations = try XCTUnwrap(plist["UISupportedInterfaceOrientations~ipad"] as? [String])

        XCTAssertEqual(
            Set(orientations),
            [
                "UIInterfaceOrientationPortrait",
                "UIInterfaceOrientationPortraitUpsideDown",
                "UIInterfaceOrientationLandscapeLeft",
                "UIInterfaceOrientationLandscapeRight",
            ]
        )
    }

    func testAppAndWidgetDeclareSharedAppGroup() throws {
        let appEntitlements = try loadPropertyList(at: projectRoot.appending(path: "Config/SproutRoute.entitlements"))
        let widgetEntitlements = try loadPropertyList(at: projectRoot.appending(path: "Config/SproutRouteWidget.entitlements"))

        XCTAssertEqual(appEntitlements["com.apple.security.application-groups"] as? [String], ["group.com.sproutroute.app"])
        XCTAssertEqual(widgetEntitlements["com.apple.security.application-groups"] as? [String], ["group.com.sproutroute.app"])
    }

    func testPrivacyManifestDocumentsLocalStorageAccess() throws {
        let manifest = try loadPropertyList(at: projectRoot.appending(path: "Config/PrivacyInfo.xcprivacy"))

        XCTAssertEqual(manifest["NSPrivacyTracking"] as? Bool, false)
        let accessedAPIs = try XCTUnwrap(manifest["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
        XCTAssertTrue(accessedAPIs.contains { entry in
            entry["NSPrivacyAccessedAPIType"] as? String == "NSPrivacyAccessedAPICategoryUserDefaults"
        })
        let collectedDataTypes = try XCTUnwrap(manifest["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        XCTAssertTrue(collectedDataTypes.contains { entry in
            entry["NSPrivacyCollectedDataType"] as? String == "NSPrivacyCollectedDataTypeProductInteraction"
                && entry["NSPrivacyCollectedDataTypeTracking"] as? Bool == false
                && entry["NSPrivacyCollectedDataTypeLinked"] as? Bool == false
        })
        XCTAssertTrue(collectedDataTypes.contains { entry in
            entry["NSPrivacyCollectedDataType"] as? String == "NSPrivacyCollectedDataTypeDeviceID"
                && entry["NSPrivacyCollectedDataTypeTracking"] as? Bool == false
                && entry["NSPrivacyCollectedDataTypeLinked"] as? Bool == false
        })
        XCTAssertTrue(collectedDataTypes.contains { entry in
            guard entry["NSPrivacyCollectedDataType"] as? String == "NSPrivacyCollectedDataTypePreciseLocation" else {
                return false
            }
            let purposes = entry["NSPrivacyCollectedDataTypePurposes"] as? [String]
            return entry["NSPrivacyCollectedDataTypeTracking"] as? Bool == false
                && entry["NSPrivacyCollectedDataTypeLinked"] as? Bool == true
                && purposes?.contains("NSPrivacyCollectedDataTypePurposeAppFunctionality") == true
        })
    }

    func testGeneratedProjectPackagesReleaseResources() throws {
        let projectFileURL = projectRoot.appending(path: "SproutRoute.xcodeproj/project.pbxproj")
        let projectFile = try String(contentsOf: projectFileURL, encoding: .utf8)

        XCTAssertTrue(projectFile.contains("PBXResourcesBuildPhase"))
        XCTAssertTrue(projectFile.contains("Assets.xcassets in Resources"))
        XCTAssertTrue(projectFile.contains("PrivacyInfo.xcprivacy in Resources"))
    }

    func testIOSSourceTreeDoesNotContainLocalOrDebugArtifacts() throws {
        let enumerator = FileManager.default.enumerator(
            at: projectRoot,
            includingPropertiesForKeys: nil
        )

        var forbiddenArtifacts: [String] = []
        while let url = enumerator?.nextObject() as? URL {
            if url.lastPathComponent == ".DS_Store" || url.lastPathComponent.hasSuffix("Debug.entitlements") {
                forbiddenArtifacts.append(url.path)
            }
        }

        XCTAssertEqual(forbiddenArtifacts, [], "Remove local desktop/debug artifacts before archiving or committing.")
    }

    func testAppModelContainerFallsBackToInMemoryStoreWhenPersistentStoreCannotOpen() throws {
        enum FixtureError: Error {
            case persistentStoreUnavailable
        }

        let state = SproutRouteModelContainerFactory.make(
            persistentFactory: {
                throw FixtureError.persistentStoreUnavailable
            },
            fallbackFactory: {
                let schema = Schema(SproutRouteSchema.models)
                let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
                return try ModelContainer(for: schema, configurations: [config])
            }
        )

        switch state {
        case .ready(let container, let storageMode):
            XCTAssertNotNil(container)
            XCTAssertEqual(storageMode, .inMemoryFallback)
        case .unavailable(let message):
            XCTFail("Expected an in-memory fallback container, got unavailable state: \(message)")
        }
    }

    func testAppModelContainerUnavailableMessageDoesNotExposeStorageInternals() {
        enum FixtureError: Error, CustomStringConvertible {
            case storagePathLeak

            var description: String {
                "/private/var/mobile/Containers/Data/Application/local.sqlite"
            }
        }

        let state = SproutRouteModelContainerFactory.make(
            persistentFactory: {
                throw FixtureError.storagePathLeak
            },
            fallbackFactory: {
                throw FixtureError.storagePathLeak
            }
        )

        switch state {
        case .ready:
            XCTFail("Expected unavailable state when persistent and fallback stores both fail.")
        case .unavailable(let message):
            XCTAssertEqual(message, "SproutRoute could not open local trip storage. Restart the app and try again.")
            XCTAssertFalse(message.contains("/private/var/mobile"))
            XCTAssertFalse(message.contains("local.sqlite"))
        }
    }

    func testProductionSwiftSourceDoesNotContainTripHubDemoFixtureData() throws {
        let bannedFixtureStrings = [
            "Vegas 2026",
            "VEGAS1",
            "gtp_owner_token"
        ]
        let swiftFiles = try productionSwiftFiles()
        var violations: [String] = []

        for fileURL in swiftFiles {
            let source = try String(contentsOf: fileURL, encoding: .utf8)
            for banned in bannedFixtureStrings where source.contains(banned) {
                violations.append("\(fileURL.lastPathComponent): \(banned)")
            }
        }

        XCTAssertEqual(
            violations,
            [],
            "Production app source should not ship local Trip Hub demo fixture data."
        )
    }

    func testAppIconAssetExistsForArchive() throws {
        let iconContentsURL = projectRoot.appending(path: "Assets.xcassets/AppIcon.appiconset/Contents.json")
        let iPhoneIconURL = projectRoot.appending(path: "Assets.xcassets/AppIcon.appiconset/AppIcon-120.png")
        let iPadIconURL = projectRoot.appending(path: "Assets.xcassets/AppIcon.appiconset/AppIcon-152.png")
        let marketingIconURL = projectRoot.appending(path: "Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png")
        let plist = try loadPropertyList(at: projectRoot.appending(path: "Config/SproutRoute-Info.plist"))
        let phonePrimaryIcon = try primaryIcon(in: plist, key: "CFBundleIcons")
        let iPadPrimaryIcon = try primaryIcon(in: plist, key: "CFBundleIcons~ipad")

        XCTAssertTrue(FileManager.default.fileExists(atPath: iconContentsURL.path))
        XCTAssertEqual(plist["CFBundleIconName"] as? String, "AppIcon")
        XCTAssertEqual(phonePrimaryIcon["CFBundleIconName"] as? String, "AppIcon")
        XCTAssertEqual(iPadPrimaryIcon["CFBundleIconName"] as? String, "AppIcon")
        XCTAssertTrue((phonePrimaryIcon["CFBundleIconFiles"] as? [String])?.contains("AppIcon-120") == true)
        XCTAssertTrue((iPadPrimaryIcon["CFBundleIconFiles"] as? [String])?.contains("AppIcon-152") == true)
        try assertPNGDimensions(iPhoneIconURL, width: 120, height: 120)
        try assertPNGDimensions(iPadIconURL, width: 152, height: 152)
        try assertPNGDimensions(marketingIconURL, width: 1024, height: 1024)
    }

    private func loadPropertyList(at url: URL) throws -> [String: Any] {
        let data = try Data(contentsOf: url)
        return try XCTUnwrap(PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
    }

    private func primaryIcon(in plist: [String: Any], key: String) throws -> [String: Any] {
        let icons = try XCTUnwrap(plist[key] as? [String: Any])
        return try XCTUnwrap(icons["CFBundlePrimaryIcon"] as? [String: Any])
    }

    private func assertPNGDimensions(_ url: URL, width: Int, height: Int, file: StaticString = #filePath, line: UInt = #line) throws {
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path), file: file, line: line)
        let imageSource = try XCTUnwrap(CGImageSourceCreateWithURL(url as CFURL, nil), file: file, line: line)
        let properties = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [String: Any], file: file, line: line)

        XCTAssertEqual(properties[kCGImagePropertyPixelWidth as String] as? Int, width, file: file, line: line)
        XCTAssertEqual(properties[kCGImagePropertyPixelHeight as String] as? Int, height, file: file, line: line)
    }

    private func productionSwiftFiles() throws -> [URL] {
        let enumerator = FileManager.default.enumerator(
            at: projectRoot,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        )

        var files: [URL] = []
        while let url = enumerator?.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            let path = url.path
            guard !path.contains("/SproutRouteTests/") else { continue }
            files.append(url)
        }
        return files.sorted { $0.path < $1.path }
    }
}
