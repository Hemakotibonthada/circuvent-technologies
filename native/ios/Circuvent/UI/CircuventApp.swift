import SwiftUI

@main
struct CircuventApp: App {
    @StateObject private var model = HomeModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
        }
    }
}

/// The accent pair from src/app/globals.css, so every client looks like one product.
enum Palette {
    static let cyan = Color(red: 0.02, green: 0.71, blue: 0.83)
    static let violet = Color(red: 0.55, green: 0.36, blue: 0.96)
    static let ink = Color(red: 0.04, green: 0.07, blue: 0.13)
    static let panel = Color(red: 0.07, green: 0.10, blue: 0.17)
    static let muted = Color(red: 0.58, green: 0.64, blue: 0.72)
    static let danger = Color(red: 0.97, green: 0.44, blue: 0.44)
    static let ok = Color(red: 0.13, green: 0.77, blue: 0.37)
    static let amber = Color(red: 0.98, green: 0.75, blue: 0.14)
}

struct RootView: View {
    @EnvironmentObject var model: HomeModel

    var body: some View {
        ZStack {
            Palette.ink.ignoresSafeArea()
            if model.signedIn { Shell() } else { SignInView() }
        }
        .task { await model.startIfSignedIn() }
    }
}

// MARK: - shell

struct Shell: View {
    @EnvironmentObject var model: HomeModel

    var body: some View {
        TabView(selection: $model.tab) {
            ForEach(Tab.allCases) { tab in
                VStack(spacing: 0) {
                    Banner()
                    content(for: tab)
                }
                .tabItem { Label(tab.rawValue, systemImage: tab.glyph) }
                .tag(tab)
            }
        }
        .tint(Palette.cyan)
        .sheet(item: Binding(
            get: { model.openDevice },
            set: { if $0 == nil { model.openDeviceID = nil } }
        )) { device in
            DeviceSheet(device: device)
                .environmentObject(model)
        }
    }

    @ViewBuilder
    private func content(for tab: Tab) -> some View {
        switch tab {
        case .home: HomeTab()
        case .devices: DevicesTab()
        case .rooms: RoomsTab()
        case .scenes: ScenesTab()
        case .more: MoreTab()
        }
    }
}

/// Errors and confirmations, in one place.
///
/// Both are shown rather than only errors: a scene that ran and a command that
/// failed are equally worth saying out loud, and an app that only speaks when
/// something breaks trains people to distrust silence.
struct Banner: View {
    @EnvironmentObject var model: HomeModel

    var body: some View {
        if let message = model.error ?? model.notice {
            let isError = model.error != nil
            HStack {
                Text(message)
                    .font(.system(size: 13))
                    .foregroundStyle(isError ? Palette.danger : Palette.cyan)
                Spacer()
                Button("Dismiss") { model.dismissNotice() }
                    .font(.system(size: 12))
            }
            .padding(12)
            .background((isError ? Palette.danger : Palette.cyan).opacity(0.14))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 12)
            .padding(.top, 8)
        }
    }
}

// MARK: - auth

struct SignInView: View {
    @EnvironmentObject var model: HomeModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Circuvent").font(.system(size: 34, weight: .bold)).foregroundStyle(.white)
            Text("Native client").font(.system(size: 15)).foregroundStyle(Palette.cyan)
                .padding(.bottom, 14)

            TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .textFieldStyle(.roundedBorder)

            SecureField("Password", text: $password).textFieldStyle(.roundedBorder)

            if let error = model.error {
                Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
            }

            Button {
                Task { await model.signIn(email: email, password: password) }
            } label: {
                if model.loading { ProgressView().frame(maxWidth: .infinity) }
                else { Text("Sign in").frame(maxWidth: .infinity) }
            }
            .buttonStyle(.borderedProminent)
            .tint(Palette.cyan)
            .controlSize(.large)
            .disabled(model.loading || email.isEmpty || password.isEmpty)
            .padding(.top, 6)
        }
        .padding(24)
    }
}

// MARK: - home

struct HomeTab: View {
    @EnvironmentObject var model: HomeModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Home").font(.system(size: 28, weight: .bold)).foregroundStyle(.white)
                    Text(model.liveConnected ? "Live" : "Not receiving live updates")
                        .font(.system(size: 12))
                        .foregroundStyle(model.liveConnected ? Palette.cyan : Palette.amber)
                }

                HStack(spacing: 10) {
                    Stat(value: "\(model.activeCount)", label: "on now")
                    Stat(value: "\(model.onlineCount)/\(model.devices.count)", label: "online")
                    Stat(value: "\(model.scenes.count)", label: "scenes")
                }

                if !model.scenes.isEmpty {
                    SectionLabel("Scenes")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(model.scenes) { scene in
                                Button {
                                    Task { await model.runScene(scene) }
                                } label: {
                                    Text(scene.name.isEmpty ? "Scene \(scene.id)" : scene.name)
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 16).padding(.vertical, 14)
                                        .background(Palette.panel)
                                        .clipShape(RoundedRectangle(cornerRadius: 14))
                                }
                            }
                        }
                    }
                }

                if !model.favourites.isEmpty {
                    SectionLabel("Favourites")
                    ForEach(model.favourites) { DeviceRow(device: $0) }
                    SectionLabel("Everything else")
                    ForEach(model.devices.filter { !$0.favorite }) { DeviceRow(device: $0) }
                } else {
                    SectionLabel("Devices")
                    if model.devices.isEmpty {
                        EmptyLine(model.loading ? "Loading…" : "No devices on this account yet.")
                    }
                    ForEach(model.devices) { DeviceRow(device: $0) }
                }
            }
            .padding(16)
        }
    }
}

struct Stat: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.system(size: 22, weight: .bold)).foregroundStyle(Palette.cyan)
            Text(label).font(.system(size: 11)).foregroundStyle(Palette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Palette.panel)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - devices

struct DevicesTab: View {
    @EnvironmentObject var model: HomeModel

    private var shown: [Device] {
        guard let filter = model.roomFilter else { return model.devices }
        return model.devices.filter { $0.room == filter }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Devices").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                Spacer()
                Button("Refresh") { Task { await model.loadAll() } }
            }
            .padding(.horizontal, 16).padding(.top, 12)

            if !model.rooms.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        Chip(title: "All", selected: model.roomFilter == nil) {
                            model.roomFilter = nil
                        }
                        ForEach(model.rooms) { room in
                            Chip(title: room.name, selected: model.roomFilter == room.name) {
                                model.roomFilter = model.roomFilter == room.name ? nil : room.name
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.top, 8)
            }

            if shown.isEmpty {
                EmptyLine(
                    model.loading ? "Loading…"
                        : model.roomFilter != nil ? "Nothing in \(model.roomFilter!) yet."
                        : "No devices on this account yet."
                )
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(shown) { DeviceRow(device: $0) }
                    }
                    .padding(16)
                }
            }
        }
    }
}

struct Chip: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13))
                .foregroundStyle(selected ? Palette.ink : .white)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(selected ? Palette.cyan : Palette.panel)
                .clipShape(Capsule())
        }
    }
}

struct DeviceRow: View {
    @EnvironmentObject var model: HomeModel
    let device: Device

    private var caps: Capabilities { DeviceCapabilities.of(device.type) }
    private var pending: Bool {
        guard let f = caps.power?.field else { return false }
        return model.pending.contains("\(device.id)::\(f)")
    }

    var body: some View {
        Button {
            model.openDeviceID = device.id
        } label: {
            HStack(spacing: 12) {
                Circle()
                    .fill(device.online ? Palette.ok : Palette.muted.opacity(0.5))
                    .frame(width: 10, height: 10)

                VStack(alignment: .leading, spacing: 2) {
                    Text(device.label)
                        .font(.system(size: 16, weight: .semibold)).foregroundStyle(.white)
                    Text(subtitle).font(.system(size: 12)).foregroundStyle(Palette.muted)
                }
                Spacer()

                if pending {
                    ProgressView()
                } else if let power = caps.power, let on = device.bool(power.field) {
                    Toggle("", isOn: Binding(
                        get: { on },
                        set: { v in
                            Task { await model.toggle(device, field: power.field, value: v) }
                        }
                    ))
                    .labelsHidden()
                    .tint(Palette.cyan)
                    .disabled(!device.online)
                } else {
                    /*
                     * A device with no primary switch gets no switch drawn. The
                     * alternative — a control that sends `power` and hopes — is
                     * how four shipped types ended up with a toggle their
                     * firmware dropped in silence.
                     */
                    Text("›").foregroundStyle(Palette.muted)
                }
            }
            .padding(16)
            .background(Palette.panel)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }

    private var subtitle: String {
        var parts = [DeviceCapabilities.metric(for: device)]
        if let room = device.room, !room.isEmpty { parts.append(room) }
        if !device.online { parts.append("offline") }
        return parts.joined(separator: " · ")
    }
}

// MARK: - rooms and scenes

struct RoomsTab: View {
    @EnvironmentObject var model: HomeModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Rooms").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                if model.rooms.isEmpty {
                    EmptyLine(model.loading ? "Loading…" : "No rooms yet.")
                }
                ForEach(model.rooms) { room in
                    let inRoom = model.devices.filter { $0.room == room.name }
                    let on = inRoom.filter { d in
                        guard let p = DeviceCapabilities.of(d.type).power else { return false }
                        return d.bool(p.field) == true
                    }.count
                    Button {
                        model.roomFilter = room.name
                        model.tab = .devices
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(room.name)
                                    .font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
                                Text("\(inRoom.count) device\(inRoom.count == 1 ? "" : "s") · \(on) on")
                                    .font(.system(size: 12)).foregroundStyle(Palette.muted)
                            }
                            Spacer()
                            Text("›").foregroundStyle(Palette.muted)
                        }
                        .padding(16)
                        .background(Palette.panel)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
    }
}

struct ScenesTab: View {
    @EnvironmentObject var model: HomeModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Scenes").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                if model.scenes.isEmpty {
                    EmptyLine(model.loading ? "Loading…" : "No scenes yet.")
                }
                ForEach(model.scenes) { scene in
                    Button {
                        Task { await model.runScene(scene) }
                    } label: {
                        HStack {
                            Text(scene.name.isEmpty ? "Scene \(scene.id)" : scene.name)
                                .font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
                            Spacer()
                            Text("Run").font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Palette.cyan)
                        }
                        .padding(16)
                        .background(Palette.panel)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                }

                if !model.automations.isEmpty {
                    SectionLabel("Automations")
                    ForEach(model.automations) { a in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(a.name.isEmpty ? "Automation \(a.id)" : a.name)
                                    .font(.system(size: 16, weight: .semibold)).foregroundStyle(.white)
                                Text(a.enabled ? "Enabled" : "Paused")
                                    .font(.system(size: 12)).foregroundStyle(Palette.muted)
                            }
                            Spacer()
                            /*
                             * Read-only for now, and shown rather than hidden.
                             * An automation the owner cannot see is one they
                             * cannot explain when it fires; an editor that
                             * half-worked would be worse than this.
                             */
                            Circle()
                                .fill(a.enabled ? Palette.ok : Palette.muted)
                                .frame(width: 10, height: 10)
                        }
                        .padding(16)
                        .background(Palette.panel)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                }
            }
            .padding(16)
        }
    }
}

// MARK: - more

struct MoreTab: View {
    @EnvironmentObject var model: HomeModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("More").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)

                Card(title: "Connection") {
                    InfoLine("Live feed",
                             model.liveConnected ? "connected" : "not connected",
                             model.liveConnected ? Palette.ok : Palette.amber)
                    InfoLine("Devices",
                             "\(model.onlineCount) of \(model.devices.count) online",
                             Palette.muted)
                }

                Card(title: "About") {
                    InfoLine("Client", "Native iOS", Palette.muted)
                    InfoLine("Version", "0.1.0", Palette.muted)
                    Text("This is the native client. The Expo app remains the published one and " +
                         "is installed separately; both can run on this phone at once.")
                        .font(.system(size: 11)).foregroundStyle(Palette.muted)
                }

                Button("Refresh everything") { Task { await model.loadAll() } }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)

                Button("Sign out") { model.signOut() }
                    .buttonStyle(.borderedProminent)
                    .tint(Palette.danger)
                    .frame(maxWidth: .infinity)
            }
            .padding(16)
        }
    }
}

struct Card<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Palette.panel)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

struct InfoLine: View {
    let label: String
    let value: String
    let color: Color

    init(_ label: String, _ value: String, _ color: Color) {
        self.label = label; self.value = value; self.color = color
    }

    var body: some View {
        HStack {
            Text(label).font(.system(size: 13)).foregroundStyle(Palette.muted)
            Spacer()
            Text(value).font(.system(size: 13)).foregroundStyle(color)
        }
    }
}

// MARK: - shared

struct SectionLabel: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(Palette.muted)
            .padding(.top, 8)
    }
}

struct EmptyLine: View {
    let message: String
    init(_ message: String) { self.message = message }

    var body: some View {
        Text(message)
            .foregroundStyle(Palette.muted)
            .font(.system(size: 15))
            .frame(maxWidth: .infinity)
            .padding(32)
    }
}
