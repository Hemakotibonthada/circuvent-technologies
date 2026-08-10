/*
 * Circuvent Drone X1 — flight controller.
 * =========================================================================
 *
 * This is Circuvent's own flight stack: our attitude estimator, our control
 * cascade, our mixer, our ESC driver, our safety interlocks. It flies the
 * aircraft. Nothing here delegates stabilisation to another project.
 *
 * READ THIS BEFORE YOU PUT A PROPELLER ON IT
 *
 * A flight controller is safety-critical software. This one is new. It has
 * been compiled, its maths has been checked against the references it is
 * derived from, and it has never flown. Every stabilisation loop ever written
 * has been wrong on its first flight in some way its author did not predict —
 * a sign, a scale factor, a filter that resonates with one particular frame.
 *
 * The commissioning ladder in Docs/22-drone-x1.md exists for that reason and
 * is not optional:
 *
 *   1. Props OFF. Confirm motor order and direction on the bench.
 *   2. Props OFF. Confirm each stick moves the right motors the right way.
 *   3. Props ON, aircraft strapped down. Confirm corrections oppose
 *      disturbances rather than amplifying them.
 *   4. Tethered hover, outdoors, nobody within the tether radius.
 *   5. Free flight.
 *
 * Step 3 is the one people skip and the one that catches a reversed axis. A
 * reversed axis at step 5 is an aircraft that flips into the ground at full
 * throttle in about 300 ms.
 *
 * ARCHITECTURE
 *
 *   core 1  ── rate loop, 1 kHz, nothing else. Reads gyro, runs the cascade,
 *              writes motors. Never touches Wi-Fi, never allocates.
 *   core 0  ── Wi-Fi, MQTT, telemetry, LED, buzzer.
 *
 * That split is the single most important structural decision in this file.
 * The ESP32's Wi-Fi driver holds locks for milliseconds at a time; a control
 * loop sharing a core with it does not miss deadlines evenly, it misses them
 * in bursts, and a burst of missed deadlines during a correction is a crash.
 *
 * Standard Circuvent protocol (cv/<id>/state|telemetry|track), so the console,
 * log book and daily report in Docs/21-drone.md work against this aircraft
 * with no change.
 */

/** Version history: 1.0.0 initial Circuvent flight stack. */
#define CV_FW_VERSION "1.0.0"

#include <CircuventDevice.h>
#include <Preferences.h>
#include "fc-config.h"
#include "ahrs.h"
#include "control.h"
#include "dshot.h"
#include "imu.h"
#include "rc.h"
#include "telemetry.h"

CircuventDevice cv("drone-x1");
Preferences prefs;

static Imu    imu;
static Ahrs   ahrs;
static DShot  esc;
static Sbus   rc;
static RatePid pidRoll, pidPitch, pidYaw;

// ---------------------------------------------------------------------------
// Shared state
//
// SharedState itself lives in fc-config.h, because telemetry.h reads it.
// ---------------------------------------------------------------------------
static portMUX_TYPE stateMux = portMUX_INITIALIZER_UNLOCKED;

static SharedState shared = {};

// Settings, persisted.
static float kpRoll = 0.0016f, kiRoll = 0.0040f, kdRoll = 0.000022f;
static float kpYaw  = 0.0035f, kiYaw  = 0.0060f, kdYaw  = 0.0f;
static float angleKp = 6.0f;
static float expo = 0.35f;
static uint8_t cells = CELL_COUNT_DEFAULT;
static bool levelModeDefault = true;

// ---------------------------------------------------------------------------
// Battery
// ---------------------------------------------------------------------------
static float readBatteryVolts() {
  // 1:10 divider into a 3.3 V ADC with 12 dB attenuation. The constant is
  // calibrated per board; an uncalibrated reading that reports 3.4 V/cell when
  // the pack is at 3.2 V is how a pack gets destroyed and an aircraft falls.
  const int raw = analogRead(PIN_VBAT);
  return (float)raw * (3.3f / 4095.0f) * 11.0f;
}

static int8_t battPercent(float volts, uint8_t cellCount) {
  if (cellCount == 0) return -1;
  const float per = volts / (float)cellCount;
  // Linear between the usable endpoints. A LiPo's discharge curve is flat in
  // the middle, so this over-reports mid-pack — but it under-reports at the
  // bottom, which is the end that matters.
  const float pct = (per - CELL_MIN_V) / (CELL_FULL_V - CELL_MIN_V) * 100.0f;
  return (int8_t)clampf(pct, 0.0f, 100.0f);
}

// ---------------------------------------------------------------------------
// Arming
// ---------------------------------------------------------------------------

/**
 * Every reason the aircraft may not arm, checked in one place.
 *
 * Returning the *first* blocker rather than a bitmask is deliberate: the
 * operator needs one instruction, not a list. "Throttle is not at idle" is
 * actionable; "3 conditions unmet" sends them looking.
 */
static ArmBlock armBlocker(const Demand &d, const Attitude &att, float battV, bool imuOk) {
  if (!imuOk)                       return AB_IMU_FAULT;
  if (!imu.calibrated())            return AB_CALIBRATING;
  if (!d.present)                   return AB_NO_RC;
  if (d.throttle > 0.03f)           return AB_THROTTLE_HIGH;
  if (Ahrs::tiltDeg(att) > 20.0f)   return AB_NOT_LEVEL;
  if (cells > 0 && battV > 1.0f && (battV / cells) < CELL_WARN_V) return AB_LOW_BATTERY;
  return AB_NONE;
}

// ---------------------------------------------------------------------------
// The rate loop — core 1
// ---------------------------------------------------------------------------
static void rateTask(void *) {
  const TickType_t period = pdMS_TO_TICKS(1);
  TickType_t last = xTaskGetTickCount();

  FlightState state = FS_BOOT;
  ArmBlock block = AB_CALIBRATING;
  uint32_t armedAt = 0;
  bool armLatch = false;
  bool sawSwitchOff = false;
  uint32_t overruns = 0;
  uint32_t loopMaxUs = 0;
  bool saturated = false;
  float motors[MOTOR_COUNT] = {0, 0, 0, 0};
  bool inAir = false;

  // Calibration happens here, on the core that will use the result, before the
  // loop starts. Doing it on core 0 would measure a bias with a different
  // thermal history from the one the loop reads.
  state = FS_CALIBRATING;
  const bool calOk = imu.calibrate(1200);
  state = calOk ? FS_DISARMED : FS_FAULT;

  for (;;) {
    const uint32_t t0 = micros();

    // ---- inputs -------------------------------------------------------
    rc.poll();
    const ImuSample s = imu.read();

    Demand d = {};
    d.present   = rc.linkUp();
    d.throttle  = rc.unit(2);
    d.armSwitch = rc.sw(4);
    d.levelMode = levelModeDefault ? !rc.sw(5) : rc.sw(5);
    d.roll      = applyExpo(rc.axis(0), expo, d.levelMode ? MAX_ANGLE_DEG : MAX_RATE_DPS);
    d.pitch     = applyExpo(rc.axis(1), expo, d.levelMode ? MAX_ANGLE_DEG : MAX_RATE_DPS);
    d.yawRate   = applyExpo(rc.axis(3), expo, MAX_YAW_RATE_DPS);

    Attitude att = ahrs.update(s.ok ? s.gyro : Vec3{0, 0, 0},
                               s.ok ? s.accel : Vec3{0, 0, 1},
                               RATE_DT);

    const float battV = shared.battV;   // sampled by the slow task

    /*
     * The arm switch must be seen OFF once before it can arm anything.
     *
     * Without this, powering up with the switch already forward arms the
     * aircraft the instant the receiver connects — while somebody is holding
     * it. This is the single most common way people are cut by their own
     * quad, and it costs one boolean to prevent.
     */
    if (!d.armSwitch) sawSwitchOff = true;

    // ---- state machine -------------------------------------------------
    if (state != FS_FAULT) {
      const ArmBlock b = armBlocker(d, att, battV, s.ok);

      if (!armLatch) {
        block = sawSwitchOff ? b : AB_SWITCH_ON_AT_BOOT;
        if (d.armSwitch && sawSwitchOff && b == AB_NONE) {
          armLatch = true;
          armedAt = millis();
          pidRoll.reset(); pidPitch.reset(); pidYaw.reset();
          state = FS_ARMED;
        } else {
          state = FS_DISARMED;
        }
      } else {
        // ---- reasons to disarm in flight -------------------------------
        if (!d.armSwitch) {
          armLatch = false; state = FS_DISARMED; block = AB_NONE;
        } else if (!s.ok) {
          // No attitude estimate means no controller. Cutting is the only
          // honest response; continuing would fly on a stale attitude.
          armLatch = false; state = FS_FAULT; block = AB_IMU_FAULT;
        } else if (Ahrs::tiltDeg(att) > TILT_CUTOFF_DEG) {
          armLatch = false; state = FS_FAULT; block = AB_TILT;
        } else if (!d.present) {
          /*
           * Radio lost. The aircraft does NOT cut power — that drops it
           * wherever it happens to be, which may be over someone. It levels
           * and descends at a controlled rate, which is what every certified
           * failsafe does.
           */
          state = FS_FAILSAFE;
        } else {
          state = FS_ARMED;
        }
      }
    }

    // ---- control -------------------------------------------------------
    float mRoll = 0, mPitch = 0, mYaw = 0, thr = 0;

    if (armLatch && (state == FS_ARMED || state == FS_FAILSAFE)) {
      float rollRateSp, pitchRateSp;

      if (state == FS_FAILSAFE) {
        // Level, no yaw, and a descent. 35% is below hover thrust for this
        // airframe, so it comes down at roughly 1.5 m/s rather than dropping.
        rollRateSp  = angleToRate(0.0f, att.rollDeg,  angleKp, MAX_RATE_DPS);
        pitchRateSp = angleToRate(0.0f, att.pitchDeg, angleKp, MAX_RATE_DPS);
        d.yawRate = 0.0f;
        thr = 0.35f;
      } else if (d.levelMode) {
        rollRateSp  = angleToRate(d.roll,  att.rollDeg,  angleKp, MAX_RATE_DPS);
        pitchRateSp = angleToRate(d.pitch, att.pitchDeg, angleKp, MAX_RATE_DPS);
        thr = d.throttle;
      } else {
        rollRateSp  = d.roll;    // already deg/s in acro
        pitchRateSp = d.pitch;
        thr = d.throttle;
      }

      mRoll  = pidRoll.update(rollRateSp,  s.gyro.x, RATE_DT, saturated);
      mPitch = pidPitch.update(pitchRateSp, s.gyro.y, RATE_DT, saturated);
      mYaw   = pidYaw.update(d.yawRate,     s.gyro.z, RATE_DT, saturated);

      const MixOutput mix = mixQuadX(thr, mRoll, mPitch, mYaw);
      saturated = mix.saturated;
      for (int i = 0; i < MOTOR_COUNT; i++) motors[i] = mix.m[i];
      esc.write(motors);

      // "In the air" is inferred, not measured: armed with meaningful
      // throttle. Used only for telemetry and the flight log.
      if (thr > 0.25f) inAir = true;
    } else {
      saturated = false;
      for (int i = 0; i < MOTOR_COUNT; i++) motors[i] = 0.0f;
      esc.stopAll();
      inAir = false;
    }

    // ---- publish shared state ------------------------------------------
    const uint32_t took = micros() - t0;
    if (took > loopMaxUs) loopMaxUs = took;
    if (took > LOOP_DEADLINE_US) overruns++;

    taskENTER_CRITICAL(&stateMux);
    shared.att = att;
    shared.gyro = s.ok ? s.gyro : Vec3{0, 0, 0};
    for (int i = 0; i < MOTOR_COUNT; i++) shared.motors[i] = motors[i];
    shared.state = state;
    shared.block = block;
    shared.loopOverruns = overruns;
    shared.armedAtMs = armLatch ? armedAt : 0;
    shared.loopMaxUs = loopMaxUs;
    shared.inAir = inAir;
    taskEXIT_CRITICAL(&stateMux);

    vTaskDelayUntil(&last, period);
  }
}

// ---------------------------------------------------------------------------
// Commands from the cloud
//
// Tuning and configuration only. There is deliberately no arm, takeoff or
// stick input here: the safety case for this aircraft rests on a pilot with a
// transmitter in line of sight, and an arm command arriving over Wi-Fi from a
// browser breaks that case completely.
// ---------------------------------------------------------------------------
static void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set") {
    bool armedNow;
    taskENTER_CRITICAL(&stateMux);
    armedNow = shared.state == FS_ARMED || shared.state == FS_FAILSAFE;
    taskEXIT_CRITICAL(&stateMux);

    /*
     * Gains are refused while armed.
     *
     * Changing a D term on a hovering aircraft steps the controller's output
     * discontinuously. Betaflight allows it in a dedicated tuning mode with a
     * pilot ready to catch it; over an internet link with no such context it
     * is a way to drop an aircraft from a web page.
     */
    if (armedNow) {
      JsonDocument d;
      d["kind"] = "refused";
      d["reason"] = "cannot retune while armed";
      cv.publishTelemetry(d.as<JsonObjectConst>());
      return;
    }

    if (p["kpRoll"].is<float>())  kpRoll  = clampf(p["kpRoll"].as<float>(),  0.0f, 0.01f);
    if (p["kiRoll"].is<float>())  kiRoll  = clampf(p["kiRoll"].as<float>(),  0.0f, 0.05f);
    if (p["kdRoll"].is<float>())  kdRoll  = clampf(p["kdRoll"].as<float>(),  0.0f, 0.001f);
    if (p["kpYaw"].is<float>())   kpYaw   = clampf(p["kpYaw"].as<float>(),   0.0f, 0.02f);
    if (p["angleKp"].is<float>()) angleKp = clampf(p["angleKp"].as<float>(), 1.0f, 15.0f);
    if (p["expo"].is<float>())    expo    = clampf(p["expo"].as<float>(),    0.0f, 0.9f);
    if (p["cells"].is<int>())     cells   = (uint8_t)constrain(p["cells"].as<int>(), 1, 8);
    if (p["levelMode"].is<bool>()) levelModeDefault = p["levelMode"].as<bool>();

    pidRoll.configure(kpRoll, kiRoll, kdRoll, 0.3f);
    pidPitch.configure(kpRoll, kiRoll, kdRoll, 0.3f);
    pidYaw.configure(kpYaw, kiYaw, kdYaw, 0.3f);

    prefs.begin("dronefc", false);
    prefs.putFloat("kpRoll", kpRoll);
    prefs.putFloat("kiRoll", kiRoll);
    prefs.putFloat("kdRoll", kdRoll);
    prefs.putFloat("kpYaw", kpYaw);
    prefs.putFloat("angleKp", angleKp);
    prefs.putFloat("expo", expo);
    prefs.putUChar("cells", cells);
    prefs.putBool("level", levelModeDefault);
    prefs.end();
    publishFullState();
    return;
  }

  if (action == "calibrate") {
    // Only on the ground, and only via the rate task's own calibration path —
    // recalibrating mid-flight would zero out real rotation.
    JsonDocument d;
    d["kind"] = "info";
    d["msg"] = "power-cycle on a level surface to recalibrate";
    cv.publishTelemetry(d.as<JsonObjectConst>());
    return;
  }

  if (action == "state") { publishFullState(); return; }
}

// ---------------------------------------------------------------------------
// setup / loop — core 0
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(100);

  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  analogReadResolution(12);

  prefs.begin("dronefc", true);
  kpRoll  = prefs.getFloat("kpRoll", kpRoll);
  kiRoll  = prefs.getFloat("kiRoll", kiRoll);
  kdRoll  = prefs.getFloat("kdRoll", kdRoll);
  kpYaw   = prefs.getFloat("kpYaw", kpYaw);
  angleKp = prefs.getFloat("angleKp", angleKp);
  expo    = prefs.getFloat("expo", expo);
  cells   = prefs.getUChar("cells", cells);
  levelModeDefault = prefs.getBool("level", levelModeDefault);
  prefs.end();

  pidRoll.configure(kpRoll, kiRoll, kdRoll, 0.3f);
  pidPitch.configure(kpRoll, kiRoll, kdRoll, 0.3f);
  pidYaw.configure(kpYaw, kiYaw, kdYaw, 0.3f);

  ahrs.begin();
  const bool imuOk = imu.begin();

  const int motorPins[MOTOR_COUNT] = {PIN_M1, PIN_M2, PIN_M3, PIN_M4};
  const bool escOk = esc.begin(motorPins);
  esc.stopAll();

  rc.begin(Serial1, PIN_RC_RX);

  /*
   * The rate loop gets core 1 and a priority above the network stack.
   *
   * Pinned, not left to the scheduler: the ESP32's Wi-Fi driver runs on core 0
   * and takes locks for milliseconds. A control loop that the scheduler is
   * free to migrate onto that core misses deadlines in bursts, and a burst of
   * missed deadlines during a correction is a crash.
   */
  if (imuOk && escOk) {
    xTaskCreatePinnedToCore(rateTask, "rate", 8192, nullptr, configMAX_PRIORITIES - 2, nullptr, 1);
  } else {
    shared.state = FS_FAULT;
    shared.block = imuOk ? AB_IMU_FAULT : AB_IMU_FAULT;
  }

  cv.onCommand(onCommand);
  cv.setInterval(1000);
  cv.begin();

  startTelemetry(cv);
  publishFullState();
}

void loop() {
  cv.loop();

  const uint32_t now = millis();

  // Battery, sampled slowly. The ADC is noisy and the pack does not move fast.
  static uint32_t lastBatt = 0;
  if (now - lastBatt >= 200) {
    lastBatt = now;
    const float v = readBatteryVolts();
    taskENTER_CRITICAL(&stateMux);
    // Heavy smoothing: prop current draw swings the measured voltage by half a
    // volt on every throttle punch, and a low-battery cutoff that fires on a
    // transient lands the aircraft with 40% left.
    shared.battV = shared.battV == 0.0f ? v : (shared.battV * 0.9f + v * 0.1f);
    shared.battPct = battPercent(shared.battV, cells);
    taskEXIT_CRITICAL(&stateMux);
  }

  SharedState snap;
  taskENTER_CRITICAL(&stateMux);
  snap = shared;
  taskEXIT_CRITICAL(&stateMux);

  pumpTelemetry(cv, snap, now);

  // State publish on change, plus the 1 Hz interval CircuventDevice runs.
  static FlightState lastState = FS_BOOT;
  static ArmBlock lastBlock = AB_NONE;
  if (snap.state != lastState || snap.block != lastBlock) {
    lastState = snap.state;
    lastBlock = snap.block;
    publishFullState();
  }

  // LED: solid armed, fast blink faulted, slow blink ready.
  static uint32_t ledAt = 0; static bool ledOn = false;
  const uint32_t period = (snap.state == FS_ARMED || snap.state == FS_FAILSAFE) ? 0
                        : (snap.state == FS_FAULT ? 120 : 900);
  if (period == 0) digitalWrite(PIN_LED, HIGH);
  else if (now - ledAt >= period) { ledAt = now; ledOn = !ledOn; digitalWrite(PIN_LED, ledOn); }
}

void publishFullState() {
  SharedState s;
  taskENTER_CRITICAL(&stateMux);
  s = shared;
  taskEXIT_CRITICAL(&stateMux);

  const bool armed = s.state == FS_ARMED || s.state == FS_FAILSAFE;
  cv.set("board", "circuvent-x1");
  cv.set("armed", armed);
  cv.set("inAir", s.inAir);
  cv.set("link", rc.linkUp());
  cv.set("mode", s.state == FS_FAILSAFE ? "failsafe"
               : s.state == FS_FAULT ? "fault"
               : armed ? "stabilise" : "disarmed");
  cv.set("ready", s.block == AB_NONE && s.state != FS_FAULT);
  cv.set("readyReason", armBlockName(s.block));
  cv.set("failsafe", s.state == FS_FAILSAFE);
  cv.set("roll", s.att.rollDeg);
  cv.set("pitch", s.att.pitchDeg);
  cv.set("yaw", s.att.yawDeg);
  cv.set("battV", s.battV);
  cv.set("battPct", (int)s.battPct);
  cv.set("cells", (int)cells);
  cv.set("flightSec", s.armedAtMs ? (int)((millis() - s.armedAtMs) / 1000) : 0);
  cv.set("loopMaxUs", (long)s.loopMaxUs);
  cv.set("overruns", (long)s.loopOverruns);
  cv.set("rcFrames", (long)rc.frames());
  cv.set("imuFaults", (long)imu.faults());
  cv.set("calibrated", imu.calibrated());
  cv.set("kpRoll", kpRoll);
  cv.set("kiRoll", kiRoll);
  cv.set("kdRoll", kdRoll);
  cv.set("angleKp", angleKp);
  cv.publishStateNow();
}
