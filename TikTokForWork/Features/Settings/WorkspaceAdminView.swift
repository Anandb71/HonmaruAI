import SwiftUI

/// The workspace's admin screens on the phone (docs/enterprise-audit-log.md
/// §10): data rules, which an admin can switch on and off, add and remove
/// here; compliance, which an owner changes here after confirming it is
/// them; and how single sign-on and the audit streams stand.
struct WorkspaceAdminView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        List {
            Section {
                NavigationLink { DataRulesAdminView().environmentObject(appState) } label: {
                    Label("Data rules", systemImage: "shield.lefthalf.filled")
                }
                NavigationLink { ComplianceAdminView().environmentObject(appState) } label: {
                    Label("Compliance", systemImage: "archivebox")
                }
                NavigationLink { SignOnAdminView().environmentObject(appState) } label: {
                    Label("Single sign-on and audit streams", systemImage: "key.horizontal")
                }
            } footer: {
                Text("Only admins and owners see these. An owner is asked to confirm it’s them before changing compliance settings. Single sign-on and audit streams are set up on the web, in Studio.")
            }
        }
        .navigationTitle("Workspace admin").navigationBarTitleDisplayMode(.inline)
    }
}

/// Loading, and a refusal said as a sentence, for each admin screen.
private struct AdminLoad: ViewModifier {
    let error: String?
    let loaded: Bool
    let reload: () async -> Void

    func body(content: Content) -> some View {
        content
            .overlay { if !loaded { ProgressView() } }
            .safeAreaInset(edge: .bottom) {
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Theme.Colors.reject)
                        .padding(12).frame(maxWidth: .infinity).background(.thinMaterial)
                }
            }
            .refreshable { await reload() }
            .task { await reload() }
    }
}

private extension AdminService {
    static var context: (orgId: String, base: URL)? {
        guard let orgId = SessionStore.orgId, !orgId.isEmpty,
              let base = BackendURL.httpBase(from: AppConfig.relayURL) else { return nil }
        return (orgId, base)
    }
}

// MARK: - Data rules

struct DataRulesAdminView: View {
    @State private var rules: [AdminService.DataRule] = []
    @State private var detectors: [AdminService.Detector] = []
    @State private var canEdit = false
    @State private var loaded = false
    @State private var error: String?
    @State private var adding = false

    var body: some View {
        List {
            Section {
                if loaded && rules.isEmpty { Text("No data rules yet.").foregroundStyle(Theme.Colors.textSecondary) }
                ForEach(rules) { rule in
                    DataRuleRow(rule: rule, canEdit: canEdit) { enabled in
                        Task { await change(rule, enabled: enabled) }
                    }
                    .swipeActions {
                        if canEdit {
                            Button(role: .destructive) { Task { await remove(rule) } } label: { Label("Delete", systemImage: "trash") }
                        }
                    }
                }
            } footer: {
                Text("A message or an attached file that breaks a rule is stopped, or the sender is asked first. What matched is never kept.")
            }
            if canEdit {
                Section { Button { adding = true } label: { Label("Add a rule", systemImage: "plus") } }
            }
        }
        .navigationTitle("Data rules").navigationBarTitleDisplayMode(.inline)
        .modifier(AdminLoad(error: error, loaded: loaded, reload: load))
        .sheet(isPresented: $adding) {
            NewDataRuleSheet(detectors: detectors) { await load() }
        }
    }

    private func load() async {
        guard let ctx = AdminService.context else { return }
        do {
            let answer = try await AdminService.dataRules(orgId: ctx.orgId, base: ctx.base)
            rules = answer.rules; detectors = answer.detectors; canEdit = answer.canEdit; error = nil
        } catch { self.error = error.localizedDescription }
        loaded = true
    }

    private func change(_ rule: AdminService.DataRule, enabled: Bool) async {
        guard let ctx = AdminService.context else { return }
        do { try await AdminService.setRule(rule.id, enabled: enabled, orgId: ctx.orgId, base: ctx.base); Haptics.success() }
        catch { self.error = error.localizedDescription }
        await load()
    }

    private func remove(_ rule: AdminService.DataRule) async {
        guard let ctx = AdminService.context else { return }
        do { try await AdminService.deleteRule(rule.id, orgId: ctx.orgId, base: ctx.base) }
        catch { self.error = error.localizedDescription }
        await load()
    }
}

private struct DataRuleRow: View {
    let rule: AdminService.DataRule
    let canEdit: Bool
    let toggle: (Bool) -> Void

    var body: some View {
        Toggle(isOn: Binding(get: { rule.enabled }, set: toggle)) {
            VStack(alignment: .leading, spacing: 2) {
                Text(rule.name).font(.body.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(Theme.Colors.textSecondary).lineLimit(2)
            }
        }
        .disabled(!canEdit)
    }

    private var detail: String {
        let what: String
        switch rule.kind {
        case "keywords": what = (rule.keywords ?? []).joined(separator: ", ")
        case "regex": what = String(localized: "Pattern")
        default: what = String(localized: "Built in")
        }
        let action = rule.action == "block" ? String(localized: "Blocks") : String(localized: "Warns")
        return "\(action) · \(what)"
    }
}

private struct NewDataRuleSheet: View {
    let detectors: [AdminService.Detector]
    let saved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var detector = ""
    @State private var name = ""
    @State private var words = ""
    @State private var block = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Picker("What it looks for", selection: $detector) {
                    Text("Words you list").tag("")
                    ForEach(detectors) { Text($0.name).tag($0.id) }
                }
                if detector.isEmpty {
                    TextField("Rule name", text: $name)
                    TextField("Words, one per line or separated by commas", text: $words, axis: .vertical).lineLimit(3...6)
                }
                Toggle("Block (instead of asking first)", isOn: $block)
                if let error { Text(error).foregroundStyle(Theme.Colors.reject) }
            }
            .navigationTitle("New data rule").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { await save() } }.disabled(busy || !ready) }
            }
        }
    }

    private var ready: Bool {
        !detector.isEmpty || (!name.trimmingCharacters(in: .whitespaces).isEmpty && !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func save() async {
        guard let ctx = AdminService.context else { return }
        busy = true
        defer { busy = false }
        let list = words.split(whereSeparator: { $0 == "\n" || $0 == "," }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        do {
            try await AdminService.addRule(orgId: ctx.orgId, detector: detector.isEmpty ? nil : detector, keywords: list, name: name, action: block ? "block" : "warn", base: ctx.base)
            Haptics.success()
            await saved()
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

// MARK: - Compliance

/// How long things are kept, where the workspace may be used from, who may be
/// invited, legal holds and exports. Admins read them; an owner changes them
/// here, confirming it is them first when the Worker asks (Reauth.swift).
struct ComplianceAdminView: View {
    @State private var governance: AdminService.Governance?
    @State private var holds: [AdminService.Hold] = []
    @State private var exports: [AdminService.ComplianceExport] = []
    @State private var downloaded: [String: URL] = [:]
    @State private var loaded = false
    @State private var busy = false
    @State private var error: String?
    @State private var editingNetworks = false
    @State private var placingHold = false
    @State private var exporting = false

    private var canEdit: Bool { governance?.canEdit == true }

    var body: some View {
        List {
            if let g = governance {
                Section("How long things are kept") {
                    retentionRow("Public channels", key: "publicDays", value: g.retention.publicDays, g: g)
                    retentionRow("Private channels", key: "privateDays", value: g.retention.privateDays, g: g)
                    retentionRow("Direct messages", key: "dmDays", value: g.retention.dmDays, g: g)
                    retentionRow("Files", key: "filesDays", value: g.retention.filesDays, g: g)
                }
                Section {
                    if canEdit {
                        Toggle("Only from these networks", isOn: Binding(
                            get: { g.network.enforce },
                            set: { on in change { try await AdminService.setNetwork(enforce: on, allowlist: g.network.allowlist, orgId: $0, base: $1) } }
                        ))
                        .disabled(busy || g.network.allowlist.isEmpty)
                    } else {
                        LabeledContent("Allowed networks", value: g.network.enforce ? String(localized: "On") : String(localized: "Off"))
                    }
                    ForEach(g.network.allowlist, id: \.self) { Text($0).font(.footnote.monospaced()) }
                    if canEdit {
                        Button { editingNetworks = true } label: { Label("Edit networks", systemImage: "pencil") }
                    }
                } header: { Text("Where it can be used from") } footer: {
                    if let ip = g.yourIp { Text("This phone is at \(ip) now.") }
                }
                Section("Who may be invited") {
                    if canEdit {
                        Picker("Invitations", selection: Binding(
                            get: { g.invites.policy },
                            set: { policy in change { try await AdminService.setInvites(policy: policy, guestsExempt: g.invites.guestsExempt, orgId: $0, base: $1) } }
                        )) {
                            ForEach(["open", "company", "approval"], id: \.self) { Text(policyName($0)).tag($0) }
                        }
                        .disabled(busy)
                        if g.invites.policy != "open" {
                            Toggle("Guests may be invited from anywhere", isOn: Binding(
                                get: { g.invites.guestsExempt },
                                set: { exempt in change { try await AdminService.setInvites(policy: g.invites.policy, guestsExempt: exempt, orgId: $0, base: $1) } }
                            ))
                            .disabled(busy)
                        }
                    } else {
                        LabeledContent("Invitations", value: policyName(g.invites.policy))
                        if g.invites.policy != "open" {
                            LabeledContent("Guests", value: g.invites.guestsExempt ? String(localized: "Anyone") : String(localized: "Same rule"))
                        }
                    }
                }
            }
            Section("Legal holds") {
                if loaded && holds.isEmpty { Text("No holds.").foregroundStyle(Theme.Colors.textSecondary) }
                ForEach(holds) { hold in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(hold.target.name ?? hold.target.channel ?? "").font(.body.weight(.semibold))
                        Text(hold.reason).font(.caption).foregroundStyle(Theme.Colors.textSecondary)
                        Text(hold.releasedAt == nil ? String(localized: "Holding") : String(localized: "Released"))
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(hold.releasedAt == nil ? Theme.Colors.accent : Theme.Colors.textSecondary)
                    }
                    .swipeActions {
                        if canEdit && hold.releasedAt == nil {
                            Button("Release") { change { try await AdminService.releaseHold(hold.id, orgId: $0, base: $1) } }.tint(Theme.Colors.reject)
                        }
                    }
                }
                if canEdit {
                    Button { placingHold = true } label: { Label("Place a hold", systemImage: "lock.doc") }
                }
            }
            Section {
                if loaded && exports.isEmpty { Text("No exports.").foregroundStyle(Theme.Colors.textSecondary) }
                ForEach(exports) { e in
                    HStack {
                        LabeledContent(ChatDates.parse(e.createdAt)?.formatted(date: .abbreviated, time: .shortened) ?? e.createdAt, value: exportStatus(e.status))
                        if e.status == "ready" && canEdit {
                            if let file = downloaded[e.id] {
                                ShareLink(item: file) { Image(systemName: "square.and.arrow.up") }
                            } else {
                                Button { Task { await download(e) } } label: { Image(systemName: "arrow.down.circle") }
                                    .buttonStyle(.borderless).disabled(busy)
                                    .accessibilityLabel(Text("Download"))
                            }
                        }
                    }
                }
                if canEdit {
                    Button { exporting = true } label: { Label("Make an export", systemImage: "square.and.arrow.down.on.square") }
                }
            } header: { Text("Exports") } footer: {
                if canEdit {
                    Text("Owners are asked to confirm it’s them before a change here. Every change, hold and export is in the audit log, and the other owners are emailed.")
                } else {
                    Text("Only an owner can change these.")
                }
            }
        }
        .navigationTitle("Compliance").navigationBarTitleDisplayMode(.inline)
        .modifier(AdminLoad(error: error, loaded: loaded, reload: load))
        .sheet(isPresented: $editingNetworks) {
            NetworksSheet(ranges: governance?.network.allowlist ?? [], yourIp: governance?.yourIp) { ranges in
                let enforce = (governance?.network.enforce ?? false) && !ranges.isEmpty
                return await attempt { try await AdminService.setNetwork(enforce: enforce, allowlist: ranges, orgId: $0, base: $1) }
            }
        }
        .sheet(isPresented: $placingHold) {
            PlaceHoldSheet { person, channel, reason in
                await attempt { try await AdminService.placeHold(person: person, channel: channel, reason: reason, orgId: $0, base: $1) }
            }
        }
        .sheet(isPresented: $exporting) {
            MakeExportSheet { from, to, reason in
                await attempt { try await AdminService.makeExport(from: from, to: to, reason: reason, orgId: $0, base: $1) }
            }
        }
    }

    @ViewBuilder
    private func retentionRow(_ title: LocalizedStringKey, key: String, value: Int?, g: AdminService.Governance) -> some View {
        if canEdit, let choices = g.retentionChoices, !choices.isEmpty {
            Picker(title, selection: Binding(
                get: { value },
                set: { days in change { try await AdminService.setRetention(key, days: days, orgId: $0, base: $1) } }
            )) {
                ForEach(choices.indices, id: \.self) { i in Text(AdminService.days(choices[i])).tag(choices[i]) }
            }
            .disabled(busy)
        } else {
            LabeledContent(title, value: AdminService.days(value))
        }
    }

    private func policyName(_ policy: String) -> String {
        switch policy {
        case "company": String(localized: "Only people at the company’s domains")
        case "approval": String(localized: "Outside the company, an owner approves")
        default: String(localized: "Anyone")
        }
    }

    private func exportStatus(_ status: String) -> String {
        switch status {
        case "ready": String(localized: "Ready")
        case "failed": String(localized: "Failed")
        case "expired": String(localized: "Expired")
        default: String(localized: "Preparing")
        }
    }

    /// A change, then the settings as they now stand.
    private func change(_ run: @escaping (String, URL) async throws -> Void) {
        Task { _ = await attempt(run) }
    }

    /// Nil when it went through, or the sentence that says why not.
    @discardableResult
    private func attempt(_ run: (String, URL) async throws -> Void) async -> String? {
        guard let ctx = AdminService.context else { return nil }
        busy = true
        defer { busy = false }
        var failed: String?
        do { try await run(ctx.orgId, ctx.base); Haptics.success(); error = nil }
        catch { failed = error.localizedDescription; self.error = failed }
        await load()
        return failed
    }

    private func download(_ export: AdminService.ComplianceExport) async {
        guard let ctx = AdminService.context else { return }
        busy = true
        defer { busy = false }
        do { downloaded[export.id] = try await AdminService.downloadExport(export.id, orgId: ctx.orgId, base: ctx.base) }
        catch { self.error = error.localizedDescription }
    }

    private func load() async {
        guard let ctx = AdminService.context else { return }
        do {
            let g = try await AdminService.governance(orgId: ctx.orgId, base: ctx.base)
            governance = g
            holds = try await AdminService.holds(orgId: ctx.orgId, base: ctx.base)
            // Only an owner sees exports at all.
            if g.canEdit == true { exports = try await AdminService.exports(orgId: ctx.orgId, base: ctx.base) } else { exports = [] }
        } catch { self.error = error.localizedDescription }
        loaded = true
    }
}

/// The address ranges the workspace may be used from, one per line.
private struct NetworksSheet: View {
    let ranges: [String]
    let yourIp: String?
    let save: ([String]) async -> String?
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("203.0.113.0/24", text: $text, axis: .vertical)
                        .lineLimit(4...12).font(.body.monospaced())
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("One address or range per line, IPv4 or IPv6.")
                        if let yourIp { Text("This phone is at \(yourIp) now. Keep it in the list, or you will be locked out.") }
                    }
                }
                if let yourIp, !text.contains(yourIp) {
                    Button { text = (text.trimmingCharacters(in: .whitespacesAndNewlines) + "\n" + yourIp).trimmingCharacters(in: .whitespacesAndNewlines) } label: {
                        Label("Add this phone’s address", systemImage: "plus")
                    }
                }
                if let error { Text(error).foregroundStyle(Theme.Colors.reject) }
            }
            .navigationTitle("Allowed networks").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            busy = true
                            let list = text.split(whereSeparator: { $0 == "\n" || $0 == "," || $0 == " " }).map(String.init).filter { !$0.isEmpty }
                            if let failed = await save(list) { error = failed } else { dismiss() }
                            busy = false
                        }
                    }
                    .disabled(busy)
                }
            }
            .onAppear { text = ranges.joined(separator: "\n") }
        }
    }
}

/// A hold on a person or a channel, and the matter it is for.
private struct PlaceHoldSheet: View {
    let place: (_ person: String?, _ channel: String?, _ reason: String) async -> String?
    @Environment(\.dismiss) private var dismiss
    @State private var onPerson = true
    @State private var people: [TeamMember] = []
    @State private var channels: [ChatBusiness] = []
    @State private var person = ""
    @State private var channel = ""
    @State private var reason = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Picker("Hold", selection: $onPerson) {
                    Text("A person").tag(true)
                    Text("A channel").tag(false)
                }
                .pickerStyle(.segmented)
                if onPerson {
                    Picker("Person", selection: $person) {
                        Text("Choose").tag("")
                        ForEach(people) { Text($0.name).tag($0.ref) }
                    }
                } else {
                    Picker("Channel", selection: $channel) {
                        Text("Choose").tag("")
                        ForEach(channels) { Text(verbatim: "#\($0.name)").tag("b:\($0.slug)") }
                    }
                }
                Section {
                    TextField("The matter, e.g. Case 2026-014", text: $reason, axis: .vertical).lineLimit(2...4)
                } footer: {
                    Text("Nothing they say, or that is said there, is deleted while the hold is on, whatever the retention. Nobody else is told.")
                }
                if let error { Text(error).foregroundStyle(Theme.Colors.reject) }
            }
            .navigationTitle("Place a hold").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Place") {
                        Task {
                            busy = true
                            let failed = await place(onPerson ? person : nil, onPerson ? nil : channel, reason.trimmingCharacters(in: .whitespacesAndNewlines))
                            busy = false
                            if let failed { error = failed } else { dismiss() }
                        }
                    }
                    .disabled(busy || reason.trimmingCharacters(in: .whitespaces).isEmpty || (onPerson ? person.isEmpty : channel.isEmpty))
                }
            }
            .task { await loadChoices() }
        }
    }

    private func loadChoices() async {
        guard let ctx = AdminService.context else { return }
        people = (try? await TeamService.members(orgId: ctx.orgId, backendBaseURL: ctx.base).members) ?? []
        channels = (try? await ChatService.businesses(orgId: ctx.orgId, base: ctx.base)) ?? []
    }
}

/// Every message and file between two days, for a matter.
private struct MakeExportSheet: View {
    let make: (_ from: Date, _ to: Date, _ reason: String) async -> String?
    @Environment(\.dismiss) private var dismiss
    @State private var from = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @State private var to = Date()
    @State private var reason = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("From", selection: $from, in: ...to, displayedComponents: .date)
                DatePicker("To", selection: $to, in: from...Date(), displayedComponents: .date)
                Section {
                    TextField("The matter, e.g. Case 2026-014", text: $reason, axis: .vertical).lineLimit(2...4)
                } footer: {
                    Text("Everyone’s messages and files in that time. It can be downloaded for seven days, and the other owners are emailed.")
                }
                if busy { HStack { ProgressView(); Text("Making the export…") } }
                if let error { Text(error).foregroundStyle(Theme.Colors.reject) }
            }
            .navigationTitle("Make an export").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Export") {
                        Task {
                            busy = true
                            let start = Calendar.current.startOfDay(for: from)
                            let end = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: to)) ?? to
                            let failed = await make(start, end, reason.trimmingCharacters(in: .whitespacesAndNewlines))
                            busy = false
                            if let failed { error = failed } else { dismiss() }
                        }
                    }
                    .disabled(busy || reason.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

// MARK: - Single sign-on and audit streams

struct SignOnAdminView: View {
    @State private var sso: AdminService.SSO?
    @State private var streams: [AdminService.Stream] = []
    @State private var loaded = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                if let sso {
                    LabeledContent("Required", value: sso.enforce ? String(localized: "Yes") : String(localized: "No"))
                    if sso.connections.isEmpty { Text("No identity provider is connected.").foregroundStyle(Theme.Colors.textSecondary) }
                    ForEach(sso.connections) { ConnectionRow(connection: $0) }
                }
            } header: { Text("Single sign-on") } footer: {
                Text("When your identity provider signs someone out or switches them off, their session here ends too.")
            }
            Section("Audit streams") {
                if loaded && streams.isEmpty { Text("The audit log is not sent anywhere.").foregroundStyle(Theme.Colors.textSecondary) }
                ForEach(streams) { StreamRow(stream: $0) }
            }
        }
        .navigationTitle("Single sign-on").navigationBarTitleDisplayMode(.inline)
        .modifier(AdminLoad(error: error, loaded: loaded, reload: load))
    }

    private func load() async {
        guard let ctx = AdminService.context else { return }
        do {
            sso = try await AdminService.sso(orgId: ctx.orgId, base: ctx.base)
            streams = try await AdminService.streams(orgId: ctx.orgId, base: ctx.base)
            error = nil
        } catch { self.error = error.localizedDescription }
        loaded = true
    }
}

private struct ConnectionRow: View {
    let connection: AdminService.Connection

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(connection.name).font(.body.weight(.semibold))
                Spacer()
                Text(status).font(.caption.weight(.semibold))
                    .foregroundStyle(connection.status == "active" ? Theme.Colors.accent : Theme.Colors.textSecondary)
            }
            Text(connection.allowedDomains.joined(separator: ", ")).font(.caption).foregroundStyle(Theme.Colors.textSecondary)
        }
    }

    private var status: String {
        switch connection.status {
        case "active": String(localized: "On")
        case "disabled": String(localized: "Off")
        default: String(localized: "Not on yet")
        }
    }
}

private struct StreamRow: View {
    let stream: AdminService.Stream

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(kind).font(.body.weight(.semibold))
                Spacer()
                Text(stream.status == "active" ? String(localized: "Sending") : stream.status == "paused" ? String(localized: "Paused") : String(localized: "Stopped"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(stream.status == "active" ? Theme.Colors.accent : Theme.Colors.reject)
            }
            if let at = ChatDates.parse(stream.lastSentAt) {
                Text("Last sent \(at.formatted(.relative(presentation: .named)))").font(.caption).foregroundStyle(Theme.Colors.textSecondary)
            }
            if let lastError = stream.lastError, !lastError.isEmpty {
                Text(lastError).font(.caption).foregroundStyle(Theme.Colors.reject).lineLimit(2)
            }
        }
    }

    private var kind: String {
        switch stream.kind {
        case "splunk_hec": "Splunk"
        case "datadog": "Datadog"
        case "https": String(localized: "Webhook")
        default: stream.kind
        }
    }
}
