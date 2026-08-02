import Foundation

/**
 * The network calls an App Intent makes.
 *
 * Separate from the app's JavaScript client on purpose: Siri gives an intent a
 * few seconds to answer, and booting the React Native runtime to send one MQTT
 * command would routinely blow that budget. This talks to the control plane
 * directly with URLSession.
 *
 * It deliberately knows nothing about device types. Which state field a device
 * toggles is decided in TypeScript (`deviceMeta` / `capabilities`) and synced
 * across as `toggleField`, so adding a device type does not mean editing Swift
 * — and the two can never disagree about what "on" means for a curtain.
 */

enum SiriApiError: Error, LocalizedError {
  case notSignedIn
  case unauthorized
  case offline
  case server(Int)

  var errorDescription: String? {
    switch self {
    case .notSignedIn: return "Open Circuvent and sign in first."
    case .unauthorized: return "Your Circuvent session has expired. Open the app to sign in again."
    case .offline: return "I couldn't reach Circuvent."
    case .server(let code): return "Circuvent returned an error (\(code))."
    }
  }
}

enum SiriApi {
  private static let timeout: TimeInterval = 8

  private static func request(path: String, body: [String: Any]?) throws -> URLRequest {
    guard let token = SiriStore.token else { throw SiriApiError.notSignedIn }
    guard let url = URL(string: SiriStore.apiBase + path) else { throw SiriApiError.offline }

    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.timeoutInterval = timeout
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if let body = body {
      req.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
    return req
  }

  private static func send(_ req: URLRequest) async throws {
    let (_, response): (Data, URLResponse)
    do {
      (_, response) = try await URLSession.shared.data(for: req)
    } catch {
      throw SiriApiError.offline
    }
    guard let http = response as? HTTPURLResponse else { throw SiriApiError.offline }
    if http.statusCode == 401 || http.statusCode == 403 { throw SiriApiError.unauthorized }
    guard (200...299).contains(http.statusCode) else { throw SiriApiError.server(http.statusCode) }
  }

  /// Sends a raw command to one device.
  static func command(deviceId: String, payload: [String: Any]) async throws {
    let escaped = deviceId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? deviceId
    try await send(try request(path: "/devices/\(escaped)/command", body: payload))
  }

  /// Switches a device on or off using the field the app told us about.
  static func setPower(device: SiriDevice, on: Bool) async throws {
    guard !device.toggleField.isEmpty else { throw SiriApiError.server(400) }
    try await command(deviceId: device.id, payload: ["action": "set", device.toggleField: on])
  }

  static func setLocked(device: SiriDevice, locked: Bool) async throws {
    if device.type == "facedoor" && !locked {
      // A face-door records how it was opened; "voice" keeps the audit trail
      // honest rather than logging a Siri unlock as a panel press.
      try await command(deviceId: device.id, payload: ["action": "unlock", "method": "voice"])
    } else {
      try await command(deviceId: device.id, payload: ["action": "set", "locked": locked])
    }
  }

  static func setGate(device: SiriDevice, open: Bool) async throws {
    try await command(deviceId: device.id, payload: ["action": open ? "open" : "close"])
  }

  static func setCurtain(device: SiriDevice, open: Bool) async throws {
    try await command(deviceId: device.id, payload: ["action": "set", "position": open ? 100 : 0])
  }

  /// Arms or disarms an alarm. Guardian and the motion sensor both take this.
  static func setArmed(device: SiriDevice, armed: Bool) async throws {
    try await command(deviceId: device.id, payload: ["action": "set", "armed": armed])
  }

  static func runScene(id: Int) async throws {
    try await send(try request(path: "/scenes/\(id)/activate", body: nil))
  }
}
