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
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.1.0", notes: ["1.1.0 is the first build that survives a power cut with the router still down - see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
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
    latestVersion: "2.1.1",
    changelog: [
    { version: "2.1.1", notes: ["2.0.0 initial; 2.1.0 adds OTA (from CircuventDevice)."] },
    ],
  },
  {
    deviceType: "camera",
    latestVersion: "1.14.4",
    changelog: [
    { version: "1.0.0", notes: ["initial"] },
    { version: "1.1.0", notes: ["streaming fixes"] },
    { version: "1.2.0", notes: ["OTA. Also moves the build to min_spiffs.csv: the previous huge_app.csv has a single app slot, so no camera could ever have taken an over-the-air update at all."] },
    { version: "1.9.0", notes: ["Serve video on the LAN as well as over MQTT. snapshot set 1600x1200 as the size of every *streamed* frame too. An OV2640 reads a UXGA frame out at around 5 fps on a good day. the time that readout takes. current one had finished being pushed through TLS. Capture and transmit were serial when they only ever needed to overlap. socket, so a camera sending more was paying to be ignored. toll twenty-two times, per frame, for nothing. SVGA the pipelining is given up rather than the camera, and that costs almost nothing, since live video is capped at STREAM_RES_MAX anyway and the only thing running larger is a still with nothing to overlap. camera must not disable itself over a *setting*, in a house nobody can visit, when it could have lowered the number by itself."] },
    ],
  },
  {
    deviceType: "curtain",
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.1.0", notes: ["1.1.0 is the first build that survives a power cut with the router still down - see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    ],
  },
  {
    deviceType: "drone-fc",
    latestVersion: "1.0.1",
    changelog: [
    { version: "1.0.1", notes: ["1.0.0 initial Circuvent flight stack."] },
    ],
  },
  {
    deviceType: "drone-link",
    latestVersion: "1.0.1",
    changelog: [
    { version: "1.0.1", notes: ["1.0.0 initial MAVLink bridge + mission supervisor."] },
    ],
  },
  {
    deviceType: "energy-monitor",
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.1.0", notes: ["1.1.0 is the first build that survives a power cut with the router still down - see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    ],
  },
  {
    deviceType: "facedoor",
    latestVersion: "1.2.1",
    changelog: [
    { version: "1.2.1", notes: ["1.0.0 initial; 1.1.0 adds OTA (from CircuventDevice); * 1.2.0 adds a time-boxed face-enrolment mode driven from the app or the door."] },
    ],
  },
  {
    deviceType: "guardian",
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.1.0", notes: ["1.1.0 is the first build that survives a power cut with the router still down - see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    ],
  },
  {
    deviceType: "home-hub",
    latestVersion: "2.3.1",
    changelog: [
    { version: "2.3.0", notes: ["OTA reports its own outcome. 2.2.0 wrote failures to Serial and nowhere else, so on a deployed unit a rejected certificate, a 404 and a command that never arrived all looked identical: nothing happens. The device now publishes otaStatus, which is what makes a failed rollout diagnosable without a serial cable."] },
    { version: "2.2.0", notes: ["OTA actually works. `action:\"ota\"` is now handled inside CircuventDevice rather than delegated to this sketch, which never implemented it — so the admin console's OTA button published a command every device ignored. Poll-based OTA also defaults on now as a backstop for units offline during a rollout. The firmware download is fetched with a pinned root instead of setInsecure(), which had allowed anyone able to intercept that connection to flash arbitrary code onto a board driving mains relays."] },
    { version: "2.1.0", notes: ["State is published the instant a command is handled (CircuventDevice::_dispatch -> publishStateNow), instead of waiting for the next 10s heartbeat. That behaviour landed on 2026-07-28 but the version was left at 2.0.0, so a unit reporting \"2.0.0\" could be either build and there was no way to tell from telemetry which devices still had ~5s average command echo. Worse, an OTA campaign filtered on version skipped exactly the units that needed it."] },
    { version: "2.0.0", notes: ["Production hardening: 4 channels, schedules, NVS boot restore."] },
    ],
  },
  {
    deviceType: "meter",
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.1.0", notes: ["1.1.0 is the first build that survives a power cut with the router still down - see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    ],
  },
  {
    deviceType: "motion-sensor",
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.1.0", notes: ["1.1.0 is the first build that survives a power cut with the router still down - see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    ],
  },
  {
    deviceType: "rfid-gate",
    latestVersion: "1.1.1",
    changelog: [
    { version: "1.1.1", notes: ["1.0.0 initial; 1.1.0 adds OTA (from CircuventDevice)."] },
    ],
  },
  {
    deviceType: "sentinel",
    latestVersion: "1.1.1",
    changelog: [
    { version: "1.0.0", notes: ["initial"] },
    { version: "1.1.0", notes: ["OTA (from CircuventDevice) + gas sensor fault detection. 1.0.0 trusted the module's active-low comparator on GPIO35, which has no internal pull-up, so an unplugged detector floated low and latched a gas alarm that cut a relay and could never clear itself. Two units in the field were sitting in exactly that state."] },
    ],
  },
  {
    deviceType: "smart-fan",
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.1.0", notes: ["1.1.0 is the first build that survives a power cut with the router still down - see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    ],
  },
  {
    deviceType: "smart-light",
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.1.0", notes: ["1.1.0 is the first build that survives a power cut with the router still down - see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    ],
  },
  {
    deviceType: "smart-lock",
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.1.0", notes: ["1.1.0 is the first build that survives a power cut with the router still down - see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
    ],
  },
  {
    deviceType: "smart-plug",
    latestVersion: "1.1.0",
    changelog: [
    { version: "1.1.0", notes: ["1.1.0 is the first build that survives a power cut with the router still down - see tests/firmware-power-restore.test.ts. Declared explicitly so the fleet can tell fixed devices from unfixed ones; without it every sketch reported the library default and they were indistinguishable."] },
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
    deviceType: "touchboard",
    latestVersion: "1.1.1",
    changelog: [
    { version: "1.1.1", notes: ["1.0.0 initial; 1.1.0 adds OTA (from CircuventDevice)."] },
    ],
  },
  {
    deviceType: "touchboard-8",
    latestVersion: "1.1.1",
    changelog: [
    { version: "1.1.1", notes: ["1.0.0 initial 8-gang board; 1.1.0 adds the local home link."] },
    ],
  },
  {
    deviceType: "watertank",
    latestVersion: "2.0.1",
    changelog: [
    { version: "2.0.1", notes: ["1.0.0 initial; 1.1.0 adds OTA; 2.0.0 overhead level over LoRa."] },
    ],
  },
  {
    deviceType: "watertank-sensor",
    latestVersion: "1.0.1",
    changelog: [

    ],
  },
];
