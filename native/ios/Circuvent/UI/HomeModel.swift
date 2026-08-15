import Foundation
import SwiftUI

enum Tab: String, CaseIterable, Identifiable {
    case home = "Home"
    case devices = "Devices"
    case rooms = "Rooms"
    case scenes = "Scenes"
    case more = "More"

    var id: String { rawValue }

    var glyph: String {
        switch self {
        case .home: return "house"
        case .devices: return "square.grid.2x2"
        case .rooms: return "rectangle.3.group"
        case .scenes: return "sparkles"
        case .more: return "ellipsis"
        }
    }
}

/// The screen's state, and the only place it changes.
///
/// Mirrors `HomeViewModel` on the Android side deliberately, including the
/// pending-command set, the slow poll behind the socket and the rule that a
/// rooms or scenes failure must not blank the device list. Two clients that
/// solve the same problem differently behave differently under failure, and
/// failure is the only time anybody notices.
@MainActor
final class HomeModel: ObservableObject {
    @Published var signedIn: Bool
    @Published var loading = false
    @Published var tab: Tab = .home
    @Published var devices: [Device] = []
    @Published var rooms: [Room] = []
    @Published var scenes: [Scene] = []
    @Published var automations: [Automation] = []
    @Published var error: String?
    @Published var notice: String?
    @Published var liveConnected = false
    /// Fields with a command in flight, as "deviceId::field".
    @Published var pending: Set<String> = []
    @Published var openDeviceID: String?
    @Published var roomFilter: String?

    private let session = Session()
    private let api: ApiClient
    private let live: LiveFeed
    private var pollTask: Task<Void, Never>?

    init() {
        api = ApiClient(session: session)
        live = LiveFeed(session: session)
        signedIn = session.signedIn
    }

    var openDevice: Device? { devices.first { $0.id == openDeviceID } }
    var favourites: [Device] { devices.filter { $0.favorite } }
    var onlineCount: Int { devices.filter { $0.online }.count }

    /// Devices that are on right now, by the field their own firmware reads.
    var activeCount: Int {
        devices.filter { d in
            guard let power = DeviceCapabilities.of(d.type).power else { return false }
            return d.bool(power.field) == true
        }.count
    }

    // MARK: - lifecycle

    func startIfSignedIn() async {
        guard signedIn else { return }
        await loadAll()
        startLive()
        startPolling()
    }

    func signIn(email: String, password: String) async {
        loading = true
        error = nil
        do {
            _ = try await api.login(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
            loading = false
            signedIn = true
            await loadAll()
            startLive()
            startPolling()
        } catch {
            loading = false
            self.error = error.localizedDescription
        }
    }

    func signOut() {
        pollTask?.cancel()
        live.disconnect()
        session.clear()
        devices = []; rooms = []; scenes = []; automations = []
        pending = []
        liveConnected = false
        signedIn = false
    }

    func dismissNotice() { notice = nil; error = nil }

    // MARK: - actions

    /// Flip one boolean field on a device.
    func toggle(_ device: Device, field: String, value: Bool) async {
        await send(device, field: field,
                   cmd: Commands.setBool(type: device.type, field: field, value: value))
    }

    /// A 0..100 control: brightness, curtain position, fan speed.
    func setLevel(_ device: Device, field: String, value: Int, legacyField: String? = nil) async {
        let clamped = min(max(value, 0), 100)
        var cmd: [String: JSONValue] = ["action": .string("set"), field: .number(Double(clamped))]
        /*
         * The legacy field rides along on purpose. A fan that has not taken the
         * firmware update reads `speed` and ignores `level`; one that has reads
         * both. Sending only the new field would make the control silently do
         * nothing on older hardware, which is indistinguishable from a broken
         * fan.
         */
        if let legacyField {
            cmd[legacyField] = .number(Double(min(max(clamped / 34, 0), 3)))
        }
        await send(device, field: field, cmd: cmd)
    }

    func setTarget(_ device: Device, field: String, value: Int) async {
        await send(device, field: field,
                   cmd: ["action": .string("set"), field: .number(Double(value))])
    }

    /// Every gang of a touch board at once.
    func allGangs(_ device: Device, value: Bool) async {
        await send(device, field: "all", cmd: Commands.allGangs(value))
    }

    func star(_ device: Device) async {
        guard let index = devices.firstIndex(where: { $0.id == device.id }) else { return }
        let next = !device.favorite
        // Applied locally first: starring is the app's own record, not the
        // device's, so there is no echo coming to confirm it.
        devices[index].favorite = next
        do {
            try await api.patchDevice(deviceID: device.id, favorite: next)
        } catch {
            devices[index].favorite = !next
            self.error = "Could not save that."
        }
    }

    func runScene(_ scene: Scene) async {
        do {
            try await api.runScene(id: scene.id)
            notice = "\(scene.name) applied."
            // A scene moves several devices at once and the echoes arrive
            // separately, so the list is refreshed rather than guessed at.
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            await loadDevices()
        } catch {
            self.error = "Could not run \(scene.name)."
        }
    }

    /// Ask a device to raise its setup hotspot, so nobody has to walk to it.
    func openSetupMode(_ device: Device) async {
        do {
            try await api.command(deviceID: device.id, Commands.setupMode(minutes: 10))
            notice = "\(device.label) will open its setup hotspot for 10 minutes, " +
                "then rejoin your Wi-Fi on its own."
        } catch {
            self.error = "Could not reach \(device.label)."
        }
    }

    private func send(_ device: Device, field: String, cmd: [String: JSONValue]?) async {
        guard let cmd else {
            error = "This app does not know how to control \(device.type). Nothing was sent."
            return
        }
        let key = "\(device.id)::\(field)"
        pending.insert(key)
        do {
            try await api.command(deviceID: device.id, cmd)
        } catch {
            pending.remove(key)
            self.error = "That did not reach \(device.label)."
            return
        }
        /*
         * Released on a timer as well as by the device's echo. Without the timer
         * a command the hardware never answers leaves the control spinning for
         * the rest of the session, which reads as the app being broken rather
         * than the device being unreachable.
         */
        Task {
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            await MainActor.run { self.pending.remove(key) }
        }
    }

    // MARK: - loading

    func loadAll() async {
        loading = devices.isEmpty
        await loadDevices()
        // Rooms and scenes change rarely, so a failure on either is not allowed
        // to blank the device list the app is actually for.
        if let r = try? await api.rooms() { rooms = r }
        if let s = try? await api.scenes() { scenes = s }
        if let a = try? await api.automations() { automations = a }
        loading = false
    }

    func loadDevices() async {
        do {
            let list = try await api.devices()
            devices = list.sorted {
                if $0.favorite != $1.favorite { return $0.favorite }
                if $0.online != $1.online { return $0.online }
                return $0.label.lowercased() < $1.label.lowercased()
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func startLive() {
        live.connect { [weak self] update in
            Task { @MainActor in
                guard let self else { return }
                if update.type == "socket:down" {
                    self.liveConnected = false
                    return
                }
                self.liveConnected = true
                self.apply(update)
            }
        }
    }

    private func apply(_ update: DeviceUpdate) {
        guard let index = devices.firstIndex(where: { $0.id == update.deviceId }) else { return }
        switch update.kind {
        case "state":
            // Only `state` is the whole picture. Telemetry is a reading, and
            // status is the broker speaking for a device that stopped
            // answering — merging either into state displays a moment as the
            // present.
            devices[index].state.merge(update.payload) { _, new in new }
        case "status":
            if let online = update.payload["online"]?.boolValue {
                devices[index].online = online
            }
        default:
            break
        }
        pending = pending.filter { !$0.hasPrefix("\(update.deviceId)::") }
    }

    /// A slow poll behind the socket. The socket makes it feel instant; this
    /// makes it true.
    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                guard let self else { return }
                await self.loadDevices()
            }
        }
    }
}
