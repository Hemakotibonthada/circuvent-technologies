package com.circuvent.app.core

/**
 * What a device type can actually be told to do.
 *
 * WHY THIS EXISTS RATHER THAN A SCREEN PER DEVICE
 *
 * There are twenty-four device types. Writing a control screen for each would
 * be twenty-four places to forget something, and the thing that gets forgotten
 * is never the whole screen — it is one field, on one type, which then renders
 * as a control that moves and changes nothing.
 *
 * So the UI asks what a type supports and draws that. The Expo app arrived at
 * the same answer for the same reason; this mirrors its `capabilities()` so the
 * two phones cannot disagree about what a device offers.
 *
 * THE RULE THAT MATTERS MOST
 *
 * A capability listed here is a promise that the firmware reads that field.
 * Adding one speculatively is worse than leaving it out: an absent control is
 * a feature somebody asks for, and a present one that does nothing is a fault
 * report about hardware that is working perfectly.
 */

/** A boolean control. */
data class PowerCap(val field: String, val label: String)

/** A 0..100 slider. */
data class LevelCap(val field: String, val label: String, val min: Int = 0, val max: Int = 100)

/** A stepped speed control, with the legacy field sent alongside. */
data class FanCap(val field: String, val label: String, val steps: Int, val legacyField: String?)

/** A target temperature. */
data class ThermostatCap(val field: String, val label: String, val min: Int, val max: Int)

data class Capabilities(
    val power: PowerCap? = null,
    val dimmer: LevelCap? = null,
    val fan: FanCap? = null,
    val thermostat: ThermostatCap? = null,
    val color: String? = null,
    /** One line for the tile, when the type has something better to say than on/off. */
    val metric: ((Device) -> String)? = null,
)

object DeviceCapabilities {

    fun of(type: String): Capabilities = when (type) {

        "smart-light", "light" -> Capabilities(
            power = PowerCap("power", "Power"),
            dimmer = LevelCap("brightness", "Brightness"),
            color = "color",
        )

        "smart-fan", "fan", "ceiling-fan" -> Capabilities(
            power = PowerCap("power", "Power"),
            // `level` is the continuous 0..100 the hardware always had; `speed`
            // is the four-position table it used to be limited to. Both are
            // sent, so the same control works on a fan that has not been
            // updated.
            fan = FanCap("level", "Speed", steps = 3, legacyField = "speed"),
        )

        "curtain" -> Capabilities(
            dimmer = LevelCap("position", "Position"),
            metric = { d -> "${(d.number("position") ?: 0.0).toInt()}%" },
        )

        "smart-lock" -> Capabilities(
            power = PowerCap("locked", "Lock"),
            metric = { d -> if (d.bool("locked") == true) "Locked" else "Unlocked" },
        )

        "thermostat", "ac" -> Capabilities(
            power = PowerCap("power", "Power"),
            thermostat = ThermostatCap("target", "Target", 16, 30),
        )

        /*
         * Cameras have no `power`. Their boolean is `streaming`, which is what
         * the live view is already doing — a tile switch for it would offer to
         * stop a recording somebody is watching, one tap away, in a grid of
         * lamps.
         */
        "camera", "cctv", "doorbell" -> Capabilities(
            metric = { d ->
                when {
                    d.bool("motionActive") == true -> "Motion"
                    d.bool("streaming") == true -> "Live"
                    else -> "Idle"
                }
            },
        )

        "anpr-cam" -> Capabilities(
            // Leads with the plate, because that is what somebody opening the
            // app actually wants to know.
            metric = { d ->
                when {
                    d.bool("ready") == false -> "No sensor"
                    d.bool("armed") != true -> "Disarmed"
                    else -> (d.state["lastPlate"]?.toString()?.trim('"')?.takeIf { it.isNotBlank() && it != "null" })
                        ?: "Watching"
                }
            },
        )

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
        "drone-link", "drone-x1" -> Capabilities(
            metric = { d ->
                when {
                    d.bool("inAir") == true -> {
                        val alt = d.number("alt") ?: 0.0
                        if (alt > 0) "Flying · ${alt.toInt()} m" else "Flying"
                    }
                    d.bool("armed") == true -> "Armed"
                    d.bool("link") == false -> "No autopilot"
                    d.bool("allowArm") == false -> "Grounded"
                    d.bool("ready") == false -> "Not ready"
                    d.bool("ready") == true -> "Ready"
                    else -> "—"
                }
            },
        )

        "watertank" -> Capabilities(
            power = PowerCap("pump", "Pump"),
            metric = { d -> d.number("level")?.let { "${it.toInt()}%" } ?: "—" },
        )

        "aquaguard", "agri-starter" -> Capabilities(power = PowerCap("pump", "Pump"))

        "energy-monitor", "meter" -> Capabilities(
            // Every value a meter publishes is the output of a measurement. A
            // toggle would be the app claiming it can set one.
            metric = { d -> d.number("watts")?.let { "${it.toInt()} W" } ?: "—" },
        )

        "motion-sensor" -> Capabilities(
            metric = { d ->
                when {
                    d.bool("motion") == true -> "Motion"
                    d.bool("armed") == true -> "Armed"
                    else -> "Clear"
                }
            },
        )

        "touchboard", "touchboard-8" -> Capabilities(
            power = PowerCap("g1", "Gang 1"),
            metric = { d ->
                val gangs = (1..8).mapNotNull { d.bool("g$it") }
                if (gangs.isEmpty()) "—" else "${gangs.count { it }}/${gangs.size} on"
            },
        )

        "sentinel" -> Capabilities(
            power = PowerCap("r1", "Relay 1"),
            metric = { d ->
                when {
                    d.bool("gasAlarm") == true -> "Gas alarm"
                    else -> d.number("temp")?.let { "${it.toInt()}°" } ?: "—"
                }
            },
        )

        "home-hub" -> Capabilities(
            // Its `power` is relay one only, so a switch labelled for the whole
            // device would turn on a quarter of it and report success.
            metric = { d ->
                val on = listOf("power", "power2", "power3", "power4").count { d.bool(it) == true }
                "$on/4 on"
            },
        )

        "facedoor" -> Capabilities(
            power = PowerCap("locked", "Lock"),
            metric = { d -> if (d.bool("locked") == true) "Locked" else "Unlocked" },
        )

        // A gate is opened, not switched on. No tile switch.
        "rfid-gate" -> Capabilities(
            metric = { d -> d.state["barrier"]?.toString()?.trim('"') ?: "—" },
        )

        "guardian" -> Capabilities(metric = { d -> if (d.bool("armed") == true) "Armed" else "Idle" })

        else -> {
            // An unrecognised type gets `power`, which is what almost every
            // device uses and the best available answer for hardware this build
            // has never heard of.
            val field = Commands.primaryToggle(type)
            if (field == null) Capabilities() else Capabilities(power = PowerCap(field, "Power"))
        }
    }

    /** The line under a device's name on a tile. */
    fun metricFor(device: Device): String {
        val caps = of(device.type)
        caps.metric?.let { return it(device) }
        val power = caps.power ?: return "—"
        return when (device.bool(power.field)) {
            true -> "On"
            false -> "Off"
            null -> "—"
        }
    }
}
