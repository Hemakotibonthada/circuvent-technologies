/*
 * Circuvent Smart Lock — ESP32 firmware
 * Motor/solenoid deadbolt via relay + physical button + status LED + optional
 * auto-relock. Lock state persists across power cycles (restored on boot).
 * Deps: CircuventDevice, ArduinoJson
 */
/* Version history: 1.1.0 is the first build that survives a power cut with the
   router still down - see tests/firmware-power-restore.test.ts. Declared
   explicitly so the fleet can tell fixed devices from unfixed ones; without
   it every sketch reported the library default and they were
   indistinguishable. */
/* 1.2.0  autoLockSec is published back after a change. It updated the variable and NVS but never cv.set() it, so nothing was marked dirty, no state was pushed, and the console reverted the stepper on the next heartbeat. */
/*
 * 1.3.0  The button no longer fights the reset gesture, which on a lock is a
 *        security problem rather than an annoyance. BTN_PIN is GPIO0, the pin
 *        `setResetButton(0)` also watches, and the test was level-triggered
 *        with a 500 ms rate limit — "every 500 ms while held", not "on press".
 *        Holding BOOT for three seconds to change the Wi-Fi therefore threw the
 *        bolt about six times and left it wherever the timing landed, which is
 *        unlocked half the time; it also restarted the auto-relock countdown on
 *        each pass. Worse, the old test acted on a pin that was already low at
 *        boot — and GPIO0 is a strapping pin that can sit low while the rail
 *        comes up, so a power cut could unlock the door on its own. Now a tap,
 *        via CvTapButton, which refuses to arm until it has seen the pin
 *        released.
 */
#define CV_FW_VERSION "1.3.0"
#include <CircuventDevice.h>
#include <Preferences.h>

// Identical firmware — Wi-Fi + identity are provisioned by the Circuvent app.

#define LOCK_RELAY 26   // drives the solenoid / motor
#define LED_PIN    2    // status LED (on = locked)
#define BTN_PIN    0    // manual lock/unlock button

CircuventDevice cv("smart-lock");
Preferences store;
CvTapButton btn;

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
    if (p["autoLockSec"].is<int>()) {
      autoLockSec = p["autoLockSec"].as<int>();
      store.putInt("autoLock", autoLockSec);
      /*
       * Publish it back, or the console reverts it.
       *
       * `cv.set()` is what marks the state dirty; changing the variable and the
       * NVS key alone leaves the retained state document holding whatever was
       * published at boot. Because nothing else here dirtied the state,
       * `_dispatch`'s `if (_dirty) publishStateNow()` did not fire either — so
       * the value took effect on the device and the next heartbeat told the app
       * the old one. The stepper snapped back and the setting looked broken
       * while working perfectly.
       */
      cv.set("autoLockSec", autoLockSec);
    }
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
  btn.begin(BTN_PIN);
  store.begin("lock", false);
  locked = store.getBool("locked", true);   // fail-safe default: locked
  savedLocked = locked;
  autoLockSec = store.getInt("autoLock", 0);
  applyLock(locked);

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.set("autoLockSec", autoLockSec);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
}

void loop() {
  /* A tap throws the bolt. A multi-second hold is the Wi-Fi/factory reset
     gesture on this same pin and must not move the lock on its way past. */
  if (btn.tapped()) {
    applyLock(!locked);
  }
  // Auto re-lock after the configured delay.
  if (!locked && autoLockSec > 0 && millis() - unlockedAt > (unsigned long)autoLockSec * 1000UL) {
    applyLock(true);
  }
  cv.loop();
}
