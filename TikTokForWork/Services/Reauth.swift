import SwiftUI
import UIKit

/// "Confirm it's you" on the phone (docs/admin-controls.md §3). An owner's
/// change, and where a workspace asks, an admin's, needs a sign-in from the
/// last few minutes. The Worker says so with a 401 whose `code` is
/// `reauth-required`; that is not being signed out. The person proves it is
/// them with a code sent to their email, or their password, and the change
/// they were making is sent again by itself, as on the web.
enum Reauth {
    /// Whether a refusal is the Worker asking for a recent sign-in.
    static func isAsked(status: Int, data: Data) -> Bool {
        guard status == 401,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return json["code"] as? String == "reauth-required"
    }

    /// Send a request; when the Worker asks for a recent sign-in, ask the
    /// person, and send it once more after they have confirmed. Declined,
    /// the refusal comes back as it was, for the caller to say.
    static func send(_ request: URLRequest, session: URLSession = .shared) async throws -> (Data, URLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, isAsked(status: http.statusCode, data: data),
              let base = origin(of: request.url) else { return (data, response) }
        guard await ReauthPrompt.shared.ask(base: base) else { return (data, response) }
        return try await session.data(for: request)
    }

    /// The Worker's address: scheme, host and port of the request.
    static func origin(of url: URL?) -> URL? {
        guard let url, var parts = URLComponents(url: url, resolvingAgainstBaseURL: true) else { return nil }
        parts.path = ""; parts.query = nil; parts.fragment = nil
        return parts.url
    }

    /// How this account proves it is them.
    enum Method: Equatable {
        case emailCode(String?)
        case password
        case signInAgain
    }

    private struct Said: Decodable { let method: String?; let email: String?; let message: String? }

    private static func request(_ path: String, base: URL, body: [String: Any]) throws -> URLRequest {
        guard let token = SessionStore.sessionToken, var parts = URLComponents(url: base, resolvingAgainstBaseURL: true) else {
            throw ChatService.Failure.notSignedIn
        }
        parts.path = path
        guard let url = parts.url else { throw ChatService.Failure.server(0, nil) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue(token, forHTTPHeaderField: "x-session-token")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return request
    }

    /// Asks the Worker how to confirm; for an email address, it sends the code now.
    static func start(base: URL, session: URLSession = .shared) async throws -> Method {
        let (data, response) = try await session.data(for: try request("/auth/reauth/start", base: base, body: [:]))
        let said = try? JSONDecoder().decode(Said.self, from: data)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw ChatService.Failure.server((response as? HTTPURLResponse)?.statusCode ?? 0, said?.message)
        }
        switch said?.method {
        case "email_code": return .emailCode(said?.email)
        case "password": return .password
        default: return .signInAgain
        }
    }

    /// The code from the email, or the password.
    static func confirm(base: URL, code: String? = nil, password: String? = nil, session: URLSession = .shared) async throws {
        var body: [String: Any] = [:]
        if let password { body["password"] = password } else { body["code"] = (code ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
        let (data, response) = try await session.data(for: try request("/auth/reauth", base: base, body: body))
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw ChatService.Failure.server((response as? HTTPURLResponse)?.statusCode ?? 0, (try? JSONDecoder().decode(Said.self, from: data))?.message)
        }
    }
}

/// The one "Confirm it's you" sheet, over whatever is on screen, sheets
/// included. Requests that ask while it is up wait for the same answer.
@MainActor
final class ReauthPrompt: ObservableObject {
    static let shared = ReauthPrompt()

    private var waiting: [CheckedContinuation<Bool, Never>] = []
    private weak var host: UIViewController?

    func ask(base: URL) async -> Bool {
        await withCheckedContinuation { continuation in
            waiting.append(continuation)
            if waiting.count == 1 { present(base: base) }
        }
    }

    func finish(_ confirmed: Bool) {
        let all = waiting
        waiting = []
        if let host, host.presentingViewController != nil { host.dismiss(animated: true) }
        host = nil
        all.forEach { $0.resume(returning: confirmed) }
    }

    private func present(base: URL) {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        guard let window = scene?.windows.first(where: \.isKeyWindow) ?? scene?.windows.first,
              var top = window.rootViewController else { finish(false); return }
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        let controller = UIHostingController(rootView: ReauthSheet(base: base) { [weak self] in self?.finish($0) }
            .environment(\.locale, AppLocalization.locale))
        // Only Cancel or Confirm answers it; a swipe would leave the change waiting.
        controller.isModalInPresentation = true
        host = controller
        top.present(controller, animated: true)
    }
}

/// A code to the email, or the password; then the change goes through.
struct ReauthSheet: View {
    let base: URL
    let done: @MainActor (Bool) -> Void
    @State private var method: Reauth.Method?
    @State private var value = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    switch method {
                    case nil:
                        HStack { ProgressView(); Text("One moment…").foregroundStyle(Theme.Colors.textSecondary) }
                    case .some(.emailCode(let email)):
                        if let email { Text("We sent a code to \(email).") } else { Text("We sent a code to your email.") }
                        TextField("Code", text: $value)
                            .keyboardType(.numberPad).textContentType(.oneTimeCode)
                            .accessibilityIdentifier("reauth.code")
                    case .some(.password):
                        SecureField("Password", text: $value).textContentType(.password)
                            .accessibilityIdentifier("reauth.password")
                    case .some(.signInAgain):
                        Text("Sign out and sign in again, then make this change.")
                    }
                } footer: {
                    Text("This change needs a recent sign-in.")
                }
                if let error { Text(error).foregroundStyle(Theme.Colors.reject) }
            }
            .navigationTitle("Confirm it's you").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { done(false) } }
                if method != nil && method != .signInAgain {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Confirm") { Task { await confirm() } }
                            .disabled(busy || value.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .task { await start() }
        }
    }

    private func start() async {
        do { method = try await Reauth.start(base: base) }
        catch { self.error = error.localizedDescription; method = .signInAgain }
    }

    private func confirm() async {
        busy = true
        defer { busy = false }
        do {
            if method == .password { try await Reauth.confirm(base: base, password: value) }
            else { try await Reauth.confirm(base: base, code: value) }
            Haptics.success()
            done(true)
        } catch { self.error = error.localizedDescription }
    }
}
