import Foundation

/// The live device feed.
///
/// The socket carries its token in the query string rather than a header. That
/// is not a shortcut — a WebSocket handshake from a browser cannot set custom
/// headers, so the control plane accepts it there, and all four clients connect
/// the same way so there is one code path on the server to keep right.
///
/// WHY POLLING IS NOT ENOUGH, AND WHY THE SOCKET IS NOT TRUSTED EITHER
///
/// A command's confirmation arrives here, so without the socket every control
/// would sit pinned until a poll happened to catch up. But a socket that has
/// silently stopped delivering looks exactly like a home where nothing is
/// happening, which is the failure mode this codebase keeps finding. The caller
/// keeps a slow refresh going as well: the socket makes it feel instant, the
/// poll makes it true.
final class LiveFeed {
    private let session: Session
    private var task: URLSessionWebSocketTask?

    /// Emitted when the socket drops, so the UI can admit it has lost touch
    /// rather than showing confidently stale state.
    static let disconnected = DeviceUpdate(type: "socket:down")

    init(session: Session) {
        self.session = session
    }

    func connect(onUpdate: @escaping (DeviceUpdate) -> Void) {
        guard let token = session.token, !token.isEmpty else { return }
        let encoded = token.addingPercentEncoding(
            withAllowedCharacters: .urlQueryAllowed
        ) ?? token
        guard let url = URL(string: "\(Api.ws)?token=\(encoded)") else { return }

        let ws = URLSession.shared.webSocketTask(with: url)
        task = ws
        ws.resume()
        receive(ws, onUpdate: onUpdate)
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    private func receive(_ ws: URLSessionWebSocketTask, onUpdate: @escaping (DeviceUpdate) -> Void) {
        ws.receive { [weak self] result in
            switch result {
            case .failure:
                onUpdate(Self.disconnected)
                // Not re-armed here: the caller decides when to reconnect.
                // Looping on a dead socket would spin a phone's radio flat.
                return
            case .success(let message):
                if case .string(let text) = message,
                   let data = text.data(using: .utf8),
                   let update = try? JSONDecoder().decode(DeviceUpdate.self, from: data),
                   // Frames are a separate message type and are not device
                   // state. Feeding them through here would have a camera's
                   // video overwriting the fields a control renders from.
                   update.type == "device:update" {
                    onUpdate(update)
                }
                self?.receive(ws, onUpdate: onUpdate)
            }
        }
    }
}
