/*
 * Circuvent Configurable Switchboard — ESP32
 * ==========================================
 *
 * One firmware for every board we build. How many gangs, which pins drive
 * which relay, whether each gang has a capacitive pad, a retrofitted rocker
 * switch or no local control at all — none of it is compiled in. It is
 * commissioned on site by the engineer who made the board, stored in NVS, and
 * published so the apps draw exactly the wall that exists.
 *
 *
 * WHY THIS REPLACES A SKETCH PER SHAPE
 *
 * `touchboard` and `touchboard-8` are the same firmware written twice, because
 * the gang count and pin map were `#define`s. Every new shape a customer asked
 * for — five gangs, three pads and two rockers, a relay in a ceiling void with
 * no switch near it — meant another file to keep in step with the other two,
 * and the fleet ended up with three builds that had drifted.
 *
 *
 * AND WHAT IT COSTS
 *
 * A fixed sketch has its pin map checked by the compiler: touchboard-8 refuses
 * to *build* if a pad lands on GPIO12. Here the pin map arrives as data, from
 * a person on a ladder, over an app — so the same rules have to be enforced at
 * runtime, by this file, and the board has to refuse a layout that would harm
 * it rather than accept it and die later inside a wall.
 *
 * That refusal is the most important code in this sketch. A board commissioned
 * onto GPIO12 works perfectly on the bench, goes into the plaster, and never
 * boots again after the first power cut — with nothing in any log, and no way
 * to reach it. The app and the control plane check the same rules first; this
 * is the copy that is certainly present.
 *
 *
 * LOCAL FIRST, AND PEER TO PEER
 *
 * A pad switches its own relay whether or not anything else is working. A pad
 * can also be bound to a gang on another board — the hall switch that kills the
 * bedroom lights — over the encrypted ESP-NOW bus in CvHomeLink, so that keeps
 * working with the broadband down, which is when somebody is most likely to be
 * standing at a switch wondering why it stopped.
 */
/* Version history
 *   1.0.0  first build. Replaces the per-shape sketches: channel count, pin
 *          map, input kind and restore policy are all commissioned rather than
 *          compiled, with the pin-safety rules that touchboard-8 enforces at
 *          build time enforced here at runtime instead.
 */
#define CV_FW_VERSION "1.0.0"
#include <CircuventDevice.h>
#include <CvHomeLink.h>
#include <Preferences.h>
#include "switchboard_types.h"

#define BACKLIGHT_PIN 25
#define RELAY_STAGGER_MS 25

/* ------------------------------------------------------------------ */
/* Pin safety — the same rules as src/lib/switchboard.ts               */
/* ------------------------------------------------------------------ */

static bool isFlashPin(int p)     { return p >= 6 && p <= 11; }
static bool isInputOnly(int p)    { return p >= 34 && p <= 39; }
static bool isTouchPin(int p) {
  return p == 4 || p == 2 || p == 15 || p == 13 || p == 14 || p == 27 || p == 33 || p == 32;
}

/**
 * Whether a commissioned pin may be used for a given job.
 *
 * Refusals only — the warnings the app shows (GPIO5's boot strap, a missing
 * pull-up on an input-only pin) are advice for a person, and a board has no
 * way to act on advice. What it can do is decline to destroy itself.
 */
static bool pinAllowed(int p, PinUse use) {
  if (p < 0 || p > 39) return false;
  if (isFlashPin(p)) return false;      /* wired to the flash we execute from */
  if (p == 12) return false;            /* MTDI: high at reset = 1.8V flash = never boots */
  if (p == 0) return false;             /* BOOT strap and the reset button */
  if (use == USE_RELAY && isInputOnly(p)) return false;  /* accepts OUTPUT, does nothing */
  if (use == USE_TOUCH && !isTouchPin(p)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* The commissioned layout                                             */
/* ------------------------------------------------------------------ */

Channel ch[CV_SWB_MAX_CH];
int chCount = 0;
bool layoutValid = false;
char layoutError[80] = "";

CircuventDevice cv("switchboard");
Preferences store;
CvHomeLink home;
bool homeLinkUp = false;

bool relayOn[CV_SWB_MAX_CH];
bool savedRelay[CV_SWB_MAX_CH];
int  touchBase[CV_SWB_MAX_CH];
bool btnWas[CV_SWB_MAX_CH];
char bindTarget[CV_SWB_MAX_CH][CV_HOME_FIELD_LEN * 2] = {{0}};

int backlight = 0;

/* Identify: blink one channel's load so an engineer on a ladder can see which
   one it is. Non-blocking, and it always leaves the channel as it found it. */
int identifyCh = -1;
uint8_t identifyLeft = 0;
uint32_t identifyNext = 0;
bool identifyRestore = false;

#define TOUCH_TRIGGER     0.6
#define TOUCH_DEBOUNCE_MS 250
#define TOUCH_RECAL_MS    (5UL * 60UL * 1000UL)
uint32_t lastTouchAt = 0, lastTouchRecal = 0;

void calibrateTouch();
void publishLayout();
void startHomeLink();

/** NVS key and state field for a channel: "g1".."g8". */
static inline void gangKey(int i, char *out) {
  out[0] = 'g';
  out[1] = (char)('1' + i);
  out[2] = 0;
}

/* ------------------------------------------------------------------ */
/* Parsing and validating a layout                                     */
/* ------------------------------------------------------------------ */

/**
 * Reads "relay:input:kind:restore:type:name;..." into `ch`.
 *
 * Written into a scratch array and only committed if the whole thing is safe,
 * so a bad layout cannot leave the board half-configured — half a switchboard
 * is worse than none, because the gangs that do work make it look commissioned.
 */
static bool parseLayout(const String &blob, Channel *out, int &count, char *err, size_t errCap) {
  count = 0;
  int from = 0;
  while (from < (int)blob.length() && count < CV_SWB_MAX_CH) {
    int semi = blob.indexOf(';', from);
    if (semi < 0) semi = blob.length();
    String one = blob.substring(from, semi);
    from = semi + 1;
    if (one.length() == 0) continue;

    Channel c;
    memset(&c, 0, sizeof(c));
    int f1 = one.indexOf(':');
    int f2 = one.indexOf(':', f1 + 1);
    int f3 = one.indexOf(':', f2 + 1);
    int f4 = one.indexOf(':', f3 + 1);
    int f5 = one.indexOf(':', f4 + 1);
    if (f1 < 0 || f2 < 0 || f3 < 0 || f4 < 0 || f5 < 0) {
      snprintf(err, errCap, "channel %d is malformed", count + 1);
      return false;
    }
    c.relayPin = (int8_t)one.substring(0, f1).toInt();
    c.inputPin = (int8_t)one.substring(f1 + 1, f2).toInt();
    const char k = one.charAt(f2 + 1);
    c.input = (k == 't') ? IN_TOUCH : (k == 'b') ? IN_BUTTON : IN_NONE;
    c.restoreLast = (one.charAt(f3 + 1) == 'l');
    c.kind = one.charAt(f4 + 1);
    strlcpy(c.name, one.substring(f5 + 1).c_str(), CV_SWB_NAME_LEN);

    if (!pinAllowed(c.relayPin, USE_RELAY)) {
      snprintf(err, errCap, "GPIO%d cannot drive a relay (channel %d)", c.relayPin, count + 1);
      return false;
    }
    if (c.input != IN_NONE) {
      if (!pinAllowed(c.inputPin, c.input == IN_TOUCH ? USE_TOUCH : USE_INPUT)) {
        snprintf(err, errCap, "GPIO%d cannot be that input (channel %d)", c.inputPin, count + 1);
        return false;
      }
    }
    out[count++] = c;
  }

  if (count == 0) {
    snprintf(err, errCap, "no channels");
    return false;
  }

  /*
   * Two jobs on one pin is the fault that looks like a haunted house — a pad
   * that switches two things, or a relay reading its own output as a press.
   */
  for (int i = 0; i < count; i++) {
    for (int j = i + 1; j < count; j++) {
      if (out[i].relayPin == out[j].relayPin) {
        snprintf(err, errCap, "GPIO%d is on two relays", out[i].relayPin);
        return false;
      }
    }
    for (int j = 0; j < count; j++) {
      if (out[i].input != IN_NONE && out[i].inputPin == out[j].relayPin) {
        snprintf(err, errCap, "GPIO%d is both an input and a relay", out[i].inputPin);
        return false;
      }
      if (i != j && out[i].input != IN_NONE && out[j].input != IN_NONE &&
          out[i].inputPin == out[j].inputPin) {
        snprintf(err, errCap, "GPIO%d is on two inputs", out[i].inputPin);
        return false;
      }
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Driving                                                             */
/* ------------------------------------------------------------------ */

void setRelay(int i, bool on, bool persist = true) {
  if (i < 0 || i >= chCount) return;
  relayOn[i] = on;
  cvRelayWrite(ch[i].relayPin, on);
  char k[3];
  gangKey(i, k);
  cv.set(k, on);
  if (persist && on != savedRelay[i]) {
    store.putBool(k, on);
    savedRelay[i] = on;
  }
  if (homeLinkUp) home.publishState(k, on ? 1 : 0);
}

/**
 * Switch everything, one coil at a time.
 *
 * Eight relay coils energising on the same millisecond is roughly half an amp
 * arriving at once, before the contacts even close on their loads. That sags
 * the rail the ESP32 runs on, and the reboot lands on the "all on" press —
 * which makes it look like that button is the broken thing.
 */
void applyAll(bool on) {
  for (int i = 0; i < chCount; i++) {
    setRelay(i, on);
    if (i < chCount - 1) delay(RELAY_STAGGER_MS);
  }
}

/** A pad or button press: drives a bound peer if there is one, else our relay. */
void pressChannel(int i) {
  if (homeLinkUp && bindTarget[i][0]) {
    char peer[CV_HOME_ID_LEN], field[CV_HOME_FIELD_LEN];
    if (cvHomeSplitTarget(bindTarget[i], peer, sizeof(peer), field, sizeof(field))) {
      /* The bound gang tracks what it last asked for, so the pad's own
         indicator still means something to whoever is standing at it. */
      relayOn[i] = !relayOn[i];
      home.sendCommand(peer, field, relayOn[i] ? 1 : 0);
      char k[3];
      gangKey(i, k);
      cv.set(k, relayOn[i]);
      cv.publishStateNow();
      return;
    }
  }
  setRelay(i, !relayOn[i]);
  cv.publishStateNow();
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

void publishLayout() {
  cv.set("gangs", chCount);
  cv.set("layoutOk", layoutValid);
  cv.set("layoutError", layoutError);
  cv.set("backlight", backlight);
  for (int i = 0; i < chCount; i++) {
    char nk[6], kk[6];
    snprintf(nk, sizeof(nk), "n%d", i + 1);
    snprintf(kk, sizeof(kk), "k%d", i + 1);
    cv.set(nk, ch[i].name);
    char kind[2] = { ch[i].kind ? ch[i].kind : 'o', 0 };
    cv.set(kk, kind);
    char bk[6];
    snprintf(bk, sizeof(bk), "bind%d", i + 1);
    cv.set(bk, bindTarget[i]);
  }
}

void applyLayoutFromStore() {
  String blob = store.getString("layout", "");
  Channel scratch[CV_SWB_MAX_CH];
  int n = 0;
  char err[80] = "";

  if (blob.length() == 0) {
    layoutValid = false;
    chCount = 0;
    strlcpy(layoutError, "not commissioned", sizeof(layoutError));
    return;
  }
  if (!parseLayout(blob, scratch, n, err, sizeof(err))) {
    /*
     * Refused, and the board stays uncommissioned rather than partly wired.
     * The reason is published so the engineer sees it on the spot instead of
     * discovering a dead gang after the covers are back on.
     */
    layoutValid = false;
    chCount = 0;
    strlcpy(layoutError, err, sizeof(layoutError));
    return;
  }

  memcpy(ch, scratch, sizeof(Channel) * n);
  chCount = n;
  layoutValid = true;
  layoutError[0] = 0;
}

void onCommand(const String &action, JsonObjectConst p) {
  /*
   * Commissioning. The engineer's app sends the whole layout as one string;
   * it is validated before anything is written, and the board reboots into it
   * so every pin starts from a known state rather than being re-purposed
   * underneath a running sketch.
   */
  if (action == "commission") {
    if (!p["layout"].is<const char *>()) return;
    String blob = String(p["layout"].as<const char *>());
    Channel scratch[CV_SWB_MAX_CH];
    int n = 0;
    char err[80] = "";
    if (!parseLayout(blob, scratch, n, err, sizeof(err))) {
      cv.set("layoutOk", false);
      cv.set("layoutError", err);
      cv.publishStateNow();
      return;
    }
    store.putString("layout", blob);
    if (p["backlight"].is<int>()) store.putInt("bl", constrain(p["backlight"].as<int>(), 0, 100));
    cv.set("layoutOk", true);
    cv.set("layoutError", "");
    cv.set("commissioned", true);
    cv.publishStateNow();
    delay(400);
    ESP.restart();
    return;
  }

  /*
   * Identify — blink one channel's load.
   *
   * The single most useful thing on a commissioning app. An engineer at the
   * board cannot tell which relay is the porch light without switching it and
   * walking outside; this flashes it a few times so somebody can call up the
   * stairs. It restores whatever the channel was doing.
   */
  if (action == "identify") {
    int g = p["gang"] | 0;
    if (g < 1 || g > chCount) return;
    identifyCh = g - 1;
    identifyRestore = relayOn[identifyCh];
    identifyLeft = 6;
    identifyNext = 0;
    return;
  }

  if (action == "bind") {
    int g = p["gang"] | 0;
    if (g < 1 || g > chCount) return;
    const char *t = p["target"] | "";
    strlcpy(bindTarget[g - 1], t, sizeof(bindTarget[0]));
    char bk[6];
    snprintf(bk, sizeof(bk), "bind%d", g);
    store.putString(bk, bindTarget[g - 1]);
    publishLayout();
    cv.publishStateNow();
    return;
  }

  if (action == "recalibrateTouch") { calibrateTouch(); return; }

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

  /* `all` first, so a command carrying both still lets a named gang win rather
     than the result depending on JSON key order. */
  if (p["all"].is<bool>()) applyAll(p["all"].as<bool>());

  for (int i = 0; i < chCount; i++) {
    char k[3];
    gangKey(i, k);
    if (p[k].is<bool>()) setRelay(i, p[k].as<bool>());
  }

  if (p["backlight"].is<int>()) {
    backlight = constrain(p["backlight"].as<int>(), 0, 100);
    store.putInt("bl", backlight);
    analogWrite(BACKLIGHT_PIN, map(backlight, 0, 100, 0, 255));
    cv.set("backlight", backlight);
  }

  if (homeLinkUp && p["scene"].is<const char *>()) home.sendScene(p["scene"].as<const char *>());

  cv.publishStateNow();
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

void calibrateTouch() {
  for (int i = 0; i < chCount; i++) {
    if (ch[i].input != IN_TOUCH) { touchBase[i] = 0; continue; }
    long acc = 0;
    for (int s = 0; s < 16; s++) { acc += touchRead(ch[i].inputPin); delay(5); }
    touchBase[i] = (int)(acc / 16);
  }
  lastTouchRecal = millis();
}

void pollInputs() {
  const uint32_t now = millis();

  /* Buttons are edge-triggered. A level test with a rate limit is not "on
     press", it is "repeatedly while held". */
  for (int i = 0; i < chCount; i++) {
    if (ch[i].input != IN_BUTTON) continue;
    const bool down = digitalRead(ch[i].inputPin) == LOW;
    if (down && btnWas[i]) pressChannel(i);
    btnWas[i] = !down;
  }

  if (now - lastTouchAt < TOUCH_DEBOUNCE_MS) return;
  for (int i = 0; i < chCount; i++) {
    if (ch[i].input != IN_TOUCH || touchBase[i] <= 0) continue;
    const int v = touchRead(ch[i].inputPin);
    if (v < touchBase[i] * TOUCH_TRIGGER) {
      pressChannel(i);
      lastTouchAt = now;
      return;                 /* one pad per pass; a palm is not eight taps */
    }
  }

  /*
   * Capacitance drifts with temperature and humidity, which is the whole
   * working life of a panel screwed to a wall. Re-baseline only on a pass
   * where nothing read as touched, or a resting hand gets absorbed into the
   * baseline and that pad goes dead until it moves.
   */
  if (now - lastTouchRecal > TOUCH_RECAL_MS) calibrateTouch();
}

void stepIdentify() {
  if (identifyCh < 0) return;
  const uint32_t now = millis();
  if ((int32_t)(now - identifyNext) < 0) return;
  identifyNext = now + 400;
  if (identifyLeft == 0) {
    cvRelayWrite(ch[identifyCh].relayPin, identifyRestore);
    relayOn[identifyCh] = identifyRestore;
    identifyCh = -1;
    return;
  }
  identifyLeft--;
  cvRelayWrite(ch[identifyCh].relayPin, (identifyLeft % 2) == 1);
}

/* ------------------------------------------------------------------ */

void setup() {
  Serial.begin(115200);

  store.begin("swb", false);
  backlight = store.getInt("bl", 0);
  applyLayoutFromStore();

  /*
   * Claim the pins only once the layout has been accepted.
   *
   * An uncommissioned or refused board drives nothing at all — which is the
   * safe state, and the one that makes a bad layout obvious rather than
   * partly working.
   */
  if (layoutValid) {
    for (int i = 0; i < chCount; i++) {
      cvRelayInit(ch[i].relayPin);
      if (ch[i].input == IN_BUTTON) {
        pinMode(ch[i].inputPin, INPUT_PULLUP);
        btnWas[i] = true;
      }
      char k[3];
      gangKey(i, k);
      relayOn[i] = ch[i].restoreLast ? store.getBool(k, false) : false;
      savedRelay[i] = relayOn[i];
      char bk[6];
      snprintf(bk, sizeof(bk), "bind%d", i + 1);
      String t = store.getString(bk, "");
      strlcpy(bindTarget[i], t.c_str(), sizeof(bindTarget[0]));
    }
    pinMode(BACKLIGHT_PIN, OUTPUT);
    analogWrite(BACKLIGHT_PIN, map(backlight, 0, 100, 0, 255));
    calibrateTouch();

    /*
     * Restoring after a power cut is the worst inrush this board sees: every
     * load that was on comes back at once, onto a supply that is itself still
     * settling. Staggered for the same reason applyAll() is, and written
     * straight to the pins because cv.set() has nowhere to publish yet.
     */
    for (int i = 0; i < chCount; i++) {
      cvRelayWrite(ch[i].relayPin, relayOn[i]);
      if (relayOn[i] && i < chCount - 1) delay(RELAY_STAGGER_MS);
    }
  }

  cv.onCommand(onCommand);
  cv.setInterval(6000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();

  startHomeLink();

  publishLayout();
  for (int i = 0; i < chCount; i++) {
    char k[3];
    gangKey(i, k);
    cv.set(k, relayOn[i]);
  }
}

void startHomeLink() {
  uint8_t key[CV_HOME_KEY_BYTES];
  size_t n = store.getBytes("homekey", key, sizeof(key));
  if (n != sizeof(key)) {
    /* No key means no local bus, which is the right way round: a missing key
       must not mean an unauthenticated bus anybody in the stairwell can drive. */
    cv.set("homeLink", "unprovisioned");
    return;
  }
  home.begin(cv.deviceId().c_str(), key);
  homeLinkUp = home.up();
  cv.set("homeLink", homeLinkUp ? "up" : "failed");
  if (!homeLinkUp) return;

  home.onCommand([](const char *field, int32_t value, const char *) {
    for (int i = 0; i < chCount; i++) {
      char k[3];
      gangKey(i, k);
      if (strcmp(k, field) == 0) {
        setRelay(i, value != 0);
        cv.publishStateNow();
        return;
      }
    }
  });

  /* Only the scenes that are unambiguous for a switchboard. One it does not
     understand is ignored rather than guessed at — a board inventing an
     interpretation of "movie" would switch somebody's room on its own. */
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

void loop() {
  if (layoutValid) {
    pollInputs();
    stepIdentify();
  }

  if (homeLinkUp) {
    home.loop(cv.online());
    cv.set("homePeers", home.livePeers());
  }

  cv.loop();
}
