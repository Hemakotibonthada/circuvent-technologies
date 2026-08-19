/*
 * Circuvent Touch Board 8 — 8-gang capacitive switchboard w/ power metering (ESP32)
 * =================================================================================
 * The big-room sibling of firmware/touchboard. A wall switchboard with:
 *   - 8 capacitive touch pads (ESP32 built-in touchRead) -> 8 relays.
 *   - Dimmable LED backlight so the pads are findable at night.
 *   - Whole-board energy metering via an HLW8012 (CF = active power pulses,
 *     CF1 = current/voltage pulses selected by SEL) -> V, I, P, PF, kWh.
 *   - Local-first: a tap flips its relay whether or not the network is up.
 *
 * Standard Circuvent protocol (cv/<id>/state|telemetry). Board: ESP32-WROOM-32.
 *
 * WHY THIS IS A SEPARATE SKETCH RATHER THAN touchboard WITH A BIGGER LOOP
 *
 * The 3-gang board is shipped hardware with a fixed pin map. Widening its
 * arrays would silently re-purpose pins on every unit already in a wall, and
 * the failure would be a relay wired to a light switching something else
 * entirely. New board, new sketch, new device type.
 *
 * WHAT ACTUALLY CHANGES AT EIGHT GANGS
 *
 * Three things that are non-issues at three:
 *
 *   1. Inrush. Eight relay coils energising on the same millisecond is roughly
 *      half an amp of coil current arriving at once, before the contacts even
 *      close on their loads. That sags the rail the ESP32 runs on, and the
 *      symptom is a board that reboots whenever somebody turns everything on —
 *      i.e. exactly when the "All on" button is pressed. applyAll() staggers.
 *
 *   2. Publish storms. touchboard calls publishStateNow() inside setRelay(),
 *      which is right for one tap. Running that over eight gangs sends eight
 *      MQTT publishes describing eight intermediate states nobody chose. Here
 *      setRelay() only records; the caller publishes once, when the whole
 *      change is done.
 *
 *   3. Touch pins run out. The ESP32 has ten (T0..T9) and two are spoken for:
 *      T1 is GPIO0, which is the BOOT strap and this project's reset button.
 *      That leaves nine for eight pads, and the one deliberately left out is
 *      T5 — see the pin map, it is not an arbitrary choice.
 */
/** Version history: 1.0.0 initial 8-gang board; 1.1.0 adds the local home link. */
/*
 * 1.1.2  It no longer invents a mains voltage. `if (volts < 1) volts = 230.0`
 *        was described as "nominal until the first V sample" and was true only
 *        of the first few seconds: a board whose voltage sense had failed
 *        reported exactly 230.0 for the rest of its life, and since the
 *        published power factor is watts / (volts x amps), the fabricated
 *        figure quietly corrupted that too. `volts` is now published only when
 *        it was measured, next to a flag that says so, and the power factor is
 *        cleared rather than left stale when there is nothing to divide by.
 *
 *        Metering is also published on a cadence. All five figures derive from
 *        pulse counts and changed on every meter window, so the board emitted
 *        a state message — and a database row — every second of its life, for
 *        numbers nobody reads at that resolution. A pad press still publishes
 *        immediately; that is somebody at the wall waiting for a light.
 */
#define CV_FW_VERSION "1.1.2"
#include <CircuventDevice.h>
#include <CvHomeLink.h>
#include <Preferences.h>

#define NUM_GANG 8

/*
 * ---- pin map -------------------------------------------------------------
 *
 * Touch pads. Values DROP when a finger lands, so a trigger is "below
 * baseline", never above.
 *
 * T5 (GPIO12) is missing on purpose and must stay missing. GPIO12 is MTDI, the
 * strapping pin the ROM samples at reset to choose the flash regulator
 * voltage: held high it selects 1.8V, and a board with 3.3V flash then fails
 * to boot at all. A capacitive pad is a plate of copper behind a glass panel —
 * a resting palm, a wet cloth, or a wall that has taken on damp is enough to
 * hold it up through a power cut. The board would come back dead after an
 * outage, inside a wall, with nothing in any log, and it would read as the
 * hardware having simply died. Eight pads fit without it; T9 is the eighth.
 *
 * GPIO2 (T2) and GPIO15 (T3) are straps too, but benign ones: they are only
 * sampled to select download mode, which also requires GPIO0 held low — and
 * GPIO0 is the reset button. touchboard already runs T3 in the field.
 */
const int TOUCH_PIN[NUM_GANG] = {
  T0,  // GPIO4
  T2,  // GPIO2
  T3,  // GPIO15
  T4,  // GPIO13
  T6,  // GPIO14
  T7,  // GPIO27
  T8,  // GPIO33
  T9,  // GPIO32
};

/*
 * Relay drives. All eight are plain outputs with nothing else attached.
 *
 * GPIO16/17 are free on WROOM-32 but carry the PSRAM lines on WROVER modules.
 * This board is specified WROOM; building it for a WROVER would give two
 * relays that click whenever the heap is touched.
 *
 * GPIO5 is a boot strap that must read HIGH at reset. It is safe here because
 * the board is active-low, so cvRelayInit() drives HIGH for "off" before it
 * ever calls pinMode — the strap sees the level it needs.
 */
const int RELAY_PIN[NUM_GANG] = { 5, 16, 17, 18, 19, 21, 22, 23 };

/*
 * ---- pin map guards ------------------------------------------------------
 *
 * The pin map above is prose, and prose does not fail a build. These do.
 *
 * Everything here is the kind of mistake that produces working hardware which
 * dies later and elsewhere: a board that boots fine on the bench and not after
 * a power cut, or two peripherals sharing a pin that only misbehave when both
 * are used at once. None of it throws at runtime, so it has to be caught here
 * or not at all.
 */
constexpr int kTouch[NUM_GANG] = { T0, T2, T3, T4, T6, T7, T8, T9 };
constexpr int kRelay[NUM_GANG] = { 5, 16, 17, 18, 19, 21, 22, 23 };

/** True if `pin` appears in the first `n` entries of `a`. */
constexpr bool cvHas(const int *a, int n, int pin) {
  return n > 0 && (a[n - 1] == pin || cvHas(a, n - 1, pin));
}
/** True if any entry of `a` also appears in `b` — i.e. the two lists collide. */
constexpr bool cvOverlaps(const int *a, int an, const int *b, int bn) {
  return an > 0 && (cvHas(b, bn, a[an - 1]) || cvOverlaps(a, an - 1, b, bn));
}
/** True if `a` repeats any pin. */
constexpr bool cvRepeats(const int *a, int n) {
  return n > 1 && (cvHas(a, n - 1, a[n - 1]) || cvRepeats(a, n - 1));
}

// GPIO12 is MTDI. Held high at reset it selects 1.8V flash and the board does
// not boot. A touch pad is exactly the thing that can hold it high. See above.
static_assert(!cvHas(kTouch, NUM_GANG, 12),
              "GPIO12/T5 must never be a touch pad: it is the flash-voltage strap");
// GPIO0 is the BOOT strap and the reset button; a pad there would factory-reset.
static_assert(!cvHas(kTouch, NUM_GANG, 0),
              "GPIO0/T1 is the BOOT strap and the reset button, not a pad");
static_assert(!cvHas(kRelay, NUM_GANG, 0), "GPIO0 drives the reset button, not a relay");
// 34-39 are input-only on the ESP32: pinMode(OUTPUT) is accepted and does nothing.
static_assert(!cvHas(kRelay, NUM_GANG, 34) && !cvHas(kRelay, NUM_GANG, 35) &&
              !cvHas(kRelay, NUM_GANG, 36) && !cvHas(kRelay, NUM_GANG, 39),
              "GPIO34-39 are input-only and cannot drive a relay");
static_assert(!cvOverlaps(kTouch, NUM_GANG, kRelay, NUM_GANG), "a pad and a relay share a pin");
static_assert(!cvRepeats(kTouch, NUM_GANG), "two gangs share a touch pad");
static_assert(!cvRepeats(kRelay, NUM_GANG), "two gangs share a relay pin");

#define BACKLIGHT_PIN 25    // PWM LED backlight
#define HLW_CF   34         // active-power pulses (input-only pin)
#define HLW_CF1  35         // current/voltage pulses (input-only pin)
#define HLW_SEL  26         // SEL: HIGH=current, LOW=voltage on CF1

// HLW8012 calibration (depends on the shunt + divider; sane defaults).
double PWR_MULT = 1.2154;   // W per (pulse Hz)
double CUR_MULT = 0.00354;  // A per (pulse Hz)
double VOL_MULT = 0.9192;   // V per (pulse Hz)

/* ---- touch tuning ---- */
#define TOUCH_TRIGGER     0.6   // fraction of baseline that counts as a touch
#define TOUCH_DEBOUNCE_MS 250
#define TOUCH_RECAL_MS    (5UL * 60UL * 1000UL)

/*
 * Gap between relays in a bulk change. Long enough for one coil's inrush to
 * settle before the next starts, short enough that "All on" still reads as
 * instant to whoever pressed it: eight gangs finish in 175ms.
 */
#define RELAY_STAGGER_MS 25

CircuventDevice cv("touchboard-8");
Preferences store;

/*
 * The local bus, so this board can drive loads on other boards in the flat.
 *
 * A three-bedroom home has one of these in each room and the useful wiring is
 * rarely "this pad switches the load behind this pad" — the hall wants a
 * master-off, a bedside pad wants the fan across the room. Without this, every
 * one of those crosses the internet and back, and stops working entirely when
 * the broadband does. See CvHomeLink.h.
 */
CvHomeLink home;
bool homeLinkUp = false;

/*
 * Per-gang bindings: "<peer-id>:<field>", or empty for a gang that only drives
 * its own relay.
 *
 * Held on the *sending* board because that is where somebody stands when they
 * decide what a switch should do. Stored in NVS so the flat keeps working the
 * way its owner arranged it across a power cut, with no cloud involved.
 */
char bindTarget[NUM_GANG][CV_HOME_FIELD_LEN * 2] = {{0}};

bool relay[NUM_GANG];
bool savedRelay[NUM_GANG];
int  touchBase[NUM_GANG];
int  backlight = 60;                 // 0..100 %
bool selCurrent = true;

// pulse counters (updated in ISRs)
volatile uint32_t cfCount = 0, cf1Count = 0;
void IRAM_ATTR onCF()  { cfCount++; }
void IRAM_ATTR onCF1() { cf1Count++; }

double volts = 0, amps = 0, watts = 0, pf = 0, kwh = 0;
/* Whether `volts` came from the sensor or is simply not known. See readMeter. */
bool voltsMeasured = false;
uint32_t lastMeter = 0, lastTouchAt = 0, lastTouchRecal = 0;

void calibrateTouch();

/** NVS key and state field for a gang: "g1".."g8". */
static inline void gangKey(int i, char *out) {
  out[0] = 'g';
  out[1] = (char)('1' + i);
  out[2] = 0;
}

void applyBacklight() { analogWrite(BACKLIGHT_PIN, map(backlight, 0, 100, 0, 255)); }

/**
 * Drive one gang and record it, without publishing.
 *
 * Publishing is the caller's job precisely because bulk changes exist: eight
 * publishes describing a 175ms sweep tells the console a story about
 * intermediate states that were never a thing anybody chose.
 */
void setRelay(int i, bool on, bool persist = true) {
  relay[i] = on;
  cvRelayWrite(RELAY_PIN[i], on);
  char k[3];
  gangKey(i, k);
  cv.set(k, on);
  if (persist && on != savedRelay[i]) {
    store.putBool(k, on);
    savedRelay[i] = on;
  }
  // Announced to the flat so other boards can react without the cloud. Cheap
  // and connectionless; it costs nothing when nobody is listening.
  if (homeLinkUp) home.publishState(k, on ? 1 : 0);
}

/**
 * What a pad does when it is touched.
 *
 * A bound gang drives a load on another board instead of its own relay. That
 * is the case worth being careful about: the switch the finger is on and the
 * light that answers are in different rooms, so if the packet is lost there is
 * nothing local to show for it. The delivery counter in CvHomeLink is what
 * makes that visible rather than mysterious.
 */
void pressGang(int i) {
  if (homeLinkUp && bindTarget[i][0]) {
    char peer[CV_HOME_ID_LEN], field[CV_HOME_FIELD_LEN];
    if (cvHomeSplitTarget(bindTarget[i], peer, sizeof(peer), field, sizeof(field))) {
      // The bound gang tracks the state it last asked for, so the pad's own
      // indicator still means something to the person standing at it.
      relay[i] = !relay[i];
      home.sendCommand(peer, field, relay[i] ? 1 : 0);
      char k[3];
      gangKey(i, k);
      cv.set(k, relay[i]);
      cv.publishStateNow();
      return;
    }
  }
  setRelay(i, !relay[i]);
  cv.publishStateNow();
}

/**
 * Switch every gang, one coil at a time.
 *
 * See the header: eight coils on one edge browns the board out, and the reboot
 * that follows happens on the "All on" press — which makes it look like that
 * button is the thing that is broken.
 */
void applyAll(bool on) {
  for (int i = 0; i < NUM_GANG; i++) {
    setRelay(i, on);
    if (i < NUM_GANG - 1) delay(RELAY_STAGGER_MS);
  }
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "recalibrateTouch") {
    calibrateTouch();
    return;
  }

  /*
   * Bind a pad to a load on another board: {action:"bind", gang:3,
   * target:"a1b2c3:g2"}. An empty target unbinds it.
   *
   * Set from the app, applied here, and kept in NVS — so the arrangement the
   * owner chose survives a power cut and keeps working with the internet down,
   * which is the entire reason the local bus exists.
   */
  if (action == "bind") {
    int g = p["gang"] | 0;
    if (g < 1 || g > NUM_GANG) return;
    const char *t = p["target"] | "";
    strncpy(bindTarget[g - 1], t, sizeof(bindTarget[0]) - 1);
    bindTarget[g - 1][sizeof(bindTarget[0]) - 1] = 0;
    char bk[6];
    snprintf(bk, sizeof(bk), "bind%d", g);
    store.putString(bk, bindTarget[g - 1]);
    publishBindings();
    cv.publishStateNow();
    return;
  }

  /*
   * Join a home: {action:"homekey", key:"<64 hex chars>"}.
   *
   * The local bus is only as trustworthy as the fact that every board on it
   * was put there by the owner, so the key arrives the one way that is already
   * authenticated — down the device's own MQTT topic, from the control plane
   * that knows which home this board belongs to. Nothing is accepted over the
   * air, which is what stops a neighbour's board from talking its way in.
   *
   * Applied on the next boot rather than live: bringing ESP-NOW up and down
   * underneath a running link is the kind of thing that half-works, and a
   * switchboard is not the place to find out. The reboot is announced first so
   * the app does not read it as a crash.
   */
  if (action == "homekey") {
    const char *hex = p["key"] | "";
    uint8_t key[CV_HOME_KEY_BYTES];
    if (!cvHomeKeyFromHex(hex, key)) {
      cv.set("homeLink", "bad key");
      cv.publishStateNow();
      return;
    }
    store.putBytes("homekey", key, sizeof(key));
    cv.set("homeLink", "rebooting to join home");
    cv.publishStateNow();
    delay(400);
    ESP.restart();
    return;
  }

  if (action != "set") return;

  // `all` is applied first so a command carrying both still lets the named
  // gang win, instead of the result depending on JSON key order.
  if (p["all"].is<bool>()) applyAll(p["all"].as<bool>());

  for (int i = 0; i < NUM_GANG; i++) {
    char k[3];
    gangKey(i, k);
    if (p[k].is<bool>()) setRelay(i, p[k].as<bool>());
  }

  if (p["backlight"].is<int>()) {
    backlight = constrain(p["backlight"].as<int>(), 0, 100);
    store.putInt("bl", backlight);
    applyBacklight();
    cv.set("backlight", backlight);
  }

  /*
   * A scene sent to this board is relayed to the flat over the local bus.
   *
   * "All off" at the front door is the most-used cross-board action there is,
   * and it used to reach the other rooms only by way of the cloud fanning it
   * out — so it was also the first thing to stop working when the broadband
   * did, at night, with somebody standing at the door.
   */
  if (homeLinkUp && p["scene"].is<const char *>()) {
    home.sendScene(p["scene"].as<const char *>());
  }

  cv.publishStateNow();
}

/** The current bindings, so the app can show what each pad is wired to. */
void publishBindings() {
  for (int i = 0; i < NUM_GANG; i++) {
    char bk[6];
    snprintf(bk, sizeof(bk), "bind%d", i + 1);
    cv.set(bk, bindTarget[i]);
  }
}

void calibrateTouch() {
  for (int i = 0; i < NUM_GANG; i++) {
    long acc = 0;
    for (int s = 0; s < 16; s++) { acc += touchRead(TOUCH_PIN[i]); delay(5); }
    touchBase[i] = (int)(acc / 16);
  }
  lastTouchRecal = millis();
}

void pollTouch() {
  uint32_t now = millis();
  if (now - lastTouchAt < TOUCH_DEBOUNCE_MS) return;

  for (int i = 0; i < NUM_GANG; i++) {
    int v = touchRead(TOUCH_PIN[i]);
    if (touchBase[i] > 0 && v < touchBase[i] * TOUCH_TRIGGER) {
      pressGang(i);                  // honours a binding; falls back to our relay
      lastTouchAt = now;
      return;                        // one pad per pass; a palm is not 8 taps
    }
  }

  /*
   * Capacitance drifts with temperature and humidity, which is the entire
   * working life of a panel screwed to a wall. Re-baseline periodically, and
   * only on a pass where nothing read as touched — otherwise a resting hand
   * gets absorbed into the baseline and that pad goes dead until it moves.
   */
  if (now - lastTouchRecal > TOUCH_RECAL_MS) calibrateTouch();
}

void setup() {
  Serial.begin(115200);

  for (int i = 0; i < NUM_GANG; i++) cvRelayInit(RELAY_PIN[i]);
  pinMode(BACKLIGHT_PIN, OUTPUT);
  pinMode(HLW_CF, INPUT);
  pinMode(HLW_CF1, INPUT);
  pinMode(HLW_SEL, OUTPUT);
  digitalWrite(HLW_SEL, HIGH);
  attachInterrupt(digitalPinToInterrupt(HLW_CF), onCF, FALLING);
  attachInterrupt(digitalPinToInterrupt(HLW_CF1), onCF1, FALLING);

  store.begin("tb8", false);
  backlight = store.getInt("bl", backlight);
  for (int i = 0; i < NUM_GANG; i++) {
    char k[3];
    gangKey(i, k);
    relay[i] = store.getBool(k, false);
    savedRelay[i] = relay[i];
  }
  kwh = store.getDouble("kwh", 0);
  for (int i = 0; i < NUM_GANG; i++) {
    char bk[6];
    snprintf(bk, sizeof(bk), "bind%d", i + 1);
    String t = store.getString(bk, "");
    strncpy(bindTarget[i], t.c_str(), sizeof(bindTarget[0]) - 1);
  }
  applyBacklight();
  calibrateTouch();

  /*
   * Restoring eight gangs after a power cut is the worst inrush this board
   * ever sees: every load that was on comes back at once, onto a supply that
   * is itself still settling. Staggered for the same reason as applyAll(), and
   * driven straight to the pins because cv.set() has nowhere to publish yet.
   */
  for (int i = 0; i < NUM_GANG; i++) {
    cvRelayWrite(RELAY_PIN[i], relay[i]);
    if (relay[i] && i < NUM_GANG - 1) delay(RELAY_STAGGER_MS);
  }

  cv.onCommand(onCommand);
  cv.setInterval(6000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();

  startHomeLink();

  /*
   * Published so the console and the app lay out the number of controls this
   * board actually has, rather than assuming a fixed size. A UI that guesses
   * is how a gang ends up either missing or present-but-dead.
   */
  cv.set("gangs", NUM_GANG);
  cv.set("pads", NUM_GANG);
  cv.set("backlight", backlight);
  publishBindings();
  for (int i = 0; i < NUM_GANG; i++) {
    char k[3];
    gangKey(i, k);
    cv.set(k, relay[i]);
  }
}

/**
 * Bring up the local bus and say what it should do when other boards talk.
 *
 * The home key is provisioned alongside the device identity. Without one the
 * board simply has no local bus — it still works through the cloud, which is
 * the right way round: a missing key must not mean an unauthenticated bus that
 * anybody in the stairwell can drive.
 */
void startHomeLink() {
  uint8_t key[CV_HOME_KEY_BYTES];
  size_t n = store.getBytes("homekey", key, sizeof(key));
  if (n != sizeof(key)) {
    Serial.println("[CVHOME] no home key provisioned — local bus disabled");
    cv.set("homeLink", "unprovisioned");
    return;
  }

  home.begin(cv.deviceId().c_str(), key);
  homeLinkUp = home.up();
  cv.set("homeLink", homeLinkUp ? "up" : "failed");
  if (!homeLinkUp) return;

  // Another board asked us to switch something of ours.
  home.onCommand([](const char *field, int32_t value, const char *) {
    for (int i = 0; i < NUM_GANG; i++) {
      char k[3];
      gangKey(i, k);
      if (strcmp(k, field) == 0) {
        setRelay(i, value != 0);
        cv.publishStateNow();
        return;
      }
    }
  });

  /*
   * Scenes are applied locally, which is what makes them survive an outage.
   *
   * Only the two that are unambiguous for a switchboard. A scene this board
   * does not understand is ignored rather than guessed at — a pad inventing an
   * interpretation of "movie" would switch somebody's room on its own.
   */
  home.onScene([](const char *scene) {
    if (!strcmp(scene, "all-off") || !strcmp(scene, "away") || !strcmp(scene, "night")) {
      applyAll(false);
      cv.publishStateNow();
    } else if (!strcmp(scene, "all-on")) {
      applyAll(true);
      cv.publishStateNow();
    }
  });
}

void readMeter() {
  uint32_t now = millis();
  uint32_t win = now - lastMeter;
  if (win < 1000) return;
  noInterrupts();
  uint32_t cf = cfCount, cf1 = cf1Count;
  cfCount = 0; cf1Count = 0;
  interrupts();
  lastMeter = now;

  double cfHz  = (cf  * 1000.0) / win;
  double cf1Hz = (cf1 * 1000.0) / win;
  watts = cfHz * PWR_MULT;
  if (selCurrent) {
    amps = cf1Hz * CUR_MULT;
  } else {
    volts = cf1Hz * VOL_MULT;
    /*
     * Whether the voltage is a reading or a guess.
     *
     * This used to say `if (volts < 1) volts = 230.0;` — "nominal until the
     * first V sample". The comment was true of the first few seconds and false
     * forever after: a board whose voltage sense had failed reported exactly
     * 230.0 for the rest of its life, and because the published power factor
     * is watts / (volts x amps), the fabricated number quietly corrupted that
     * too. A meter that invents a reading is worse than one that admits it
     * cannot take it. See Docs/31-metering.md, where the same trap cost more.
     */
    voltsMeasured = (volts > 1.0);
  }
  digitalWrite(HLW_SEL, selCurrent ? LOW : HIGH);   // alternate the CF1 measurement
  selCurrent = !selCurrent;

  /*
   * Power factor needs both a load and a voltage worth dividing by. When
   * either goes, pf is cleared rather than left holding its last value —
   * a stale 0.98 on a board that has stopped measuring is indistinguishable
   * from a healthy one.
   */
  const double vForPf = voltsMeasured ? volts : 0.0;
  if (watts > 1 && vForPf * amps > 1) {
    pf = watts / (vForPf * amps);
    if (pf > 1) pf = 1;
    if (pf < 0) pf = 0;
  } else {
    pf = 0;
  }

  kwh += watts * (win / 3600000000.0);              // W * hours -> Wh, /1000 -> kWh
  static uint32_t lastSave = 0;
  if (now - lastSave > 60000) { store.putDouble("kwh", kwh); lastSave = now; }
}

void loop() {
  pollTouch();
  readMeter();

  if (homeLinkUp) {
    home.loop(cv.online());
    // Reported so a flat that has quietly stopped talking to itself is visible
    // in the app, rather than only showing up as switches that do nothing.
    cv.set("homePeers", home.livePeers());
  }

  /*
   * Metering on a cadence.
   *
   * Every one of these is a float derived from a pulse count, so all five
   * changed on each meter window — and CircuventDevice republishes whenever
   * state is dirty and _minGap has elapsed. A switchboard was therefore
   * emitting a state message, and a database row, every second of its life:
   * around 86,000 a day, per board, for numbers nobody reads at that
   * resolution. A tap on a pad still publishes immediately, because that is
   * somebody standing at the wall waiting for a light.
   */
  static uint32_t lastMeterPub = 0;
  if (millis() - lastMeterPub >= 15000UL) {
    lastMeterPub = millis();
    cv.set("watts", (float)watts);
    cv.set("amps", (float)amps);
    cv.set("pf", (float)pf);
    cv.set("kwh", (float)kwh);
    /*
     * The voltage is published only when it was actually measured, alongside
     * the flag that says so. A console drawing 230 V from a board that cannot
     * see the mains is the reason this exists.
     */
    cv.set("voltsMeasured", voltsMeasured);
    if (voltsMeasured) cv.set("volts", (float)volts);
  }

  cv.loop();
}
