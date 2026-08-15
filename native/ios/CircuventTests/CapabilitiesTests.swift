import XCTest
@testable import Circuvent

/// What each device type offers, asserted.
///
/// A direct translation of `CapabilitiesTest.kt`, deliberately test-for-test.
/// Two clients with different tests are two clients that were checked for
/// different things, and the gap between them is where a platform-specific bug
/// lives.
///
/// The failure guarded here is not a crash — it is a slider or a switch that
/// renders, moves, and changes nothing, because the field behind it is one no
/// sketch has. The other half matters just as much: the types that must offer
/// *no* switch, because a camera's boolean stops a recording and a drone's is
/// an aircraft's permission to fly.
final class CapabilitiesTests: XCTestCase {

    private func device(_ type: String, _ state: [String: JSONValue] = [:]) -> Device {
        Device(id: "d1", type: type, name: "Test", online: true, state: state)
    }

    func testALightOffersPowerBrightnessAndColour() {
        let caps = DeviceCapabilities.of("smart-light")
        XCTAssertEqual(caps.power?.field, "power")
        XCTAssertEqual(caps.dimmer?.field, "brightness")
        XCTAssertNotNil(caps.color)
    }

    func testAFanSendsTheLegacySpeedFieldAlongsideTheNewOne() {
        // A fan that has not taken the firmware update reads `speed` and
        // ignores `level`. Sending only the new field would make the control
        // silently do nothing on older hardware.
        let fan = DeviceCapabilities.of("smart-fan").fan
        XCTAssertEqual(fan?.field, "level")
        XCTAssertEqual(fan?.legacyField, "speed")
    }

    func testACurtainHasAPositionAndNoOnOff() {
        let caps = DeviceCapabilities.of("curtain")
        XCTAssertEqual(caps.dimmer?.field, "position")
        XCTAssertNil(caps.power, "a curtain is opened to a position, not switched on")
    }

    func testALockReadsAsLockedRatherThanOn() {
        let caps = DeviceCapabilities.of("smart-lock")
        XCTAssertEqual(caps.power?.field, "locked")
        XCTAssertEqual(caps.power?.label, "Lock")
        XCTAssertEqual(caps.metric?(device("smart-lock", ["locked": .bool(true)])), "Locked")
        XCTAssertEqual(caps.metric?(device("smart-lock", ["locked": .bool(false)])), "Unlocked")
    }

    func testACameraOffersNoSwitch() {
        let caps = DeviceCapabilities.of("camera")
        XCTAssertNil(caps.power)
        XCTAssertEqual(caps.metric?(device("camera", ["streaming": .bool(true)])), "Live")
        XCTAssertEqual(caps.metric?(device("camera", ["motionActive": .bool(true)])), "Motion")
        XCTAssertEqual(caps.metric?(device("camera")), "Idle")
    }

    func testADroneOffersNoSwitchAndLeadsWithWhatItIsDoing() {
        let caps = DeviceCapabilities.of("drone-link")
        XCTAssertNil(caps.power)
        XCTAssertEqual(
            caps.metric?(device("drone-link", ["inAir": .bool(true), "alt": .number(30)])),
            "Flying · 30 m"
        )
        XCTAssertEqual(
            caps.metric?(device("drone-link", ["allowArm": .bool(false)])),
            "Grounded"
        )
    }

    func testAMeterOffersNoSwitchBecauseEveryValueIsAMeasurement() {
        let caps = DeviceCapabilities.of("meter")
        XCTAssertNil(caps.power)
        XCTAssertEqual(caps.metric?(device("meter", ["watts": .number(42)])), "42 W")
    }

    func testAHubOffersNoWholeDeviceSwitch() {
        // Its `power` is relay one only, so a switch labelled for the whole
        // device would turn on a quarter of it and report success.
        let caps = DeviceCapabilities.of("home-hub")
        XCTAssertNil(caps.power)
        XCTAssertEqual(
            caps.metric?(device("home-hub", ["power": .bool(true), "power2": .bool(true)])),
            "2/4 on"
        )
    }

    func testATouchBoardCountsTheGangsItActuallyReports() {
        // A 3-gang board and an 8-gang board publish different numbers of
        // fields; counting a fixed eight would report dead gangs on the smaller.
        let caps = DeviceCapabilities.of("touchboard")
        XCTAssertEqual(caps.power?.field, "g1")
        XCTAssertEqual(
            caps.metric?(device("touchboard", [
                "g1": .bool(true), "g2": .bool(false), "g3": .bool(false),
            ])),
            "1/3 on"
        )
        XCTAssertEqual(
            caps.metric?(device("touchboard-8", [
                "g1": .bool(true), "g2": .bool(false), "g3": .bool(false), "g4": .bool(true),
                "g5": .bool(false), "g6": .bool(false), "g7": .bool(false), "g8": .bool(false),
            ])),
            "2/8 on"
        )
    }

    func testAnUnknownTypeStillGetsAPowerSwitch() {
        XCTAssertEqual(DeviceCapabilities.of("something-new").power?.field, "power")
    }

    func testTheTileLineFallsBackToOnAndOffAndAdmitsWhenItDoesNotKnow() {
        XCTAssertEqual(
            DeviceCapabilities.metric(for: device("smart-plug", ["power": .bool(true)])), "On"
        )
        XCTAssertEqual(
            DeviceCapabilities.metric(for: device("smart-plug", ["power": .bool(false)])), "Off"
        )
        // A device that has never reported must not read as "Off" — that is a
        // statement about hardware nobody has heard from.
        XCTAssertEqual(DeviceCapabilities.metric(for: device("smart-plug")), "—")
    }
}
