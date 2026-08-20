/*
 * Circuvent RC Car — the vehicle.
 * =========================================================================
 *
 * A model car that is driven either from a handset or from a phone, over a
 * link that is deliberately not Wi-Fi, with a camera feed that deliberately is.
 * The reasoning for that split is in rc-protocol.h and is the single most
 * important thing to understand before changing anything here.
 *
 * WHAT THIS BOARD DOES
 *
 *   core 0  ── ESP-NOW control, failsafe, drive, lights. Nothing blocking.
 *   core 1  ── camera capture and the HTTP server that serves it.
 *
 * The split matters for the same reason it does on the drone: the Wi-Fi stack
 * takes multi-millisecond locks, and a control loop sharing a core with it
 * misses its deadline in bursts. On a car a missed deadline is not a crash,
 * but a hundred milliseconds of stale steering at speed is a wall.
 *
 * SAFETY, SUCH AS IT IS
 *
 * This is a toy-scale vehicle, not an aircraft, so the failure modes are
 * cheaper — but two of them are worth stating:
 *
 *   1. The car must stop when the link goes, and it must *brake* rather than
 *      coast. rc-protocol.h explains why.
 *   2. It must not move on power-up. Every controller starts by sending
 *      neutral, and the vehicle refuses to leave immobilised mode until it has
 *      seen a frame with the throttle at rest — so a handset left with the
 *      trigger pulled cannot drive the car away the moment its battery goes in.
 *
 * Standard Circuvent protocol on the cloud side (cv/<id>/state|telemetry), so
 * the console and the app see this like any other device.
 */

/**
 * Version history:
 *   1.0.0  initial vehicle firmware.
 */
#define CV_FW_VERSION "1.0.0"

#include <CircuventDevice.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#include "rc-protocol.h"
#include "rc-drive.h"
#include "rc-lights.h"
#include "rc-camera.h"

CircuventDevice cv("rc-car");
Preferences prefs;

static RcDrive drive;
static RcLights lights;
static RcCamera camera;

/*
 * The camera task.
 *
 * Pinned to core 1 with a priority *below* the control path, and it is the
 * only thing that touches the camera or the HTTP server. Everything it does —
 * capture, JPEG, Wi-Fi, a client that stops reading — is allowed to block,
 * which is exactly why it is not on the core that drives the motor.
 */
static void cameraTask(void *) {
  for (;;) {
    camera.loop();
    /*
     * A yield rather than a busy loop. handleClient() returns immediately when
     * nothing is pending, so without this the task would spin at full tilt and
     * starve everything else on the core of the little time it needs.
     */
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}

/* ---------------------------------------------------------------- link ---- */

/*
 * The controller this car answers to.
 *
 * Stored, not discovered. An unpaired car that drives for whoever shouts
 * loudest is a car that two people at the same field fight over — and worse,
 * one that a passer-by can drive into a road. Pairing is deliberate: hold the
 * bind button, and the next PAIR frame wins.
 */
static uint8_t peerMac[6] = {0};
static bool paired = false;

static volatile uint32_t lastControlMs = 0;
static volatile uint16_t lastSeq = 0;
static volatile bool haveSeq = false;

/* The most recent accepted demand. Written in the ESP-NOW callback, read by
   the loop, so both are volatile and neither is more than a word. */
static volatile int16_t demandThrottle = 0;
static volatile int16_t demandSteer = 0;
static volatile uint16_t demandAux = 0;
static volatile uint8_t demandMode = RC_MODE_IMMOBILISED;
static volatile uint8_t demandTrim = 100;

/*
 * Set once the controller has been seen at rest, and cleared on every link
 * loss. This is what stops a car driving away when a handset is switched on
 * with the trigger already pulled — the throttle has to pass through neutral
 * before any of it counts.
 */
static volatile bool sawNeutral = false;


static volatile uint32_t framesGood = 0, framesBad = 0, framesLost = 0;

/*
 * Link quality from sequence gaps rather than RSSI.
 *
 * The Arduino core's ESP-NOW callback on this part hands over the sender's
 * address and the payload and nothing else — there is no per-packet RSSI to
 * read. Rather than report a signal strength this board cannot measure,
 * quality is counted from the sequence numbers: every gap is a frame that was
 * sent and did not arrive.
 *
 * That is arguably the better number anyway. RSSI says how loud the
 * transmitter is; this says how much of what it said was heard, which is the
 * thing a driver actually cares about.
 */
static void onEspNowRecv(const uint8_t *mac, const uint8_t *data, int len) {
  RcControlPacket p;
  if (len != (int)sizeof(p)) { framesBad++; return; }
  memcpy(&p, data, sizeof(p));
  if (!rcCheckControl(&p, sizeof(p))) { framesBad++; return; }

  /* Only from the paired controller. */
  if (paired && memcmp(mac, peerMac, 6) != 0) return;

  /*
   * Older or repeated frames are dropped. Out-of-order arrivals happen on a
   * busy channel, and acting on the older one means the car briefly obeys a
   * command the driver has already moved past. Replays are the other half: a
   * recorded "full throttle" sent back later carries a sequence already seen.
   */
  if (haveSeq && !rcSeqIsNewer(p.seq, lastSeq)) return;
  if (haveSeq) {
    const uint16_t gap = (uint16_t)(p.seq - lastSeq);
    if (gap > 1) framesLost += (gap - 1);
  }
  lastSeq = p.seq;
  haveSeq = true;

  if (abs(p.throttle) < 60) sawNeutral = true;

  demandThrottle = p.throttle;
  demandSteer = p.steer;
  demandAux = p.aux;
  demandMode = p.mode;
  demandTrim = p.trim;
  lastControlMs = millis();
  framesGood++;
}

/* ------------------------------------------------------------- battery ---- */

static uint8_t cells = CELL_COUNT_DEFAULT;

static float readBatteryVolts() {
  /* 1:2 divider into a 3.3 V ADC at 12 dB. Calibrated per board; an
     uncalibrated reading is how a pack gets run flat and destroyed. */
  const int raw = analogRead(PIN_VBAT);
  return (float)raw * (3.3f / 4095.0f) * 2.0f;
}

static int8_t battPercent(float v) {
  if (cells == 0) return -1;
  const float per = v / (float)cells;
  const float pct = (per - CELL_MIN_V) / (CELL_FULL_V - CELL_MIN_V) * 100.0f;
  return (int8_t)(pct < 0 ? 0 : (pct > 100 ? 100 : pct));
}

/* --------------------------------------------------------------- wheel ---- */

/*
 * Speed from a wheel sensor, counted in an interrupt.
 *
 * Optional: with nothing fitted the count never moves and speed reports zero.
 * That is reported honestly rather than estimated from throttle — a number
 * derived from the command is not a measurement, it is the command wearing a
 * different label, and it would read full speed with the wheels off the ground.
 */
static volatile uint32_t wheelTicks = 0;
static void IRAM_ATTR onWheelTick() { wheelTicks++; }

#ifndef WHEEL_TICKS_PER_TURN
#define WHEEL_TICKS_PER_TURN 4
#endif
#ifndef WHEEL_CIRCUM_MM
#define WHEEL_CIRCUM_MM 210
#endif

static uint32_t odoMm = 0;

/* ------------------------------------------------------------ telemetry ---- */

static uint16_t telemSeq = 0;

static void sendTelemetry(float battV, int16_t speedCms, bool failsafe) {
  if (!paired) return;
  RcTelemetryPacket t;
  memset(&t, 0, sizeof(t));
  t.seq = telemSeq++;
  t.battMv = (uint16_t)(battV * 1000.0f);
  t.speedCms = speedCms;
  t.motorTempC = 0; /* no sensor fitted; reported as zero rather than guessed */
  t.aux = demandAux;
  t.mode = demandMode;
  t.rssi = 0;              /* see the link-quality note above */
  t.battPct = (uint8_t)max<int8_t>(0, battPercent(battV));
  t.odoM = odoMm / 1000;
  t.flags = 0;
  if (failsafe) t.flags |= RC_TF_FAILSAFE;
  if (battPercent(battV) < 15) t.flags |= RC_TF_LOW_BATTERY;
  rcSealTelemetry(&t);
  esp_now_send(peerMac, (const uint8_t *)&t, sizeof(t));
}

/* ---------------------------------------------------------------- setup ---- */

static void startLink() {
  WiFi.mode(WIFI_AP_STA);
  /*
   * A fixed channel. ESP-NOW peers must agree, and letting the AP pick one
   * means the control link moves whenever the camera's Wi-Fi does — which is
   * a car that stops responding because something re-scanned.
   */
  esp_wifi_set_channel(CV_RC_CHANNEL, WIFI_SECOND_CHAN_NONE);

  if (esp_now_init() != ESP_OK) return;
  esp_now_register_recv_cb(onEspNowRecv);

  if (paired) {
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, peerMac, 6);
    peer.channel = CV_RC_CHANNEL;
    peer.encrypt = false;
    esp_now_add_peer(&peer);
  }
}

void setup() {
  Serial.begin(115200);

  /*
   * Drive and lights come up before the radio, and both come up stopped. The
   * radio is what can deliver a throttle command, so nothing that can move the
   * car should be initialised after it.
   */
  drive.begin();
  lights.begin();
  analogReadResolution(12);

  pinMode(PIN_WHEEL, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_WHEEL), onWheelTick, FALLING);

  prefs.begin("rccar", true);
  cells = prefs.getUChar("cells", cells);
  paired = prefs.getBytes("peer", peerMac, 6) == 6;
  prefs.end();

  startLink();

  /*
   * The camera comes up last, after the link and after the drive.
   *
   * It is the one part that is allowed to fail without stopping anything: a
   * car with no camera is a car somebody drives by looking at it, which is how
   * every model car worked until recently. A car with no control link is a
   * brick, so that goes first.
   */
  char camPass[33] = {0};
  prefs.begin("rccar", true);
  prefs.getString("camPass", camPass, sizeof(camPass));
  prefs.end();
  if (camera.begin(camPass)) {
    xTaskCreatePinnedToCore(cameraTask, "rc-camera", 8192, nullptr, 3, nullptr, 1);
  }

  cv.begin();
}

/* ----------------------------------------------------------------- loop ---- */

void loop() {
  cv.loop();

  static uint32_t lastTick = 0;
  const uint32_t now = millis();
  if (now - lastTick < 20) return; /* 50 Hz, matching the control rate */
  lastTick = now;

  /* ---- link state ------------------------------------------------- */
  const bool linkUp = (now - lastControlMs) < RC_CONTROL_TIMEOUT_MS && lastControlMs != 0;
  const bool failsafe = !linkUp;
  if (failsafe) sawNeutral = false; /* re-arm through neutral after every loss */

  /* ---- speed ------------------------------------------------------ */
  static uint32_t lastTicks = 0;
  static uint32_t lastSpeedMs = 0;
  static int16_t speedCms = 0;
  if (now - lastSpeedMs >= 200) {
    const uint32_t t = wheelTicks;
    const uint32_t d = t - lastTicks;
    lastTicks = t;
    const uint32_t mm = (d * WHEEL_CIRCUM_MM) / WHEEL_TICKS_PER_TURN;
    odoMm += mm;
    speedCms = (int16_t)((mm / 10) * (1000 / 200));
    if (drive.applied() < 0) speedCms = -speedCms; /* direction from the motor */
    lastSpeedMs = now;
  }

  /* ---- demand ------------------------------------------------------ */
  static int16_t previousApplied = 0;
  int16_t demand = 0;

  if (failsafe) {
    const RcFailsafeAction a = rcFailsafeAction();
    drive.update(a.throttle, true);
  } else {
    /*
     * Mode is taken from the frame but the ceiling is applied here, on the
     * vehicle. A controller that asks for sport mode gets sport mode; a
     * controller that asks for 1500 gets 1000, whatever it thinks it sent.
     */
    uint8_t mode = demandMode;
    if (!sawNeutral) mode = RC_MODE_IMMOBILISED;
    demand = rcApplyLimits(demandThrottle, mode, demandAux);
    drive.update(demand, false);
    drive.steer(demandSteer, demandTrim);
  }

  const float battV = readBatteryVolts();
  /* A flat pack immobilises the car rather than letting it brown out mid-turn,
     which is how a servo stalls and a lithium cell gets damaged. */
  if (cells > 0 && (battV / cells) < CELL_MIN_V) drive.stop();

  lights.update(failsafe ? (demandAux | RC_AUX_HAZARD) : demandAux,
                drive.applied(), previousApplied, -1, failsafe);
  previousApplied = drive.applied();

  /* ---- telemetry --------------------------------------------------- */
  static uint32_t lastTelem = 0;
  if (now - lastTelem >= RC_TELEMETRY_PERIOD_MS) {
    lastTelem = now;
    sendTelemetry(battV, speedCms, failsafe);
  }

  /* ---- cloud ------------------------------------------------------- */
  static uint32_t lastCloud = 0;
  if (now - lastCloud >= 2000) {
    lastCloud = now;
    cv.set("linked", linkUp);
    cv.set("failsafe", failsafe);
    cv.set("mode", demandMode == RC_MODE_SPORT ? "sport"
                 : demandMode == RC_MODE_NORMAL ? "normal"
                 : demandMode == RC_MODE_BEGINNER ? "beginner" : "immobilised");
    cv.set("speedCms", (int)speedCms);
    cv.set("battV", battV);
    cv.set("battPct", (int)battPercent(battV));
    cv.set("odoM", (long)(odoMm / 1000));
    cv.set("headlight", (bool)(demandAux & RC_AUX_HEADLIGHT));
    cv.set("hazard", (bool)(demandAux & RC_AUX_HAZARD));
    cv.set("rxLost", (long)framesLost);
    cv.set("rxGood", (long)framesGood);
    cv.set("rxBad", (long)framesBad);
    cv.set("paired", paired);
    cv.set("cameraUp", camera.up());
    cv.set("camFrames", (long)camera.frames());
  }
}
