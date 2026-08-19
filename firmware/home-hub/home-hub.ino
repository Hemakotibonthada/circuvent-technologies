/*
 * Circuvent Home Automation Hub (ESP32)
 * =====================================
 * 4-channel mains automation controller:
 *   - 4 relay outputs + 4 physical buttons (local control always works,
 *     even offline).
 *   - Scenes (home / away / night / movie) map to channel states.
 *   - NTP-backed daily schedules per channel (on-minute / off-minute).
 *   - Boot-state restore from NVS (relays return to last state after a
 *     power cut, unless configured otherwise).
 *   - Zero-touch Wi-Fi provisioning + OTA via CircuventDevice.
 *
 * Deps: CircuventDevice, ArduinoJson.  Board: ESP32.
 */
/*
 * Version history — bump this whenever behaviour changes, not just features.
 *
 * 2.4.0  A channel no longer switches itself on at boot. The button handler
 *        compared the first reading in loop() against an assumed "released",
 *        so a pin already low at power-up read as a deliberate press and
 *        toggled the relay — caught on a live unit that came back from an OTA
 *        reboot with a channel energised after it had been switched off. On a
 *        mains board that is an appliance turning itself on after a power cut.
 *        Also picks up the setup-mode confirmation below.
 * 2.3.1  Picks up the CircuventDevice setup-portal fixes. `action:"setup"` did
 *        not exist before this build, so a console asking a 2.3.0 unit to open
 *        its hotspot was silently ignored — the owner was told to join a
 *        network that was never going to appear. The device now publishes
 *        `setupMode` before it drops the link, so the console can tell an
 *        obeyed request from an ignored one. The portal's network list also
 *        concatenated each SSID straight into the page's HTML, and an SSID is
 *        whatever a radio in range chooses to broadcast — so a quote in a
 *        neighbour's network name broke the form, and a tag in it ran script
 *        on the page where the owner types their Wi-Fi password. The same page
 *        ran a blocking 2-4 s scan inside the HTTP handler on every request.
 * 2.3.0  OTA reports its own outcome. 2.2.0 wrote failures to Serial and
 *        nowhere else, so on a deployed unit a rejected certificate, a 404
 *        and a command that never arrived all looked identical: nothing
 *        happens. The device now publishes otaStatus, which is what makes a
 *        failed rollout diagnosable without a serial cable.
 * 2.2.0  OTA actually works. `action:"ota"` is now handled inside
 *        CircuventDevice rather than delegated to this sketch, which never
 *        implemented it — so the admin console's OTA button published a
 *        command every device ignored. Poll-based OTA also defaults on now as
 *        a backstop for units offline during a rollout. The firmware download
 *        is fetched with a pinned root instead of setInsecure(), which had
 *        allowed anyone able to intercept that connection to flash arbitrary
 *        code onto a board driving mains relays.
 * 2.1.0  State is published the instant a command is handled
 *        (CircuventDevice::_dispatch -> publishStateNow), instead of waiting
 *        for the next 10s heartbeat. That behaviour landed on 2026-07-28 but
 *        the version was left at 2.0.0, so a unit reporting "2.0.0" could be
 *        either build and there was no way to tell from telemetry which
 *        devices still had ~5s average command echo. Worse, an OTA campaign
 *        filtered on version skipped exactly the units that needed it.
 * 2.0.0  Production hardening: 4 channels, schedules, NVS boot restore.
 */
#define CV_FW_VERSION "2.4.0"
#include <CircuventDevice.h>
#include <Preferences.h>
#include <time.h>

// Identical firmware — Wi-Fi + identity are provisioned by the Circuvent app.

#define NUM_CH 4
const uint8_t RELAY[NUM_CH] = {26, 27, 32, 33};
const uint8_t BTN[NUM_CH]   = {13, 14, 16, 17};
#define LED_PIN 2

struct Rule { int8_t ch; int16_t onMin; int16_t offMin; bool en; };  // minutes of day, -1 = unused
#define MAX_RULES 8

CircuventDevice cv("home-hub");
Preferences store;

bool relayOn[NUM_CH] = {false, false, false, false};
/*
 * Button state, primed from the pins before anything is acted on.
 *
 * `lastBtn` used to be initialised to `true` (released) and compared against
 * the very first reading in loop(). A pin that was *already* low when the
 * device booted therefore looked like a fresh falling edge, and the channel
 * toggled itself. Nobody can press a button for a device that is not running
 * yet, so that reading was always wrong.
 *
 * It is not hypothetical and it is not rare: this was caught on a live unit,
 * which came back from an OTA reboot with channel 1 energised after it had
 * been switched off. On a board that switches mains, that is a light or an
 * appliance turning itself on after every power cut — and the owner has no
 * reason to connect it to the button at all.
 *
 * This is the same fault, and the same fix, as `_pollResetButton` in
 * CircuventDevice: the input is not trusted until it has been sampled once
 * with the device actually running.
 */
bool lastBtn[NUM_CH] = {true, true, true, true};
bool btnPrimed = false;
uint32_t btnAt[NUM_CH] = {0, 0, 0, 0};
String scene = "home";
Rule rules[MAX_RULES];
bool clockReady = false;
int lastAppliedMinute = -1;

void writeRelay(int i, bool on) {
  relayOn[i] = on;
  cvRelayWrite(RELAY[i], on);
  char k[4]; snprintf(k, sizeof(k), "r%d", i);
  store.putBool(k, on);
  char t[8]; snprintf(t, sizeof(t), "power%s", i == 0 ? "" : String(i + 1).c_str());
  cv.set(t, on);
}

void applyScene(const String &s) {
  scene = s;
  if (s == "away")       { for (int i = 0; i < NUM_CH; i++) writeRelay(i, false); }
  else if (s == "night") { writeRelay(0, false); writeRelay(1, false); }         // lights off, keep others
  else if (s == "movie") { writeRelay(0, false); writeRelay(2, true); }          // dim lights, TV/AV on
  else if (s == "home")  { writeRelay(0, true); }                                // main light on
  store.putString("scene", scene);
  cv.set("scene", scene.c_str());
}

void loadState() {
  store.begin("hub", false);
  bool restore = store.getBool("restore", true);
  for (int i = 0; i < NUM_CH; i++) {
    char k[4]; snprintf(k, sizeof(k), "r%d", i);
    writeRelay(i, restore ? store.getBool(k, false) : false);
  }
  scene = store.getString("scene", "home");
  for (int i = 0; i < MAX_RULES; i++) {
    char k[8]; snprintf(k, sizeof(k), "rule%d", i);
    String v = store.getString(k, "");
    if (v.length()) {
      // format: ch,onMin,offMin,en
      int a, b, c, d;
      if (sscanf(v.c_str(), "%d,%d,%d,%d", &a, &b, &c, &d) == 4) rules[i] = {(int8_t)a, (int16_t)b, (int16_t)c, (bool)d};
    } else rules[i] = {-1, -1, -1, false};
  }
}

void saveRule(int idx) {
  char k[8]; snprintf(k, sizeof(k), "rule%d", idx);
  char v[24]; snprintf(v, sizeof(v), "%d,%d,%d,%d", rules[idx].ch, rules[idx].onMin, rules[idx].offMin, rules[idx].en ? 1 : 0);
  store.putString(k, v);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action != "set") return;
  // single channel: { ch: 0..3, on: bool }
  if (p["ch"].is<int>() && p["on"].is<bool>()) {
    int c = p["ch"].as<int>();
    if (c >= 0 && c < NUM_CH) writeRelay(c, p["on"].as<bool>());
  }
  // legacy single relay: { power: bool } -> channel 0
  if (p["power"].is<bool>()) writeRelay(0, p["power"].as<bool>());
  // bulk: { relays: [b,b,b,b] }
  if (p["relays"].is<JsonArrayConst>()) {
    JsonArrayConst a = p["relays"].as<JsonArrayConst>();
    int i = 0; for (bool v : a) { if (i < NUM_CH) writeRelay(i, v); i++; }
  }
  // scene: { scene: "away" }
  if (p["scene"].is<const char *>()) applyScene(String(p["scene"].as<const char *>()));
  // schedule rule: { rule: {idx,ch,onMin,offMin,en} }
  if (p["rule"].is<JsonObjectConst>()) {
    JsonObjectConst r = p["rule"].as<JsonObjectConst>();
    int idx = r["idx"] | -1;
    if (idx >= 0 && idx < MAX_RULES) {
      rules[idx] = { (int8_t)(r["ch"] | -1), (int16_t)(r["onMin"] | -1), (int16_t)(r["offMin"] | -1), (bool)(r["en"] | false) };
      saveRule(idx);
    }
  }
  // boot restore policy: { restore: bool }
  if (p["restore"].is<bool>()) store.putBool("restore", p["restore"].as<bool>());
}

void applySchedules() {
  if (!clockReady) return;
  time_t now = time(nullptr);
  struct tm t; localtime_r(&now, &t);
  int minute = t.tm_hour * 60 + t.tm_min;
  if (minute == lastAppliedMinute) return;
  lastAppliedMinute = minute;
  for (int i = 0; i < MAX_RULES; i++) {
    if (!rules[i].en || rules[i].ch < 0 || rules[i].ch >= NUM_CH) continue;
    if (rules[i].onMin == minute)  writeRelay(rules[i].ch, true);
    if (rules[i].offMin == minute) writeRelay(rules[i].ch, false);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT); digitalWrite(LED_PIN, HIGH);
  for (int i = 0; i < NUM_CH; i++) { cvRelayInit(RELAY[i]); pinMode(BTN[i], INPUT_PULLUP); }
  loadState();
  cv.onCommand(onCommand);
  cv.setInterval(10000);
  // cv.setRootCA(CIRCUVENT_ROOT_CA);   // enable TLS pinning in production
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
  configTime(19800, 0, "pool.ntp.org", "time.google.com");  // IST (UTC+5:30)
}

void loop() {
  // physical buttons (local-first: work even when offline)
  if (!btnPrimed) {
    // First pass: record what the pins actually read, and act on nothing. A
    // press has to *begin* while the device is running to count as one.
    for (int i = 0; i < NUM_CH; i++) lastBtn[i] = digitalRead(BTN[i]);
    btnPrimed = true;
  } else {
    for (int i = 0; i < NUM_CH; i++) {
      bool s = digitalRead(BTN[i]);
      if (lastBtn[i] && !s && millis() - btnAt[i] > 250) {  // falling edge
        btnAt[i] = millis();
        writeRelay(i, !relayOn[i]);
      }
      lastBtn[i] = s;
    }
  }

  if (!clockReady && time(nullptr) > 1700000000) clockReady = true;
  applySchedules();

  // `uptime`/`rssi`/`fw` are appended by publishState(); setting uptime here
  // would mark the state dirty every second and force a needless publish.
  cv.set("scene", scene.c_str());
  cv.set("channels", NUM_CH);
  cv.set("clock", clockReady);
  cv.loop();
}
