/*
 * Circuvent Smart Lock — ESP32 firmware
 * Motor/solenoid deadbolt via relay + physical button + status LED + optional
 * auto-relock. Lock state persists across power cycles (restored on boot).
 * Deps: CircuventDevice, ArduinoJson
 */
#include <CircuventDevice.h>
#include <Preferences.h>

// Identical firmware — Wi-Fi + identity are provisioned by the Circuvent app.

#define LOCK_RELAY 26   // drives the solenoid / motor
#define LED_PIN    2    // status LED (on = locked)
#define BTN_PIN    0    // manual lock/unlock button

CircuventDevice cv("smart-lock");
Preferences store;

bool locked = true;
bool savedLocked = true;
int  autoLockSec = 0;              // 0 = disabled; else re-lock this many secs after unlock
unsigned long unlockedAt = 0;

void applyLock(bool lock) {
  locked = lock;
  // Deadbolt engaged when locked; energise relay to withdraw the bolt (unlock).
  digitalWrite(LOCK_RELAY, lock ? LOW : HIGH);
  digitalWrite(LED_PIN, lock ? HIGH : LOW);
  if (locked != savedLocked) {
    store.putBool("locked", locked);
    savedLocked = locked;
  }
  if (!lock) unlockedAt = millis();
  cv.set("locked", locked);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set") {
    if (p["locked"].is<bool>()) applyLock(p["locked"].as<bool>());
    if (p["autoLockSec"].is<int>()) { autoLockSec = p["autoLockSec"].as<int>(); store.putInt("autoLock", autoLockSec); }
  } else if (action == "lock") {
    applyLock(true);
  } else if (action == "unlock") {
    applyLock(false);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LOCK_RELAY, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BTN_PIN, INPUT_PULLUP);
  store.begin("lock", false);
  locked = store.getBool("locked", true);   // fail-safe default: locked
  savedLocked = locked;
  autoLockSec = store.getInt("autoLock", 0);
  applyLock(locked);

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.set("autoLockSec", autoLockSec);
  cv.begin();
}

unsigned long lastBtn = 0;
void loop() {
  if (digitalRead(BTN_PIN) == LOW && millis() - lastBtn > 500) {
    lastBtn = millis();
    applyLock(!locked);
  }
  // Auto re-lock after the configured delay.
  if (!locked && autoLockSec > 0 && millis() - unlockedAt > (unsigned long)autoLockSec * 1000UL) {
    applyLock(true);
  }
  cv.loop();
}
