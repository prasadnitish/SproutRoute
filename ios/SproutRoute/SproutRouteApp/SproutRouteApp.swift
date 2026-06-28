import SwiftData
import SwiftUI

enum SproutRouteModelContainerStorageMode: Equatable {
    case persistent
    case inMemoryFallback
}

enum SproutRouteModelContainerState {
    case ready(ModelContainer, SproutRouteModelContainerStorageMode)
    case unavailable(String)
}

enum SproutRouteModelContainerFactory {
    static func make(
        persistentFactory: () throws -> ModelContainer = {
            let schema = Schema(SproutRouteSchema.models)
            return try ModelContainer(for: schema)
        },
        fallbackFactory: () throws -> ModelContainer = {
            let schema = Schema(SproutRouteSchema.models)
            let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            return try ModelContainer(for: schema, configurations: [config])
        }
    ) -> SproutRouteModelContainerState {
        do {
            return .ready(try persistentFactory(), .persistent)
        } catch {
            do {
                return .ready(try fallbackFactory(), .inMemoryFallback)
            } catch {
                return .unavailable("SproutRoute could not open local trip storage. Restart the app and try again.")
            }
        }
    }
}

@main
struct SproutRouteApp: App {
    private let modelContainer: ModelContainer?
    private let launchFailureMessage: String?
    @State private var planner = TripPlanner()

    init() {
        switch SproutRouteModelContainerFactory.make() {
        case .ready(let container, _):
            modelContainer = container
            launchFailureMessage = nil
        case .unavailable(let message):
            modelContainer = nil
            launchFailureMessage = message
        }
    }

    var body: some Scene {
        WindowGroup {
            if let modelContainer {
                AppRootView()
                    .environment(planner)
                    .modelContainer(modelContainer)
                    .onOpenURL { url in
                        if let deepLink = SproutRouteDeepLink.parse(url) {
                            planner.handleDeepLink(deepLink)
                        }
                    }
            } else {
                SproutRouteLaunchFailureView(message: launchFailureMessage)
            }
        }
    }
}

private struct SproutRouteLaunchFailureView: View {
    var message: String?

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "externaldrive.badge.exclamationmark")
                .font(.system(size: 40, weight: .semibold))
                .foregroundStyle(.orange)

            Text("SproutRoute needs local storage")
                .font(.title3.weight(.semibold))

            Text(message ?? "Restart the app and try again.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .padding()
    }
}
