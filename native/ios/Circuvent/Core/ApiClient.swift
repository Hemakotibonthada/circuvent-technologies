import Foundation

/// Where the session lives.
///
/// The Keychain rather than UserDefaults: this holds a bearer token that is as
/// good as the password until it expires. UserDefaults is a plist in the app
/// container, readable from a backup, and it is where this sort of thing ends
/// up when nobody makes the decision deliberately.
final class Session {
    private let service = "com.circuvent.app.nativeclient"

    var token: String? {
        get { read("token") }
        set { write("token", newValue) }
    }

    var refreshToken: String? {
        get { read("refresh") }
        set { write("refresh", newValue) }
    }

    var signedIn: Bool { !(token ?? "").isEmpty }

    func clear() {
        write("token", nil)
        write("refresh", nil)
    }

    private func query(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    private func read(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func write(_ key: String, _ value: String?) {
        let q = query(key)
        SecItemDelete(q as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var add = q
        add[kSecValueData as String] = data
        /*
         * Not synchronised to iCloud, and unavailable until the device has been
         * unlocked once after boot. A session token that follows somebody onto
         * a second device is a session they never started there.
         */
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}

enum ApiError: Error, LocalizedError {
    case unreachable
    case server(String, Int)

    var errorDescription: String? {
        switch self {
        case .unreachable:
            return "Could not reach Circuvent. Check the connection."
        case .server(let message, _):
            return message
        }
    }
}

/// The REST client.
///
/// Deliberately the same shape as the Kotlin `ApiClient`: same endpoints, same
/// single-flight refresh, same rule about never paraphrasing the server's own
/// error text. Two clients that solve the same problem differently are two
/// clients that behave differently under failure, and failure is the only time
/// anybody notices.
actor ApiClient {
    private let session: Session
    private let urlSession: URLSession
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    /// Set while a refresh is in flight, so a burst of 401s rotates once.
    ///
    /// Refresh tokens are single-use, so letting each retry rotate
    /// independently means all but one present a spent token — and the server
    /// reads a spent token as replay and tears the whole family down, signing
    /// the user out of a session that was merely stale. The Expo client learned
    /// this the hard way.
    private var refreshTask: Task<Bool, Never>?

    init(session: Session) {
        self.session = session
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.waitsForConnectivity = true
        self.urlSession = URLSession(configuration: config)
    }

    func login(email: String, password: String) async throws -> AuthResponse {
        let body: [String: JSONValue] = [
            "email": .string(email),
            "password": .string(password),
        ]
        let data = try await send(Api.login, method: "POST", body: body, authed: false)
        let auth = try decoder.decode(AuthResponse.self, from: data)
        guard !auth.token.isEmpty else {
            throw ApiError.server(auth.error ?? "Those details were not accepted.", 401)
        }
        session.token = auth.token
        if let r = auth.refreshToken { session.refreshToken = r }
        return auth
    }

    func devices() async throws -> [Device] {
        let data = try await send(Api.devices, method: "GET")
        return try decoder.decode(DeviceList.self, from: data).devices
    }

    func command(deviceID: String, _ cmd: [String: JSONValue]) async throws {
        _ = try await send(Api.command(deviceID), method: "POST", body: cmd)
    }

    // MARK: - plumbing

    private func send(
        _ path: String,
        method: String,
        body: [String: JSONValue]? = nil,
        authed: Bool = true,
        allowRetry: Bool = true
    ) async throws -> Data {
        guard let url = URL(string: Api.base + path) else { throw ApiError.unreachable }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        if authed, let t = session.token {
            req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: req)
        } catch {
            throw ApiError.unreachable
        }

        guard let http = response as? HTTPURLResponse else { throw ApiError.unreachable }

        if http.statusCode == 401, authed, allowRetry, session.refreshToken != nil {
            if await refreshOnce() {
                return try await send(path, method: method, body: body,
                                      authed: authed, allowRetry: false)
            }
        }

        guard (200..<300).contains(http.statusCode) else {
            throw ApiError.server(message(from: data, status: http.statusCode), http.statusCode)
        }
        return data
    }

    private func refreshOnce() async -> Bool {
        if let existing = refreshTask { return await existing.value }
        let task = Task<Bool, Never> { [session] in
            guard let rt = session.refreshToken,
                  let url = URL(string: Api.base + Api.refresh) else { return false }
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONEncoder().encode(["refreshToken": JSONValue.string(rt)])

            guard let (data, response) = try? await URLSession.shared.data(for: req),
                  let http = response as? HTTPURLResponse else { return false }

            guard (200..<300).contains(http.statusCode) else {
                // A refused refresh means the family is gone. Holding a dead
                // token would leave every later call retrying forever.
                session.clear()
                return false
            }
            guard let auth = try? JSONDecoder().decode(AuthResponse.self, from: data),
                  !auth.token.isEmpty else { return false }
            session.token = auth.token
            if let r = auth.refreshToken { session.refreshToken = r }
            return true
        }
        refreshTask = task
        let ok = await task.value
        refreshTask = nil
        return ok
    }

    /// The server's own words when it sends them, never a paraphrase.
    private func message(from data: Data, status: Int) -> String {
        if let obj = try? JSONDecoder().decode([String: JSONValue].self, from: data),
           let text = obj["error"]?.stringValue, !text.isEmpty {
            return text
        }
        switch status {
        case 403: return "This account is not allowed to do that."
        case 404: return "That is no longer there."
        case 500...599: return "Circuvent is having trouble. Try again shortly."
        default: return "That did not work (HTTP \(status))."
        }
    }
}
