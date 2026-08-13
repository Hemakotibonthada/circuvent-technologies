/*
 * Circuvent FaceDoor — Smart Entry Door Controller (ESP32)
 * ========================================================
 * Zone 2 of the Circuvent smart-home. Multi-factor front-door access:
 *   - Electric strike / deadbolt via relay (fail-secure: locked on boot).
 *   - 4x4 capacitive/membrane keypad for PIN unlock.
 *   - Fingerprint module on Serial2 (emits "MATCH:<id>" on a verified print).
 *   - Face recognition runs on the hub's AI node (Frigate/OpenCV); on a match
 *     the hub sends {action:"unlock", method:"face", name:"..."} over MQTT.
 *   - Calling-bell button -> publishes a bell event (hub grabs the snapshot).
 *   - Every owner match publishes an `owner_access` event so the Room
 *     Automation Engine can trigger greeting + lights + AC.
 *   - Auto-relock after a configurable delay.
 *
 * Standard Circuvent protocol (cv/<id>/state|telemetry). Board: ESP32.
 */
/** Version history: 1.0.0 initial; 1.1.0 adds OTA (from CircuventDevice);
 *  1.2.0 adds a time-boxed face-enrolment mode driven from the app or the door. */
#define CV_FW_VERSION "1.2.0"
#include <CircuventDevice.h>
#include <Preferences.h>

// ---- pins ----
#define LOCK_RELAY 13
#define LED_PIN     2
#define BELL_BTN   39            // input-only; external pull-up; active-low
const int KP_ROW[4] = { 32, 33, 25, 26 };   // outputs
const int KP_COL[4] = { 27, 14, 23, 4 };    // inputs (pull-up)
const char KEYS[4][4] = {
  { '1', '2', '3', 'A' },
  { '4', '5', '6', 'B' },
  { '7', '8', '9', 'C' },
  { '*', '0', '#', 'D' },
};
// Fingerprint UART on Serial2 (RX=16, TX=17)
#define FP_RX 16
#define FP_TX 17

CircuventDevice cv("facedoor");
Preferences store;

bool locked = true, savedLocked = true;
int  autoLockSec = 8;
String pin = "";                 // configured via the app
String entry = "";               // current keypad entry
unsigned long unlockedAt = 0, lastBell = 0, lastKey = 0;
long accessCount = 0, bellCount = 0;

/*
 * Face enrolment at the door.
 *
 * The ESP32 has no camera and recognises nobody — the hub's AI node does that.
 * What the door owns is the *mode*: it shows that enrolment is happening, tells
 * the hub who the samples belong to, and closes the window on a timer so a door
 * cannot be left enrolling indefinitely. A door stuck in enrolment mode is a
 * door that can be taught to open for a stranger, and unlike a stolen key
 * nobody would notice.
 */
bool enrolling = false;
long enrolProfileId = 0;
String enrolName = "";
unsigned long enrolUntil = 0;

void publishEnrolState() {
  cv.set("enrolling", enrolling);
  cv.set("enrolName", enrolName);
  cv.set("enrolProfileId", (int)enrolProfileId);
  cv.set("enrolSecondsLeft", enrolling ? (int)((enrolUntil - millis()) / 1000UL) : 0);
  cv.publishStateNow();
}

void stopEnrol(const char *why) {
  if (!enrolling) return;
  enrolling = false;
  enrolUntil = 0;
  JsonDocument d;
  d["type"] = "enrol";
  d["state"] = "stopped";
  d["reason"] = why;
  d["profileId"] = (int)enrolProfileId;
  d["name"] = enrolName;
  d["ts"] = (long)(millis() / 1000);
  cv.publishTelemetry(d.as<JsonObjectConst>());
  enrolName = "";
  enrolProfileId = 0;
  publishEnrolState();
}

void startEnrol(long profileId, const char *name, int seconds) {
  // Clamped: a window measured in hours is the failure this exists to prevent.
  if (seconds <= 0) seconds = 120;
  if (seconds > 300) seconds = 300;

  enrolling = true;
  enrolProfileId = profileId;
  enrolName = name ? name : "";
  enrolUntil = millis() + (unsigned long)seconds * 1000UL;

  JsonDocument d;
  d["type"] = "enrol";
  d["state"] = "started";
  d["profileId"] = (int)profileId;
  d["name"] = enrolName;
  d["seconds"] = seconds;
  d["ts"] = (long)(millis() / 1000);
  cv.publishTelemetry(d.as<JsonObjectConst>());
  publishEnrolState();
}

void applyLock(bool lock) {
  locked = lock;
  digitalWrite(LOCK_RELAY, lock ? LOW : HIGH);   // energise to withdraw the bolt
  digitalWrite(LED_PIN, lock ? HIGH : LOW);
  if (locked != savedLocked) { store.putBool("locked", locked); savedLocked = locked; }
  if (!lock) unlockedAt = millis();
  cv.set("locked", locked);
  cv.publishStateNow();
}

void grantAccess(const char *method, const char *name) {
  JsonDocument d;
  d["type"] = "access";
  d["method"] = method;          // "face" | "fingerprint" | "keypad" | "app"
  d["name"] = name ? name : "";
  d["ok"] = true;
  d["ts"] = (long)(millis() / 1000);
  cv.publishTelemetry(d.as<JsonObjectConst>());
  accessCount++;
  cv.set("lastMethod", method);
  cv.set("lastName", name ? name : "");
  cv.set("accessCount", accessCount);
  applyLock(false);              // owner match -> unlock
}
void denyAccess(const char *method) {
  JsonDocument d;
  d["type"] = "access"; d["method"] = method; d["ok"] = false; d["ts"] = (long)(millis() / 1000);
  cv.publishTelemetry(d.as<JsonObjectConst>());
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "unlock") {
    /*
     * Refused while enrolling. During enrolment the camera is being shown
     * faces that are not yet trusted, and a recogniser that fires mid-capture
     * would open the door on a half-taught profile. Enrolment and unlocking
     * are different jobs and the door does one at a time.
     */
    if (enrolling) {
      denyAccess("face");
      return;
    }
    const char *m = p["method"].is<const char *>() ? p["method"].as<const char *>() : "app";
    const char *n = p["name"].is<const char *>() ? p["name"].as<const char *>() : "";
    grantAccess(m, n);
  } else if (action == "lock") {
    applyLock(true);
  } else if (action == "enrol") {
    const char *mode = p["mode"].is<const char *>() ? p["mode"].as<const char *>() : "off";
    if (strcmp(mode, "face") == 0) {
      long id = p["profileId"].is<long>() ? p["profileId"].as<long>() : 0;
      const char *n = p["name"].is<const char *>() ? p["name"].as<const char *>() : "";
      int secs = p["seconds"].is<int>() ? p["seconds"].as<int>() : 120;
      startEnrol(id, n, secs);
    } else {
      stopEnrol("commanded");
    }
  } else if (action == "set") {
    if (p["locked"].is<bool>()) applyLock(p["locked"].as<bool>());
    if (p["autoLockSec"].is<int>()) { autoLockSec = p["autoLockSec"].as<int>(); store.putInt("alock", autoLockSec); cv.set("autoLockSec", autoLockSec); }
    if (p["pin"].is<const char *>()) { pin = String(p["pin"].as<const char *>()); store.putString("pin", pin); }
  }
}

char scanKeypad() {
  for (int r = 0; r < 4; r++) {
    digitalWrite(KP_ROW[r], LOW);
    for (int c = 0; c < 4; c++) {
      if (digitalRead(KP_COL[c]) == LOW) {
        digitalWrite(KP_ROW[r], HIGH);
        return KEYS[r][c];
      }
    }
    digitalWrite(KP_ROW[r], HIGH);
  }
  return 0;
}

void handleKey(char k) {
  if (k == '#') {                       // submit
    if (pin.length() && entry == pin) grantAccess("keypad", "");
    else denyAccess("keypad");
    entry = "";
  } else if (k == '*') {                // clear
    entry = "";
  } else {
    if (entry.length() < 12) entry += k;
  }
}

void checkFingerprint() {
  static String line = "";
  while (Serial2.available()) {
    char ch = (char)Serial2.read();
    if (ch == '\n' || ch == '\r') {
      line.trim();
      if (line.startsWith("MATCH:")) grantAccess("fingerprint", line.substring(6).c_str());
      else if (line.startsWith("NOMATCH")) denyAccess("fingerprint");
      line = "";
    } else if (line.length() < 48) {
      line += ch;
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(57600, SERIAL_8N1, FP_RX, FP_TX);
  pinMode(LOCK_RELAY, OUTPUT); pinMode(LED_PIN, OUTPUT);
  pinMode(BELL_BTN, INPUT);
  for (int r = 0; r < 4; r++) { pinMode(KP_ROW[r], OUTPUT); digitalWrite(KP_ROW[r], HIGH); }
  for (int c = 0; c < 4; c++) { pinMode(KP_COL[c], INPUT_PULLUP); }

  store.begin("fdoor", false);
  locked = store.getBool("locked", true); savedLocked = locked;
  autoLockSec = store.getInt("alock", autoLockSec);
  pin = store.getString("pin", "");
  applyLock(locked);

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.setResetButton(0);
  cv.begin();
  cv.set("autoLockSec", autoLockSec);
  cv.set("enrolling", false);
}

void loop() {
  /*
   * Close the enrolment window on time.
   *
   * Checked before anything else in the loop, so the door cannot spend even
   * one more pass in a mode whose window has passed. This is the timer the
   * whole safety argument for device-side enrolment rests on: the server asks
   * for a window, but only the door can guarantee it ends.
   */
  if (enrolling && (long)(millis() - enrolUntil) >= 0) stopEnrol("expired");

  // Blink while enrolling, so somebody standing at the door can see the mode
  // rather than having to trust a phone screen they may not be holding.
  if (enrolling) digitalWrite(LED_PIN, (millis() / 250) % 2 ? HIGH : LOW);

  // keypad
  char k = scanKeypad();
  if (k && millis() - lastKey > 220) { lastKey = millis(); handleKey(k); }

  // fingerprint module
  checkFingerprint();

  // calling bell (active-low, debounced)
  if (digitalRead(BELL_BTN) == LOW && millis() - lastBell > 2000) {
    lastBell = millis(); bellCount++;
    JsonDocument d; d["type"] = "bell"; d["ts"] = (long)(millis() / 1000);
    cv.publishTelemetry(d.as<JsonObjectConst>());
    cv.set("bellCount", bellCount);
    cv.publishStateNow();
  }

  // auto-relock
  if (!locked && autoLockSec > 0 && millis() - unlockedAt > (unsigned long)autoLockSec * 1000UL) applyLock(true);

  cv.loop();
}
