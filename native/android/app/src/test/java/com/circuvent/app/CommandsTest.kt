package com.circuvent.app

import com.circuvent.app.core.Commands
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The command map, asserted.
 *
 * Every failure this guards against is silent. A command built with the state
 * key instead of the command key is accepted by the control plane, delivered by
 * the broker, and dropped by the sketch — so the switch moves under the finger,
 * snaps back, and the customer reports broken hardware.
 *
 * These expectations are transcribed from the firmware and from
 * src/lib/smarthome-command-map.ts, not from this app, so the test disagrees
 * with the app when the app is wrong.
 */
class CommandsTest {

    @Test
    fun `a hub channel is addressed positionally, never by its state key`() {
        // firmware/home-hub reports power/power2/power3/power4 and reads
        // {ch, on}. Sending {power2: true} is dropped in silence.
        val cmd = Commands.setBool("home-hub", "power2", true)!!
        assertEquals(JsonPrimitive("set"), cmd["action"])
        assertEquals(JsonPrimitive(1), cmd["ch"])
        assertEquals(JsonPrimitive(true), cmd["on"])
        assertNull("the state key must not ride along", cmd["power2"])
    }

    @Test
    fun `a hub refuses a field that is not one of its channels`() {
        assertNull(Commands.setBool("home-hub", "g1", true))
    }

    @Test
    fun `a lock is locked, not switched on`() {
        assertEquals(JsonPrimitive("unlock"), Commands.setBool("smart-lock", "locked", false)!!["action"])
        assertEquals(JsonPrimitive("lock"), Commands.setBool("smart-lock", "locked", true)!!["action"])
    }

    @Test
    fun `a gate is opened, not switched on`() {
        assertEquals(JsonPrimitive("open"), Commands.setBool("rfid-gate", "barrier", true)!!["action"])
    }

    @Test
    fun `an ordinary device takes its own field`() {
        val cmd = Commands.setBool("touchboard-8", "g7", true)!!
        assertEquals(JsonPrimitive("set"), cmd["action"])
        assertEquals(JsonPrimitive(true), cmd["g7"])
    }

    @Test
    fun `the whole-board switch uses the field the sketch reads`() {
        val cmd = Commands.allGangs(false)
        assertEquals(JsonPrimitive("set"), cmd["action"])
        assertEquals(JsonPrimitive(false), cmd["all"])
    }

    @Test
    fun `setup mode is an action, not a field`() {
        // Falling into the generic tail would build {action:"set", setup:true},
        // a shape no sketch reads.
        val cmd = Commands.setupMode(10)
        assertEquals(JsonPrimitive("setup"), cmd["action"])
        assertEquals(JsonPrimitive(10), cmd["minutes"])
        assertNull(cmd["setup"])
    }

    @Test
    fun `setup minutes are clamped the way the firmware clamps them`() {
        assertEquals(JsonPrimitive(1), Commands.setupMode(0)["minutes"])
        assertEquals(JsonPrimitive(60), Commands.setupMode(999)["minutes"])
    }

    @Test
    fun `the primary toggle is the field each firmware actually reads`() {
        // These four all reached a `power` guess in the Expo app and dropped it
        // in silence. Named individually so a regression says which one.
        assertEquals("g1", Commands.primaryToggle("touchboard"))
        assertEquals("g1", Commands.primaryToggle("touchboard-8"))
        assertEquals("pump", Commands.primaryToggle("watertank"))
        assertEquals("locked", Commands.primaryToggle("facedoor"))
        assertEquals("r1", Commands.primaryToggle("sentinel"))
        assertEquals("power", Commands.primaryToggle("smart-plug"))
    }

    @Test
    fun `devices with no single switch get none`() {
        // A hub's `power` is relay one only, so a switch labelled for the whole
        // device would turn on a quarter of it and report success. A gate is
        // opened. A meter only measures.
        for (type in listOf("home-hub", "rfid-gate", "curtain", "camera", "meter", "drone-link")) {
            assertNull("$type must not offer a primary switch", Commands.primaryToggle(type))
        }
    }

    @Test
    fun `an unknown type still guesses power`() {
        // The best available answer for hardware this build has never heard of,
        // and what almost every device uses.
        assertEquals("power", Commands.primaryToggle("something-new"))
    }
}
