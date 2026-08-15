import Foundation
import SwiftUI

/// The screen's state, and the only place it changes.
///
/// Mirrors `HomeViewModel` on the Android side deliberately, including the
/// pending-command set and the slow poll behind the socket. Two clients that
/// solve the same problem differently behave differently under failure, and
/// failure is the only time anybody notices.
@MainActor
final class HomeModel: ObservableObject {
    @Published var signedIn: Bool
    @Published var loading = false
    @Published var devices: [Device] = []
    @Published var error: String?
    @Published var liveConnected = false
    /// Fields with a command in flight, as "deviceId::field".
    @Published var pending: Set<String> = []

    private let session = Session()
    private let api: ApiClient
    private let live: LiveFeed
    private var pollTask: Task<Void, Never>?

    init() {
        api = ApiClient(session: session)
        live = LiveFeed(session: session)
        signedIn = session.signedIn
    }

    func startIfSignedIn() async {
        guard signedIn else { return }
        await load()
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
            await load()
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
        devices = []
        pending = []
        liveConnected = false
        signedIn = false
    }

    func load() async {
        loading = devices.isEmpty
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

    /// Flip one boolean field on a device.
    ///
    /// The field is marked pending until the device's own report replaces it.
    /// That pin is the whole reason `Commands` refuses to build a command for a
    /// field a type does not read: a control that pins and never resolves is
    /// worse than one that does nothing, because it also lies about being busy.
    func toggle(_ device: Device, field: String, value: Bool) async {
        guard let cmd = Commands.setBool(type: device.type, field: field, value: value) else {
            error = "This app does not know how to switch \(device.type). Nothing was sent."
            return
        }
        let key = "\(device.id)::\(field)"
        pending.insert(key)
        do {
            try await api.command(deviceID: device.id, cmd)
        } catch {
            pending.remove(key)
            self.error = error.localizedDescription
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
                await self.load()
            }
        }
    }
}
