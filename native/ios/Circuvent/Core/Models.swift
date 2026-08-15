import Foundation

/// A JSON value the app does not have a model for.
///
/// Device state is twenty-four sketches' worth of fields that change with every
/// firmware release, so it is carried as raw JSON rather than modelled per type.
/// A fixed model would mean a phone that silently drops a field the hardware
/// started sending — and the symptom of that is a control the app does not know
/// exists, which is this codebase's signature defect.
enum JSONValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let v = try? c.decode(Bool.self) { self = .bool(v); return }
        if let v = try? c.decode(Double.self) { self = .number(v); return }
        if let v = try? c.decode(String.self) { self = .string(v); return }
        if let v = try? c.decode([String: JSONValue].self) { self = .object(v); return }
        if let v = try? c.decode([JSONValue].self) { self = .array(v); return }
        self = .null
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }

    var boolValue: Bool? { if case .bool(let v) = self { return v }; return nil }
    var numberValue: Double? { if case .number(let v) = self { return v }; return nil }
    var stringValue: String? { if case .string(let v) = self { return v }; return nil }
}

/// The device as the control plane reports it.
struct Device: Codable, Identifiable, Equatable {
    let id: String
    let type: String
    var name: String = ""
    var room: String?
    var favorite: Bool = false
    var online: Bool = false
    var lastSeen: String?
    var state: [String: JSONValue] = [:]
    var fwVersion: String?

    enum CodingKeys: String, CodingKey {
        case id, type, name, room, favorite, online, state
        case lastSeen = "last_seen"
        case fwVersion = "fw_version"
    }

    func bool(_ field: String) -> Bool? { state[field]?.boolValue }
    func number(_ field: String) -> Double? { state[field]?.numberValue }

    var label: String { name.isEmpty ? id : name }
}

struct DeviceList: Codable {
    var devices: [Device] = []
}

struct User: Codable, Equatable {
    let id: Int
    var email: String = ""
    var name: String = ""
}

struct AuthResponse: Codable {
    var token: String = ""
    var refreshToken: String?
    var user: User?
    var error: String?
}

/// A live update from the socket.
///
/// `kind` separates the three things a device can say, and they are not
/// interchangeable: `state` is the whole retained picture, `telemetry` is a
/// reading that was only true when it was sent, and `status` is the broker
/// speaking for a device that has stopped answering. Merging them into one
/// "update" is how a stale reading ends up displayed as current.
struct DeviceUpdate: Codable {
    var type: String = ""
    var deviceId: String = ""
    var kind: String = ""
    var payload: [String: JSONValue] = [:]
    var at: String = ""
}
