import Foundation

/// What a device type can actually be told to do.
///
/// WHY THIS EXISTS RATHER THAN A SCREEN PER DEVICE
///
/// There are twenty-four device types. Writing a control screen for each would
/// be twenty-four places to forget something, and the thing that gets forgotten
/// is never the whole screen — it is one field, on one type, which then renders
/// as a control that moves and changes nothing.
///
/// So the UI asks what a type supports and draws that. The Expo app and the
/// Android client arrived at the same answer; this mirrors both so no two
/// clients disagree about what a device offers.
///
/// THE RULE THAT MATTERS MOST
///
/// A capability listed here is a promise that the firmware reads that field.
/// Adding one speculatively is worse than leaving it out: an absent control is
/// a feature somebody asks for, and a present one that does nothing is a fault
/// report about hardware that is working perfectly.

struct PowerCap: Equatable {
    let field: String
    let label: String
}

struct LevelCap: Equatable {
    let field: String
    let label: String
    var min: Int = 0
    var max: Int = 100
}

struct FanCap: Equatable {
    let field: String
    let label: String
    let steps: Int
    let legacyField: String?
}

struct ThermostatCap: Equatable {
    let field: String
    let label: String
    let min: Int
    let max: Int
}

struct Capabilities {
    var power: PowerCap?
    var dimmer: LevelCap?
    var fan: FanCap?
    var thermostat: ThermostatCap?
    var color: String?
    /// One line for the tile, when the type has something better to say than on/off.
    var metric: ((Device) -> String)?
}

enum DeviceCapabilities {

    static func of(_ type: String) -> Capabilities {
        switch type {

        case "smart-light", "light":
            return Capabilities(
                power: PowerCap(field: "power", label: "Power"),
                dimmer: LevelCap(field: "brightness", label: "Brightness"),
                color: "color"
            )

        case "smart-fan", "fan", "ceiling-fan":
            // `level` is the continuous 0..100 the hardware always had; `speed`
            // is the four-position table it used to be limited to. Both are
            // sent, so the same control works on a fan that has not been
            // updated.
            return Capabilities(
                power: PowerCap(field: "power", label: "Power"),
                fan: FanCap(field: "level", label: "Speed", steps: 3, legacyField: "speed")
            )

        case "curtain":
            return Capabilities(
                dimmer: LevelCap(field: "position", label: "Position"),
                metric: { d in "\(Int(d.number("position") ?? 0))%" }
            )

        case "smart-lock":
            return Capabilities(
                power: PowerCap(field: "locked", label: "Lock"),
                metric: { d in d.bool("locked") == true ? "Locked" : "Unlocked" }
            )

        case "thermostat", "ac":
            return Capabilities(
                power: PowerCap(field: "power", label: "Power"),
                thermostat: ThermostatCap(field: "target", label: "Target", min: 16, max: 30)
            )

        /*
         * Cameras have no `power`. Their boolean is `streaming`, which is what
         * the live view is already doing — a tile switch for it would offer to
         * stop a recording somebody is watching, one tap away, in a grid of
         * lamps.
         */
        case "camera", "cctv", "doorbell":
            return Capabilities(metric: { d in
                if d.bool("motionActive") == true { return "Motion" }
                if d.bool("streaming") == true { return "Live" }
                return "Idle"
            })

        case "anpr-cam":
            // Leads with the plate, because that is what somebody opening the
            // app actually wants to know.
            return Capabilities(metric: { d in
                if d.bool("ready") == false { return "No sensor" }
                if d.bool("armed") != true { return "Disarmed" }
                if let plate = d.state["lastPlate"]?.stringValue, !plate.isEmpty { return plate }
                return "Watching"
            })

        /*
         * A drone's only boolean is `allowArm` — an aircraft's permission to
         * fly. As a tile switch in a grid of lamps it reads as a launch button
         * and behaves as a ground switch, and either reading is dangerous.
         *
         * The metric leads with what the aircraft is doing rather than its
         * battery: a parked drone on a charger reads 100% and a crashed one
         * reads whatever it read last, so the number is reassuring in exactly
         * the two cases where it should not be.
         */
        case "drone-link", "drone-x1":
            return Capabilities(metric: { d in
                if d.bool("inAir") == true {
                    let alt = d.number("alt") ?? 0
                    return alt > 0 ? "Flying · \(Int(alt)) m" : "Flying"
                }
                if d.bool("armed") == true { return "Armed" }
                if d.bool("link") == false { return "No autopilot" }
                if d.bool("allowArm") == false { return "Grounded" }
                if d.bool("ready") == false { return "Not ready" }
                if d.bool("ready") == true { return "Ready" }
                return "—"
            })

        case "watertank":
            return Capabilities(
                power: PowerCap(field: "pump", label: "Pump"),
                metric: { d in d.number("level").map { "\(Int($0))%" } ?? "—" }
            )

        case "aquaguard", "agri-starter":
            return Capabilities(power: PowerCap(field: "pump", label: "Pump"))

        case "energy-monitor", "meter":
            // Every value a meter publishes is the output of a measurement. A
            // toggle would be the app claiming it can set one.
            return Capabilities(metric: { d in d.number("watts").map { "\(Int($0)) W" } ?? "—" })

        case "motion-sensor":
            return Capabilities(metric: { d in
                if d.bool("motion") == true { return "Motion" }
                if d.bool("armed") == true { return "Armed" }
                return "Clear"
            })

        case "touchboard", "touchboard-8":
            return Capabilities(
                power: PowerCap(field: "g1", label: "Gang 1"),
                metric: { d in
                    let gangs = (1...8).compactMap { d.bool("g\($0)") }
                    guard !gangs.isEmpty else { return "—" }
                    return "\(gangs.filter { $0 }.count)/\(gangs.count) on"
                }
            )

        case "sentinel":
            return Capabilities(
                power: PowerCap(field: "r1", label: "Relay 1"),
                metric: { d in
                    if d.bool("gasAlarm") == true { return "Gas alarm" }
                    return d.number("temp").map { "\(Int($0))°" } ?? "—"
                }
            )

        case "home-hub":
            // Its `power` is relay one only, so a switch labelled for the whole
            // device would turn on a quarter of it and report success.
            return Capabilities(metric: { d in
                let on = ["power", "power2", "power3", "power4"]
                    .filter { d.bool($0) == true }.count
                return "\(on)/4 on"
            })

        case "facedoor":
            return Capabilities(
                power: PowerCap(field: "locked", label: "Lock"),
                metric: { d in d.bool("locked") == true ? "Locked" : "Unlocked" }
            )

        // A gate is opened, not switched on. No tile switch.
        case "rfid-gate":
            return Capabilities(metric: { d in d.state["barrier"]?.stringValue ?? "—" })

        case "guardian":
            return Capabilities(metric: { d in d.bool("armed") == true ? "Armed" : "Idle" })

        default:
            // An unrecognised type gets `power`, which is what almost every
            // device uses and the best available answer for hardware this build
            // has never heard of.
            guard let field = Commands.primaryToggle(type: type) else { return Capabilities() }
            return Capabilities(power: PowerCap(field: field, label: "Power"))
        }
    }

    /// The line under a device's name on a tile.
    static func metric(for device: Device) -> String {
        let caps = of(device.type)
        if let metric = caps.metric { return metric(device) }
        guard let power = caps.power else { return "—" }
        switch device.bool(power.field) {
        case .some(true): return "On"
        case .some(false): return "Off"
        case .none: return "—"
        }
    }
}
