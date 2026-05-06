import SwiftData
import SwiftUI

@main
struct SproutRouteApp: App {
    private let modelContainer: ModelContainer
    @State private var planner = TripPlanner()

    init() {
        do {
            let schema = Schema(SproutRouteSchema.models)
            modelContainer = try ModelContainer(for: schema)
        } catch {
            fatalError("Failed to create SwiftData container: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environment(planner)
                .modelContainer(modelContainer)
                .onOpenURL { url in
                    if let deepLink = SproutRouteDeepLink.parse(url) {
                        planner.handleDeepLink(deepLink)
                    }
                }
        }
    }
}
