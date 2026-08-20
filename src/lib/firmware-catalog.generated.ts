// GENERATED FILE — do not edit by hand.
//
// Produced by scripts/generate-firmware-catalog.cjs from the firmware sources,
// which declare their own version and document their own history. The console
// compares a device's reported version against this to decide whether it is
// behind, so a hand-maintained copy that drifts tells every up-to-date unit it
// is out of date and makes an OTA campaign filtered on version match nothing.
//
// Regenerate after changing any firmware:  node scripts/generate-firmware-catalog.cjs

import type { FirmwareInfo } from "./smarthome-firmware";

export const GENERATED_FIRMWARE_CATALOG: FirmwareInfo[] = [
  {
    deviceType: "agri-starter",
    latestVersion: "1.2.0",
    changelog: [
    { version: "1.1.0", notes: ["first build that survives a power cut with the router still down — see tests/firmware-power-restore.test.ts."] },
    { version: "1.2.0", notes: ["It can no longer be started by a stranger, and it can no longer destroy the thing it controls. Caller ID is checked. `AT+CLIP=1` was enabled to obtain it and the result was discarded, so every incoming call — including a wrong number — toggled the pump. Mains presence is measured over a window instead of sampled. An opto on a 50 Hz supply is a pulse train, not a level; reading it raw and driving the contactor from it on every loop meant the contactor was chattering continuously whenever mains was present. SMS actually works: text mode, delivery notifications, read, act, delete. What was there before could not receive a message at all and would start the pump on the modem's own \"CONNECT\". A dry-run cutout, a maximum runtime, a restart delay after the supply returns, and timed irrigation — ring once, water for thirty minutes, stop by itself. And it answers. Every command is confirmed by SMS with what really happened, because \"the pump did not start, there is no power\" is the single most useful sentence this product can send and it was previously a wasted trip to the field."] },
    ],
  },
  {
    deviceType: "anpr-cam",
    latestVersion: "1.0.1",
    changelog: [
    { version: "1.0.1", notes: ["1.0.0 initial ANPR capture node."] },
    ],
  },
  {
    deviceType: "aquaguard",
    latestVersion: "2.3.0",
    changelog: [
    { version: "2.3.0", notes: ["The manual override no longer fires throughout the reset gesture. BTN_PIN is GPIO0, shared with `setResetButton(0)`, and the test was a level read with a 500 ms rate limit — so holding BOOT to change the Wi-Fi ran the override about six times, each pulsing the pump and setting `autoMode = false`. Auto-fill stayed off afterwards and the tank stopped refilling until somebody noticed. It also acted on a pin already low at boot, which after a power cut is not a press. Now a tap, via CvTapButton."] },
    ],
  },
  {
    deviceType: "camera",
    latestVersion: "1.14.6",
    changelog: [
    { version: "1.0.0", notes: ["initial"] },
    { version: "1.1.0", notes: ["streaming fixes"] },
    { version: "1.2.0", notes: ["OTA. Also moves the build to min_spiffs.csv: the previous huge_app.csv has a single app slot, so no camera could ever have taken an over-the-air update at all."] },
    { version: "1.9.0", notes: ["Serve video on the LAN as well as over MQTT. snapshot set 1600x1200 as the size of every *streamed* frame too. An OV2640 reads a UXGA frame out at around 5 fps on a good day. the time that readout takes. current one had finished being pushed through TLS. Capture and transmit were serial when they only ever needed to overlap. socket, so a camera sending more was paying to be ignored. toll twenty-two times, per frame, for nothing. SVGA the pipelining is given up rather than the camera, and that costs almost nothing, since live video is capped at STREAM_RES_MAX anyway and the only thing running larger is a still with nothing to overlap. camera must not disable itself over a *setting*, in a house nobody can visit, when it could have lowered the number by itself."] },
    ],
  },
  {
    deviceType: "curtain",
    latestVersion: "2.0.0",
    changelog: [
    { version: "1.1.0", notes: ["first build that survives a power cut with the router still down — see tests/firmware-power-restore.test.ts."] },
    { version: "2.0.0", notes: ["The motor relays are driven correctly. They were bare GPIO writes with HIGH meaning \"on\", on boards where LOW energises the coil — so the *stopped* state held both relays closed, continuously, from power-up, and every direction was inverted. A full open or close now re-homes against the mechanical stop, so the timed estimate stops drifting away from where the curtain actually is. Travel time is a setting rather than a compile-time constant, with a learn mode — every curtain is a different width, and a 20-second default on a 1.5 m track put every reported position out by half. A dead time before reversing, a hard ceiling on how long the motor may run, edge-detected buttons, and a publish cadence: position changes on every pass while moving, so the old code emitted roughly 250 state messages — and 250 database rows — per movement."] },
    ],
  },
  {
    deviceType: "drone-fc",
    latestVersion: "2.0.0",
    changelog: [
    { version: "1.0.0", notes: ["initial Circuvent flight stack."] },
    { version: "1.0.1", notes: ["mixer/diagram agreement."] },
    { version: "2.0.0", notes: ["the failsafe now ends. It levelled and descended correctly and nothing ever stopped it, because sw() reads the last decoded SBUS channels and those persist after the link drops — so the aircraft landed and sat there at 35% throttle. Staged failsafe with a bounded descent, touchdown detection, crash detection, a latched stop the pilot has to acknowledge, staged low-voltage response, a dynamic notch and gyro filter chain, and bench tools (motor test, turtle mode, ESC locator beep)."] },
    ],
  },
  {
    deviceType: "drone-link",
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.1.0", notes: ["1.0.0 initial MAVLink bridge + mission supervisor."] },
    ],
  },
  {
    deviceType: "energy-monitor",
    latestVersion: "1.3.0",
    changelog: [
    { version: "1.1.0", notes: ["first build that survives a power cut with the router still down — see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    { version: "1.2.0", notes: ["The cumulative total survives a power cut. `kwh` lived only in RAM, so every reboot restarted it at zero and the retained state jumped backwards — worse than losing the number, because a meter reading that decreases corrupts any consumption history built by differencing it. Adds a command handler, so the reset/calibrate actions the server's command map already builds stop being dropped."] },
    { version: "1.3.0", notes: ["...except that handler only understood `ctCal`, and the command map sends `watts`, `volts` or `amps` — trim against a known load, the same contract `meter` honours. All three were accepted and ignored. The assumed supply voltage is now settable and persisted rather than fixed at 230, and the assumptions behind the wattage are published so an app can say the number is derived, not measured. Also samples once a second instead of as fast as the ADC allows, which was publishing a quarter of a million state messages a day."] },
    ],
  },
  {
    deviceType: "facedoor",
    latestVersion: "1.4.0",
    changelog: [
    { version: "1.0.0", notes: ["initial"] },
    { version: "1.1.0", notes: ["adds OTA (from CircuventDevice)"] },
    { version: "1.2.0", notes: ["adds a time-boxed face-enrolment mode driven from the app or the door"] },
    { version: "1.3.0", notes: ["Fail-secure means fail-secure: the door always boots locked. An unlock was persisted to NVS, so losing power during the unlock window made the strike energise on restore and stay open for the whole of cv.begin()."] },
    { version: "1.4.0", notes: ["A display, and the keypad hardening a display makes it possible to explain: PINs are salted-hashed instead of stored in clear, a held key no longer types itself over and over, a half-typed PIN no longer waits on the door for the next person to finish, and repeated wrong PINs lock the keypad out for a while that survives a power cycle. Adds an on-device admin menu so a face can be enrolled at the door."] },
    ],
  },
  {
    deviceType: "guardian",
    latestVersion: "2.1.0",
    changelog: [
    { version: "1.1.0", notes: ["first build that survives a power cut with the router still down — see tests/firmware-power-restore.test.ts."] },
    { version: "1.2.0", notes: ["An SOS no longer reports a location it does not have. lat/lng start at 0,0 and were only ever written on a fix, with nothing checking whether one had happened — so a device that had never seen a satellite sent \"Live location: 0.000000,0.000000\", a point in the Gulf of Guinea, to whoever the wearer trusts most. The SMS path also wrote the body a fixed 300 ms after AT+CMGS without waiting for the modem's \">\" prompt, so on a slow registration the body was discarded and the send failed silently while the buzzer and the cloud alert both said it had worked."] },
    { version: "2.0.0", notes: ["The product it was supposed to be. The trigger is a thirty-second continuous hold instead of a single press with a one-second debounce. In a shoe, the old test fired on ordinary walking — every step a second apart was a full SOS to the wearer's emergency contact. The panic button moved off GPIO0. It shared the pin with the reset gesture, so a thirty-second hold would have cleared the Wi-Fi at three seconds and factory reset at eight — erasing the contacts it was about to message. Contacts are provisioned instead of compiled in. The trusted number was the literal string \"+9199XXXXXXXX\" in the source, so every device ever flashed would have texted a number that does not exist. Up to four contacts, a cached nearest police station and a national emergency fallback now live in NVS, set from the app. The modem no longer blocks. sendSOS() could sit in delay loops for about forty-three seconds, during which GPS was not read and the cloud link was not serviced — the device went deaf at the one moment it must not. Sending is now a state machine stepped from loop(), which is also what lets it message several people, retry a failure, and keep sending position updates while the incident runs. Silent by default, and there is a self-test that proves the whole path works without staging an emergency."] },
    { version: "2.1.0", notes: ["It can now say whether it could actually call for help. `ready` only ever meant \"somebody typed in a phone number\". A beacon with no signal, no SIM, or a prepaid account that quietly expired looked identical to a working one — online, charged, reporting a position — and the button did nothing useful. Signal, network registration and SIM state are now polled and published. It answers texts from its contacts. WHERE returns a map link, STATUS returns battery and signal, SOS raises the alarm and STOP stands it down. This is the strongest form of working without the app: a parent with an ancient handset, no data and no account can find their child with nothing in between working at all. Only trusted numbers are obeyed, and deliberately no command can change who the contacts are — an SMS sender is trivially spoofed. Journey mode: say when you expect to be home, and if you do not say you arrived, the alarm is raised for you. It covers what the button cannot — being unable to press it. A low battery now tells somebody, once, before it dies rather than after. The serial reader was centralised. The outbox used to read the port itself, so an incoming text arriving mid-send was consumed by its token matcher and lost."] },
    ],
  },
  {
    deviceType: "home-hub",
    latestVersion: "2.4.0",
    changelog: [
    { version: "2.4.0", notes: ["A channel no longer switches itself on at boot. The button handler compared the first reading in loop() against an assumed \"released\", so a pin already low at power-up read as a deliberate press and toggled the relay — caught on a live unit that came back from an OTA reboot with a channel energised after it had been switched off. On a mains board that is an appliance turning itself on after a power cut. Also picks up the setup-mode confirmation below."] },
    { version: "2.3.1", notes: ["Picks up the CircuventDevice setup-portal fixes. `action:\"setup\"` did not exist before this build, so a console asking a 2.3.0 unit to open its hotspot was silently ignored — the owner was told to join a network that was never going to appear. The device now publishes `setupMode` before it drops the link, so the console can tell an obeyed request from an ignored one. The portal's network list also concatenated each SSID straight into the page's HTML, and an SSID is whatever a radio in range chooses to broadcast — so a quote in a neighbour's network name broke the form, and a tag in it ran script on the page where the owner types their Wi-Fi password. The same page ran a blocking 2-4 s scan inside the HTTP handler on every request."] },
    { version: "2.3.0", notes: ["OTA reports its own outcome. 2.2.0 wrote failures to Serial and nowhere else, so on a deployed unit a rejected certificate, a 404 and a command that never arrived all looked identical: nothing happens. The device now publishes otaStatus, which is what makes a failed rollout diagnosable without a serial cable."] },
    { version: "2.2.0", notes: ["OTA actually works. `action:\"ota\"` is now handled inside CircuventDevice rather than delegated to this sketch, which never implemented it — so the admin console's OTA button published a command every device ignored. Poll-based OTA also defaults on now as a backstop for units offline during a rollout. The firmware download is fetched with a pinned root instead of setInsecure(), which had allowed anyone able to intercept that connection to flash arbitrary code onto a board driving mains relays."] },
    { version: "2.1.0", notes: ["State is published the instant a command is handled (CircuventDevice::_dispatch -> publishStateNow), instead of waiting for the next 10s heartbeat. That behaviour landed on 2026-07-28 but the version was left at 2.0.0, so a unit reporting \"2.0.0\" could be either build and there was no way to tell from telemetry which devices still had ~5s average command echo. Worse, an OTA campaign filtered on version skipped exactly the units that needed it."] },
    { version: "2.0.0", notes: ["Production hardening: 4 channels, schedules, NVS boot restore."] },
    ],
  },
  {
    deviceType: "meter",
    latestVersion: "1.2.0",
    changelog: [
    { version: "1.1.0", notes: ["first build that survives a power cut with the router still down — see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    { version: "1.2.0", notes: ["CF1 is cleared whenever SEL changes. It was not, and the settle window (1 s) is shorter than the staleness timeout (2 s), so a period measured before the switch was still accepted afterwards as the newly selected quantity — a channel with nothing plugged into it reported roughly 0.9 A, because current mode produces no CF1 edges and the voltage pulse rate was read as current. Also stops `volts` holding its last value forever when the voltage sense goes quiet (which silently corrupted the published power factor), and samples on a fixed cadence rather than publishing twelve state messages a second under load. SEL_LEVEL_FOR_CURRENT is defined once instead of twice. The old #if/#else pair tripped a \"redefined\" warning in the .ino-to-.cpp conversion pass; the compiler proper resolved it correctly, so shipped boards were right, but an unknown METER_PART silently inherited HLW8012 polarity — now a hard #error. platformio.ini was a copy of energy-monitor's and gained real envs for the single-channel and HLW8012 variants, which had never been built."] },
    ],
  },
  {
    deviceType: "motion-sensor",
    latestVersion: "1.2.0",
    changelog: [
    { version: "1.1.0", notes: ["first build that survives a power cut with the router still down — see tests/firmware-power-restore.test.ts."] },
    { version: "1.2.0", notes: ["Disarming actually stops it reporting movement. It previously only suppressed the LED and the instant push; the heartbeat published motion regardless, so automations kept firing a few seconds later. A warm-up period after power-up, because a PIR emits spurious movement for up to a minute while its reference settles — so every power cut produced a false alarm at whatever hour the supply returned. `armed` is remembered across a reboot. It was a RAM default, so a sensor somebody had deliberately disarmed re-armed itself after any power blip and started alerting again. Movement is held briefly rather than reported edge by edge: a PIR chatters at the end of its pulse, and each transition was a published state and a database row."] },
    ],
  },
  {
    deviceType: "rc-link",
    latestVersion: "1.0.0",
    changelog: [
    { version: "1.0.0", notes: ["initial dongle firmware: control link complete, USB host interface still to come (see loop())."] },
    ],
  },
  {
    deviceType: "rc-remote",
    latestVersion: "1.0.0",
    changelog: [
    { version: "1.0.0", notes: ["initial handset firmware."] },
    ],
  },
  {
    deviceType: "rccar",
    latestVersion: "1.0.0",
    changelog: [
    { version: "1.0.0", notes: ["initial vehicle firmware."] },
    ],
  },
  {
    deviceType: "rfid-attend",
    latestVersion: "1.0.0",
    changelog: [
    { version: "1.0.0", notes: ["initial"] },
    ],
  },
  {
    deviceType: "rfid-gate",
    latestVersion: "2.0.0",
    changelog: [
    { version: "1.0.0", notes: ["initial"] },
    { version: "1.1.0", notes: ["OTA, from CircuventDevice."] },
    { version: "1.2.0", notes: ["A close command no longer opens the barrier. The force-close called openGate() to fix a stale flag, and on a closed gate that pulses the OPEN relay — then left it open if a vehicle was on the loop detector."] },
    { version: "1.3.0", notes: ["The manual button no longer fights the reset gesture. BTN_PIN is GPIO0, the pin setResetButton(0) also watches, and the test was level-triggered — so holding BOOT to factory reset commanded open/close about thirteen times in a row, reversing a barrier motor under load every 600 ms."] },
    { version: "2.0.0", notes: ["The relays are driven correctly. They were bare GPIO writes with HIGH meaning \"on\", on boards where LOW energises the coil: both the OPEN and CLOSE relays were held on from power-up, and every pulse was inverted. Now cvRelayInit/cvRelayWrite, which also means the barrier is not commanded during the first moments of boot. Wiegand frames are validated. 26-bit parity is checked and 34-bit is decoded properly; anything else is counted and discarded instead of being masked into a plausible-looking card number. The same tag is not re-read every few milliseconds. A car sitting in range used to generate a telemetry row per read and hold the barrier open indefinitely. The open limit switch is read, so `barrier` reports what the gate is actually doing — including refusing to move, which nothing could previously detect."] },
    ],
  },
  {
    deviceType: "sentinel",
    latestVersion: "1.2.0",
    changelog: [
    { version: "1.0.0", notes: ["initial"] },
    { version: "1.1.0", notes: ["OTA (from CircuventDevice) + gas sensor fault detection. 1.0.0 trusted the module's active-low comparator on GPIO35, which has no internal pull-up, so an unplugged detector floated low and latched a gas alarm that cut a relay and could never clear itself. Two units in the field were sitting in exactly that state."] },
    { version: "1.1.1", notes: ["The gas baseline stops tracking while the sensor is faulted. A disconnected module reads zero, and averaging that in walked the baseline down to nothing — so the moment the sensor came back, its ordinary clean-air output sat hundreds of counts \"above baseline\" and tripped the alarm."] },
    { version: "1.2.0", notes: ["The safety interlock can be stood down. `engageSafety()` was called on the alarm edge and had no counterpart anywhere in the file: after any gas event the exhaust relay ran indefinitely, and the appliances it cut stayed cut — while the alarm cleared itself the moment the air improved, so the panel looked perfectly normal and the reason those appliances were off was no longer displayed anywhere. Somebody would eventually switch the boiler back on, never knowing there had been a leak. So the alarm now latches until a person acknowledges it, which is what the file header always claimed, and acknowledging is what releases the interlock. `gasPresent` carries the live reading and drives the siren; `safetyCut` reports which appliances were cut, so the app can offer to restore them rather than the panel deciding to re-light a gas appliance by itself. Clearing is refused while gas is still present — that would only switch the extractor off in the middle of a leak, and muting already exists for a loud siren. The raw reading also stopped being published twice a second. It is an averaged ADC value that moves on every sample however clean the air is, so live state was dirty continuously — about 172,000 messages a day per panel, each an INSERT, for a diagnostic figure the app already charts from telemetry."] },
    ],
  },
  {
    deviceType: "smart-fan",
    latestVersion: "1.2.0",
    changelog: [
    { version: "1.1.0", notes: ["first build that survives a power cut with the router still down — see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    { version: "1.2.0", notes: ["The local button no longer fights the reset gesture. BTN_PIN is GPIO0, the same pin `setResetButton(0)` watches, and the test here was level-triggered with a 400 ms rate limit — not \"on press\" but \"every 400 ms while held\". Holding BOOT for eight seconds to factory reset therefore walked the fan through about twenty positions on the way, switching the relay and committing to NVS each time: a motor started and stopped twenty times in eight seconds, which is inrush the relay contacts are not specified for. It also acted on a pin already low at boot, which after a power cut is not a press at all. Now a tap, via CvTapButton."] },
    ],
  },
  {
    deviceType: "smart-light",
    latestVersion: "1.2.0",
    changelog: [
    { version: "1.1.0", notes: ["first build that survives a power cut with the router still down — see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    { version: "1.2.0", notes: ["The local button no longer fights the reset gesture. BTN_PIN is GPIO0, which is also the pin `setResetButton(0)` watches, and the test here was level-triggered with a 400 ms rate limit — so it was not \"on press\" but \"every 400 ms while held\". Holding BOOT for three seconds to change the Wi-Fi strobed the lamp seven times and left it wherever the timing landed; eight seconds for a factory reset did it twenty times, committing `power` to NVS on each one. It also acted on a pin that was already low at boot, which after a power cut is not a press at all. Now a tap, via CvTapButton. Setting a brightness on a lamp that is off turns it on, the way setting a speed on a stopped fan does. It did not, so the slider moved, the command was confirmed, the stored brightness changed and the room stayed dark."] },
    ],
  },
  {
    deviceType: "smart-lock",
    latestVersion: "1.3.0",
    changelog: [
    { version: "1.3.0", notes: ["The button no longer fights the reset gesture, which on a lock is a security problem rather than an annoyance. BTN_PIN is GPIO0, the pin `setResetButton(0)` also watches, and the test was level-triggered with a 500 ms rate limit — \"every 500 ms while held\", not \"on press\". Holding BOOT for three seconds to change the Wi-Fi therefore threw the bolt about six times and left it wherever the timing landed, which is unlocked half the time; it also restarted the auto-relock countdown on each pass. Worse, the old test acted on a pin that was already low at boot — and GPIO0 is a strapping pin that can sit low while the rail comes up, so a power cut could unlock the door on its own. Now a tap, via CvTapButton, which refuses to arm until it has seen the pin released."] },
    ],
  },
  {
    deviceType: "smart-plug",
    latestVersion: "1.2.0",
    changelog: [
    { version: "1.2.0", notes: ["Stops reporting a wattage it cannot measure. There is no metering front end on this board — the sketch published a hard-coded 42.5 W whenever the socket was on, and the console rendered it in large type under the caption \"Live power draw\". It was a placeholder that reached customers: every plug in the fleet claimed the same fictitious load, and anything reading `watts` (dashboards, automations, reports) was being fed a constant. A plug that says nothing about power is honest; one that invents it is not. Fit a BL0937 and it can be reinstated — firmware/meter already has the driver, and Docs/31-metering.md the traps. The button also no longer fights the reset gesture: level-triggered with a 400 ms rate limit, it switched the socket about twenty times during an eight-second factory-reset hold, and acted on a pin that was already low at boot. Now a tap, via CvTapButton."] },
    ],
  },
  {
    deviceType: "smart-switch",
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.1.0", notes: ["1.1.0 is the first build that survives a power cut with the router still down - see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    ],
  },
  {
    deviceType: "switchboard",
    latestVersion: "1.0.0",
    changelog: [
    { version: "1.0.0", notes: ["first build. Replaces the per-shape sketches: channel count, pin map, input kind and restore policy are all commissioned rather than compiled, with the pin-safety rules that touchboard-8 enforces at build time enforced here at runtime instead."] },
    ],
  },
  {
    deviceType: "touchboard",
    latestVersion: "1.1.1",
    changelog: [
    { version: "1.1.1", notes: ["1.0.0 initial; 1.1.0 adds OTA (from CircuventDevice)."] },
    ],
  },
  {
    deviceType: "touchboard-8",
    latestVersion: "1.1.2",
    changelog: [
    { version: "1.1.2", notes: ["It no longer invents a mains voltage. `if (volts < 1) volts = 230.0` was described as \"nominal until the first V sample\" and was true only of the first few seconds: a board whose voltage sense had failed reported exactly 230.0 for the rest of its life, and since the published power factor is watts / (volts x amps), the fabricated figure quietly corrupted that too. `volts` is now published only when it was measured, next to a flag that says so, and the power factor is cleared rather than left stale when there is nothing to divide by. Metering is also published on a cadence. All five figures derive from pulse counts and changed on every meter window, so the board emitted a state message — and a database row — every second of its life, for numbers nobody reads at that resolution. A pad press still publishes immediately; that is somebody at the wall waiting for a light."] },
    ],
  },
  {
    deviceType: "watertank",
    latestVersion: "2.3.0",
    changelog: [
    { version: "1.0.0", notes: ["initial"] },
    { version: "1.1.0", notes: ["adds OTA"] },
    { version: "2.0.0", notes: ["overhead level over LoRa"] },
    { version: "2.1.0", notes: ["Sump calibration is validated. A swapped or equal empty/full pair silently inverted the level — defeating the pump's dry-run interlock — or produced a NaN percentage. The manual button also no longer fires repeatedly during the GPIO0 reset gesture, which used to disable auto-fill permanently."] },
    { version: "2.2.0", notes: ["A sump that cannot be read no longer reports 50%. It did, and 50 is above every possible sumpMin, so a failed sump ultrasonic satisfied the pump's primary dry-run interlock and auto-fill would start the motor on it. Also stops a malformed pairing offer from overwriting the live sensor's key, and makes the persisted replay counter actually apply after a reboot."] },
    { version: "2.3.0", notes: ["The manual button ignores a pin that was already low at boot. 2.1.0 made it act on release, which stopped a reset hold from repeatedly toggling the pump, but the first pass of loop() still treated an already-low GPIO0 as a press beginning at that instant. Nobody can start a press before the device is running, and GPIO0 is a strapping pin that can sit low for seconds while the rail comes up — so a dirty mains restore could release into a valid-looking tap, toggle the pump and disable auto-fill on its own. Now shares CvTapButton with the other sketches on this pin, which arms only after seeing a release."] },
    ],
  },
  {
    deviceType: "watertank-sensor",
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.0.0", notes: ["initial"] },
    { version: "1.0.1", notes: ["pairing is acknowledged by the starter, so the unit stops transmitting and reports success only when something heard it"] },
    { version: "1.1.0", notes: ["Holds SENSOR_EN low through deep sleep. The ESP32 releases digital outputs the moment it sleeps, so the line that switches off the ultrasonic module — the biggest idle draw on a unit that runs from a cell on a roof — floated for the whole interval. Also keeps the \"when did we last persist the sequence\" marker in RTC memory, so NVS is written every five hundred readings as intended rather than on every single wake."] },
    ],
  },
  {
    deviceType: "witness",
    latestVersion: "1.0.0",
    changelog: [
    { version: "1.0.0", notes: ["initial firmware."] },
    ],
  },
];
