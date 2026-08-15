import XCTest
@testable import Circuvent

/// The command map, asserted.
///
/// A direct translation of `CommandsTest.kt`, deliberately test-for-test. Two
/// clients with different tests are two clients that were checked for different
/// things, and the gap between them is where a platform-specific bug lives.
///
/// Every failure guarded here is silent. A command built with the state key
/// instead of the command key is accepted by the control plane, delivered by
/// the broker, and dropped by the sketch — so the switch moves under the
/// finger, snaps back, and the customer reports broken hardware.
final class CommandsTests: XCTestCase {

    func testHubChannelIsAddressedPositionally() {
        // firmware/home-hub reports power/power2/power3/power4 and reads
        // {ch, on}. Sending {power2: true} is dropped in silence.
        let cmd = Commands.setBool(type: "home-hub", field: "power2", value: true)
        XCTAssertEqual(cmd?["action"], .string("set"))
        XCTAssertEqual(cmd?["ch"], .number(1))
        XCTAssertEqual(cmd?["on"], .bool(true))
        XCTAssertNil(cmd?["power2"], "the state key must not ride along")
    }

    func testHubRefusesAFieldThatIsNotOneOfItsChannels() {
        XCTAssertNil(Commands.setBool(type: "home-hub", field: "g1", value: true))
    }

    func testALockIsLockedNotSwitchedOn() {
        XCTAssertEqual(
            Commands.setBool(type: "smart-lock", field: "locked", value: false)?["action"],
            .string("unlock")
        )
        XCTAssertEqual(
            Commands.setBool(type: "smart-lock", field: "locked", value: true)?["action"],
            .string("lock")
        )
    }

    func testAGateIsOpenedNotSwitchedOn() {
        XCTAssertEqual(
            Commands.setBool(type: "rfid-gate", field: "barrier", value: true)?["action"],
            .string("open")
        )
    }

    func testAnOrdinaryDeviceTakesItsOwnField() {
        let cmd = Commands.setBool(type: "touchboard-8", field: "g7", value: true)
        XCTAssertEqual(cmd?["action"], .string("set"))
        XCTAssertEqual(cmd?["g7"], .bool(true))
    }

    func testWholeBoardSwitchUsesTheFieldTheSketchReads() {
        let cmd = Commands.allGangs(false)
        XCTAssertEqual(cmd["action"], .string("set"))
        XCTAssertEqual(cmd["all"], .bool(false))
    }

    func testSetupModeIsAnActionNotAField() {
        // Falling into the generic tail would build {action:"set", setup:true},
        // a shape no sketch reads.
        let cmd = Commands.setupMode(minutes: 10)
        XCTAssertEqual(cmd["action"], .string("setup"))
        XCTAssertEqual(cmd["minutes"], .number(10))
        XCTAssertNil(cmd["setup"])
    }

    func testSetupMinutesAreClampedTheWayTheFirmwareClampsThem() {
        XCTAssertEqual(Commands.setupMode(minutes: 0)["minutes"], .number(1))
        XCTAssertEqual(Commands.setupMode(minutes: 999)["minutes"], .number(60))
    }

    func testPrimaryToggleIsTheFieldEachFirmwareActuallyReads() {
        // These four all reached a `power` guess in the Expo app and dropped it
        // in silence. Named individually so a regression says which one.
        XCTAssertEqual(Commands.primaryToggle(type: "touchboard"), "g1")
        XCTAssertEqual(Commands.primaryToggle(type: "touchboard-8"), "g1")
        XCTAssertEqual(Commands.primaryToggle(type: "watertank"), "pump")
        XCTAssertEqual(Commands.primaryToggle(type: "facedoor"), "locked")
        XCTAssertEqual(Commands.primaryToggle(type: "sentinel"), "r1")
        XCTAssertEqual(Commands.primaryToggle(type: "smart-plug"), "power")
    }

    func testDevicesWithNoSingleSwitchGetNone() {
        // A hub's `power` is relay one only, so a switch labelled for the whole
        // device would turn on a quarter of it and report success.
        for type in ["home-hub", "rfid-gate", "curtain", "camera", "meter", "drone-link"] {
            XCTAssertNil(
                Commands.primaryToggle(type: type),
                "\(type) must not offer a primary switch"
            )
        }
    }

    func testAnUnknownTypeStillGuessesPower() {
        XCTAssertEqual(Commands.primaryToggle(type: "something-new"), "power")
    }
}
