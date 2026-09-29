import Foundation

/// What a workspace's admins look after, from the phone: its data rules, its
/// compliance settings (which an owner changes here too, after confirming it
/// is them: Reauth.swift), and how single sign-on and audit streams stand.
enum AdminService {
    // MARK: Data rules

    struct DataRule: Identifiable, Decodable, Equatable {
        let id: String
        let name: String
        let kind: String
        let detector: String?
        let pattern: String?
        let keywords: [String]?
        let action: String
        let enabled: Bool
    }

    struct Detector: Identifiable, Decodable, Equatable {
        let id: String
        let name: String
    }

    struct DataRules: Decodable {
        let rules: [DataRule]
        let detectors: [Detector]
        let canEdit: Bool
    }

    static func dataRules(orgId: String, base: URL) async throws -> DataRules {
        try await ChatService.call("GET", "/orgs/dlp", base: base, query: ["orgId": orgId], as: DataRules.self)
    }

    private struct Saved: Decodable { let rule: DataRule? }
    private struct Nothing: Decodable {}

    /// One of the ready-made detectors, or a list of words, as a new rule.
    static func addRule(orgId: String, detector: String?, keywords: [String], name: String, action: String, base: URL) async throws {
        var body: [String: Any] = ["orgId": orgId, "action": action]
        if let detector {
            body["kind"] = "builtin"; body["detector"] = detector
        } else {
            body["kind"] = "keywords"; body["keywords"] = keywords.joined(separator: "\n"); body["name"] = name
        }
        _ = try await ChatService.call("POST", "/orgs/dlp", base: base, body: body, as: Saved.self)
    }

    static func setRule(_ id: String, enabled: Bool? = nil, action: String? = nil, orgId: String, base: URL) async throws {
        var body: [String: Any] = ["orgId": orgId]
        if let enabled { body["enabled"] = enabled }
        if let action { body["action"] = action }
        _ = try await ChatService.call("PATCH", "/orgs/dlp/\(id)", base: base, body: body, as: Saved.self)
    }

    static func deleteRule(_ id: String, orgId: String, base: URL) async throws {
        _ = try await ChatService.call("DELETE", "/orgs/dlp/\(id)", base: base, query: ["orgId": orgId], as: Nothing.self)
    }

    // MARK: Compliance

    struct Governance: Decodable {
        struct Retention: Decodable { let publicDays: Int?; let privateDays: Int?; let dmDays: Int?; let filesDays: Int? }
        struct Network: Decodable { let enforce: Bool; let allowlist: [String] }
        struct Invites: Decodable { let policy: String; let guestsExempt: Bool }
        let retention: Retention
        let network: Network
        let invites: Invites
        /// Whether this person may change them: an owner.
        var canEdit: Bool? = nil
        /// The address this phone is at, as the Worker sees it.
        var yourIp: String? = nil
        /// How long things may be kept, in days; null is forever.
        var retentionChoices: [Int?]? = nil
    }

    struct Hold: Identifiable, Decodable {
        struct Target: Decodable { let name: String?; let channel: String? }
        let id: String
        let kind: String
        let reason: String
        let createdAt: String
        let releasedAt: String?
        let target: Target
    }

    struct ComplianceExport: Identifiable, Decodable {
        let id: String
        let status: String
        let createdAt: String
        let expiresAt: String?
    }

    static func governance(orgId: String, base: URL) async throws -> Governance {
        try await ChatService.call("GET", "/orgs/governance", base: base, query: ["orgId": orgId], as: Governance.self)
    }

    static func holds(orgId: String, base: URL) async throws -> [Hold] {
        struct R: Decodable { let holds: [Hold] }
        return try await ChatService.call("GET", "/orgs/holds", base: base, query: ["orgId": orgId], as: R.self).holds
    }

    static func exports(orgId: String, base: URL) async throws -> [ComplianceExport] {
        struct R: Decodable { let exports: [ComplianceExport] }
        return try await ChatService.call("GET", "/orgs/compliance/exports", base: base, query: ["orgId": orgId], as: R.self).exports
    }

    /// The retention keys, as the Worker names them.
    static let retentionKeys = ["publicDays", "privateDays", "dmDays", "filesDays"]

    /// How long one kind of thing is kept; nil keeps it forever.
    static func setRetention(_ key: String, days: Int?, orgId: String, base: URL) async throws {
        let value: Any = days.map { $0 as Any } ?? NSNull()
        _ = try await ChatService.call("PUT", "/orgs/governance", base: base, body: ["orgId": orgId, "retention": [key: value] as [String: Any]], as: Governance.self)
    }

    /// The networks the workspace may be used from, one range per entry.
    static func setNetwork(enforce: Bool, allowlist: [String], orgId: String, base: URL) async throws {
        _ = try await ChatService.call("PUT", "/orgs/governance", base: base, body: ["orgId": orgId, "network": ["enforce": enforce, "allowlist": allowlist] as [String: Any]], as: Governance.self)
    }

    static func setInvites(policy: String, guestsExempt: Bool, orgId: String, base: URL) async throws {
        _ = try await ChatService.call("PUT", "/orgs/governance", base: base, body: ["orgId": orgId, "invites": ["policy": policy, "guestsExempt": guestsExempt] as [String: Any]], as: Governance.self)
    }

    /// Keep everything a person, or a channel (`b:slug`), says, whatever the
    /// retention, until the hold is released.
    static func placeHold(person ref: String? = nil, channel: String? = nil, reason: String, orgId: String, base: URL) async throws {
        struct R: Decodable { let id: String }
        var body: [String: Any] = ["orgId": orgId, "reason": reason]
        if let ref { body["kind"] = "person"; body["ref"] = ref }
        if let channel { body["kind"] = "channel"; body["channel"] = channel }
        _ = try await ChatService.call("POST", "/orgs/holds", base: base, body: body, as: R.self)
    }

    static func releaseHold(_ id: String, orgId: String, base: URL) async throws {
        _ = try await ChatService.call("DELETE", "/orgs/holds/\(id)", base: base, query: ["orgId": orgId], as: Nothing.self)
    }

    /// Every message and file between two days, for the matter named.
    static func makeExport(from: Date, to: Date, reason: String, orgId: String, base: URL) async throws {
        struct R: Decodable { let export: ComplianceExport }
        let iso = ISO8601DateFormatter()
        _ = try await ChatService.call("POST", "/orgs/compliance/exports", base: base,
                                       body: ["orgId": orgId, "from": iso.string(from: from), "to": iso.string(from: to), "reason": reason],
                                       timeout: 120, as: R.self)
    }

    /// A ready export, saved to a file of its own on this phone to share on.
    static func downloadExport(_ id: String, orgId: String, base: URL) async throws -> URL {
        guard let token = SessionStore.sessionToken, var parts = URLComponents(url: base, resolvingAgainstBaseURL: true) else {
            throw ChatService.Failure.notSignedIn
        }
        parts.path = "/orgs/compliance/exports/\(id)/download"
        parts.queryItems = [URLQueryItem(name: "orgId", value: orgId)]
        guard let url = parts.url else { throw ChatService.Failure.server(0, nil) }
        var request = URLRequest(url: url)
        request.timeoutInterval = 120
        request.setValue(token, forHTTPHeaderField: "x-session-token")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw ChatService.Failure.server((response as? HTTPURLResponse)?.statusCode ?? 0, String(localized: "The export could not be downloaded."))
        }
        let name = exportFileName(id: id, disposition: http.value(forHTTPHeaderField: "Content-Disposition"))
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try data.write(to: file, options: [.atomic, .completeFileProtection])
        return file
    }

    /// The file name the Worker gave, or one made from the export's ID.
    static func exportFileName(id: String, disposition: String?) -> String {
        if let disposition, let range = disposition.range(of: #"filename="?([^";]+)"?"#, options: .regularExpression) {
            let raw = disposition[range].replacingOccurrences(of: "filename=", with: "").replacingOccurrences(of: "\"", with: "")
            var safe = raw.components(separatedBy: CharacterSet(charactersIn: "/\\:")).joined(separator: "-").trimmingCharacters(in: .whitespaces)
            // Never a hidden file, and never "..": it stays in the folder it is put in.
            while safe.hasPrefix(".") { safe.removeFirst() }
            if !safe.isEmpty { return safe }
        }
        return "export-\(id.prefix(8)).jsonl.gz"
    }

    // MARK: Single sign-on and audit streams

    struct Connection: Identifiable, Decodable {
        let id: String
        let name: String
        let provider: String
        let allowedDomains: [String]
        let status: String
        let testedAt: String?
        let logoutUrl: String?
    }

    struct SSO: Decodable {
        let connections: [Connection]
        let enforce: Bool
    }

    struct Stream: Identifiable, Decodable {
        let id: String
        let kind: String
        let endpoint: String?
        let status: String
        let failures: Int?
        let lastError: String?
        let lastSentAt: String?
    }

    static func sso(orgId: String, base: URL) async throws -> SSO {
        try await ChatService.call("GET", "/orgs/sso", base: base, query: ["orgId": orgId], as: SSO.self)
    }

    static func streams(orgId: String, base: URL) async throws -> [Stream] {
        struct R: Decodable { let streams: [Stream] }
        return try await ChatService.call("GET", "/audit/streams", base: base, query: ["orgId": orgId], as: R.self).streams
    }

    // MARK: Apps through Smithery (each person's own)

    struct AppConnection: Decodable, Equatable { let state: String }
    struct App: Identifiable, Decodable, Equatable {
        let server: String
        let name: String
        let description: String?
        let verified: Bool
        let allowWrites: Bool
        let connection: AppConnection?
        var id: String { server }
    }
    struct Apps: Decodable {
        let configured: Bool
        let apps: [App]
        let canConnect: Bool
    }
    struct Connecting: Decodable { let state: String; let setupUrl: String? }

    static func apps(orgId: String, base: URL) async throws -> Apps {
        try await ChatService.call("GET", "/orgs/apps", base: base, query: ["orgId": orgId], as: Apps.self)
    }

    /// Start (or finish) connecting your own account; the page to open, when
    /// there is sign-in to do.
    static func connectApp(_ server: String, orgId: String, base: URL) async throws -> Connecting {
        try await ChatService.call("POST", "/apps/connect", base: base, body: ["orgId": orgId, "server": server], as: Connecting.self)
    }

    static func disconnectApp(_ server: String, orgId: String, base: URL) async throws {
        _ = try await ChatService.call("DELETE", "/apps/connect", base: base, query: ["orgId": orgId, "server": server], as: Nothing.self)
    }

    /// Days as a person reads them: "Forever", "30 days", "1 year".
    static func days(_ value: Int?) -> String {
        guard let value else { return String(localized: "Forever") }
        if value >= 365, value % 365 == 0 {
            let years = value / 365
            return years == 1 ? String(localized: "1 year") : String(localized: "\(years) years")
        }
        return value == 1 ? String(localized: "1 day") : String(localized: "\(value) days")
    }
}
