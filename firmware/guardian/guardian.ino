/*
 * Circuvent Guardian — ESP32 firmware
 *
 * A personal safety beacon worn in a shoe. A sustained press on a hidden
 * button sends the wearer's live position to the people who care about them
 * and to the nearest police station, by SMS and voice call over its own SIM.
 *
 * Hardware: SIM800L (UART2), GPS (UART1), panic switch under the insole,
 * Li-ion cell. Deps: CircuventDevice, ArduinoJson, TinyGPSPlus.
 *
 *
 * THE THREE THINGS THIS DEVICE HAS TO GET RIGHT
 *
 * 1. IT MUST NOT CRY WOLF. The button lives in a shoe. It is stood on, walked
 *    on and flexed all day, and the previous firmware fired on a *single press
 *    with a one-second debounce* — so every footfall a second apart sent an
 *    SOS: buzzer, SMS and a voice call to the wearer's mother. A safety device
 *    that does that is taken off the foot within a day, and then it protects
 *    nobody. The trigger is a thirty-second continuous hold (CvHoldButton),
 *    because nothing a shoe does on its own lasts thirty seconds unbroken.
 *
 * 2. IT MUST WORK WITH NO PHONE AND NO WI-FI. The wearer is, by assumption,
 *    somewhere bad, and the phone is the first thing taken. Everything needed
 *    to raise the alarm — the numbers, the message, the modem — is on the
 *    device and in NVS. The mobile app is how it is set up the first time, and
 *    is not needed again.
 *
 * 3. IT MUST NOT LIE ABOUT WHERE SOMEBODY IS. Sending 0,0 under the words
 *    "live location" points a rescuer at the Gulf of Guinea and gives them no
 *    reason to doubt it. If there is no fix the message says so.
 *
 *
 * THE PIN THE PANIC BUTTON MUST NOT BE ON
 *
 * It used to be GPIO0 — which is also what `setResetButton(0)` watches, where
 * a 3-second hold clears the Wi-Fi credentials and an 8-second hold factory
 * resets. A thirty-second hold passes straight through both. The gesture this
 * product is built around would have wiped the device's identity and every
 * emergency contact on it, twenty-two seconds before it was due to call for
 * help. The button is now on its own pin, with a compile-time guard below so
 * it cannot drift back.
 *
 *
 * WHY IT IS SILENT BY DEFAULT
 *
 * The old firmware sounded a buzzer on SOS. A device hidden in a shoe is
 * hidden for a reason: the wearer does not want the person they are afraid of
 * to know they have called for help. A noise announces it. `silent` can be
 * turned off for wearers who want the deterrent instead — a child who is lost
 * rather than threatened, where being found is the whole point — but it
 * defaults to quiet.
 *
 *
 * WHY THERE IS NO CANCEL WINDOW
 *
 * The obvious design is to wait ten seconds after the hold completes so a
 * mistake can be undone. It is rejected here: the wearer has already held a
 * button for thirty uninterrupted seconds, which is the safeguard, and a delay
 * costs exactly the person who cannot afford it. A false alarm is undone
 * afterwards from the app, which sends a stand-down message to everyone who
 * was alerted.
 */
/* Version history
 *   1.1.0  first build that survives a power cut with the router still down —
 *          see tests/firmware-power-restore.test.ts.
 *   1.2.0  An SOS no longer reports a location it does not have. lat/lng start
 *          at 0,0 and were only ever written on a fix, with nothing checking
 *          whether one had happened — so a device that had never seen a
 *          satellite sent "Live location: 0.000000,0.000000", a point in the
 *          Gulf of Guinea, to whoever the wearer trusts most. The SMS path
 *          also wrote the body a fixed 300 ms after AT+CMGS without waiting
 *          for the modem's ">" prompt, so on a slow registration the body was
 *          discarded and the send failed silently while the buzzer and the
 *          cloud alert both said it had worked.
 *   2.0.0  The product it was supposed to be.
 *
 *          The trigger is a thirty-second continuous hold instead of a single
 *          press with a one-second debounce. In a shoe, the old test fired on
 *          ordinary walking — every step a second apart was a full SOS to the
 *          wearer's emergency contact.
 *
 *          The panic button moved off GPIO0. It shared the pin with the reset
 *          gesture, so a thirty-second hold would have cleared the Wi-Fi at
 *          three seconds and factory reset at eight — erasing the contacts it
 *          was about to message.
 *
 *          Contacts are provisioned instead of compiled in. The trusted number
 *          was the literal string "+9199XXXXXXXX" in the source, so every
 *          device ever flashed would have texted a number that does not exist.
 *          Up to four contacts, a cached nearest police station and a national
 *          emergency fallback now live in NVS, set from the app.
 *
 *          The modem no longer blocks. sendSOS() could sit in delay loops for
 *          about forty-three seconds, during which GPS was not read and the
 *          cloud link was not serviced — the device went deaf at the one
 *          moment it must not. Sending is now a state machine stepped from
 *          loop(), which is also what lets it message several people, retry a
 *          failure, and keep sending position updates while the incident runs.
 *
 *          Silent by default, and there is a self-test that proves the whole
 *          path works without staging an emergency.
 *   2.1.0  It can now say whether it could actually call for help.
 *
 *          `ready` only ever meant "somebody typed in a phone number". A
 *          beacon with no signal, no SIM, or a prepaid account that quietly
 *          expired looked identical to a working one — online, charged,
 *          reporting a position — and the button did nothing useful. Signal,
 *          network registration and SIM state are now polled and published.
 *
 *          It answers texts from its contacts. WHERE returns a map link,
 *          STATUS returns battery and signal, SOS raises the alarm and STOP
 *          stands it down. This is the strongest form of working without the
 *          app: a parent with an ancient handset, no data and no account can
 *          find their child with nothing in between working at all. Only
 *          trusted numbers are obeyed, and deliberately no command can change
 *          who the contacts are — an SMS sender is trivially spoofed.
 *
 *          Journey mode: say when you expect to be home, and if you do not say
 *          you arrived, the alarm is raised for you. It covers what the button
 *          cannot — being unable to press it.
 *
 *          A low battery now tells somebody, once, before it dies rather than
 *          after.
 *
 *          The serial reader was centralised. The outbox used to read the port
 *          itself, so an incoming text arriving mid-send was consumed by its
 *          token matcher and lost.
 */
#define CV_FW_VERSION "2.1.0"
#include <CircuventDevice.h>
#include <CvHoldButton.h>
#include <TinyGPSPlus.h>
#include <Preferences.h>

/* ------------------------------------------------------------------ */
/* Pins                                                                */
/* ------------------------------------------------------------------ */
#define SOS_BTN 13      /* panic switch under the insole — its own pin */
#define BUZZER 25
#define BATT_ADC 34
#define SIM_RX 16
#define SIM_TX 17
#define GPS_RX 4
#define GPS_TX 2
#define RESET_BTN 0     /* BOOT, inside the case: 3 s Wi-Fi, 8 s factory */

/*
 * The guard that keeps the worst version of this bug from coming back.
 *
 * If the panic button is ever put back on the reset pin, the thirty-second
 * gesture factory-resets the device instead of calling for help — silently,
 * and only when somebody actually needs it. That is not a fault anybody finds
 * in testing, so it fails the build instead.
 */
#if SOS_BTN == RESET_BTN
#error "SOS_BTN must not be the reset pin: a 30s hold would factory reset the device instead of raising an alarm."
#endif

/* ------------------------------------------------------------------ */
/* Configuration — provisioned, never compiled in                      */
/* ------------------------------------------------------------------ */
#define MAX_CONTACTS 4
#define NUM_LEN 20
#define NAME_LEN 16

struct Contact {
  char name[NAME_LEN];
  char number[NUM_LEN];
};

Contact contacts[MAX_CONTACTS];
int contactCount = 0;

/* Nearest station, pushed by the platform as the wearer moves. Empty until it
   has been resolved at least once — see nationalNumber for the fallback. */
char policeNumber[NUM_LEN] = "";
/* Always reachable, no directory needed. Set at provisioning: 112 in India,
   999 in the UK, 911 in the US. */
char nationalNumber[NUM_LEN] = "";
char apn[24] = "";
uint32_t holdMs = 30000;
bool silent = true;

CircuventDevice cv("guardian");
Preferences store;
CvHoldButton panic;
HardwareSerial sim(2);
HardwareSerial gpsSerial(1);
TinyGPSPlus gps;

bool armed = true;
bool sos = false;
double lat = 0, lng = 0;

/* How old a fix may be and still be called "live". TinyGPSPlus keeps the last
   position for as long as the device is powered, so lat/lng alone cannot tell
   "here, now" from "where this was an hour ago before it went indoors". */
#define GPS_MAX_AGE_MS 30000UL

bool haveFix() {
  return gps.location.isValid() && gps.location.age() < GPS_MAX_AGE_MS;
}

int batteryPct() {
  int raw = analogRead(BATT_ADC);
  float v = (raw / 4095.0f) * 2.0f * 3.3f;
  int pct = (int)((v - 3.3f) / (4.2f - 3.3f) * 100);
  return constrain(pct, 0, 100);
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

/* Contacts are stored as one string, "name|number;name|number", because NVS
   keys are an awkward thing to iterate and four contacts is not worth eight
   of them. */
void saveContacts() {
  String blob;
  for (int i = 0; i < contactCount; i++) {
    if (i) blob += ';';
    blob += contacts[i].name;
    blob += '|';
    blob += contacts[i].number;
  }
  store.putString("contacts", blob);
}

void loadContacts() {
  contactCount = 0;
  String blob = store.getString("contacts", "");
  int from = 0;
  while (from < (int)blob.length() && contactCount < MAX_CONTACTS) {
    int semi = blob.indexOf(';', from);
    if (semi < 0) semi = blob.length();
    String one = blob.substring(from, semi);
    int bar = one.indexOf('|');
    if (bar > 0) {
      strlcpy(contacts[contactCount].name, one.substring(0, bar).c_str(), NAME_LEN);
      strlcpy(contacts[contactCount].number, one.substring(bar + 1).c_str(), NUM_LEN);
      contactCount++;
    }
    from = semi + 1;
  }
}

void loadConfig() {
  store.begin("guardian", false);
  loadContacts();
  strlcpy(policeNumber, store.getString("police", "").c_str(), NUM_LEN);
  strlcpy(nationalNumber, store.getString("national", "").c_str(), NUM_LEN);
  strlcpy(apn, store.getString("apn", "").c_str(), sizeof(apn));
  holdMs = store.getUInt("holdms", 30000);
  if (holdMs < 10000 || holdMs > 120000) holdMs = 30000;
  silent = store.getBool("silent", true);
  armed = store.getBool("armed", true);
}

/**
 * Whether this device could actually raise an alarm if the button were held.
 *
 * Published, because "configured" is not something anybody can see by looking
 * at a shoe, and an unprovisioned Guardian is an ornament. The console and the
 * app both refuse to call it ready without this.
 */
bool canRaiseAlarm() {
  return contactCount > 0 || policeNumber[0] || nationalNumber[0];
}

/* ------------------------------------------------------------------ */
/* Modem — non-blocking                                                */
/* ------------------------------------------------------------------ */
/*
 * Everything below is stepped from loop(). The previous implementation used
 * blocking waits totalling about forty-three seconds, inside the SOS path: for
 * three quarters of a minute after the button was pressed the device stopped
 * reading GPS and stopped servicing the cloud link. The position it eventually
 * reported was the one it had before the emergency started, and any command
 * sent to it in that window was lost.
 */

/** Incremental token matcher: fed a byte at a time, never waits. */
struct AtMatch {
  const char *token = nullptr;
  size_t at = 0;
  void expect(const char *t) { token = t; at = 0; }
  bool feed(char c) {
    if (!token) return false;
    const size_t n = strlen(token);
    at = (c == token[at]) ? at + 1 : (c == token[0] ? 1 : 0);
    return at == n;
  }
};

enum SendPhase : uint8_t {
  PH_IDLE = 0,
  PH_MODE,      /* AT+CMGF=1  -> OK     */
  PH_NUMBER,    /* AT+CMGS="n" -> ">"   */
  PH_BODY,      /* body + Ctrl-Z -> +CMGS */
  PH_CALL,      /* ATD n;     -> OK     */
  PH_DONE
};

struct Outbox {
  char to[MAX_CONTACTS + 2][NUM_LEN];
  uint8_t count;
  uint8_t at;
  char body[161];
  uint8_t attempts;
  SendPhase phase;
  uint32_t deadline;
  AtMatch match;
  /** Set by modemPump() when the awaited token arrives. */
  bool hit;
  bool callAfter;
  char callNumber[NUM_LEN];
  uint8_t sentOk;
  uint8_t failed;
};

Outbox out;

/* One line of modem output, assembled by modemPump(). */
char lineBuf[192];
int lineLen = 0;
void handleModemLine(const char *line);

/* ---- what the modem says about itself -------------------------------- *
 *
 * A beacon with no signal, no SIM or an expired prepaid account looks exactly
 * like a working one from the app: online over Wi-Fi, charged, reporting a
 * position. The button does nothing useful and nobody finds out until the day
 * it matters. These three numbers are what make `ready` an honest claim rather
 * than "somebody typed in a phone number once".
 */
int csq = 99;      /* 0..31 signal, 99 = the modem does not know */
int creg = 4;      /* 1 = registered, 5 = roaming, anything else = cannot send */
bool simOk = false;

/* Low battery is announced once, with hysteresis, so a cell hovering at the
   threshold cannot text somebody's mother every ten minutes. */
bool batteryWarned = false;
#define BATT_WARN_PCT 15
#define BATT_CLEAR_PCT 30

/*
 * Journey mode — "walk me home".
 *
 * The wearer says when they expect to arrive. If they do not say they got
 * there, the alarm is raised for them. It covers the case the panic button
 * cannot: being unable to press it, because pressing anything for thirty
 * seconds is not something that is always possible.
 *
 * The deadline is held in RAM rather than NVS on purpose. millis() restarts at
 * a reboot, so a stored deadline would be meaningless, and the alternatives —
 * an RTC the board does not have, or GPS time that is absent indoors — are
 * worse than the honest behaviour: a journey does not survive a power cycle,
 * and the platform re-arms it when the device reconnects.
 */
bool journeyOn = false;
uint32_t journeyDueAt = 0;
bool journeyNudged = false;

void outboxClear() {
  out.count = 0;
  out.at = 0;
  out.attempts = 0;
  out.phase = PH_IDLE;
  out.callAfter = false;
}

void outboxAdd(const char *number) {
  if (!number || !number[0]) return;
  if (out.count >= MAX_CONTACTS + 2) return;
  /* Never message the same number twice in one incident — a contact who is
     also the emergency number should not get two identical alarms. */
  for (uint8_t i = 0; i < out.count; i++) {
    if (strcmp(out.to[i], number) == 0) return;
  }
  strlcpy(out.to[out.count++], number, NUM_LEN);
}

void simFlush() {
  while (sim.available()) sim.read();
}

/** Begins the next SMS, or finishes the run. */
void outboxNext() {
  if (out.at >= out.count) {
    if (out.callAfter && out.callNumber[0]) {
      out.callAfter = false;
      simFlush();
      sim.print("ATD");
      sim.print(out.callNumber);
      sim.println(";");
      out.match.expect("OK");
      out.phase = PH_CALL;
      out.deadline = millis() + 20000;
      return;
    }
    out.phase = PH_DONE;
    return;
  }
  out.attempts = 0;
  simFlush();
  sim.println("AT+CMGF=1");
  out.match.expect("OK");
  out.phase = PH_MODE;
  out.deadline = millis() + 5000;
}

/**
 * Reads the modem once, and gives every byte to everything that wants it.
 *
 * The outbox used to read the serial port itself. That was fine while sending
 * an SMS was the only thing the modem was for, and became wrong the moment
 * anything else needed to hear from it: whichever consumer got there first
 * consumed the byte, and the other simply never saw the reply. An unsolicited
 * `+CMTI` — an incoming text — arriving in the middle of a send would be eaten
 * by the outbox's token matcher and lost.
 *
 * So there is one reader. It feeds the outbox's matcher and assembles complete
 * lines for everything else.
 */
void modemPump() {
  while (sim.available()) {
    const char ch = (char)sim.read();

    if (out.phase != PH_IDLE && out.phase != PH_DONE && !out.hit) {
      if (out.match.feed(ch)) out.hit = true;
    }

    if (ch == '\r' || ch == '\n') {
      if (lineLen > 0) {
        lineBuf[lineLen] = '\0';
        handleModemLine(lineBuf);
        lineLen = 0;
      }
    } else if (lineLen < (int)sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = ch;
    }
  }
}

/**
 * Advances the send.
 *
 * A failure moves on to the next recipient rather than stopping: the whole
 * point of alerting several people is that one of them being unreachable does
 * not end the attempt. Two tries at the first step, because a modem that has
 * just registered frequently rejects one command and accepts the next.
 */
void outboxStep() {
  if (out.phase == PH_IDLE || out.phase == PH_DONE) return;

  const bool hit = out.hit;
  const bool expired = (int32_t)(millis() - out.deadline) >= 0;
  if (!hit && !expired) return;
  out.hit = false;

  switch (out.phase) {
    case PH_MODE:
      if (hit) {
        simFlush();
        sim.print("AT+CMGS=\"");
        sim.print(out.to[out.at]);
        sim.println("\"");
        out.match.expect(">");
        out.phase = PH_NUMBER;
        /* The prompt, not a guessed delay. A body written before it arrives is
           discarded by the modem and the send fails with no indication. */
        out.deadline = millis() + 12000;
      } else if (++out.attempts < 2) {
        simFlush();
        sim.println("AT+CMGF=1");
        out.match.expect("OK");
        out.deadline = millis() + 5000;
      } else {
        out.failed++;
        out.at++;
        outboxNext();
      }
      break;

    case PH_NUMBER:
      if (hit) {
        sim.print(out.body);
        sim.write(26);  /* Ctrl-Z sends it */
        out.match.expect("+CMGS");
        out.phase = PH_BODY;
        out.deadline = millis() + 40000;
      } else {
        /* Abandon a half-written command so the next one is not appended to
           it. ESC tells the modem to forget the prompt. */
        sim.write(27);
        out.failed++;
        out.at++;
        outboxNext();
      }
      break;

    case PH_BODY:
      if (hit) out.sentOk++;
      else out.failed++;
      out.at++;
      outboxNext();
      break;

    case PH_CALL:
      out.phase = PH_DONE;
      break;

    default:
      break;
  }
}

bool outboxBusy() { return out.phase != PH_IDLE && out.phase != PH_DONE; }

/* ------------------------------------------------------------------ */
/* What the modem tells us without being asked                         */
/* ------------------------------------------------------------------ */

/** True when the number belongs to somebody the wearer trusts. */
bool isTrusted(const char *number) {
  if (!number || !number[0]) return false;
  for (int i = 0; i < contactCount; i++) {
    /*
     * Compared from the right-hand end, over the last nine digits.
     *
     * The same person's number arrives in several forms depending on how the
     * network happened to deliver it — +919876543210, 919876543210,
     * 09876543210 — and a straight strcmp would refuse a genuine parent's text
     * because their operator dropped the country code. Nine digits is enough
     * to identify a subscriber and short enough to survive every prefix.
     */
    const char *a = contacts[i].number;
    const size_t la = strlen(a), lb = strlen(number);
    const size_t n = 9;
    if (la < n || lb < n) continue;
    if (strcmp(a + la - n, number + lb - n) == 0) return true;
  }
  return false;
}

/** Queues one message to one number, if nothing else is being sent. */
bool sendTo(const char *number, const char *text) {
  if (outboxBusy() || !number || !number[0]) return false;
  outboxClear();
  strlcpy(out.body, text, sizeof(out.body));
  outboxAdd(number);
  outboxNext();
  return true;
}

void buildMessage(char *dst, size_t n, bool standDown);

/**
 * A text from a trusted number, answered.
 *
 * THIS IS THE STRONGEST FORM OF "WORKS WITHOUT THE APP"
 *
 * A parent with an ancient handset, no smartphone, no data and no account can
 * text WHERE and get a map link back. Nothing in between has to be working:
 * not our servers, not their internet, not ours. It is also the only channel
 * that still functions when the wearer is somewhere with enough signal for SMS
 * and not enough for anything else, which is most of the countryside.
 *
 * Only trusted numbers are obeyed, and only these verbs. In particular there
 * is no command that changes who the contacts are — an SMS sender is trivially
 * spoofable, and a device that could be re-pointed at a stranger's phone by a
 * text message would be worse than no device.
 */
void handleInboundSms(const char *from, const char *text) {
  if (!isTrusted(from)) return;

  /* Upper-cased first word, so "where" and "Where are you" both work. */
  char verb[12] = {0};
  int v = 0;
  for (const char *p = text; *p && v < (int)sizeof(verb) - 1; p++) {
    if (*p == ' ' || *p == '\r' || *p == '\n') { if (v) break; else continue; }
    verb[v++] = (char)toupper((unsigned char)*p);
  }

  char msg[161];

  if (!strcmp(verb, "WHERE") || !strcmp(verb, "LOC")) {
    if (haveFix()) {
      snprintf(msg, sizeof(msg), "Guardian: https://maps.google.com/?q=%.6f,%.6f (live, %d%% battery)",
               gps.location.lat(), gps.location.lng(), batteryPct());
    } else if (gps.location.isValid()) {
      snprintf(msg, sizeof(msg), "Guardian: no live GPS. Last known %lu min ago: https://maps.google.com/?q=%.6f,%.6f",
               (unsigned long)(gps.location.age() / 60000UL), lat, lng);
    } else {
      snprintf(msg, sizeof(msg), "Guardian: no GPS fix yet, so no location to give. Battery %d%%.", batteryPct());
    }
    sendTo(from, msg);
    return;
  }

  if (!strcmp(verb, "STATUS")) {
    snprintf(msg, sizeof(msg),
             "Guardian: %s, battery %d%%, signal %d/31, %d contact(s), GPS %s.",
             armed ? "armed" : "DISARMED", batteryPct(), csq, contactCount,
             haveFix() ? "live" : "no fix");
    sendTo(from, msg);
    return;
  }

  /* A trusted person can raise the alarm on the wearer's behalf — they may
     have heard something the wearer cannot act on. */
  if (!strcmp(verb, "SOS") || !strcmp(verb, "HELP")) {
    if (!sos) openIncident(false);
    return;
  }

  if (!strcmp(verb, "STOP") || !strcmp(verb, "CANCEL")) {
    if (sos) cancelIncident();
    return;
  }

  if (!strcmp(verb, "ARM") || !strcmp(verb, "DISARM")) {
    armed = (verb[0] == 'A');
    store.putBool("armed", armed);
    if (!armed) panic.reset();
    snprintf(msg, sizeof(msg), "Guardian: now %s.", armed ? "armed" : "disarmed");
    sendTo(from, msg);
    return;
  }
}

/* The message we are part-way through reading, when a +CMGR reply arrives. */
char smsFrom[NUM_LEN] = "";
bool smsBodyNext = false;

/**
 * One line from the modem.
 *
 * Handles both the answers we asked for (signal, registration, SIM) and the
 * ones we did not (an incoming text). Unsolicited notifications are the reason
 * the reader had to be centralised: they arrive whenever they arrive, often
 * mid-send.
 */
void handleModemLine(const char *line) {
  if (!strncmp(line, "+CSQ:", 5)) {
    csq = atoi(line + 5);
    return;
  }
  if (!strncmp(line, "+CREG:", 6)) {
    /* "+CREG: <n>,<stat>" — the second field is the one that matters. */
    const char *comma = strchr(line, ',');
    if (comma) creg = atoi(comma + 1);
    return;
  }
  if (!strncmp(line, "+CPIN:", 6)) {
    simOk = (strstr(line, "READY") != nullptr);
    return;
  }

  /* A new message has landed. Ask for it by index. */
  if (!strncmp(line, "+CMTI:", 6)) {
    const char *comma = strchr(line, ',');
    if (comma && !outboxBusy()) {
      sim.print("AT+CMGR=");
      sim.println(atoi(comma + 1));
    }
    return;
  }

  /* The header of a message we asked for: +CMGR: "REC UNREAD","+9198...",,"..." */
  if (!strncmp(line, "+CMGR:", 6)) {
    smsFrom[0] = '\0';
    smsBodyNext = false;
    const char *p = strchr(line, ',');           /* end of the status field */
    if (p) {
      const char *q = strchr(p, '"');            /* opening quote of the number */
      if (q) {
        q++;
        const char *e = strchr(q, '"');
        if (e && (size_t)(e - q) < NUM_LEN) {
          memcpy(smsFrom, q, e - q);
          smsFrom[e - q] = '\0';
          smsBodyNext = true;
        }
      }
    }
    return;
  }

  /* The line after that header is the text itself. */
  if (smsBodyNext) {
    smsBodyNext = false;
    handleInboundSms(smsFrom, line);
    /*
     * Delete everything already read.
     *
     * SIM message storage is small — often ten slots — and a full store makes
     * the modem silently stop accepting new messages. The device would go on
     * looking healthy while no longer hearing anybody, which is the failure
     * this whole file is written against.
     */
    if (!outboxBusy()) sim.println("AT+CMGDA=\"DEL READ\"");
  }
}

/** Asks the modem how it is, on a slow timer. */
void pollModemHealth() {
  if (outboxBusy()) return;   /* never interrupt a send in progress */
  sim.println("AT+CSQ");
  sim.println("AT+CREG?");
  sim.println("AT+CPIN?");
}

/* ------------------------------------------------------------------ */
/* The message                                                         */
/* ------------------------------------------------------------------ */

/**
 * Builds the text, saying only what is known.
 *
 * Sending 0,0 — or an hour-old position — under the words "live location" is
 * worse than sending no coordinates at all: it points whoever is coming at a
 * specific wrong place and gives them no reason to doubt it.
 */
void buildMessage(char *dst, size_t n, bool standDown) {
  if (standDown) {
    snprintf(dst, n, "Circuvent Guardian: FALSE ALARM. The earlier SOS was cancelled by the wearer. No help needed.");
    return;
  }
  if (haveFix()) {
    snprintf(dst, n,
             "SOS from Circuvent Guardian. I need help. Live location: https://maps.google.com/?q=%.6f,%.6f",
             gps.location.lat(), gps.location.lng());
  } else if (gps.location.isValid()) {
    snprintf(dst, n,
             "SOS from Circuvent Guardian. I need help. No live GPS - last known %lu min ago: https://maps.google.com/?q=%.6f,%.6f",
             (unsigned long)(gps.location.age() / 60000UL), lat, lng);
  } else {
    snprintf(dst, n,
             "SOS from Circuvent Guardian. I need help. GPS location unavailable - please call me now.");
  }
}

/* ------------------------------------------------------------------ */
/* Incidents                                                           */
/* ------------------------------------------------------------------ */

void openIncident(bool selfTest) {
  if (outboxBusy()) return;

  outboxClear();
  if (selfTest) {
    snprintf(out.body, sizeof(out.body),
             "Circuvent Guardian test. This is what an SOS from this device looks like. No action needed.");
    /* A test goes to the wearer's own people only. Dialling a police station
       to prove the wiring works is not acceptable, and is how a product gets
       its emergency numbers blocked. */
    for (int i = 0; i < contactCount; i++) outboxAdd(contacts[i].number);
  } else {
    buildMessage(out.body, sizeof(out.body), false);
    for (int i = 0; i < contactCount; i++) outboxAdd(contacts[i].number);
    /* The nearest station if the platform has told us one, the national number
       otherwise. Something always gets the message. */
    if (policeNumber[0]) outboxAdd(policeNumber);
    else if (nationalNumber[0]) outboxAdd(nationalNumber);

    sos = true;
    cv.set("sos", true);
    if (!silent) digitalWrite(BUZZER, HIGH);
    /* A voice call after the messages, to the first contact — a ringing phone
       is noticed at 3am and a text is not. */
    if (contactCount > 0) {
      strlcpy(out.callNumber, contacts[0].number, NUM_LEN);
      out.callAfter = true;
    }
  }
  outboxNext();
  cv.publishStateNow();
}

/** Stands the alarm down, and tells everyone who was told it started. */
void cancelIncident() {
  sos = false;
  digitalWrite(BUZZER, LOW);
  cv.set("sos", false);
  panic.reset();

  if (canRaiseAlarm()) {
    outboxClear();
    buildMessage(out.body, sizeof(out.body), true);
    for (int i = 0; i < contactCount; i++) outboxAdd(contacts[i].number);
    if (policeNumber[0]) outboxAdd(policeNumber);
    else if (nationalNumber[0]) outboxAdd(nationalNumber);
    outboxNext();
  }
  cv.publishStateNow();
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

void applyContacts(JsonArrayConst arr) {
  contactCount = 0;
  for (JsonObjectConst c : arr) {
    if (contactCount >= MAX_CONTACTS) break;
    const char *num = c["number"].is<const char *>() ? c["number"].as<const char *>() : nullptr;
    if (!num || strlen(num) < 6) continue;   /* not a phone number */
    const char *nm = c["name"].is<const char *>() ? c["name"].as<const char *>() : "Contact";
    strlcpy(contacts[contactCount].name, nm, NAME_LEN);
    strlcpy(contacts[contactCount].number, num, NUM_LEN);
    contactCount++;
  }
  saveContacts();
}

void publishConfig() {
  cv.set("contacts", contactCount);
  cv.set("police", policeNumber[0] ? 1 : 0);
  cv.set("national", nationalNumber[0] ? 1 : 0);
  cv.set("holdSec", (int)(holdMs / 1000));
  cv.set("silent", silent);
  cv.set("ready", canRaiseAlarm());
  /* What the modem says about itself. `ready` above is about configuration;
     these are about whether a message could actually leave the device. */
  cv.set("csq", csq);
  cv.set("reg", creg);
  cv.set("sim", simOk);
  cv.set("journey", journeyOn);
  cv.set("journeyLeft", journeyOn ? (int)((int32_t)(journeyDueAt - millis()) / 1000) : 0);
}

/**
 * Journey mode, checked once a second.
 *
 * The nudge exists because almost every overdue journey is somebody who
 * forgot to press "I'm home". Telling them first turns those into a tap and
 * costs the real cases nothing — a person who cannot answer a nudge is exactly
 * the person the alarm is for.
 */
void stepJourney() {
  if (!journeyOn || sos) return;
  const int32_t lateBy = (int32_t)(millis() - journeyDueAt);
  if (lateBy < 0) return;

  if (!journeyNudged && lateBy >= 60000) {
    journeyNudged = true;
    if (contactCount > 0) {
      char msg[161];
      snprintf(msg, sizeof(msg),
               "Guardian: journey overdue. If all is well, reply OK. An alarm will be raised in 4 minutes.");
      sendTo(contacts[0].number, msg);
    }
    return;
  }

  /* Five minutes past due. People are late; this long past a deadline they
     said themselves is worth somebody looking. */
  if (lateBy >= 5 * 60000) {
    journeyOn = false;
    openIncident(false);
  }
}

/** A flat beacon fails silently — it simply stops being there. */
void stepBatteryWarning() {
  const int pct = batteryPct();
  if (!batteryWarned && pct <= BATT_WARN_PCT && contactCount > 0 && !sos && !outboxBusy()) {
    batteryWarned = true;
    char msg[161];
    snprintf(msg, sizeof(msg),
             "Circuvent Guardian battery is %d%%. It will stop working within a day or so - please charge it.", pct);
    sendTo(contacts[0].number, msg);
  }
  /* Hysteresis, so a cell hovering at the threshold cannot text somebody's
     mother every ten minutes. */
  if (batteryWarned && pct >= BATT_CLEAR_PCT) batteryWarned = false;
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "configure") {
    if (p["contacts"].is<JsonArrayConst>()) applyContacts(p["contacts"].as<JsonArrayConst>());
    if (p["national"].is<const char *>()) {
      strlcpy(nationalNumber, p["national"].as<const char *>(), NUM_LEN);
      store.putString("national", nationalNumber);
    }
    if (p["apn"].is<const char *>()) {
      strlcpy(apn, p["apn"].as<const char *>(), sizeof(apn));
      store.putString("apn", apn);
    }
    if (p["holdSec"].is<int>()) {
      /* Bounded for the reasons in src/lib/guardian-hold.ts: under ten seconds
         walking performs the gesture, over two minutes nobody in trouble can
         complete it. */
      uint32_t ms = (uint32_t)p["holdSec"].as<int>() * 1000UL;
      holdMs = constrain(ms, 10000UL, 120000UL);
      store.putUInt("holdms", holdMs);
      panic.setHoldMs(holdMs);
    }
    if (p["silent"].is<bool>()) {
      silent = p["silent"].as<bool>();
      store.putBool("silent", silent);
      if (silent) digitalWrite(BUZZER, LOW);
    }
    publishConfig();
    cv.publishStateNow();
    return;
  }

  /* The platform resolves the nearest station from the reported position and
     pushes the number here, so the device still reaches the right one when it
     has nothing but SMS. */
  if (action == "setPolice") {
    if (p["number"].is<const char *>()) {
      strlcpy(policeNumber, p["number"].as<const char *>(), NUM_LEN);
      store.putString("police", policeNumber);
      publishConfig();
    }
    return;
  }

  /* Proving the whole path works without staging an emergency. A safety device
     nobody has tested is a safety device nobody should trust. */
  if (action == "test") { openIncident(true); return; }

  if (action == "panic") { openIncident(false); return; }   /* from the app */
  if (action == "cancel") { cancelIncident(); return; }

  /*
   * Nobody answered.
   *
   * The platform sends this when an alarm has gone unacknowledged long enough
   * that assuming somebody saw it is no longer safe. It messages the emergency
   * number specifically — the first wave already went to the contacts, and
   * repeating that to the same four phones is not escalation, it is noise.
   */
  if (action == "escalate") {
    const char *authority = policeNumber[0] ? policeNumber : nationalNumber;
    if (authority[0] && !outboxBusy()) {
      outboxClear();
      buildMessage(out.body, sizeof(out.body), false);
      outboxAdd(authority);
      outboxNext();
    }
    return;
  }

  /*
   * Journey mode. The deadline is armed on the device rather than only on the
   * platform, so a wearer who walks out of coverage is still covered — which
   * is precisely when somebody would want it.
   */
  if (action == "journey") {
    const int mins = p["minutes"].is<int>() ? p["minutes"].as<int>() : 0;
    if (mins <= 0) {
      journeyOn = false;
    } else {
      journeyOn = true;
      journeyNudged = false;
      journeyDueAt = millis() + (uint32_t)constrain(mins, 2, 480) * 60000UL;
    }
    publishConfig();
    cv.publishStateNow();
    return;
  }
  if (action == "arrived") {
    journeyOn = false;
    publishConfig();
    cv.publishStateNow();
    return;
  }

  if (action != "set") return;
  if (p["armed"].is<bool>()) {
    armed = p["armed"].as<bool>();
    store.putBool("armed", armed);
    if (!armed) panic.reset();
  }
  if (p["sos"].is<bool>() && !p["sos"].as<bool>()) cancelIncident();
}

/* ------------------------------------------------------------------ */

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER, OUTPUT);
  digitalWrite(BUZZER, LOW);

  outboxClear();
  out.sentOk = 0;
  out.failed = 0;

  loadConfig();
  panic.begin(SOS_BTN, holdMs);

  sim.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);

  /*
   * Text mode, and tell us about incoming messages.
   *
   * CNMI=2,1 makes the modem send a +CMTI notification rather than dumping the
   * message inline — inline delivery in the middle of an AT exchange is how a
   * send gets corrupted. Then clear the store: a SIM that filled up while the
   * device was in a drawer would silently refuse every new message, and the
   * beacon would look perfectly healthy while no longer hearing anybody.
   */
  sim.println("AT+CMGF=1");
  sim.println("AT+CNMI=2,1,0,0,0");
  sim.println("AT+CMGDA=\"DEL READ\"");

  cv.onCommand(onCommand);
  cv.setInterval(15000);
  cv.setResetButton(RESET_BTN);
  cv.begin();
  publishConfig();
}

/*
 * Telemetry cadence.
 *
 * Position and battery move continuously, and the library republishes whenever
 * state is dirty and 80 ms have passed — so an ungated set() of a live GPS
 * figure is about twelve messages a second, each one a database write. See
 * Docs/31-metering.md, where the same trap cost considerably more.
 */
#define TELEMETRY_MS 10000UL
/* While an incident is open, position is what everybody is waiting for. */
#define INCIDENT_TELEMETRY_MS 5000UL
/* And the first contact gets a fresh position by SMS at this interval, so a
   rescuer following on foot is not working from where the wearer used to be. */
#define TRACK_SMS_MS 120000UL

uint32_t lastTelemetry = 0;
uint32_t lastTrackSms = 0;

void loop() {
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
    if (gps.location.isUpdated()) { lat = gps.location.lat(); lng = gps.location.lng(); }
  }

  /* The gesture. update() must be called every pass — it is what measures the
     hold — but it only fires when armed and not already in an incident. */
  const bool fired = panic.update();
  if (fired && armed && !sos) openIncident(false);

  /* One reader for the modem, then the things that act on what it said. */
  modemPump();
  outboxStep();
  stepJourney();

  const uint32_t now = millis();

  /* How the modem is doing. Slow, because it is three commands and the answers
     do not change quickly — but not so slow that a beacon that lost its
     network keeps claiming to be ready for a quarter of an hour. */
  static uint32_t lastHealth = 0;
  if (now - lastHealth >= 60000UL) {
    lastHealth = now;
    pollModemHealth();
    stepBatteryWarning();
  }

  /* Position updates by SMS to the first contact while an incident runs. */
  if (sos && contactCount > 0 && !outboxBusy() && now - lastTrackSms > TRACK_SMS_MS) {
    lastTrackSms = now;
    outboxClear();
    buildMessage(out.body, sizeof(out.body), false);
    outboxAdd(contacts[0].number);
    outboxNext();
  }

  const uint32_t gap = sos ? INCIDENT_TELEMETRY_MS : TELEMETRY_MS;
  if (now - lastTelemetry >= gap) {
    lastTelemetry = now;
    cv.set("armed", armed);
    cv.set("battery", batteryPct());
    /*
     * Publish the fix separately from the coordinates, and never a position
     * the device does not have. 0,0 is a real place, so a map pin drawn from
     * it is indistinguishable from a genuine one.
     */
    cv.set("fix", haveFix());
    if (gps.location.isValid()) {
      cv.set("lat", (float)lat);
      cv.set("lng", (float)lng);
      cv.set("fixAgeSec", (int)(gps.location.age() / 1000));
    }
    cv.set("sats", (int)gps.satellites.value());
    cv.set("smsOk", (int)out.sentOk);
    cv.set("smsFail", (int)out.failed);
    publishConfig();
  }

  /*
   * How far through the gesture the wearer is.
   *
   * Published only while it is happening, and rounded to ten percent so it
   * cannot become its own publish storm. It lets the console say "SOS in 12s"
   * rather than leaving somebody watching a device that looks idle.
   */
  static int lastPct = -1;
  const int pct = panic.inProgress() ? (panic.progressPct(now) / 10) * 10 : 0;
  if (pct != lastPct) {
    lastPct = pct;
    cv.set("holdPct", pct);
  }

  cv.loop();
}
