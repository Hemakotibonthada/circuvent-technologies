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

/// The accent pair from src/app/globals.css, so four clients look like one product.
enum Palette {
    static let cyan = Color(red: 0.02, green: 0.71, blue: 0.83)
    static let violet = Color(red: 0.55, green: 0.36, blue: 0.96)
    static let ink = Color(red: 0.04, green: 0.07, blue: 0.13)
    static let panel = Color(red: 0.07, green: 0.10, blue: 0.17)
    static let muted = Color(red: 0.58, green: 0.64, blue: 0.72)
    static let danger = Color(red: 0.97, green: 0.44, blue: 0.44)
    static let ok = Color(red: 0.13, green: 0.77, blue: 0.37)
}

struct RootView: View {
    @EnvironmentObject var model: HomeModel

    var body: some View {
        ZStack {
            Palette.ink.ignoresSafeArea()
            if model.signedIn {
                DeviceListView()
            } else {
                SignInView()
            }
        }
        .task { await model.startIfSignedIn() }
    }
}

struct SignInView: View {
    @EnvironmentObject var model: HomeModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Circuvent")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(.white)
            Text("Native client")
                .font(.system(size: 15))
                .foregroundStyle(Palette.cyan)
                .padding(.bottom, 14)

            TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .textFieldStyle(.roundedBorder)

            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)

            if let error = model.error {
                Text(error)
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.danger)
            }

            Button {
                Task { await model.signIn(email: email, password: password) }
            } label: {
                if model.loading {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Text("Sign in").frame(maxWidth: .infinity)
                }
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

struct DeviceListView: View {
    @EnvironmentObject var model: HomeModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Your devices")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(.white)
                    // Said out loud rather than left to be inferred from
                    // nothing changing on screen.
                    Text(model.liveConnected ? "Live" : "Not receiving live updates")
                        .font(.system(size: 12))
                        .foregroundStyle(model.liveConnected ? Palette.cyan : .yellow)
                }
                Spacer()
                Button("Refresh") { Task { await model.load() } }
                Button("Sign out") { model.signOut() }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)

            if let error = model.error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.danger)
                    .padding(.horizontal, 20)
                    .padding(.top, 6)
            }

            if model.devices.isEmpty {
                Spacer()
                Text(model.loading ? "Loading…" : "No devices on this account yet.")
                    .foregroundStyle(Palette.muted)
                    .frame(maxWidth: .infinity)
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(model.devices) { device in
                            DeviceRow(device: device)
                        }
                    }
                    .padding(16)
                }
            }
        }
    }
}

struct DeviceRow: View {
    @EnvironmentObject var model: HomeModel
    let device: Device

    private var field: String? { Commands.primaryToggle(type: device.type) }
    private var isOn: Bool? { field.flatMap { device.bool($0) } }
    private var pending: Bool {
        guard let field else { return false }
        return model.pending.contains("\(device.id)::\(field)")
    }

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(device.online ? Palette.ok : Palette.muted.opacity(0.5))
                .frame(width: 10, height: 10)

            VStack(alignment: .leading, spacing: 2) {
                Text(device.label)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.muted)
            }
            Spacer()

            if pending {
                ProgressView()
            } else if let field, let isOn {
                Toggle("", isOn: Binding(
                    get: { isOn },
                    set: { value in Task { await model.toggle(device, field: field, value: value) } }
                ))
                .labelsHidden()
                .tint(Palette.cyan)
                .disabled(!device.online)
            } else {
                // A device with no primary switch gets no switch drawn. The
                // alternative — a control that sends `power` and hopes — is how
                // four shipped types ended up with a toggle their firmware
                // dropped in silence.
                Text("—").foregroundStyle(Palette.muted)
            }
        }
        .padding(16)
        .background(Palette.panel)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var subtitle: String {
        var parts = [device.type]
        if let room = device.room, !room.isEmpty { parts.append(room) }
        if !device.online { parts.append("offline") }
        return parts.joined(separator: " · ")
    }
}
