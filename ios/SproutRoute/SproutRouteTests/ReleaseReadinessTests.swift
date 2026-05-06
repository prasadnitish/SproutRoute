import XCTest
import ImageIO

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
        XCTAssertNotNil(plist["NSLocationWhenInUseUsageDescription"])
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
}
