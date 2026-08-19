/*
 * Circuvent RFID Gate — UHF Vehicle Access Controller (ESP32)
 * ===========================================================
 *
 * A long-range UHF reader on the driveway scans windshield tags over Wiegand
 * and drives a motorised barrier. Authorised tags live in NVS so the gate keeps
 * working when the network does not; the platform keeps the list current,
 * records who came and went, and issues time-boxed guest passes.
 *
 *
 * FOUR THINGS THAT WERE WRONG, AND WHY EACH ONE MATTERED
 *
 * 1. BOTH RELAYS WERE ENERGISED FROM THE MOMENT IT POWERED UP.
 *    The relay boards are opto-isolated and negative-trigger: pulling the GPIO
 *    low energises the coil. This sketch used bare pinMode(OUTPUT) — which
 *    leaves the latch low — and then treated HIGH as "on". So at boot the gate
 *    controller was handed a continuous OPEN *and* CLOSE, and every "pulse"
 *    actually released the relay for 600 ms rather than closing it. The library
 *    has cvRelayInit/cvRelayWrite for exactly this and they were not used.
 *
 * 2. A NOISY FRAME COULD OPEN THE BARRIER.
 *    Wiegand is a pair of open-drain lines run tens of metres up a driveway,
 *    and the format carries two parity bits precisely because that run picks up
 *    noise. Nothing checked them. Worse, anything between 24 and 37 bits was
 *    accepted and masked down to its low 24 — so a corrupted read did not fail,
 *    it silently became a *different card number*. Usually that number is in
 *    nobody's list and a valid tag appears to be rejected; occasionally it is
 *    in somebody's.
 *
 * 3. A PARKED CAR FLOODED THE PLATFORM.
 *    A UHF reader sees a windshield tag continuously while it is in range, many
 *    times a second. Every read published state and wrote a telemetry row, and
 *    re-armed the auto-close timer — so one car idling at the gate produced
 *    thousands of database rows and a barrier that would not close.
 *
 * 4. THE BARRIER'S POSITION WAS A BELIEF, NOT A MEASUREMENT.
 *    OPEN_LIMIT is wired, and was configured as an input, and then never read.
 *    A barrier whose motor has jammed or lost power reports "open" with total
 *    confidence, and the app, the automations and the guest-pass flow all
 *    believe it.
 */
/* Version history
 *   1.0.0  initial
 *   1.1.0  OTA, from CircuventDevice.
 *   1.2.0  A close command no longer opens the barrier. The force-close called
 *          openGate() to fix a stale flag, and on a closed gate that pulses the
 *          OPEN relay — then left it open if a vehicle was on the loop
 *          detector.
 *   1.3.0  The manual button no longer fights the reset gesture. BTN_PIN is
 *          GPIO0, the pin setResetButton(0) also watches, and the test was
 *          level-triggered — so holding BOOT to factory reset commanded
 *          open/close about thirteen times in a row, reversing a barrier motor
 *          under load every 600 ms.
 *   2.0.0  The relays are driven correctly. They were bare GPIO writes with
 *          HIGH meaning "on", on boards where LOW energises the coil: both the
 *          OPEN and CLOSE relays were held on from power-up, and every pulse
 *          was inverted. Now cvRelayInit/cvRelayWrite, which also means the
 *          barrier is not commanded during the first moments of boot.
 *
 *          Wiegand frames are validated. 26-bit parity is checked and 34-bit
 *          is decoded properly; anything else is counted and discarded instead
 *          of being masked into a plausible-looking card number.
 *
 *          The same tag is not re-read every few milliseconds. A car sitting in
 *          range used to generate a telemetry row per read and hold the barrier
 *          open indefinitely.
 *
 *          The open limit switch is read, so `barrier` reports what the gate is
 *          actually doing — including refusing to move, which nothing could
 *          previously detect.
 */
#define CV_FW_VERSION "2.0.0"
#include <CircuventDevice.h>
#include <Preferences.h>

// ---- pins ----
#define WIEGAND_D0   16   // green
#define WIEGAND_D1   17   // white
#define OPEN_RELAY   26   // momentary -> gate controller "open"
#define CLOSE_RELAY  27   // momentary -> gate controller "close"
#define OPEN_LIMIT   34   // limit switch: gate fully open (input-only)
#define LOOP_DETECT  35   // inductive loop / IR beam: vehicle present (input-only)
#define LED_PIN       2
#define BTN_PIN       0

/* ------------------------------------------------------------------ */
/* Wiegand                                                             */
/* ------------------------------------------------------------------ */

volatile uint64_t wgData = 0;
volatile int wgBits = 0;
volatile uint32_t wgLast = 0;

void IRAM_ATTR onD0() { wgData <<= 1; wgBits++; wgLast = millis(); }
void IRAM_ATTR onD1() { wgData = (wgData << 1) | 1ULL; wgBits++; wgLast = millis(); }

CircuventDevice cv("rfid-gate");
Preferences store;
CvTapButton btn;

String allow = "";           // "12345,67890,..."
int  autoCloseSec = 20;
bool autoMode = true;
bool barrierOpen = false;    // what we have commanded
long scanCount = 0;
long badFrames = 0;          // frames rejected by parity or length
uint32_t openedAt = 0, pulseUntil = 0;
int pulsingRelay = -1;

unsigned long lastTag = 0;
bool lastAllowed = false;
uint32_t lastTagAt = 0;

/*
 * How long the same tag is ignored after it has been read.
 *
 * A UHF reader sees a windshield tag continuously while it is in range — many
 * reads a second, for as long as the car is there. Without this every one of
 * them published state and wrote a telemetry row, and re-armed the auto-close
 * so the barrier stayed open until the car left the reader's field rather than
 * until it had passed through.
 *
 * Five seconds is longer than a car takes to clear a barrier and far shorter
 * than a second, deliberate presentation of the same tag.
 */
#define SAME_TAG_QUIET_MS 5000UL

/* ------------------------------------------------------------------ */
/* Allow-list                                                          */
/* ------------------------------------------------------------------ */

bool isAllowed(unsigned long tag) {
  String needle = "," + String(tag) + ",";
  String hay = "," + allow + ",";
  return hay.indexOf(needle) >= 0;
}
void addTag(unsigned long tag) {
  if (isAllowed(tag)) return;
  if (allow.length()) allow += ",";
  allow += String(tag);
  store.putString("tags", allow);
}
void removeTag(unsigned long tag) {
  String hay = "," + allow + ",";
  hay.replace("," + String(tag) + ",", ",");
  hay.trim();
  while (hay.startsWith(",")) hay = hay.substring(1);
  while (hay.endsWith(",")) hay = hay.substring(0, hay.length() - 1);
  allow = hay;
  store.putString("tags", allow);
}

int tagCount() {
  if (!allow.length()) return 0;
  int n = 1;
  for (unsigned int i = 0; i < allow.length(); i++) if (allow[i] == ',') n++;
  return n;
}

/* ------------------------------------------------------------------ */
/* Barrier                                                             */
/* ------------------------------------------------------------------ */

/** True when the limit switch says the gate is physically fully open. */
bool limitSaysOpen() {
  return digitalRead(OPEN_LIMIT) == LOW;   // switch closes to ground when made
}

bool vehiclePresent() {
  return digitalRead(LOOP_DETECT) == LOW;
}

void pulse(int relay) {
  cvRelayWrite(relay, true);
  pulsingRelay = relay;
  pulseUntil = millis() + 600;   // 600 ms momentary contact
}

void openGate() {
  /*
   * An already-open gate is not re-pulsed, and — unlike before — its timer is
   * not re-armed either. Re-arming on every read of a tag that is simply
   * sitting in the reader's field is what kept the barrier open for as long as
   * a car was parked near it. The loop detector is the thing that should hold
   * a gate open, because it is the thing that knows a vehicle is underneath it.
   */
  if (barrierOpen) return;
  pulse(OPEN_RELAY);
  barrierOpen = true;
  openedAt = millis();
  digitalWrite(LED_PIN, HIGH);
  cv.publishStateNow();
}

void closeGate() {
  if (!barrierOpen) return;
  if (vehiclePresent()) return;   // vehicle under the gate -> keep open
  pulse(CLOSE_RELAY);
  barrierOpen = false;
  digitalWrite(LED_PIN, LOW);
  cv.publishStateNow();
}

/**
 * Closes the barrier whatever this device believes its state to be.
 *
 * The old force-close was `openGate(); closeGate();` — the intent being to flip
 * `barrierOpen` true so `closeGate()` would not return early on a stale flag.
 * But `openGate()` does not merely set the flag: on a gate this device thinks
 * is shut it takes the pulse branch and physically drives the OPEN relay. So
 * "close" opened the barrier and then closed it again — and with a vehicle on
 * the loop detector, `closeGate()` returned early and the gate was simply left
 * open, with the retained state reading "open".
 *
 * The loop-detector interlock is still honoured. Closing a barrier onto a
 * vehicle is the one outcome worse than leaving it open.
 */
void forceClose() {
  if (vehiclePresent()) return;
  pulse(CLOSE_RELAY);
  barrierOpen = false;
  digitalWrite(LED_PIN, LOW);
  cv.publishStateNow();
}

/**
 * What the barrier is actually doing.
 *
 * `barrierOpen` is what we commanded; the limit switch is what happened. When
 * they disagree for longer than the gate takes to travel, that is worth saying
 * — a jammed motor, a tripped supply or a snapped drive chain all look like a
 * perfectly healthy "open" otherwise, and the guest-pass flow will go on
 * telling visitors the gate is open while they sit in front of it.
 */
#define GATE_TRAVEL_MS 15000UL

const char *barrierState() {
  if (barrierOpen) {
    if (limitSaysOpen()) return "open";
    if (millis() - openedAt < GATE_TRAVEL_MS) return "opening";
    return "jammed";
  }
  /* The limit switch only tells us about the open end, so a gate we have not
     opened is reported as closed unless the switch says otherwise — in which
     case it did not obey a close. */
  return limitSaysOpen() ? "jammed" : "closed";
}

/* ------------------------------------------------------------------ */
/* Scans                                                               */
/* ------------------------------------------------------------------ */

void publishScan(unsigned long tag, bool ok) {
  JsonDocument d;
  d["type"] = "rfid";
  d["tag"] = (long)tag;
  d["allowed"] = ok;
  d["ts"] = (long)(millis() / 1000);
  cv.publishTelemetry(d.as<JsonObjectConst>());
  lastTag = tag;
  lastAllowed = ok;
  lastTagAt = millis();
  scanCount++;
  cv.set("lastTag", (long)tag);
  cv.set("lastAllowed", ok);
  cv.set("scanCount", scanCount);
  cv.publishStateNow();
}

/**
 * Even parity over the first 13 bits, odd over the last 13.
 *
 * This is the whole reason Wiegand-26 carries two spare bits, and it is what
 * separates "the reader saw a card" from "the cable picked up the gate motor
 * starting". Without it a corrupted frame does not fail — it silently becomes a
 * different card number, which is either a valid tag mysteriously refused or,
 * rarely and much worse, somebody else's tag accepted.
 */
bool wiegand26Valid(uint32_t frame) {
  uint8_t evenOnes = 0, oddOnes = 0;
  for (int i = 25; i >= 13; i--) if (frame & (1UL << i)) evenOnes++;   // P0 + first 12 data
  for (int i = 12; i >= 0; i--) if (frame & (1UL << i)) oddOnes++;     // last 12 data + P1
  return (evenOnes % 2 == 0) && (oddOnes % 2 == 1);
}

/** Decodes a completed frame into a card number, or returns false. */
bool decodeFrame(uint64_t data, int bits, unsigned long &card) {
  if (bits == 26) {
    const uint32_t f = (uint32_t)data;
    if (!wiegand26Valid(f)) return false;
    card = (f >> 1) & 0xFFFFFF;          // strip the two parity bits
    return true;
  }
  if (bits == 34) {
    /* HID 34-bit: one parity either end, 32 bits of payload between them. */
    card = (unsigned long)((data >> 1) & 0xFFFFFFFFULL);
    return true;
  }
  /*
   * Anything else is discarded rather than guessed at.
   *
   * The old code accepted any length from 24 to 37 and masked it down to its
   * low 24 bits, which turns a partial or corrupted read into a confident,
   * wrong card number. Counting them is more useful: a gate that is quietly
   * rejecting frames has a cable, a reader or an interference problem, and
   * `badFrames` is the only way anybody would ever find out.
   */
  return false;
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "open" || action == "grantOpen") {
    openGate();
    return;
  }
  if (action == "close") {
    forceClose();
    return;
  }
  /*
   * The whole allow-list, replaced.
   *
   * Adding and removing one tag at a time was fine while the list was edited on
   * the device, and is wrong now the platform owns it: a device that missed a
   * removal — offline, or a dropped message — keeps admitting a vehicle whose
   * access was revoked, and nothing ever notices because the platform believes
   * it sent the removal. Replacing the list makes every sync self-correcting.
   */
  if (action == "setTags") {
    if (p["tags"].is<const char *>()) {
      allow = String(p["tags"].as<const char *>());
      store.putString("tags", allow);
      cv.set("tagCount", tagCount());
      cv.publishStateNow();
    }
    return;
  }
  if (action == "set") {
    if (p["addTag"].is<long>())    addTag((unsigned long)p["addTag"].as<long>());
    if (p["removeTag"].is<long>()) removeTag((unsigned long)p["removeTag"].as<long>());
    if (p["autoCloseSec"].is<int>()) {
      autoCloseSec = constrain(p["autoCloseSec"].as<int>(), 3, 300);
      store.putInt("acs", autoCloseSec);
    }
    if (p["mode"].is<const char *>()) {
      autoMode = String(p["mode"].as<const char *>()) == "auto";
      store.putBool("auto", autoMode);
    }
  }
}

/* ------------------------------------------------------------------ */

void setup() {
  Serial.begin(115200);

  /*
   * Claim the relay pins without commanding the gate.
   *
   * This is the fix for the worst of it: bare pinMode(OUTPUT) leaves the latch
   * low, and low is what energises these boards — so the barrier controller was
   * handed OPEN and CLOSE simultaneously, continuously, from the instant the
   * device powered on.
   */
  cvRelayInit(OPEN_RELAY);
  cvRelayInit(CLOSE_RELAY);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  pinMode(OPEN_LIMIT, INPUT);
  pinMode(LOOP_DETECT, INPUT);
  btn.begin(BTN_PIN);

  pinMode(WIEGAND_D0, INPUT_PULLUP);
  pinMode(WIEGAND_D1, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(WIEGAND_D0), onD0, FALLING);
  attachInterrupt(digitalPinToInterrupt(WIEGAND_D1), onD1, FALLING);

  store.begin("gate", false);
  allow = store.getString("tags", "");
  autoCloseSec = store.getInt("acs", autoCloseSec);
  autoMode = store.getBool("auto", true);

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.setResetButton(0);
  cv.begin();
}

void loop() {
  // end a momentary relay pulse
  if (pulsingRelay >= 0 && (int32_t)(millis() - pulseUntil) >= 0) {
    cvRelayWrite(pulsingRelay, false);
    pulsingRelay = -1;
  }

  // decode a completed Wiegand frame (25 ms idle after the last bit)
  if (wgBits > 0 && millis() - wgLast > 25) {
    noInterrupts();
    uint64_t data = wgData;
    int bits = wgBits;
    wgData = 0;
    wgBits = 0;
    interrupts();

    unsigned long card = 0;
    if (decodeFrame(data, bits, card)) {
      /*
       * A tag that is simply still in range is not a new presentation. Without
       * this the gate published a scan, wrote a telemetry row and re-decided
       * access many times a second for as long as a car was parked nearby.
       */
      const bool repeat = (card == lastTag) && (millis() - lastTagAt < SAME_TAG_QUIET_MS);
      if (!repeat) {
        const bool ok = isAllowed(card);
        publishScan(card, ok);
        if (ok && autoMode) openGate();
      } else {
        lastTagAt = millis();   // still here; keep the quiet window rolling
      }
    } else {
      badFrames++;
      cv.set("badFrames", badFrames);
    }
  }

  // manual button toggles the gate — on release, and only for a tap. A
  // multi-second hold belongs to the Wi-Fi/factory reset gesture on this pin.
  if (btn.tapped()) {
    if (barrierOpen) forceClose(); else openGate();
  }

  // auto-close once the delay has elapsed and nothing is underneath
  if (barrierOpen && autoMode && millis() - openedAt > (uint32_t)autoCloseSec * 1000UL) {
    if (!vehiclePresent()) closeGate();
  }

  /*
   * Telemetry on a cadence.
   *
   * `vehiclePresent` and the barrier state both change on their own, and the
   * library republishes whenever state is dirty and 80 ms have passed — so a
   * car easing over a loop detector, or a bouncing limit switch, would publish
   * continuously. Every one of those is a row in Postgres.
   */
  static uint32_t lastPub = 0;
  if (millis() - lastPub >= 2000UL) {
    lastPub = millis();
    cv.set("barrier", barrierState());
    cv.set("vehiclePresent", vehiclePresent());
    cv.set("mode", autoMode ? "auto" : "manual");
    cv.set("autoCloseSec", autoCloseSec);
    cv.set("tagCount", tagCount());
    cv.set("badFrames", badFrames);
  }

  cv.loop();
}
