/*
 * Circuvent Agri GSM Starter — ESP32 firmware
 *
 * Starts and stops a farm pump from a phone — a missed call or a text, from
 * any handset, with no app and no internet — and from the Circuvent cloud when
 * there is a network. Mains-presence sensing, a restart delay, a maximum
 * runtime, timed irrigation and an optional dry-run cutout.
 *
 * Hardware: SIM800L on UART2, contactor coil on a relay, opto-isolated
 * mains-present input, optional float/flow switch.
 *
 *
 * WHO THIS IS FOR, AND WHY THAT DECIDES EVERYTHING
 *
 * The pump is at the bottom of a field, often kilometres from the house, on a
 * three-phase supply that comes and goes on the electricity board's schedule.
 * The farmer's alternative to this box is a motorbike ride at 2am to see
 * whether the power is back. So:
 *
 *   - it must work with no internet, because there is none;
 *   - it must tell them what actually happened, because they cannot look;
 *   - and it must never damage the pump, because the pump costs more than
 *     everything else here put together and cannot be replaced in a hurry.
 *
 *
 * THE FOUR THINGS THAT WERE WRONG
 *
 * 1. ANYONE COULD START THE PUMP. `AT+CLIP=1` was switched on specifically to
 *    get the caller's number, and the number was then never looked at: any
 *    incoming call toggled the contactor. A wrong number, a marketing robocall
 *    or a stranger cycling the digits could start a stranger's irrigation, or
 *    stop it halfway through a watering. The intent was there in the code and
 *    the check was simply missing.
 *
 * 2. THE CONTACTOR CHATTERED AT MAINS FREQUENCY. An opto-isolated
 *    mains-present input conducts on each half cycle, so reading it with a
 *    bare digitalRead() gives a square wave at 50 or 100 Hz — not a level. The
 *    old loop did exactly that and drove the relay from it on every pass, so
 *    "mains present" was true about half the time and the contactor was being
 *    asked to open and close many times a second. That welds contacts, and a
 *    welded contactor is a pump that cannot be switched off.
 *
 * 3. SMS CONTROL DID NOT EXIST, AND THE CODE THAT PRETENDED TO WAS A HAZARD.
 *    The modem was never put into text mode and never told to deliver
 *    messages, so no SMS body ever reached the sketch. What did reach it was
 *    ordinary modem chatter — and `line.indexOf("ON") >= 0` matches the word
 *    CONNECT. The pump could be started by the modem talking to itself.
 *
 * 4. THE HEADER PROMISED A DRY-RUN GUARD THAT WAS NOT THERE. Running a
 *    submersible dry destroys its seals in minutes and then its windings. The
 *    guard is now real, and it is honest about needing a sensor: without one
 *    fitted it says so rather than implying protection that does not exist.
 */
/* Version history
 *   1.1.0  first build that survives a power cut with the router still down —
 *          see tests/firmware-power-restore.test.ts.
 *   1.2.0  It can no longer be started by a stranger, and it can no longer
 *          destroy the thing it controls.
 *
 *          Caller ID is checked. `AT+CLIP=1` was enabled to obtain it and the
 *          result was discarded, so every incoming call — including a wrong
 *          number — toggled the pump.
 *
 *          Mains presence is measured over a window instead of sampled. An
 *          opto on a 50 Hz supply is a pulse train, not a level; reading it
 *          raw and driving the contactor from it on every loop meant the
 *          contactor was chattering continuously whenever mains was present.
 *
 *          SMS actually works: text mode, delivery notifications, read, act,
 *          delete. What was there before could not receive a message at all
 *          and would start the pump on the modem's own "CONNECT".
 *
 *          A dry-run cutout, a maximum runtime, a restart delay after the
 *          supply returns, and timed irrigation — ring once, water for thirty
 *          minutes, stop by itself.
 *
 *          And it answers. Every command is confirmed by SMS with what really
 *          happened, because "the pump did not start, there is no power" is
 *          the single most useful sentence this product can send and it was
 *          previously a wasted trip to the field.
 */
#define CV_FW_VERSION "1.2.0"
#include <CircuventDevice.h>
#include <Preferences.h>

#define PUMP_RELAY 26
#define MAINS_SENSE 34   /* opto-isolated mains-present input, pulses at line rate */
#define DRY_SENSE 35     /* optional float/flow switch; LOW = dry. Input-only pin. */
#define SIM_RX 16
#define SIM_TX 17

HardwareSerial sim(2);
CircuventDevice cv("agri-starter");
Preferences store;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

bool pump = false;          /* what the contactor is actually doing */
bool pumpIntent = false;    /* what somebody asked for */
bool savedPumpIntent = false;

/*
 * Why the pump is not running, when it is not.
 *
 * Published as a string because every one of these has a different answer for
 * the farmer, and "off" tells them none of them. Mirrored in src/lib/agri.ts
 * so the apps say the same thing.
 */
const char *holdReason = "idle";

bool dryLatched = false;    /* dry-run cutout has tripped and needs clearing */
uint32_t pumpStartedAt = 0;
uint32_t runUntil = 0;      /* timed irrigation; 0 = run until told to stop */
uint32_t totalRunMin = 0;   /* lifetime, persisted, for the maintenance schedule */
uint32_t runMinCarry = 0;

/* ---- configuration, provisioned rather than compiled in -------------- */
#define MAX_CALLERS 4
#define NUM_LEN 20
char callers[MAX_CALLERS][NUM_LEN];
int callerCount = 0;

/*
 * A missed call means this many minutes of watering, or 0 for "until I say
 * stop". Timed is the safer default and the one farmers actually want: the
 * commonest way to destroy a pump is to start it and forget.
 */
uint16_t ringMinutes = 30;

/*
 * Hard ceiling on a single run.
 *
 * Even a deliberate "run until I stop it" gets cut off eventually. Three hours
 * is longer than any single irrigation set and short enough that a forgotten
 * pump does not run all night into a dry well.
 */
uint16_t maxRunMin = 180;

/*
 * Wait this long after the supply returns before re-engaging.
 *
 * Rural supply comes back unstable — it dips, returns and dips again for a
 * minute or two. Re-engaging a motor into that is how windings are lost, and
 * every starter in the village doing it at the same instant is what makes the
 * supply dip again. Twenty seconds costs nothing and avoids both.
 */
uint16_t restartDelaySec = 20;

/* Whether a dry-run sensor is actually fitted. Off by default: claiming
   protection that is not wired is worse than claiming none. */
bool dryGuard = false;

/* ------------------------------------------------------------------ */
/* Mains presence — a window, not a sample                             */
/* ------------------------------------------------------------------ */
/*
 * The opto conducts on each half cycle of the supply, so the pin is a pulse
 * train at 50 or 100 Hz. A single digitalRead() therefore returns "mains
 * absent" about half the time while the supply is perfectly healthy.
 *
 * So: remember when the pin was last seen high. Mains is present if that was
 * recently, and is only declared absent after long enough that no plausible
 * waveform could have been missed. GPIO34 is input-only with no internal
 * pull-down either, so a disconnected sensor floats — which the same window
 * handles, since a floating pin that never goes high reads as no mains, and
 * that is the safe answer.
 */
#define MAINS_PULSE_GAP_MS 300UL   /* longest gap that still counts as present */
uint32_t mainsLastHigh = 0;
bool mainsPresent = false;
uint32_t mainsReturnedAt = 0;

void sampleMains() {
  if (digitalRead(MAINS_SENSE) == HIGH) mainsLastHigh = millis();
  const bool nowPresent = (millis() - mainsLastHigh) < MAINS_PULSE_GAP_MS;
  if (nowPresent && !mainsPresent) mainsReturnedAt = millis();
  mainsPresent = nowPresent;
}

/** True once the supply has been steady long enough to trust with a motor. */
bool mainsSettled() {
  return mainsPresent && (millis() - mainsReturnedAt) >= (uint32_t)restartDelaySec * 1000UL;
}

/** True when a fitted sensor says there is nothing to pump. */
bool isDry() {
  return dryGuard && digitalRead(DRY_SENSE) == LOW;
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

void saveCallers() {
  String blob;
  for (int i = 0; i < callerCount; i++) {
    if (i) blob += ';';
    blob += callers[i];
  }
  store.putString("callers", blob);
}

void loadCallers() {
  callerCount = 0;
  String blob = store.getString("callers", "");
  int from = 0;
  while (from < (int)blob.length() && callerCount < MAX_CALLERS) {
    int semi = blob.indexOf(';', from);
    if (semi < 0) semi = blob.length();
    String one = blob.substring(from, semi);
    one.trim();
    if (one.length() >= 6) strlcpy(callers[callerCount++], one.c_str(), NUM_LEN);
    from = semi + 1;
  }
}

/**
 * Whether this number may operate the pump.
 *
 * Compared over the last nine digits, for the same reason the Guardian does:
 * the same person's number arrives as +919876543210, 919876543210 or
 * 09876543210 depending on the network, and a strict comparison would lock the
 * owner out of their own pump.
 *
 * With no numbers provisioned nothing is trusted. That is deliberate — an
 * empty list must mean "nobody", not "everybody", which is precisely the bug
 * this replaces.
 */
bool isTrustedCaller(const char *number) {
  if (!number || strlen(number) < 6) return false;
  for (int i = 0; i < callerCount; i++) {
    const size_t la = strlen(callers[i]), lb = strlen(number), n = 9;
    if (la < n || lb < n) continue;
    if (strcmp(callers[i] + la - n, number + lb - n) == 0) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* The pump                                                            */
/* ------------------------------------------------------------------ */

/**
 * Decides what the contactor should be doing, and says why.
 *
 * Every refusal sets `holdReason`, because each one has a different answer for
 * somebody standing in a field: "no power" means wait, "dry" means check the
 * well, "runtime" means it did its job and stopped.
 */
void applyPump() {
  bool want = pumpIntent;

  if (!want) {
    holdReason = "idle";
  } else if (dryLatched) {
    want = false;
    holdReason = "dry-run";
  } else if (!mainsPresent) {
    want = false;
    holdReason = "no-mains";
  } else if (!mainsSettled()) {
    /* The supply is back but not yet trusted. Not an error — a wait. */
    want = false;
    holdReason = "restart-delay";
  } else {
    holdReason = "running";
  }

  if (want && !pump) pumpStartedAt = millis();
  if (!want && pump) {
    /* Bank the minutes actually run, so the lifetime figure survives. */
    runMinCarry += (millis() - pumpStartedAt) / 1000;
    if (runMinCarry >= 60) {
      totalRunMin += runMinCarry / 60;
      runMinCarry %= 60;
      store.putUInt("runmin", totalRunMin);
    }
  }

  pump = want;
  cvRelayWrite(PUMP_RELAY, pump);
}

void setPump(bool on) {
  pumpIntent = on;
  if (!on) runUntil = 0;
  if (pumpIntent != savedPumpIntent) {
    store.putBool("pump", pumpIntent);
    savedPumpIntent = pumpIntent;
  }
  applyPump();
}

/** Start, and stop by itself after `minutes`. */
void setPumpFor(uint16_t minutes) {
  if (minutes == 0) { setPump(true); return; }
  if (minutes > maxRunMin) minutes = maxRunMin;
  setPump(true);
  runUntil = millis() + (uint32_t)minutes * 60000UL;
}

/* ------------------------------------------------------------------ */
/* Modem                                                               */
/* ------------------------------------------------------------------ */
/*
 * Read a byte at a time into a line buffer and never block. The old loop used
 * readStringUntil('\n'), which waits for the serial timeout — a second, every
 * pass, whenever the modem happened to be quiet — and a delay(800) after a
 * ring. During those the mains window is not sampled and the contactor is not
 * being managed, which on this device is the one thing that must never stop.
 */
char lineBuf[160];
int lineLen = 0;
char pendingFrom[NUM_LEN] = "";
bool smsBodyNext = false;
bool smsPending = false;
char smsQueueTo[NUM_LEN] = "";
char smsQueueBody[161] = "";

/** Queues one reply. One at a time is plenty for a device that speaks in verbs. */
void replyTo(const char *number, const char *text) {
  if (!number || !number[0]) return;
  strlcpy(smsQueueTo, number, NUM_LEN);
  strlcpy(smsQueueBody, text, sizeof(smsQueueBody));
  smsPending = true;
}

/** A sentence describing exactly what the pump is doing and why. */
void statusText(char *dst, size_t n) {
  const char *what = pump ? "RUNNING" : "STOPPED";
  const char *why =
      !strcmp(holdReason, "no-mains")      ? " - no mains power"
      : !strcmp(holdReason, "dry-run")     ? " - DRY RUN cutout, check the water source"
      : !strcmp(holdReason, "restart-delay") ? " - waiting for the supply to steady"
      : !strcmp(holdReason, "running")     ? ""
                                           : "";
  char left[32] = "";
  if (pump && runUntil) {
    const uint32_t mins = (runUntil - millis()) / 60000UL + 1;
    snprintf(left, sizeof(left), ", %lu min left", (unsigned long)mins);
  }
  snprintf(dst, n, "Circuvent pump: %s%s%s. Mains %s.", what, why, left,
           mainsPresent ? "on" : "OFF");
}

/**
 * A command from a trusted phone.
 *
 * Everything is confirmed, because the farmer cannot see the pump. The most
 * valuable message this device sends is the one that says the pump did *not*
 * start and why — that is a motorbike ride saved, and it is exactly what the
 * previous firmware could never say.
 */
void handleCommand(const char *from, const char *verb) {
  char msg[161];

  if (!strcmp(verb, "ON") || !strcmp(verb, "START")) {
    setPumpFor(ringMinutes);
  } else if (!strcmp(verb, "OFF") || !strcmp(verb, "STOP")) {
    setPump(false);
  } else if (!strcmp(verb, "RESET")) {
    /*
     * Clearing a dry-run latch is a deliberate act by a person who has been to
     * look at the well. It is not done automatically for the same reason the
     * water tank does not: the condition that tripped it is still true until
     * somebody checks.
     */
    dryLatched = false;
    applyPump();
    replyTo(from, "Circuvent pump: dry-run cutout cleared.");
    return;
  } else if (!strcmp(verb, "STATUS")) {
    statusText(msg, sizeof(msg));
    replyTo(from, msg);
    return;
  } else {
    return;   /* unknown verb — say nothing rather than guess */
  }

  statusText(msg, sizeof(msg));
  replyTo(from, msg);
}

/** Uppercased first word of a text. */
void firstWord(const char *text, char *dst, size_t n) {
  size_t v = 0;
  for (const char *p = text; *p && v < n - 1; p++) {
    if (*p == ' ' || *p == '\r' || *p == '\n' || *p == '\t') { if (v) break; else continue; }
    dst[v++] = (char)toupper((unsigned char)*p);
  }
  dst[v] = '\0';
}

/** Pulls the quoted number out of a +CLIP or +CMGR header. */
bool quotedNumber(const char *line, char *dst, size_t n) {
  const char *q = strchr(line, '"');
  if (!q) return false;
  q++;
  const char *e = strchr(q, '"');
  if (!e || (size_t)(e - q) >= n) return false;
  memcpy(dst, q, e - q);
  dst[e - q] = '\0';
  return strlen(dst) >= 6;
}

void handleModemLine(const char *line) {
  /*
   * An incoming call. The number is the whole point: without checking it, any
   * ring from anywhere operates a stranger's pump.
   */
  if (!strncmp(line, "+CLIP:", 6)) {
    char from[NUM_LEN];
    if (quotedNumber(line, from, sizeof(from))) {
      const bool trusted = isTrustedCaller(from);
      sim.println("ATH");            /* never actually answer — it is a signal, not a call */
      if (trusted) {
        /* A ring toggles. It is the only gesture a missed call can make, and
           it is what farmers already expect from every other starter. */
        if (pumpIntent) setPump(false);
        else setPumpFor(ringMinutes);
        char msg[161];
        statusText(msg, sizeof(msg));
        replyTo(from, msg);
      }
    }
    return;
  }

  /* A text has arrived; fetch it by index. */
  if (!strncmp(line, "+CMTI:", 6)) {
    const char *comma = strchr(line, ',');
    if (comma) { sim.print("AT+CMGR="); sim.println(atoi(comma + 1)); }
    return;
  }

  /* Header of the message we asked for; the sender is the second quoted field. */
  if (!strncmp(line, "+CMGR:", 6)) {
    pendingFrom[0] = '\0';
    smsBodyNext = false;
    const char *afterStatus = strchr(line, ',');
    if (afterStatus && quotedNumber(afterStatus, pendingFrom, sizeof(pendingFrom))) {
      smsBodyNext = true;
    }
    return;
  }

  if (smsBodyNext) {
    smsBodyNext = false;
    if (isTrustedCaller(pendingFrom)) {
      char verb[12];
      firstWord(line, verb, sizeof(verb));
      handleCommand(pendingFrom, verb);
    }
    /* Read messages are deleted. SIM storage is a handful of slots and a full
       store makes the modem quietly refuse new ones — the device would look
       perfectly healthy while no longer hearing the farmer. */
    sim.println("AT+CMGDA=\"DEL READ\"");
  }
}

void modemPump() {
  while (sim.available()) {
    const char ch = (char)sim.read();
    if (ch == '\r' || ch == '\n') {
      if (lineLen > 0) { lineBuf[lineLen] = '\0'; handleModemLine(lineBuf); lineLen = 0; }
    } else if (lineLen < (int)sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = ch;
    }
  }
}

/* Sends at most one queued reply at a time, stepped rather than blocking. */
uint8_t smsPhase = 0;
uint32_t smsDeadline = 0;

void stepSms() {
  if (!smsPending) return;
  switch (smsPhase) {
    case 0:
      sim.println("AT+CMGF=1");
      sim.print("AT+CMGS=\"");
      sim.print(smsQueueTo);
      sim.println("\"");
      smsPhase = 1;
      smsDeadline = millis() + 3000;
      break;
    case 1:
      /* The prompt takes a moment; writing the body early has it discarded. */
      if ((int32_t)(millis() - smsDeadline) >= 0) {
        sim.print(smsQueueBody);
        sim.write(26);
        smsPhase = 2;
        smsDeadline = millis() + 20000;
      }
      break;
    case 2:
      if ((int32_t)(millis() - smsDeadline) >= 0) { smsPending = false; smsPhase = 0; }
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Cloud commands                                                      */
/* ------------------------------------------------------------------ */

void publishState() {
  cv.set("pump", pump);
  cv.set("power_available", mainsPresent);
  cv.set("hold", holdReason);
  cv.set("dry", dryLatched);
  cv.set("dryGuard", dryGuard);
  cv.set("callers", callerCount);
  cv.set("ringMin", (int)ringMinutes);
  cv.set("maxRunMin", (int)maxRunMin);
  cv.set("runHours", (int)(totalRunMin / 60));
  cv.set("minsLeft", (pump && runUntil) ? (int)((runUntil - millis()) / 60000UL + 1) : 0);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "configure") {
    if (p["callers"].is<JsonArrayConst>()) {
      callerCount = 0;
      for (JsonVariantConst v : p["callers"].as<JsonArrayConst>()) {
        if (callerCount >= MAX_CALLERS) break;
        const char *num = v.is<const char *>() ? v.as<const char *>() : nullptr;
        if (num && strlen(num) >= 6) strlcpy(callers[callerCount++], num, NUM_LEN);
      }
      saveCallers();
    }
    if (p["ringMin"].is<int>()) {
      ringMinutes = (uint16_t)constrain(p["ringMin"].as<int>(), 0, 720);
      store.putUShort("ringmin", ringMinutes);
    }
    if (p["maxRunMin"].is<int>()) {
      maxRunMin = (uint16_t)constrain(p["maxRunMin"].as<int>(), 5, 720);
      store.putUShort("maxrun", maxRunMin);
    }
    if (p["restartSec"].is<int>()) {
      restartDelaySec = (uint16_t)constrain(p["restartSec"].as<int>(), 0, 600);
      store.putUShort("restart", restartDelaySec);
    }
    if (p["dryGuard"].is<bool>()) {
      dryGuard = p["dryGuard"].as<bool>();
      store.putBool("dryguard", dryGuard);
      if (!dryGuard) dryLatched = false;
    }
    publishState();
    cv.publishStateNow();
    return;
  }

  /* Timed irrigation from the app: run for exactly this long. */
  if (action == "runFor") {
    const int mins = p["minutes"].is<int>() ? p["minutes"].as<int>() : 0;
    if (mins > 0) setPumpFor((uint16_t)constrain(mins, 1, (int)maxRunMin));
    else setPump(false);
    publishState();
    cv.publishStateNow();
    return;
  }

  if (action == "resetDry") {
    dryLatched = false;
    applyPump();
    publishState();
    cv.publishStateNow();
    return;
  }

  if (action == "set" && p["pump"].is<bool>()) {
    /* A plain on/off from the app honours the configured run length too, so
       the app and a missed call mean the same thing. */
    if (p["pump"].as<bool>()) setPumpFor(ringMinutes);
    else setPump(false);
    publishState();
    cv.publishStateNow();
  }
}

/* ------------------------------------------------------------------ */

void setup() {
  Serial.begin(115200);
  cvRelayInit(PUMP_RELAY);
  pinMode(MAINS_SENSE, INPUT);
  pinMode(DRY_SENSE, INPUT);

  store.begin("agri", false);
  pumpIntent = store.getBool("pump", false);
  savedPumpIntent = pumpIntent;
  loadCallers();
  ringMinutes = store.getUShort("ringmin", 30);
  maxRunMin = store.getUShort("maxrun", 180);
  restartDelaySec = store.getUShort("restart", 20);
  dryGuard = store.getBool("dryguard", false);
  totalRunMin = store.getUInt("runmin", 0);

  /*
   * Prime the mains window before anything looks at it, so the first pass of
   * loop() does not decide the supply is missing simply because it has not
   * been watched for long enough yet.
   */
  mainsLastHigh = millis() - MAINS_PULSE_GAP_MS - 1;
  applyPump();

  sim.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);
  sim.println("AT+CLIP=1");            /* caller ID — now actually checked */
  sim.println("AT+CMGF=1");            /* text mode, so a body arrives at all */
  sim.println("AT+CNMI=2,1,0,0,0");    /* notify on new message, do not dump inline */
  sim.println("AT+CMGDA=\"DEL READ\"");

  cv.onCommand(onCommand);
  cv.setInterval(10000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
  publishState();
}

void loop() {
  /*
   * The mains window is sampled every pass and nothing here is allowed to
   * block, because this is what stands between an unstable supply and a
   * chattering contactor.
   */
  sampleMains();
  modemPump();
  stepSms();

  const uint32_t now = millis();

  /* Dry run, while pumping. Latched, because the well does not refill just
     because the sensor flickered, and a pump that restarts into a dry bore is
     a pump that destroys itself in the time nobody is watching. */
  if (pump && isDry()) {
    dryLatched = true;
    if (callerCount > 0) {
      replyTo(callers[0], "Circuvent pump: STOPPED - dry run detected. Check the water source, then text RESET.");
    }
  }

  /* Timed irrigation reaching its end. */
  if (pump && runUntil && (int32_t)(now - runUntil) >= 0) {
    runUntil = 0;
    setPump(false);
    if (callerCount > 0) replyTo(callers[0], "Circuvent pump: finished its timed run and stopped.");
  }

  /* The backstop. Even a deliberate "run until I stop it" ends eventually —
     a forgotten pump is the commonest way one is destroyed. */
  if (pump && (now - pumpStartedAt) > (uint32_t)maxRunMin * 60000UL) {
    setPump(false);
    if (callerCount > 0) {
      replyTo(callers[0], "Circuvent pump: stopped after reaching the maximum run time.");
    }
  }

  applyPump();

  static uint32_t lastPub = 0;
  if (now - lastPub >= 5000UL) {
    lastPub = now;
    publishState();
  }
  cv.loop();
}
