/*
 * Circuvent Smart Plug — ESP32 firmware
 * Wi-Fi relay + energy telemetry + Alexa/Google (fauxmoESP) + Circuvent cloud.
 * Deps: CircuventDevice, ArduinoJson, fauxmoESP (by Xose Perez)
 */
/* Version history: 1.1.0 is the first build that survives a power cut with the
   router still down - see tests/firmware-power-restore.test.ts. Declared
   explicitly so the fleet can tell fixed devices from unfixed ones; without
   it every sketch reported the library default and they were
   indistinguishable. */
/* 1.1.1  The status LED is no longer inverted. It was driven through cvRelayWrite(), which applies the relay board's active-LOW polarity, so the LED lit when the socket was off. */
/*
 * 1.2.0  Stops reporting a wattage it cannot measure. There is no metering
 *        front end on this board — the sketch published a hard-coded 42.5 W
 *        whenever the socket was on, and the console rendered it in large type
 *        under the caption "Live power draw". It was a placeholder that reached
 *        customers: every plug in the fleet claimed the same fictitious load,
 *        and anything reading `watts` (dashboards, automations, reports) was
 *        being fed a constant. A plug that says nothing about power is honest;
 *        one that invents it is not. Fit a BL0937 and it can be reinstated —
 *        firmware/meter already has the driver, and Docs/31-metering.md the
 *        traps.
 *
 *        The button also no longer fights the reset gesture: level-triggered
 *        with a 400 ms rate limit, it switched the socket about twenty times
 *        during an eight-second factory-reset hold, and acted on a pin that was
 *        already low at boot. Now a tap, via CvTapButton.
 */
#define CV_FW_VERSION "1.2.0"
#include <CircuventDevice.h>
#include <fauxmoESP.h>
#include <Preferences.h>

// Identical firmware — Wi-Fi + identity are provisioned by the Circuvent app.

#define RELAY_PIN 26
#define LED_PIN 2
#define BTN_PIN 0

CircuventDevice cv("smart-plug");
fauxmoESP fauxmo;
Preferences store;
CvTapButton btn;
bool power = false;
bool savedPower = false;

void applyPower(bool on) {
  power = on;
  cvRelayWrite(RELAY_PIN, on);
  // The status LED is wired active-HIGH, like every other sketch in the fleet.
  // cvRelayWrite() applies the *relay* board's active-LOW polarity, so using it
  // here lit the LED when the socket was off and darkened it when on.
  digitalWrite(LED_PIN, on ? HIGH : LOW);
  if (power != savedPower) {
    store.putBool("power", power);
    savedPower = power;
  }
  cv.set("power", power);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set" && p["power"].is<bool>()) applyPower(p["power"].as<bool>());
}

void setup() {
  Serial.begin(115200);
  cvRelayInit(RELAY_PIN);
  pinMode(LED_PIN, OUTPUT);
  btn.begin(BTN_PIN);
  store.begin("plug", false);
  power = store.getBool("power", false);
  savedPower = power;
  applyPower(power);

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();

  // Local Alexa / Google Home voice control
  fauxmo.createServer(true);
  fauxmo.setPort(80);
  fauxmo.enable(true);
  fauxmo.addDevice("Circuvent Plug");
  fauxmo.onSetState([](unsigned char, const char *, bool state, unsigned char) { applyPower(state); });
}

void loop() {
  fauxmo.handle();
  /* A tap toggles the socket; a long hold is the reset gesture on this same
     pin and is left to the library, which is already timing it. */
  if (btn.tapped()) applyPower(!power);
  /*
   * No `watts` here on purpose.
   *
   * This board has no metering front end. What stood here published a constant
   * 42.5 W whenever the socket was on, behind a TODO — and the console showed
   * it as "Live power draw". Publishing nothing means the app has no reading to
   * show, which is true; publishing 42.5 meant every plug we have ever shipped
   * reported the same invented load, and automations and reports consumed it as
   * if it were measured.
   */
  cv.loop();
}
