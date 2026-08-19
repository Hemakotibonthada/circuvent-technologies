/*
 * Circuvent Motion Sensor — ESP32 firmware
 *
 * A PIR on a wall, reporting movement to the platform and lighting a local
 * indicator. Arm and disarm from the app.
 *
 * Hardware: HC-SR501 (or compatible) PIR. Deps: CircuventDevice, ArduinoJson.
 *
 *
 * TWO THINGS THAT WERE WRONG
 *
 * 1. DISARMING DID NOT DISARM ANYTHING. `armed` suppressed the indicator LED
 *    and the immediate push, and nothing else — `cv.set("motion", motion)` ran
 *    regardless. So the next heartbeat, at most six seconds later, published
 *    motion:true anyway, and every automation and alert keyed on `motion`
 *    fired exactly as before. Somebody who disarmed the sensor for a party, or
 *    because the dog sets it off, got the alerts a few seconds late instead of
 *    not at all. A disarm that does not disarm is worse than no disarm,
 *    because it is trusted.
 *
 * 2. EVERY POWER CUT RAISED A FALSE ALARM. A PIR needs somewhere between
 *    thirty and sixty seconds after power-up to settle its reference level,
 *    and outputs spurious HIGH while it does. Nothing here waited, so the
 *    device came back from an outage, immediately reported movement, and — in
 *    a house where that arms a siren or sends a notification — did it at
 *    whatever hour the power happened to return. The one moment a security
 *    sensor is most likely to be believed is straight after a power cut, and
 *    it was the one moment it was guaranteed to be lying.
 *
 * The old header also advertised "automate a light output". There is no light
 * output on this board — only the indicator LED — so the claim is gone rather
 * than the pin invented.
 */
/* Version history
 *   1.1.0  first build that survives a power cut with the router still down —
 *          see tests/firmware-power-restore.test.ts.
 *   1.2.0  Disarming actually stops it reporting movement. It previously only
 *          suppressed the LED and the instant push; the heartbeat published
 *          motion regardless, so automations kept firing a few seconds later.
 *
 *          A warm-up period after power-up, because a PIR emits spurious
 *          movement for up to a minute while its reference settles — so every
 *          power cut produced a false alarm at whatever hour the supply
 *          returned.
 *
 *          `armed` is remembered across a reboot. It was a RAM default, so a
 *          sensor somebody had deliberately disarmed re-armed itself after any
 *          power blip and started alerting again.
 *
 *          Movement is held briefly rather than reported edge by edge: a PIR
 *          chatters at the end of its pulse, and each transition was a
 *          published state and a database row.
 */
#define CV_FW_VERSION "1.2.0"
#include <CircuventDevice.h>
#include <Preferences.h>

#define PIR_PIN 27
#define LED_PIN 2

/*
 * How long to distrust the sensor after power-up.
 *
 * The HC-SR501's datasheet asks for a minute; in practice most settle inside
 * thirty seconds and all of them are unreliable before that. Sixty is chosen
 * because the cost of waiting is that an intruder in the first minute after a
 * power cut is missed, and the cost of not waiting is that every power cut in
 * the device's life is reported as an intruder. The second one is what makes
 * people stop believing the sensor.
 */
#define WARMUP_MS 60000UL

/*
 * How long movement is held after the last trigger.
 *
 * A PIR does not go cleanly low: it chatters as its pulse ends, and somebody
 * moving around a room produces a burst of edges rather than one. Each of
 * those was a state change, a publish and a row. Holding for a few seconds
 * turns a burst into one event, which is also how a person would describe it.
 */
#define MOTION_HOLD_MS 8000UL

CircuventDevice cv("motion-sensor");
Preferences store;

bool armed = true;
bool motion = false;          /* what we report — held, and gated by `armed` */
uint32_t lastTrigger = 0;
uint32_t bootedAt = 0;
bool warmedUp = false;

/** True once the PIR has had long enough to be worth believing. */
bool ready() {
  return warmedUp;
}

void publishAll() {
  cv.set("motion", motion);
  cv.set("armed", armed);
  cv.set("warmingUp", !warmedUp);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action != "set") return;
  if (p["armed"].is<bool>()) {
    armed = p["armed"].as<bool>();
    store.putBool("armed", armed);
    /*
     * Disarming clears any movement currently being reported, rather than
     * leaving a latched `true` sitting in the retained state for an automation
     * to pick up moments later.
     */
    if (!armed) {
      motion = false;
      digitalWrite(LED_PIN, LOW);
    }
    publishAll();
    cv.publishStateNow();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  store.begin("pir", false);
  /*
   * Defaulted to armed, and then remembered.
   *
   * A sensor nobody has configured should be watching — that is the safe way
   * round for a security device. What must not happen is the previous
   * behaviour, where a deliberate disarm was forgotten at the next power blip.
   */
  armed = store.getBool("armed", true);

  bootedAt = millis();
  warmedUp = false;

  cv.onCommand(onCommand);
  cv.setInterval(6000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
  publishAll();
}

void loop() {
  const uint32_t now = millis();

  /* Warm-up. Published while it lasts, so the app can say why a sensor that
     was just powered on is reporting nothing. */
  if (!warmedUp && now - bootedAt >= WARMUP_MS) {
    warmedUp = true;
    publishAll();
    cv.publishStateNow();
  }

  const bool raw = digitalRead(PIR_PIN) == HIGH;

  /*
   * The gate. `armed` and the warm-up are applied here, once, so everything
   * downstream — the LED, the published state, the instant push — agrees.
   *
   * This is the fix for a disarm that was only skin deep: previously the raw
   * reading went into cv.set() whatever `armed` said, and the heartbeat
   * published it moments later.
   */
  if (raw && armed && ready()) lastTrigger = now;

  const bool nowMotion =
      armed && ready() && lastTrigger != 0 && (now - lastTrigger < MOTION_HOLD_MS);

  if (nowMotion != motion) {
    motion = nowMotion;
    digitalWrite(LED_PIN, motion ? HIGH : LOW);
    publishAll();
    /* Movement is the whole point of the device, so it does not wait for the
       heartbeat — in either direction. A clear matters to an automation as
       much as a trigger. */
    cv.publishStateNow();
  }

  cv.loop();
}
