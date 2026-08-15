import Foundation

/// Turning "the user pressed this" into the command a sketch actually reads.
///
/// WHY THIS IS ITS OWN FILE, AND WHY IT IS SO CAREFUL
///
/// The command key and the state key are the same word for most devices and
/// different words for several, and the difference is invisible until hardware
/// fails to move. A Home Hub reports `power2` and is commanded with
/// `{ch: 1, on: true}`. A touch board reports `g1` and is commanded with `g1`,
/// but its whole-board switch is `all`, which it reports as nothing at all.
///
/// Send the state key to a device that wanted a command key and there is no
/// error anywhere: the control plane accepts it, the broker delivers it, the
/// sketch reads a field it does not have and does nothing. The switch moves
/// under the finger, snaps back, and the customer reports broken hardware.
///
/// That exact bug has shipped twice already. This is the fourth implementation
/// of the same map, which is the fourth chance to get it wrong — so
/// `tests/native-client-parity.test.ts` asserts these shapes against
/// `src/lib/smarthome-command-map.ts` and against the Kotlin twin, rather than
/// trusting that whoever wrote this had read either.
enum Commands {

    /// The 4-channel Home Hub is addressed positionally, never by state key.
    private static let hubChannels = ["power", "power2", "power3", "power4"]

    /// A boolean control on a device, as a command.
    ///
    /// Returns nil when the field is not something this type can be told —
    /// refusing is the point. A command built for a field the firmware does not
    /// read is a control that looks present and does nothing, so it must not be
    /// possible to build one by accident.
    static func setBool(type: String, field: String, value: Bool) -> [String: JSONValue]? {
        switch type {
        case "home-hub":
            guard let ch = hubChannels.firstIndex(of: field) else { return nil }
            return [
                "action": .string("set"),
                "ch": .number(Double(ch)),
                "on": .bool(value),
            ]

        case "smart-lock":
            // A lock is locked and unlocked, not switched on. The state key is
            // `locked`; the command is an action.
            return ["action": .string(value ? "lock" : "unlock")]

        case "rfid-gate":
            return ["action": .string(value ? "open" : "close")]

        default:
            return ["action": .string("set"), field: .bool(value)]
        }
    }

    /// Every gang of a touch board at once. The sketch reads `all`.
    static func allGangs(_ value: Bool) -> [String: JSONValue] {
        ["action": .string("set"), "all": .bool(value)]
    }

    /// Ask a device to raise its setup hotspot for a while.
    ///
    /// Handled by the shared device library on every product rather than by any
    /// one sketch, so it is deliberately not routed through the per-type branch
    /// above — falling into the generic tail would build
    /// `{action:"set", setup:true}`, a shape no firmware reads, sent to a
    /// device that would drop it in silence while the caller saw success.
    static func setupMode(minutes: Int = 10) -> [String: JSONValue] {
        [
            "action": .string("setup"),
            "minutes": .number(Double(min(max(minutes, 1), 60))),
        ]
    }

    /// Move a device onto another Wi-Fi network.
    ///
    /// Safe to send remotely because the firmware restores the previous
    /// credentials if the new network refuses it, and says so in `wifiStatus`.
    static func changeWifi(ssid: String, password: String) -> [String: JSONValue] {
        [
            "action": .string("wifi"),
            "ssid": .string(ssid),
            "pass": .string(password),
        ]
    }

    /// The field a device's primary switch should address.
    ///
    /// Guessing `power` here is what broke four shipped device types in the
    /// Expo app: a touch board reads g1/g2/g3, a water tank reads `pump`, a
    /// face door unlocks, and a gate has no switch at all. `{power:true}` was
    /// dropped in silence by every one of them, so the switch moved back under
    /// the finger and the hardware never changed.
    ///
    /// nil means the device genuinely has no on/off, and the UI must not draw
    /// one.
    static func primaryToggle(type: String) -> String? {
        switch type {
        case "smart-plug", "smart-switch", "smart-light", "smart-fan", "light", "fan":
            return "power"
        case "touchboard", "touchboard-8":
            return "g1"
        case "sentinel":
            return "r1"
        case "watertank", "aquaguard", "agri-starter":
            return "pump"
        case "smart-lock", "facedoor":
            return "locked"
        // A hub's `power` is only relay one, so a switch labelled for the whole
        // device would turn on a quarter of it and report success.
        case "home-hub":
            return nil
        case "rfid-gate", "curtain", "camera", "cctv", "doorbell", "anpr-cam",
             "energy-monitor", "meter", "guardian", "motion-sensor",
             "drone-link", "drone-x1":
            return nil
        default:
            return "power"
        }
    }
}
