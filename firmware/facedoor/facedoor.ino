/*
 * Circuvent FaceDoor — Smart Entry Door Controller (ESP32)
 * ========================================================
 * Zone 2 of the Circuvent smart-home. Multi-factor front-door access:
 *   - Electric strike / deadbolt via relay (fail-secure: locked on boot).
 *   - 4x4 capacitive/membrane keypad for PIN unlock, with attempt lockout.
 *   - 128x64 SSD1306 OLED so the door can say what it is doing.
 *   - On-device admin menu: enrol a face, change PINs, lock now.
 *   - Fingerprint module on Serial2 (emits "MATCH:<id>" on a verified print).
 *   - Face recognition runs on the hub's AI node (see platform/face); on a
 *     match the hub sends {action:"unlock", method:"face", name:"..."}.
 *   - Calling-bell button -> publishes a bell event (hub grabs the snapshot).
 *   - Every owner match publishes an `owner_access` event so the Room
 *     Automation Engine can trigger greeting + lights + AC.
 *   - Auto-relock after a configurable delay.
 *
 * Standard Circuvent protocol (cv/<id>/state|telemetry). Board: ESP32.
 */
/*
 * Version history
 *   1.0.0  initial
 *   1.1.0  adds OTA (from CircuventDevice)
 *   1.2.0  adds a time-boxed face-enrolment mode driven from the app or the door
 *   1.3.0  Fail-secure means fail-secure: the door always boots locked. An
 *          unlock was persisted to NVS, so losing power during the unlock
 *          window made the strike energise on restore and stay open for the
 *          whole of cv.begin().
 *   1.4.0  A display, and the keypad hardening a display makes it possible to
 *          explain: PINs are salted-hashed instead of stored in clear, a held
 *          key no longer types itself over and over, a half-typed PIN no longer
 *          waits on the door for the next person to finish, and repeated wrong
 *          PINs lock the keypad out for a while that survives a power cycle.
 *          Adds an on-device admin menu so a face can be enrolled at the door.
 */
#define CV_FW_VERSION "1.4.0"
#include <CircuventDevice.h>
#include <Preferences.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "mbedtls/sha256.h"

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
// OLED on the default I2C pins. 21 and 22 are the only pins left that the
// keypad, the strike, the bell and the fingerprint UART are not already using.
#define OLED_SDA  21
#define OLED_SCL  22
#define OLED_ADDR 0x3C

CircuventDevice cv("facedoor");
Preferences store;
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
bool hasDisplay = false;         // false if no panel answered on I2C

bool locked = true, savedLocked = true;
int  autoLockSec = 8;
String entry = "";               // current keypad entry
String lastMethod = "", lastName = "";
unsigned long unlockedAt = 0, lastBell = 0;
long accessCount = 0, bellCount = 0;

/*
 * PINs are stored as a salted SHA-256, never in clear.
 *
 * They used to be written to NVS as text. Flash on an ESP32 is not a secret:
 * the chip is screwed to the *outside* of the door, esptool reads it over the
 * same four pins used to program it, and unless flash encryption is fused on —
 * it is not, on stock hardware — a few minutes alone with the panel yields the
 * door's PIN. Hashing does not stop somebody who can dump flash from attacking
 * the door, but it stops the dump from handing them the code, and it stops the
 * same code from working on the customer's other doors.
 *
 * The salt is per-device, so two doors sharing a PIN do not share a hash.
 */
String userHash = "", adminHash = "", salt = "";

/*
 * Keypad lockout.
 *
 * A 4-digit PIN is 10,000 guesses, and a keypad accepts them as fast as fingers
 * move — perhaps three a second, so under an hour unattended. The delay is what
 * makes a short PIN safe at all, so it escalates and, more importantly, it is
 * *persisted*: otherwise an attacker pulls the fuse to clear the counter, and
 * cutting power to this particular device is already the attack the fail-secure
 * rule exists for.
 */
const int  MAX_FAILS_DEFAULT = 5;
const int  LOCKOUT_SEC_DEFAULT = 60;
const long LOCKOUT_SEC_MAX = 900;
int   maxFails = MAX_FAILS_DEFAULT;
int   lockoutSec = LOCKOUT_SEC_DEFAULT;
int   fails = 0;                 // consecutive wrong PINs, persisted
int   rounds = 0;                // lockouts served since the last success
unsigned long lockoutUntil = 0;

/*
 * A half-typed PIN is a hazard, not a convenience. Somebody types three digits,
 * changes their mind and walks off; the next person to touch the keypad is
 * completing a stranger's entry, and the digits sit on the display in the
 * meantime. Anything unfinished is discarded.
 */
const unsigned long ENTRY_TIMEOUT_MS = 10000;
unsigned long entryAt = 0;

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
int  enrolSamples = 0;

/*
 * The admin menu.
 *
 * Everything here can also be done from the app. It exists because the app
 * cannot always be reached: a new resident standing at the door with the owner
 * beside them should not need the owner's phone, an account and a working
 * internet connection to have their face taken. It is gated behind a separate
 * admin PIN, and there is deliberately no default one — a menu that opens on
 * 1234 out of the box is worse than no menu, because every installer would
 * leave it there.
 */
enum AdminState { ADMIN_OFF, ADMIN_PIN, ADMIN_MENU, ADMIN_NEW_PIN, ADMIN_NEW_PIN2, ADMIN_NEW_ADMIN };
AdminState admin = ADMIN_OFF;
String pending = "";             // first entry of a "type it twice" change
unsigned long adminUntil = 0;
const unsigned long ADMIN_TIMEOUT_MS = 45000;

// A line of feedback shown for a moment, then cleared: "WRONG PIN", "SAVED".
String toastText = "";
unsigned long toastUntil = 0;
void toast(const char *t, unsigned long ms = 2000) { toastText = t; toastUntil = millis() + ms; }

// --------------------------------------------------------------- PIN hashing

String sha256Hex(const String &in) {
  uint8_t out[32];
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts_ret(&ctx, 0);
  mbedtls_sha256_update_ret(&ctx, (const unsigned char *)in.c_str(), in.length());
  mbedtls_sha256_finish_ret(&ctx, out);
  mbedtls_sha256_free(&ctx);
  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", out[i]);
  hex[64] = 0;
  return String(hex);
}

String hashPin(const String &p) { return p.length() ? sha256Hex(salt + ":" + p) : String(""); }

/*
 * Compared in constant time.
 *
 * String::equals bails at the first differing character, so how long a wrong
 * guess takes to reject leaks how much of it was right. That is a real attack
 * on a network service; over a keypad, where a human is the clock, it is far
 * more theoretical. It is four lines either way, and being casual about it in
 * the one file where the comparison decides whether a door opens sets the
 * wrong precedent.
 */
bool hashEquals(const String &a, const String &b) {
  if (a.length() != b.length()) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < a.length(); i++) diff |= (uint8_t)(a[i] ^ b[i]);
  return diff == 0;
}

bool validPin(const String &p) {
  if (p.length() < 4 || p.length() > 12) return false;
  for (size_t i = 0; i < p.length(); i++) if (p[i] < '0' || p[i] > '9') return false;
  return true;
}

// --------------------------------------------------------------- the display

void drawScreen() {
  if (!hasDisplay) return;
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);

  // Header: who we are and whether the hub can hear us. A door that has lost
  // the broker still opens on a PIN, and the person standing at it should be
  // able to tell that face unlock is not going to happen right now.
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.print(F("CIRCUVENT"));
  oled.setCursor(92, 0);
  oled.print(cv.online() ? F("LINK") : F(" ---"));
  oled.drawFastHLine(0, 10, 128, SSD1306_WHITE);

  long left = (long)(lockoutUntil - millis());
  if (cv.isProvisioning()) {
    oled.setCursor(0, 18); oled.print(F("SETUP MODE"));
    oled.setCursor(0, 32); oled.print(F("Join the Wi-Fi"));
    oled.setCursor(0, 44); oled.print(F("network shown in"));
    oled.setCursor(0, 54); oled.print(F("the Circuvent app"));
  } else if (admin != ADMIN_OFF) {
    oled.setCursor(0, 16);
    if (admin == ADMIN_PIN) {
      oled.print(F("ADMIN PIN"));
      oled.setTextSize(2); oled.setCursor(0, 32);
      for (size_t i = 0; i < entry.length(); i++) oled.print('*');
    } else if (admin == ADMIN_MENU) {
      oled.print(F("ADMIN"));
      oled.setCursor(0, 28); oled.print(F("1 Enrol face"));
      oled.setCursor(0, 38); oled.print(F("2 Change PIN"));
      oled.setCursor(0, 48); oled.print(F("3 Admin PIN"));
      oled.setCursor(0, 58); oled.print(F("4 Lock    * Exit"));
    } else {
      oled.print(admin == ADMIN_NEW_ADMIN ? F("NEW ADMIN PIN")
               : admin == ADMIN_NEW_PIN2  ? F("REPEAT NEW PIN")
                                          : F("NEW PIN"));
      oled.setTextSize(2); oled.setCursor(0, 32);
      for (size_t i = 0; i < entry.length(); i++) oled.print('*');
      oled.setTextSize(1); oled.setCursor(0, 56); oled.print(F("# save    * cancel"));
    }
  } else if (left > 0) {
    oled.setTextSize(2); oled.setCursor(0, 18); oled.print(F("LOCKED OUT"));
    oled.setTextSize(1);
    oled.setCursor(0, 40); oled.print(F("Too many tries"));
    oled.setCursor(0, 52); oled.print(F("Wait ")); oled.print((int)(left / 1000) + 1); oled.print(F("s"));
  } else if (enrolling) {
    oled.setTextSize(2); oled.setCursor(0, 16); oled.print(F("ENROL"));
    oled.setTextSize(1);
    oled.setCursor(0, 36); oled.print(enrolName.length() ? enrolName : String(F("new face")));
    oled.setCursor(0, 46); oled.print(F("Look at the camera"));
    oled.setCursor(0, 56);
    oled.print(enrolSamples); oled.print(F(" taken   "));
    oled.print((int)((enrolUntil - millis()) / 1000UL)); oled.print(F("s"));
  } else if (entry.length()) {
    oled.setCursor(0, 16); oled.print(F("ENTER PIN"));
    oled.setTextSize(2); oled.setCursor(0, 32);
    for (size_t i = 0; i < entry.length(); i++) oled.print('*');
    oled.setTextSize(1); oled.setCursor(0, 56); oled.print(F("# enter   * clear"));
  } else {
    oled.setTextSize(2); oled.setCursor(0, 20);
    oled.print(locked ? F("LOCKED") : F("UNLOCKED"));
    oled.setTextSize(1);
    if (!locked) {
      oled.setCursor(0, 42);
      oled.print(lastName.length() ? lastName : (lastMethod.length() ? lastMethod : String(F("open"))));
      long rel = autoLockSec > 0
        ? ((long)(((unsigned long)autoLockSec * 1000UL) - (millis() - unlockedAt))) / 1000 + 1
        : 0;
      if (rel > 0) { oled.setCursor(0, 54); oled.print(F("Relocks in ")); oled.print(rel); oled.print(F("s")); }
    }
  }

  if (toastText.length() && (long)(toastUntil - millis()) > 0) {
    // Drawn over whatever is underneath, with the background cleared, so a
    // short message is readable rather than interleaved with the status.
    oled.fillRect(0, 44, 128, 20, SSD1306_BLACK);
    oled.drawFastHLine(0, 44, 128, SSD1306_WHITE);
    oled.setTextSize(1); oled.setCursor(2, 52); oled.print(toastText);
  }
  oled.display();
}

// --------------------------------------------------------------- MQTT state

void publishEnrolState() {
  cv.set("enrolling", enrolling);
  cv.set("enrolName", enrolName.c_str());
  cv.set("enrolProfileId", (int)enrolProfileId);
  cv.set("enrolSamples", enrolSamples);
  cv.set("enrolSecondsLeft", enrolling ? (int)((enrolUntil - millis()) / 1000UL) : 0);
  cv.publishStateNow();
}

void publishLockoutState() {
  long left = (long)(lockoutUntil - millis());
  cv.set("failedAttempts", fails);
  cv.set("lockedOutFor", left > 0 ? (int)(left / 1000) + 1 : 0);
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
  d["samples"] = enrolSamples;
  d["ts"] = (long)(millis() / 1000);
  cv.publishTelemetry(d.as<JsonObjectConst>());
  enrolName = "";
  enrolProfileId = 0;
  enrolSamples = 0;
  publishEnrolState();
  drawScreen();
}

void startEnrol(long profileId, const char *name, int seconds) {
  // Clamped: a window measured in hours is the failure this exists to prevent.
  if (seconds <= 0) seconds = 120;
  if (seconds > 300) seconds = 300;

  enrolling = true;
  enrolProfileId = profileId;
  enrolName = name ? name : "";
  enrolSamples = 0;
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
  drawScreen();
}

void applyLock(bool lock) {
  locked = lock;
  digitalWrite(LOCK_RELAY, lock ? LOW : HIGH);   // energise to withdraw the bolt
  if (!enrolling) digitalWrite(LED_PIN, lock ? HIGH : LOW);
  /*
   * Only ever persist "locked".
   *
   * This wrote whichever state it was given, so an unlock put `locked=false`
   * into NVS for the few seconds before the auto-relock wrote it back. Lose
   * power inside that window and the device booted, read `false`, and
   * energised the strike — the door opened on power restore and stayed open
   * for the whole of `cv.begin()` (Wi-Fi up to 8 s plus NTP up to 8 s, during
   * which loop() and the auto-relock do not run).
   *
   * That is the opposite of the fail-secure contract at the top of this file,
   * and the scenario that produces it is the one that matters: cutting power
   * to a door controller is a deliberate act, and it was rewarded with an
   * unlocked door.
   *
   * There is nothing to gain from restoring an unlocked state anyway — a lock
   * that comes back exactly as it was is a lock that has to be told to shut
   * after every outage.
   */
  if (lock && !savedLocked) { store.putBool("locked", true); savedLocked = true; }
  if (!lock) unlockedAt = millis();
  cv.set("locked", locked);
  cv.publishStateNow();
  drawScreen();
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
  lastMethod = method;
  lastName = name ? name : "";
  cv.set("lastMethod", lastMethod.c_str());
  cv.set("lastName", lastName.c_str());
  cv.set("accessCount", accessCount);

  // Any success clears the penalty. The counter exists to slow down guessing,
  // and somebody who has just proved they belong here is not guessing.
  if (fails || rounds) {
    fails = 0; rounds = 0;
    store.putInt("fails", 0); store.putInt("rounds", 0);
    lockoutUntil = millis();
    publishLockoutState();
  }
  applyLock(false);              // owner match -> unlock
}

void denyAccess(const char *method, const char *reason = "") {
  JsonDocument d;
  d["type"] = "access"; d["method"] = method; d["ok"] = false;
  if (reason && *reason) d["reason"] = reason;
  d["ts"] = (long)(millis() / 1000);
  cv.publishTelemetry(d.as<JsonObjectConst>());
}

/** Records a wrong PIN and starts the lockout once the allowance is spent. */
void registerFailure() {
  fails++;
  store.putInt("fails", fails);
  if (fails >= maxFails) {
    rounds++;
    store.putInt("rounds", rounds);
    int shift = rounds - 1; if (shift > 4) shift = 4;
    long secs = (long)lockoutSec << shift;
    if (secs > LOCKOUT_SEC_MAX) secs = LOCKOUT_SEC_MAX;
    lockoutUntil = millis() + (unsigned long)secs * 1000UL;
    fails = 0;
    store.putInt("fails", 0);

    JsonDocument d;
    d["type"] = "lockout";
    d["seconds"] = (int)secs;
    d["round"] = rounds;
    d["ts"] = (long)(millis() / 1000);
    cv.publishTelemetry(d.as<JsonObjectConst>());
    toast("LOCKED OUT", 3000);
  } else {
    String msg = String("WRONG PIN  ") + (maxFails - fails) + " left";
    toast(msg.c_str(), 2500);
  }
  publishLockoutState();
}

bool lockedOut() { return (long)(lockoutUntil - millis()) > 0; }

// ------------------------------------------------------------------ commands

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "unlock") {
    /*
     * Refused while enrolling. During enrolment the camera is being shown
     * faces that are not yet trusted, and a recogniser that fires mid-capture
     * would open the door on a half-taught profile. Enrolment and unlocking
     * are different jobs and the door does one at a time.
     */
    if (enrolling) {
      denyAccess("face", "enrolling");
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
  } else if (action == "sample") {
    /*
     * The hub telling the door a usable sample was captured, so the person
     * being enrolled can watch the count go up instead of guessing whether
     * standing still is working. Purely cosmetic — the samples live on the
     * server, and the door is not trusted to count them.
     */
    if (enrolling) {
      enrolSamples = p["count"].is<int>() ? p["count"].as<int>() : enrolSamples + 1;
      publishEnrolState();
      drawScreen();
    }
  } else if (action == "set") {
    if (p["locked"].is<bool>()) applyLock(p["locked"].as<bool>());
    if (p["autoLockSec"].is<int>()) { autoLockSec = p["autoLockSec"].as<int>(); store.putInt("alock", autoLockSec); cv.set("autoLockSec", autoLockSec); }
    if (p["maxFails"].is<int>()) {
      int v = p["maxFails"].as<int>();
      // Never below three: that would let a fat-fingered resident lock their
      // own household out. Never unbounded: that is no lockout at all.
      maxFails = v < 3 ? 3 : (v > 20 ? 20 : v);
      store.putInt("maxf", maxFails); cv.set("maxFails", maxFails);
    }
    if (p["lockoutSec"].is<int>()) {
      int v = p["lockoutSec"].as<int>();
      lockoutSec = v < 10 ? 10 : (v > (int)LOCKOUT_SEC_MAX ? (int)LOCKOUT_SEC_MAX : v);
      store.putInt("lsec", lockoutSec); cv.set("lockoutSec", lockoutSec);
    }
    if (p["pin"].is<const char *>()) {
      String v = String(p["pin"].as<const char *>());
      // An empty PIN is a deliberate "disable keypad unlock", not a mistake;
      // anything else must be a plausible PIN or it is ignored, because
      // silently storing "12" would leave a door with a two-digit code.
      if (v.length() == 0)  { userHash = ""; store.remove("pinh"); store.remove("pin"); cv.set("pinSet", false); }
      else if (validPin(v)) { userHash = hashPin(v); store.putString("pinh", userHash); store.remove("pin"); cv.set("pinSet", true); }
      cv.publishStateNow();
    }
    if (p["adminPin"].is<const char *>()) {
      String v = String(p["adminPin"].as<const char *>());
      if (v.length() == 0)  { adminHash = ""; store.remove("apinh"); cv.set("adminPinSet", false); }
      else if (validPin(v)) { adminHash = hashPin(v); store.putString("apinh", adminHash); cv.set("adminPinSet", true); }
      cv.publishStateNow();
    }
  }
}

// -------------------------------------------------------------------- keypad

/*
 * Returns the key currently held, or 0.
 *
 * Note this reports the *held* state rather than a press. Debounce and the
 * press/release edge are the caller's job, because the previous version did
 * neither: it emitted a key every 220 ms for as long as one was touched, so
 * resting a finger on a digit typed it a dozen times and immediately ran past
 * the PIN length. On a keypad with no display nobody could see why.
 */
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

void enterAdmin() {
  admin = ADMIN_MENU;
  adminUntil = millis() + ADMIN_TIMEOUT_MS;
  entry = "";
  cv.set("adminOpen", true);
  cv.publishStateNow();
}

void exitAdmin(const char *why) {
  if (admin == ADMIN_OFF) return;
  admin = ADMIN_OFF;
  entry = "";
  pending = "";
  cv.set("adminOpen", false);
  cv.publishStateNow();
  if (why && *why) toast(why);
  drawScreen();
}

/*
 * Ask the hub to open an enrolment window.
 *
 * The door does not know profile ids — those live in the database with names
 * and permissions attached — so it cannot start a meaningful enrolment on its
 * own. It publishes a request instead and waits for the `enrol` command to
 * come back, which also means enrolment started at the door goes through
 * exactly the same server-side checks as enrolment started from the app.
 * Standing next to the hardware grants no extra authority.
 */
void requestEnrol() {
  JsonDocument d;
  d["type"] = "enrol";
  d["state"] = "requested";
  d["source"] = "keypad";
  d["ts"] = (long)(millis() / 1000);
  cv.publishTelemetry(d.as<JsonObjectConst>());
  toast(cv.online() ? "ASKING HUB..." : "NO LINK", 3000);
}

void handleAdminKey(char k) {
  adminUntil = millis() + ADMIN_TIMEOUT_MS;

  if (admin == ADMIN_MENU) {
    switch (k) {
      case '1': requestEnrol(); exitAdmin(""); break;
      case '2': admin = ADMIN_NEW_PIN; entry = ""; break;
      case '3': admin = ADMIN_NEW_ADMIN; entry = ""; break;
      case '4': applyLock(true); exitAdmin("LOCKED"); break;
      case '*': exitAdmin("EXIT"); break;
    }
    return;
  }

  if (k == '*') { exitAdmin("CANCELLED"); return; }
  if (k != '#') { if (entry.length() < 12) entry += k; return; }

  if (admin == ADMIN_PIN) {
    if (adminHash.length() && hashEquals(hashPin(entry), adminHash)) {
      enterAdmin();
    } else {
      entry = "";
      admin = ADMIN_OFF;
      cv.set("adminOpen", false);
      registerFailure();          // an admin PIN is worth more, not less
      denyAccess("admin", "bad-pin");
    }
    return;
  }

  if (!validPin(entry)) { toast("4-12 DIGITS", 2500); entry = ""; return; }

  if (admin == ADMIN_NEW_PIN) { pending = entry; entry = ""; admin = ADMIN_NEW_PIN2; return; }
  if (admin == ADMIN_NEW_PIN2) {
    if (pending == entry) {
      userHash = hashPin(entry);
      store.putString("pinh", userHash);
      store.remove("pin");
      cv.set("pinSet", true);
      cv.publishStateNow();
      exitAdmin("PIN SAVED");
    } else {
      toast("DID NOT MATCH", 2500);
      entry = ""; pending = ""; admin = ADMIN_NEW_PIN;
    }
    return;
  }
  if (admin == ADMIN_NEW_ADMIN) {
    adminHash = hashPin(entry);
    store.putString("apinh", adminHash);
    cv.set("adminPinSet", true);
    cv.publishStateNow();
    exitAdmin("ADMIN SAVED");
  }
}

void handleKey(char k) {
  entryAt = millis();

  if (admin != ADMIN_OFF) { handleAdminKey(k); return; }

  if (lockedOut()) {
    // Say why rather than ignoring the press: a keypad that does nothing at all
    // reads as broken, and a resident who thinks the door is broken calls
    // somebody out to it.
    entry = "";
    toast("LOCKED OUT", 2000);
    return;
  }

  if (k == 'A') {                       // admin
    if (!adminHash.length()) { toast("SET ADMIN PIN IN APP", 3000); return; }
    admin = ADMIN_PIN;
    adminUntil = millis() + ADMIN_TIMEOUT_MS;
    entry = "";
    return;
  }

  if (k == '#') {                       // submit
    if (userHash.length() && entry.length() && hashEquals(hashPin(entry), userHash)) {
      grantAccess("keypad", "");
    } else {
      denyAccess("keypad", userHash.length() ? "bad-pin" : "no-pin-set");
      registerFailure();
    }
    entry = "";
  } else if (k == '*') {                // clear
    entry = "";
  } else if (k >= '0' && k <= '9') {
    if (entry.length() < 12) entry += k;
  }
}

void checkFingerprint() {
  static String line = "";
  while (Serial2.available()) {
    char ch = (char)Serial2.read();
    if (ch == '\n' || ch == '\r') {
      line.trim();
      if (line.startsWith("MATCH:")) {
        if (enrolling) denyAccess("fingerprint", "enrolling");
        else grantAccess("fingerprint", line.substring(6).c_str());
      } else if (line.startsWith("NOMATCH")) {
        denyAccess("fingerprint");
      }
      line = "";
    } else if (line.length() < 48) {
      line += ch;
    }
  }
}

// ----------------------------------------------------------------- lifecycle

void setup() {
  Serial.begin(115200);
  Serial2.begin(57600, SERIAL_8N1, FP_RX, FP_TX);
  pinMode(LOCK_RELAY, OUTPUT); pinMode(LED_PIN, OUTPUT);
  pinMode(BELL_BTN, INPUT);
  for (int r = 0; r < 4; r++) { pinMode(KP_ROW[r], OUTPUT); digitalWrite(KP_ROW[r], HIGH); }
  for (int c = 0; c < 4; c++) { pinMode(KP_COL[c], INPUT_PULLUP); }

  // The panel is optional. A door with a dead or absent display is a door that
  // still locks and unlocks, so nothing below is allowed to depend on it.
  Wire.begin(OLED_SDA, OLED_SCL);
  hasDisplay = oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (hasDisplay) {
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(1);
    oled.setCursor(0, 24);
    oled.println(F("Circuvent FaceDoor"));
    oled.println(F("starting..."));
    oled.display();
  }

  store.begin("fdoor", false);
  /*
   * Boot locked, always. Fail-secure is stated as the contract at the top of
   * this file, and a door is the one device where "restore what it was doing"
   * is the wrong instinct: the stored value is only ever `true` now (see
   * applyLock), and this does not consult it regardless, so a corrupt or
   * legacy `false` left in NVS by an older build cannot open the door either.
   */
  savedLocked = true;
  autoLockSec = store.getInt("alock", autoLockSec);
  maxFails    = store.getInt("maxf", MAX_FAILS_DEFAULT);
  lockoutSec  = store.getInt("lsec", LOCKOUT_SEC_DEFAULT);
  fails       = store.getInt("fails", 0);
  rounds      = store.getInt("rounds", 0);

  // Per-device salt, made once. It is not a secret; it only has to differ
  // between doors so one recovered hash does not unlock a second one.
  salt = store.getString("salt", "");
  if (!salt.length()) {
    char buf[17];
    for (int i = 0; i < 16; i++) buf[i] = "0123456789abcdef"[esp_random() & 0xF];
    buf[16] = 0;
    salt = String(buf);
    store.putString("salt", salt);
  }

  userHash  = store.getString("pinh", "");
  adminHash = store.getString("apinh", "");
  /*
   * Migrate a PIN written in clear by 1.3.0 and earlier, then delete it.
   * Leaving the old key behind would make the hashing pointless for every door
   * that has ever been configured — which is all of them.
   */
  String legacy = store.getString("pin", "");
  if (legacy.length()) {
    if (!userHash.length()) { userHash = hashPin(legacy); store.putString("pinh", userHash); }
    store.remove("pin");
  }

  /*
   * A lockout in progress survives the reboot that would otherwise clear it.
   * The counters are persisted, so if the allowance was already spent the
   * penalty is re-applied here — power-cycling the door is not a way to skip
   * the wait, which was the whole point of persisting them.
   */
  if (rounds > 0 && fails == 0) {
    int shift = rounds - 1; if (shift > 4) shift = 4;
    long secs = (long)lockoutSec << shift;
    if (secs > LOCKOUT_SEC_MAX) secs = LOCKOUT_SEC_MAX;
    lockoutUntil = millis() + (unsigned long)secs * 1000UL;
  }

  applyLock(true);

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.setResetButton(0);
  cv.begin();
  cv.set("autoLockSec", autoLockSec);
  cv.set("maxFails", maxFails);
  cv.set("lockoutSec", lockoutSec);
  cv.set("pinSet", userHash.length() > 0);
  cv.set("adminPinSet", adminHash.length() > 0);
  cv.set("display", hasDisplay);
  cv.set("enrolling", false);
  cv.set("adminOpen", false);
  publishLockoutState();
  drawScreen();
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
  // even on a unit with no display fitted.
  if (enrolling) digitalWrite(LED_PIN, (millis() / 250) % 2 ? HIGH : LOW);

  // The admin menu closes itself. Walking away from an open menu must not
  // leave the next person at the door able to change the PIN.
  if (admin != ADMIN_OFF && (long)(millis() - adminUntil) >= 0) exitAdmin("TIMED OUT");

  // Anything half-typed is discarded after a few seconds of silence.
  if (entry.length() && millis() - entryAt > ENTRY_TIMEOUT_MS) {
    entry = "";
    if (admin == ADMIN_PIN) exitAdmin("");
  }

  // One event per press, debounced, with a release required before the next.
  static char held = 0;
  static bool emitted = false;
  static unsigned long heldAt = 0;
  char raw = scanKeypad();
  if (raw != held) { held = raw; heldAt = millis(); emitted = false; }
  else if (raw && !emitted && millis() - heldAt > 25) { emitted = true; handleKey(raw); }

  checkFingerprint();

  // calling bell (active-low, debounced)
  if (digitalRead(BELL_BTN) == LOW && millis() - lastBell > 2000) {
    lastBell = millis(); bellCount++;
    JsonDocument d; d["type"] = "bell"; d["ts"] = (long)(millis() / 1000);
    cv.publishTelemetry(d.as<JsonObjectConst>());
    cv.set("bellCount", bellCount);
    cv.publishStateNow();
    toast("BELL RUNG", 2500);
  }

  // auto-relock
  if (!locked && autoLockSec > 0 && millis() - unlockedAt > (unsigned long)autoLockSec * 1000UL) applyLock(true);

  /*
   * Repaint at 5 Hz, not every pass.
   *
   * Pushing the whole 1 KB framebuffer over I2C takes about 25 ms, and doing
   * that in a loop that also has to scan a keypad and service MQTT would make
   * the door feel unresponsive and drop keypresses. Countdowns only need to
   * tick, so five frames a second is generous.
   */
  static unsigned long lastDraw = 0;
  if (millis() - lastDraw > 200) { lastDraw = millis(); drawScreen(); }

  cv.loop();
}
