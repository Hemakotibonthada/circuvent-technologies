package com.circuvent.app.core

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Turning "the user pressed this" into the command a sketch actually reads.
 *
 * WHY THIS IS ITS OWN FILE, AND WHY IT IS SO CAREFUL
 *
 * The command key and the state key are the same word for most devices and
 * different words for several, and the difference is invisible until hardware
 * fails to move. A Home Hub reports `power2` and is commanded with
 * `{ch: 1, on: true}`. A touch board reports `g1` and is commanded with `g1`,
 * but its whole-board switch is `all`, which it reports as nothing at all. A
 * camera's `{action:"stream", on:true}` sets `state.streaming`.
 *
 * Send the state key to a device that wanted a command key and there is no
 * error anywhere: the control plane accepts it, the broker delivers it, the
 * sketch reads a field it does not have and does nothing. The switch moves
 * under the finger, snaps back, and the customer reports broken hardware.
 *
 * That exact bug has shipped on the web and again in the Expo app. This is the
 * third implementation of the same map, so it is the third chance to get it
 * wrong — which is why `tests/native-client-parity.test.ts` asserts these
 * shapes against `src/lib/smarthome-command-map.ts` rather than trusting that
 * whoever wrote this had read it.
 */
object Commands {

    /** The 4-channel Home Hub is addressed positionally, never by state key. */
    private val HUB_CHANNELS = listOf("power", "power2", "power3", "power4")

    /**
     * A boolean control on a device, as a command.
     *
     * Returns null when the field is not something this type can be told —
     * refusing is the point. A command built for a field the firmware does not
     * read is a control that looks present and does nothing, so it must not be
     * possible to build one by accident.
     */
    fun setBool(type: String, field: String, value: Boolean): JsonObject? = when (type) {
        "home-hub" -> {
            val ch = HUB_CHANNELS.indexOf(field)
            if (ch < 0) null else buildJsonObject {
                put("action", "set")
                put("ch", ch)
                put("on", value)
            }
        }

        "smart-lock" -> buildJsonObject {
            // A lock is locked and unlocked, not switched on. The state key is
            // `locked`; the command is an action.
            put("action", if (value) "lock" else "unlock")
        }

        "rfid-gate" -> buildJsonObject {
            put("action", if (value) "open" else "close")
        }

        else -> buildJsonObject {
            put("action", "set")
            put(field, value)
        }
    }

    /** Every gang of a touch board at once. The sketch reads `all`. */
    fun allGangs(value: Boolean): JsonObject = buildJsonObject {
        put("action", "set")
        put("all", value)
    }

    /**
     * Ask a device to raise its setup hotspot for a while.
     *
     * Handled by the shared device library on every product rather than by any
     * one sketch, so it is deliberately not routed through the per-type branch
     * above — falling into the generic tail would build `{action:"set",
     * setup:true}`, a shape no firmware reads, sent to a device that would drop
     * it in silence while the caller saw success.
     */
    fun setupMode(minutes: Int = 10): JsonObject = buildJsonObject {
        put("action", "setup")
        put("minutes", minutes.coerceIn(1, 60))
    }

    /**
     * Move a device onto another Wi-Fi network.
     *
     * Safe to send remotely because the firmware restores the previous
     * credentials if the new network refuses it, and says so in `wifiStatus`.
     */
    fun changeWifi(ssid: String, password: String): JsonObject = buildJsonObject {
        put("action", "wifi")
        put("ssid", ssid)
        put("pass", password)
    }

    /**
     * The field a device's primary switch should address.
     *
     * Guessing `power` here is what broke four shipped device types in the Expo
     * app: a touch board reads g1/g2/g3, a water tank reads `pump`, a face door
     * unlocks, and a gate has no switch at all. `{power:true}` was dropped in
     * silence by every one of them, so the switch moved back under the finger
     * and the hardware never changed.
     *
     * Null means the device genuinely has no on/off, and the UI must not draw
     * one.
     */
    fun primaryToggle(type: String): String? = when (type) {
        "smart-plug", "smart-switch", "smart-light", "smart-fan", "light", "fan" -> "power"
        "touchboard", "touchboard-8" -> "g1"
        "sentinel" -> "r1"
        "watertank", "aquaguard", "agri-starter" -> "pump"
        "smart-lock", "facedoor" -> "locked"
        // A hub's `power` is only relay one, so a switch labelled for the whole
        // device would turn on a quarter of it and report success.
        "home-hub" -> null
        "rfid-gate", "curtain", "camera", "cctv", "doorbell", "anpr-cam",
        "energy-monitor", "meter", "guardian", "motion-sensor",
        "drone-link", "drone-x1" -> null
        else -> "power"
    }
}
