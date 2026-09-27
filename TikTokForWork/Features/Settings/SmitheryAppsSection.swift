import SwiftUI

/// More apps, through Smithery (docs/smithery-apps.md): the ones an owner
/// allowed in this workspace, each connected with the person's own account.
/// Only their own conversation with their AI reads it. Signing in happens on
/// Smithery's page, in the browser; coming back refreshes how it stands.
struct SmitheryAppsSection: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @State private var apps: AdminService.Apps?
    @State private var busy: String?
    @State private var error: String?

    var body: some View {
        Group {
            if let apps, apps.configured, !apps.apps.isEmpty {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    Text("More apps, through Smithery").font(Theme.TypeScale.micro).foregroundStyle(Theme.Colors.textTertiary)
                    Text("What you connect here is yours alone: only your own conversation with your AI reads it, never a channel or anyone else. It reads, and does not write, unless an owner allowed it.")
                        .font(Theme.TypeScale.caption).foregroundStyle(Theme.Colors.textSecondary)
                    ForEach(apps.apps) { app in row(app, canConnect: apps.canConnect) }
                    if let error { Text(error).font(Theme.TypeScale.label).foregroundStyle(Theme.Colors.reject) }
                }
            }
        }
        .task { await load() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await load() } } }
    }

    private func row(_ app: AdminService.App, canConnect: Bool) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(app.name).font(.body.weight(.semibold))
                Text(status(app)).font(.caption).foregroundStyle(Theme.Colors.textSecondary)
            }
            Spacer()
            if canConnect {
                if app.connection?.state == "connected" {
                    Button("Disconnect") { Task { await disconnect(app) } }.disabled(busy != nil)
                } else {
                    Button(app.connection == nil ? String(localized: "Connect") : String(localized: "Finish signing in")) { Task { await connect(app) } }.disabled(busy != nil)
                }
            }
        }
        .padding(Theme.Spacing.md)
        .background(Theme.Colors.background)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.image))
        .overlay { RoundedRectangle(cornerRadius: Theme.Radius.image).strokeBorder(Theme.Colors.border, lineWidth: 1) }
    }

    private func status(_ app: AdminService.App) -> String {
        switch app.connection?.state {
        case nil: return app.allowWrites ? String(localized: "Can write") : String(localized: "Reads only")
        case "connected": return String(localized: "Connected")
        case "auth_required", "input_required", "pending": return String(localized: "Finish signing in")
        case "missing": return String(localized: "Connect again")
        default: return String(localized: "Not working")
        }
    }

    private var context: (orgId: String, base: URL)? {
        guard let orgId = SessionStore.orgId, !orgId.isEmpty, let base = BackendURL.httpBase(from: AppConfig.relayURL) else { return nil }
        return (orgId, base)
    }

    private func load() async {
        guard let ctx = context else { return }
        apps = try? await AdminService.apps(orgId: ctx.orgId, base: ctx.base)
    }

    private func connect(_ app: AdminService.App) async {
        guard let ctx = context else { return }
        busy = app.server
        defer { busy = nil }
        do {
            let out = try await AdminService.connectApp(app.server, orgId: ctx.orgId, base: ctx.base)
            if let raw = out.setupUrl, let url = URL(string: raw), url.scheme == "https" { openURL(url) }
            error = nil
        } catch { self.error = error.localizedDescription }
        await load()
    }

    private func disconnect(_ app: AdminService.App) async {
        guard let ctx = context else { return }
        busy = app.server
        defer { busy = nil }
        do { try await AdminService.disconnectApp(app.server, orgId: ctx.orgId, base: ctx.base); error = nil }
        catch { self.error = error.localizedDescription }
        await load()
    }
}
