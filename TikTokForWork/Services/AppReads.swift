import Foundation

/// When each app's cards (Automations, Gmail…) were last looked at, on any
/// device: the same `app:<name>` positions the web keeps. A card from an
/// app counts toward the icon's badge only until it has been seen — it
/// still waits on you in the feed, but it no longer calls for you.
@MainActor
final class AppReads: ObservableObject {
    static let shared = AppReads()

    @Published private(set) var at: [String: Date] = [:]
    /// Called when a position moves, so the badge is counted again.
    var onChange: (() -> Void)?

    /// The app a card came from, as the web names it; nil for a card from a
    /// person, which stays in the badge until it is decided.
    nonisolated static func key(for card: DecisionCard) -> String? { key(sourceApp: card.sourceApp) }
    nonisolated static func key(sourceApp: String?) -> String? {
        let app = (sourceApp ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        guard !app.isEmpty else { return nil }
        return app == "your ai" ? "app:ai" : "app:\(app)"
    }

    func isNew(_ card: DecisionCard) -> Bool {
        guard let key = Self.key(for: card) else { return true }
        return card.createdAt > (at[key] ?? .distantPast)
    }

    /// The server's positions (from the conversation list, or another
    /// device saying it read one), never moved backwards.
    func merge(_ reads: [String: String]) {
        var moved = false
        for (key, value) in reads where key.hasPrefix("app:") {
            guard let date = ChatDates.parse(value), date > (at[key] ?? .distantPast) else { continue }
            at[key] = date
            moved = true
        }
        if moved { onChange?() }
    }

    /// Looked at in the feed: read here, and on the server for every other
    /// device. Only the apps that have something new are written.
    func seen(_ cards: [DecisionCard], orgId: String?, base: URL?) {
        let keys = Set(cards.filter { isNew($0) }.compactMap(Self.key(for:)))
        guard !keys.isEmpty else { return }
        let now = Date()
        for key in keys { at[key] = now }
        onChange?()
        guard let orgId, let base else { return }
        Task { for key in keys { await ChatService.markRead(orgId: orgId, channel: key, base: base) } }
    }

    func reset() { at = [:] }
}
