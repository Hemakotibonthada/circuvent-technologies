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
#define CV_FW_VERSION "2.0.0"
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
bool lastBtn[NUM_CH] = {true, true, true, true};
uint32_t btnAt[NUM_CH] = {0, 0, 0, 0};
String scene = "home";
Rule rules[MAX_RULES];
bool clockReady = false;
int lastAppliedMinute = -1;

void writeRelay(int i, bool on) {
  relayOn[i] = on;
  digitalWrite(RELAY[i], on ? HIGH : LOW);
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
  for (int i = 0; i < NUM_CH; i++) { pinMode(RELAY[i], OUTPUT); pinMode(BTN[i], INPUT_PULLUP); }
  loadState();
  cv.onCommand(onCommand);
  cv.setInterval(10000);
  // cv.setRootCA(CIRCUVENT_ROOT_CA);   // enable TLS pinning in production
  cv.begin();
  configTime(19800, 0, "pool.ntp.org", "time.google.com");  // IST (UTC+5:30)
}

void loop() {
  // physical buttons (local-first: work even when offline)
  for (int i = 0; i < NUM_CH; i++) {
    bool s = digitalRead(BTN[i]);
    if (lastBtn[i] && !s && millis() - btnAt[i] > 250) {  // falling edge
      btnAt[i] = millis();
      writeRelay(i, !relayOn[i]);
    }
    lastBtn[i] = s;
  }

  if (!clockReady && time(nullptr) > 1700000000) clockReady = true;
  applySchedules();

  cv.set("uptime", (long)(millis() / 1000));
  cv.set("scene", scene.c_str());
  cv.set("channels", NUM_CH);
  cv.set("clock", clockReady);
  cv.loop();
}
