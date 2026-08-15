import Foundation

/// The control plane's address and the shapes it speaks.
///
/// These constants are the whole reason this file is separate from the client
/// that uses them. The Expo app, the web console, the Android client and this
/// one are four independent implementations of a single protocol, and the way
/// that protocol breaks is never a compile error — it is a request that returns
/// 404, or a command the device drops in silence because a key was spelled
/// differently here.
///
/// `tests/native-client-parity.test.ts` reads this file, its Kotlin twin and
/// `mobile/src/config.ts`, and fails the build when they disagree. That test
/// matters more on this side than any other: there is no Mac in the pipeline
/// that builds this project, so a typo here would otherwise be found by a
/// person, on a phone, months later.
enum Api {
    static let base = "https://api.circuvent.com"
    static let ws = "wss://api.circuvent.com/ws"

    static let login = "/auth/login"
    static let refresh = "/auth/refresh"
    static let devices = "/devices"
    static let rooms = "/rooms"
    static let scenes = "/scenes"
    static let automations = "/automations"

    static func command(_ deviceID: String) -> String {
        "/devices/\(deviceID)/command"
    }

    static func runScene(_ id: Int) -> String {
        "/scenes/\(id)/run"
    }

    static func patchDevice(_ deviceID: String) -> String {
        "/devices/\(deviceID)"
    }
}
