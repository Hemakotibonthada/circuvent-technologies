package com.circuvent.app

import com.circuvent.app.core.Device
import com.circuvent.app.core.DeviceCapabilities
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * What each device type offers, asserted.
 *
 * A capability listed is a promise that the firmware reads that field. The
 * failure this guards is not a crash — it is a slider or a switch that renders,
 * moves, and changes nothing, because the field behind it is one no sketch has.
 *
 * The other half is just as important and easier to get wrong: the types that
 * must offer *no* switch. A camera's boolean is `streaming`, a drone's is an
 * aircraft's permission to fly, and a meter's values are all measurements. A
 * tile switch for any of those is a dangerous control sitting in a grid of
 * lamps.
 */
class CapabilitiesTest {

    private fun device(type: String, vararg state: Pair<String, Any>) = Device(
        id = "d1",
        type = type,
        name = "Test",
        online = true,
        state = JsonObject(
            state.associate { (k, v) ->
                k to when (v) {
                    is Boolean -> JsonPrimitive(v)
                    is Int -> JsonPrimitive(v)
                    is Double -> JsonPrimitive(v)
                    else -> JsonPrimitive(v.toString())
                }
            }
        ),
    )

    @Test
    fun `a light offers power, brightness and colour`() {
        val caps = DeviceCapabilities.of("smart-light")
        assertEquals("power", caps.power?.field)
        assertEquals("brightness", caps.dimmer?.field)
        assertNotNull(caps.color)
    }

    @Test
    fun `a fan sends the legacy speed field alongside the new one`() {
        // A fan that has not taken the firmware update reads `speed` and
        // ignores `level`. Sending only the new field would make the control
        // silently do nothing on older hardware.
        val fan = DeviceCapabilities.of("smart-fan").fan
        assertEquals("level", fan?.field)
        assertEquals("speed", fan?.legacyField)
    }

    @Test
    fun `a curtain has a position and no on-off`() {
        val caps = DeviceCapabilities.of("curtain")
        assertEquals("position", caps.dimmer?.field)
        assertNull("a curtain is opened to a position, not switched on", caps.power)
    }

    @Test
    fun `a lock reads as locked rather than on`() {
        val caps = DeviceCapabilities.of("smart-lock")
        assertEquals("locked", caps.power?.field)
        assertEquals("Lock", caps.power?.label)
        assertEquals("Locked", caps.metric!!(device("smart-lock", "locked" to true)))
        assertEquals("Unlocked", caps.metric!!(device("smart-lock", "locked" to false)))
    }

    @Test
    fun `a camera offers no switch`() {
        /*
         * Its boolean is `streaming`, which is what the live view is already
         * doing. A tile switch for it would offer to stop a recording somebody
         * is watching, one tap away, in a grid of lamps.
         */
        val caps = DeviceCapabilities.of("camera")
        assertNull(caps.power)
        assertEquals("Live", caps.metric!!(device("camera", "streaming" to true)))
        assertEquals("Motion", caps.metric!!(device("camera", "motionActive" to true)))
        assertEquals("Idle", caps.metric!!(device("camera")))
    }

    @Test
    fun `a drone offers no switch and leads with what it is doing`() {
        /*
         * Its only boolean is an aircraft's permission to fly. The metric leads
         * with flight rather than battery: a parked drone on a charger reads
         * 100% and a crashed one reads whatever it read last, so the number is
         * reassuring in exactly the two cases where it should not be.
         */
        val caps = DeviceCapabilities.of("drone-link")
        assertNull(caps.power)
        assertEquals("Flying · 30 m", caps.metric!!(device("drone-link", "inAir" to true, "alt" to 30)))
        assertEquals("Grounded", caps.metric!!(device("drone-link", "allowArm" to false)))
    }

    @Test
    fun `a meter offers no switch because every value is a measurement`() {
        val caps = DeviceCapabilities.of("meter")
        assertNull(caps.power)
        assertEquals("42 W", caps.metric!!(device("meter", "watts" to 42)))
    }

    @Test
    fun `a hub offers no whole-device switch`() {
        // Its `power` is relay one only, so a switch labelled for the whole
        // device would turn on a quarter of it and report success.
        val caps = DeviceCapabilities.of("home-hub")
        assertNull(caps.power)
        assertEquals("2/4 on", caps.metric!!(device("home-hub", "power" to true, "power2" to true)))
    }

    @Test
    fun `a touch board counts the gangs it actually reports`() {
        // A 3-gang board and an 8-gang board publish different numbers of
        // fields; counting a fixed eight would report dead gangs on the smaller.
        val caps = DeviceCapabilities.of("touchboard")
        assertEquals("g1", caps.power?.field)
        assertEquals(
            "1/3 on",
            caps.metric!!(device("touchboard", "g1" to true, "g2" to false, "g3" to false)),
        )
        assertEquals(
            "2/8 on",
            caps.metric!!(
                device(
                    "touchboard-8",
                    "g1" to true, "g2" to false, "g3" to false, "g4" to true,
                    "g5" to false, "g6" to false, "g7" to false, "g8" to false,
                )
            ),
        )
    }

    @Test
    fun `an unknown type still gets a power switch`() {
        assertEquals("power", DeviceCapabilities.of("something-new").power?.field)
    }

    @Test
    fun `the tile line falls back to on and off, and admits when it does not know`() {
        assertEquals("On", DeviceCapabilities.metricFor(device("smart-plug", "power" to true)))
        assertEquals("Off", DeviceCapabilities.metricFor(device("smart-plug", "power" to false)))
        // A device that has never reported must not read as "Off" — that is a
        // statement about hardware nobody has heard from.
        assertEquals("—", DeviceCapabilities.metricFor(device("smart-plug")))
    }
}
