import SwiftUI
import UIKit

/// The only thing UIKit is still needed for: APNs hands the device token to the
/// app delegate and nowhere else.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            PushService.shared.register(deviceToken: deviceToken, sessionToken: SessionStore.sessionToken)
        }
    }

    /// A silent push: what was read on another device comes down here too,
    /// even while the app is not open.
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        guard userInfo["kind"] as? String == "read", let channel = userInfo["channel"] as? String else {
            completionHandler(.noData)
            return
        }
        let parentId = (userInfo["parentId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        PushService.clearDelivered(channel: channel, parentId: parentId)
        completionHandler(.newData)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Not fatal, and not worth an alert: the user simply is not told about
        // decisions until the next launch tries again. The feed still works.
        print("APNs registration failed: \(error.localizedDescription)")
    }
}

@main
struct TikTokForWorkApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var appState = AppState()
    @StateObject private var push = PushService.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .environmentObject(push)
                .environmentObject(SubscriptionService.shared)
                .environment(\.locale, appState.language.locale ?? Locale.autoupdatingCurrent)
                .preferredColorScheme(appState.appearance.colorScheme)
        }
        .onChange(of: scenePhase) { _, phase in
            // A socket dropped while the app was backgrounded produces no
            // receive-loop error to react to, so nothing would ever notice it
            // died. Coming back to the foreground is the signal.
            guard phase == .active else { return }
            appState.webSocketService.reconnectIfNeeded()
            Task { await push.refreshAuthorization() }
            // The language may have been changed on the web meanwhile.
            Task { await appState.adoptAccountLanguage() }
        }
    }
}
