/*
 * Circuvent Smart Curtain — ESP32 firmware
 *
 * Drives a curtain or roller blind motor through a pair of relays, tracks its
 * position by time, and takes local buttons as well as the cloud.
 *
 *
 * THE PROBLEM WITH TIMED POSITION, AND HOW THIS DEALS WITH IT
 *
 * There are no encoders and no limit switches wired here — position is
 * inferred from how long the motor has run. That is how almost every curtain
 * controller at this price works, and it drifts: the motor is not identical
 * run to run, the fabric binds on a humid day, the mains sags when the kettle
 * goes on. After a few dozen cycles "0%" is no longer where closed is, and the
 * app is confidently reporting a curtain that is a hand's width open.
 *
 * The fix is not better arithmetic, it is a reference. When told to go *fully*
 * open or *fully* closed, this drives for the whole travel time regardless of
 * where it believes it is, so it always ends against the mechanical stop. Every
 * full open or close therefore re-homes the estimate. Partial positions drift
 * between those, and are corrected by the next one.
 *
 * (This assumes what curtain motors actually have: an internal slip clutch or
 * end limits, so being driven into the stop for a second or two is what they
 * are designed for. A bare geared motor with no limits should not be wired to
 * this.)
 *
 *
 * TWO THINGS THAT WERE WRONG
 *
 * 1. BOTH MOTOR RELAYS WERE ENERGISED WHENEVER THE CURTAIN WAS STOPPED.
 *    The boards are opto-isolated and negative-trigger: LOW energises the coil.
 *    This sketch used bare pinMode(OUTPUT) — which leaves the latch low — and
 *    treated HIGH as "on". So `driveMotor(0)`, the *stopped* state, wrote LOW
 *    to both pins and held both relays closed; and it did it from the moment
 *    the device powered on, before anything had been commanded. Every direction
 *    was inverted on top of that. cvRelayInit/cvRelayWrite exist for exactly
 *    this.
 *
 * 2. THE STOP BUTTON WAS ON THE RESET PIN, LEVEL-TRIGGERED. BTN_STOP is GPIO0,
 *    which is also what setResetButton(0) watches. The test fired every 300 ms
 *    for as long as the pin was low, so holding BOOT to change the Wi-Fi ran
 *    stopCurtain() about ten times — each one committing the position to NVS —
 *    and it acted on a pin that was already low at boot.
 */
/* Version history
 *   1.1.0  first build that survives a power cut with the router still down —
 *          see tests/firmware-power-restore.test.ts.
 *   2.0.0  The motor relays are driven correctly. They were bare GPIO writes
 *          with HIGH meaning "on", on boards where LOW energises the coil — so
 *          the *stopped* state held both relays closed, continuously, from
 *          power-up, and every direction was inverted.
 *
 *          A full open or close now re-homes against the mechanical stop, so
 *          the timed estimate stops drifting away from where the curtain
 *          actually is.
 *
 *          Travel time is a setting rather than a compile-time constant, with
 *          a learn mode — every curtain is a different width, and a 20-second
 *          default on a 1.5 m track put every reported position out by half.
 *
 *          A dead time before reversing, a hard ceiling on how long the motor
 *          may run, edge-detected buttons, and a publish cadence: position
 *          changes on every pass while moving, so the old code emitted roughly
 *          250 state messages — and 250 database rows — per movement.
 */
#define CV_FW_VERSION "2.0.0"
#include <CircuventDevice.h>
#include <CvHoldButton.h>
#include <Preferences.h>

#define MOTOR_OPEN_PIN 26
#define MOTOR_CLOSE_PIN 27
#define BTN_OPEN 32
#define BTN_CLOSE 33
#define BTN_STOP 0        /* shared with the reset gesture — see CvTapButton */

/*
 * Longest a curtain may travel end to end.
 *
 * Not a preference: it is the ceiling on how long the motor is ever allowed to
 * run in one command, and therefore what protects a jammed curtain from being
 * driven into itself for however long the estimate happened to ask for.
 */
#define MAX_TRAVEL_MS 90000UL

/*
 * Both relays off before reversing.
 *
 * Switching a motor straight from one direction to the other asks the
 * contacts to break an inductive load and make the opposite one in the same
 * instant, while the motor is still turning and still generating. That arcs
 * the contacts and, on a shared-common relay pair, briefly shorts the supply.
 * A third of a second is invisible to a person and is several cycles of mains.
 */
#define REVERSE_DEAD_MS 300UL

CircuventDevice cv("curtain");
Preferences store;
CvTapButton stopBtn;

int position = 0, targetPosition = 0, savedPosition = 0;
int moving = 0;            // 1 = opening, -1 = closing, 0 = stopped
int moveFrom = 0;
uint32_t moveStart = 0;
uint32_t moveLimitMs = 0;  // how long this particular run may take
bool homingTo = false;     // this run ends against a stop, so it re-homes
int homingTarget = 0;

uint32_t travelMs = 20000; // learned, or set

/* Direction changes wait out the dead time before the new one is energised. */
int pendingDir = 0;
uint32_t deadUntil = 0;

/* Learn mode: drive open and time it until somebody says it has arrived. */
bool learning = false;
uint32_t learnStart = 0;

bool btnOpenWas = true, btnCloseWas = true;

/* ------------------------------------------------------------------ */

void savePosition() {
  if (position != savedPosition) {
    store.putInt("pos", position);
    savedPosition = position;
  }
}

/**
 * Energises one direction, or neither.
 *
 * Every write goes through cvRelayWrite so the board's polarity is honoured.
 * Written as bare digitalWrite with HIGH meaning on, the resting state held
 * both relays closed.
 */
void applyMotor(int dir) {
  cvRelayWrite(MOTOR_OPEN_PIN, dir > 0);
  cvRelayWrite(MOTOR_CLOSE_PIN, dir < 0);
  moving = dir;
}

/** Requests a direction, inserting a dead time when reversing. */
void driveMotor(int dir) {
  if (dir == moving) return;
  if (dir != 0 && moving != 0 && dir != moving) {
    applyMotor(0);
    pendingDir = dir;
    deadUntil = millis() + REVERSE_DEAD_MS;
    return;
  }
  pendingDir = 0;
  applyMotor(dir);
}

void stopCurtain();

/** Advances the position estimate and finishes a run that is done. */
void updateMotion() {
  if (moving == 0) return;
  const uint32_t elapsed = millis() - moveStart;

  if (travelMs > 0) {
    const int delta = (int)((uint64_t)elapsed * 100ULL / travelMs);
    int p = moving > 0 ? moveFrom + delta : moveFrom - delta;
    position = constrain(p, 0, 100);
  }

  if (elapsed >= moveLimitMs) {
    /*
     * A homing run ends against the stop, so the answer is exact rather than
     * estimated — that is the whole point of driving the full travel.
     */
    position = homingTo ? homingTarget : constrain(targetPosition, 0, 100);
    homingTo = false;
    stopCurtain();
  }
}

void stopCurtain() {
  if (moving != 0) {
    const uint32_t elapsed = millis() - moveStart;
    if (travelMs > 0 && !homingTo) {
      const int delta = (int)((uint64_t)elapsed * 100ULL / travelMs);
      position = constrain(moving > 0 ? moveFrom + delta : moveFrom - delta, 0, 100);
    }
  }
  driveMotor(0);
  pendingDir = 0;
  homingTo = false;
  learning = false;
  targetPosition = position;
  savePosition();
  cv.publishStateNow();
}

/**
 * Moves to a position.
 *
 * Fully open and fully closed are treated differently on purpose: they run the
 * whole travel time rather than the fraction the estimate calls for, so the
 * curtain finishes against the mechanical stop and the estimate is corrected.
 * Without that, drift accumulates in one direction and "closed" gradually stops
 * meaning closed.
 */
void moveTo(int target) {
  target = constrain(target, 0, 100);
  updateMotion();

  if (target == 0 || target == 100) {
    /* Home. Always the full travel, plus a little, whatever we believe. */
    homingTo = true;
    homingTarget = target;
    targetPosition = target;
    moveFrom = position;
    moveStart = millis();
    moveLimitMs = min((uint32_t)MAX_TRAVEL_MS, (uint32_t)(travelMs + travelMs / 10 + 1000));
    driveMotor(target == 100 ? 1 : -1);
    cv.publishStateNow();
    return;
  }

  if (target == position) { stopCurtain(); return; }

  homingTo = false;
  targetPosition = target;
  moveFrom = position;
  moveStart = millis();
  const int travel = abs(target - position);
  moveLimitMs = min((uint32_t)MAX_TRAVEL_MS, (uint32_t)((uint64_t)travel * travelMs / 100ULL));
  driveMotor(target > position ? 1 : -1);
  cv.publishStateNow();
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

void publishState() {
  cv.set("position", position);
  cv.set("moving", moving);
  cv.set("travelSec", (int)(travelMs / 1000));
  cv.set("learning", learning);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "open") { moveTo(100); return; }
  if (action == "close") { moveTo(0); return; }
  if (action == "stop") { stopCurtain(); return; }

  /*
   * Learn mode.
   *
   * Every curtain is a different width and nobody knows their travel time, so
   * the device measures it: close fully to get a known starting point, then
   * open while timing until somebody says it has arrived. A stopwatch and a
   * settings field would work too, and is what people get wrong.
   */
  if (action == "learn") {
    learning = true;
    /* Close to the stop first, so the timed run starts from a known end. */
    moveTo(0);
    learnStart = 0;
    publishState();
    cv.publishStateNow();
    return;
  }
  if (action == "learnDone") {
    if (learning && learnStart != 0) {
      const uint32_t measured = millis() - learnStart;
      if (measured >= 2000 && measured <= MAX_TRAVEL_MS) {
        travelMs = measured;
        store.putUInt("travel", travelMs);
      }
      position = 100;
      savePosition();
    }
    learning = false;
    stopCurtain();
    publishState();
    cv.publishStateNow();
    return;
  }

  if (action == "set") {
    if (p["position"].is<int>()) { moveTo(p["position"].as<int>()); return; }
    if (p["travelSec"].is<int>()) {
      const uint32_t ms = (uint32_t)constrain(p["travelSec"].as<int>(), 2, 90) * 1000UL;
      travelMs = ms;
      store.putUInt("travel", travelMs);
      publishState();
      cv.publishStateNow();
    }
  }
}

/* ------------------------------------------------------------------ */

void setup() {
  Serial.begin(115200);

  /*
   * Claim both motor pins at the safe level before they become outputs.
   *
   * This is the fix for the worst of it: bare pinMode(OUTPUT) leaves the latch
   * low, and low energises these boards — so the curtain motor was handed both
   * directions at once from the instant the device powered on.
   */
  cvRelayInit(MOTOR_OPEN_PIN);
  cvRelayInit(MOTOR_CLOSE_PIN);

  pinMode(BTN_OPEN, INPUT_PULLUP);
  pinMode(BTN_CLOSE, INPUT_PULLUP);
  stopBtn.begin(BTN_STOP);

  store.begin("curtain", false);
  position = constrain(store.getInt("pos", 0), 0, 100);
  targetPosition = position;
  savedPosition = position;
  travelMs = store.getUInt("travel", 20000);
  if (travelMs < 2000 || travelMs > MAX_TRAVEL_MS) travelMs = 20000;

  applyMotor(0);

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
  publishState();
}

void loop() {
  /* Finish a reversal once the dead time has run. */
  if (pendingDir != 0 && (int32_t)(millis() - deadUntil) >= 0) {
    const int dir = pendingDir;
    pendingDir = 0;
    applyMotor(dir);
  }

  updateMotion();

  /*
   * Learn mode begins timing the moment the closing run finishes and the
   * opening one starts, so the measurement is a genuine end-to-end travel.
   */
  if (learning && learnStart == 0 && moving == 0) {
    moveFrom = 0;
    position = 0;
    moveStart = millis();
    moveLimitMs = MAX_TRAVEL_MS;
    homingTo = false;
    learnStart = millis();
    driveMotor(1);
  }
  if (learning && learnStart != 0 && millis() - learnStart > MAX_TRAVEL_MS) {
    /* Nobody said it had arrived. Never leave a motor running. */
    learning = false;
    stopCurtain();
  }

  /* Local buttons, on the falling edge. Level-triggered with a rate limit is
     not "on press" — it is "every 300 ms while held". */
  const bool o = digitalRead(BTN_OPEN) == LOW;
  const bool c = digitalRead(BTN_CLOSE) == LOW;
  if (o && btnOpenWas) moveTo(100);
  if (c && btnCloseWas) moveTo(0);
  btnOpenWas = !o;
  btnCloseWas = !c;

  /* Stop shares GPIO0 with the reset gesture, so it must be a tap. */
  if (stopBtn.tapped()) stopCurtain();

  /*
   * State on a cadence.
   *
   * `position` changes on every pass while the motor runs, and the library
   * republishes whenever state is dirty and 80 ms have elapsed — about 250
   * messages, and 250 database rows, for one twenty-second movement.
   */
  static uint32_t lastPub = 0;
  const uint32_t gap = moving != 0 ? 1000UL : 5000UL;
  if (millis() - lastPub >= gap) {
    lastPub = millis();
    publishState();
  }

  cv.loop();
}
