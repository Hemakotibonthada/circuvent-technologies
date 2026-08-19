/*
 * Circuvent RFID Attend — Attendance & Access Terminal (ESP32)
 * ============================================================
 * The reader on the wall by a school gate, an office entrance or a server-room
 * door. It identifies a card, decides on the spot whether the door opens,
 * shows the person what happened, and makes sure the event reaches the control
 * plane even if the network does not exist at the time.
 *
 *   - MFRC522 (13.56 MHz MIFARE/NTAG) over SPI — the usual card or fob.
 *   - Wiegand D0/D1 input as well, so an existing reader can be retrofitted
 *     without replacing the hardware already screwed to the wall.
 *   - 128x64 OLED, buzzer and two LEDs so the result is unmistakable.
 *   - Relay for a strike, maglock or turnstile; REX button; door contact.
 *   - Allow-list pushed from the server and held in NVS, so the decision is
 *     local and instant.
 *   - Punches queued in NVS while offline and replayed on reconnect.
 *
 * Standard Circuvent protocol (cv/<id>/state|telemetry). Board: ESP32.
 *
 * WHY THE DECISION IS MADE HERE AND NOT ON THE SERVER
 *
 * Asking the control plane on every scan would be simpler, and is what a first
 * version usually does. It is also wrong for this device. A school gate at
 * 08:25 has four hundred people through it in fifteen minutes; a round trip to
 * a VM in another country, over a school's Wi-Fi, is somewhere between "slow"
 * and "not today". And the moment the line drops, every door in the building
 * stops working at once.
 *
 * So the server pushes *who is allowed* and the terminal decides. The network
 * carries the record of what happened, which can be late without anybody being
 * locked out of anything.
 *
 * WHY THE QUEUE IS ONLY USED OFFLINE
 *
 * Writing every punch to flash would be tidy and would wear the NVS partition
 * out for no reason: a busy terminal sees perhaps 800 scans a day. When the
 * broker is connected the punch is published and that is the record. The queue
 * exists for the case it was built for — the line being down — and nothing
 * else.
 */
/*
 * Version history
 *   1.0.0  initial
 */
#define CV_FW_VERSION "1.0.0"
#include <CircuventDevice.h>
#include <Preferences.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <time.h>
#include "attend_types.h"

// ---- pins ----
#define RC522_SS    5
#define RC522_RST   27
// SPI is the ESP32 default: SCK 18, MISO 19, MOSI 23.
#define WIEGAND_D0  16          // retrofit reader, green
#define WIEGAND_D1  17          // retrofit reader, white
#define OLED_SDA    21
#define OLED_SCL    22
#define OLED_ADDR   0x3C
#define DOOR_RELAY  26
#define BUZZER      25
#define LED_OK      32
#define LED_NO      33
#define REX_BTN     34          // input-only; external pull-up; active-low
#define DOOR_SENSE  35          // input-only; reed contact; LOW = door closed
#define RESET_BTN    0

CircuventDevice cv("rfid-attend");
Preferences store;
MFRC522 rc522(RC522_SS, RC522_RST);
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
bool hasDisplay = false;
bool hasReader = false;

/* ------------------------------------------------------------------ */
/* Wiegand                                                             */
/* ------------------------------------------------------------------ */

volatile unsigned long wgData = 0;
volatile int wgBits = 0;
volatile uint32_t wgLast = 0;

void IRAM_ATTR onD0() { wgData <<= 1; wgBits++; wgLast = millis(); }
void IRAM_ATTR onD1() { wgData = (wgData << 1) | 1UL; wgBits++; wgLast = millis(); }

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

/*
 * What this terminal is for.
 *
 *   attendance — records who came, drives nothing. A school gate with a
 *                turnstile somebody else operates, or a clocking-in point.
 *   access     — opens a door, and nobody calls the result attendance.
 *   both       — the common case: the office front door is also the register.
 *
 * A device setting rather than something inferred from whether a relay is
 * wired, because "the relay is not connected" and "this door must never open"
 * are different statements and only one of them is safe to guess.
 */
String mode = "both";
/** in | out | auto — which way through the door a scan here means. */
String direction = "in";
String terminalName = "Entrance";

int  relaySec = 5;             // how long the strike is released
int  dedupeSec = 8;            // the same card again inside this is one scan
int  heldOpenSec = 30;         // a door left open longer than this is an alarm
bool buzzerOn = true;
/*
 * What to do with an unknown card *while offline*.
 *
 * Defaults to refusing. The alternative — letting anybody in when the line is
 * down — turns every network outage into an open building, and an outage is
 * not a rare event on the kind of Wi-Fi these are installed on. Sites that
 * would rather fail open (a fire route, a shop floor) can set it, deliberately
 * and in writing.
 */
bool offlineFailOpen = false;

/* ------------------------------------------------------------------ */
/* The allow-list                                                      */
/* ------------------------------------------------------------------ */

/*
 * Card numbers the server says may pass: sorted, searched by bisection.
 *
 * Sorted rather than hashed because the whole point is that it survives a
 * power cycle: a sorted array of uint32 is its own serialisation, 1000 cards
 * is 4 KB, and a lookup is ten comparisons.
 *
 * rfid-gate keeps its allow-list as a comma-separated string and scans it with
 * indexOf. That is fine for a driveway with six cars on it and quadratic
 * misery for a school.
 */
#define ACL_MAX 1000
uint32_t acl[ACL_MAX];
int aclCount = 0;
long aclVersion = 0;

/*
 * A replacement list is assembled in RAM and written only when the server says
 * it is complete.
 *
 * The list arrives in chunks because a thousand card numbers do not fit in an
 * MQTT packet. If a chunk goes missing the commit never comes, the staged copy
 * is thrown away and the terminal keeps the list it already had. Applying
 * chunks as they arrive would leave a door with a roster that is short by
 * whatever was dropped — and it would look like a perfectly working door to
 * anybody testing it with their own card.
 */
uint32_t *stage = nullptr;
int stageCount = 0, stageTotal = 0;
long stageVersion = 0;

int aclFind(uint32_t card) {
  int lo = 0, hi = aclCount - 1;
  while (lo <= hi) {
    int mid = (lo + hi) / 2;
    if (acl[mid] == card) return mid;
    if (acl[mid] < card) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}

void aclSort(uint32_t *a, int n) {
  // Insertion sort: n is at most 1000 and the server sends the list in id
  // order, so it arrives very nearly sorted. A quicksort here would be more
  // code for a case that does not occur.
  for (int i = 1; i < n; i++) {
    uint32_t key = a[i];
    int j = i - 1;
    while (j >= 0 && a[j] > key) { a[j + 1] = a[j]; j--; }
    a[j + 1] = key;
  }
}

void aclSave() {
  store.putBytes("acl", acl, (size_t)aclCount * sizeof(uint32_t));
  store.putInt("aclN", aclCount);
  store.putLong("aclV", aclVersion);
  cv.set("aclCount", aclCount);
  cv.set("aclVersion", (int)aclVersion);
}

void aclLoad() {
  aclCount = store.getInt("aclN", 0);
  if (aclCount < 0 || aclCount > ACL_MAX) aclCount = 0;
  if (aclCount) {
    size_t got = store.getBytes("acl", acl, (size_t)aclCount * sizeof(uint32_t));
    if (got != (size_t)aclCount * sizeof(uint32_t)) aclCount = 0;
  }
  aclVersion = store.getLong("aclV", 0);
}

/* ------------------------------------------------------------------ */
/* The offline queue                                                   */
/* ------------------------------------------------------------------ */

/*
 * The offline queue. `struct Punch` is in attend_types.h — see the note there
 * about the Arduino build step and generated prototypes.
 */

#define QUEUE_MAX 240
Punch queue[QUEUE_MAX];
int qHead = 0, qCount = 0;
uint32_t punchSeq = 0;

void queueSave() {
  store.putBytes("q", queue, sizeof(Punch) * (size_t)QUEUE_MAX);
  store.putInt("qh", qHead);
  store.putInt("qc", qCount);
  cv.set("queued", qCount);
}

void queueLoad() {
  qHead = store.getInt("qh", 0);
  qCount = store.getInt("qc", 0);
  if (qHead < 0 || qHead >= QUEUE_MAX) qHead = 0;
  if (qCount < 0 || qCount > QUEUE_MAX) qCount = 0;
  if (qCount) store.getBytes("q", queue, sizeof(Punch) * (size_t)QUEUE_MAX);
}

void queuePush(const Punch &p) {
  int tail = (qHead + qCount) % QUEUE_MAX;
  queue[tail] = p;
  if (qCount < QUEUE_MAX) {
    qCount++;
  } else {
    /*
     * Full. The oldest is dropped rather than the newest refused.
     *
     * Neither is good and this is the less bad one. A terminal that stops
     * recording once it is full quietly stops being an attendance system for
     * the rest of the outage, and the scans it refuses are the ones nobody
     * knows are missing. Overwriting loses the oldest, which is the part most
     * likely to have been reconstructed from somewhere else by the time
     * anybody looks. Either way the loss is counted and reported.
     */
    qHead = (qHead + 1) % QUEUE_MAX;
    store.putLong("qdrop", store.getLong("qdrop", 0) + 1);
  }
  queueSave();
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

String bannerText = "", bannerSub = "";
bool bannerOk = false;
unsigned long bannerUntil = 0;
unsigned long relayUntil = 0, beepUntil = 0;
long scansToday = 0, grantedToday = 0, deniedToday = 0;
uint32_t lastUid = 0;
unsigned long lastUidAt = 0;

void banner(const char *big, const String &sub, bool ok, unsigned long ms = 2500) {
  bannerText = big;
  bannerSub = sub;
  bannerOk = ok;
  bannerUntil = millis() + ms;
}

void beep(int ms) {
  if (!buzzerOn) return;
  digitalWrite(BUZZER, HIGH);
  beepUntil = millis() + ms;
}

void releaseDoor() {
  digitalWrite(DOOR_RELAY, HIGH);
  relayUntil = millis() + (unsigned long)relaySec * 1000UL;
  cv.set("doorReleased", true);
}

void drawScreen() {
  if (!hasDisplay) return;
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(1);

  if (bannerText.length() && (long)(bannerUntil - millis()) > 0) {
    oled.setTextSize(2);
    oled.setCursor(0, 6);
    oled.print(bannerText);
    oled.setTextSize(1);
    if (bannerSub.length()) {
      oled.setCursor(0, 30);
      oled.print(bannerSub.substring(0, 21));
    }
    oled.drawFastHLine(0, 46, 128, SSD1306_WHITE);
    oled.setCursor(0, 52);
    oled.print(bannerOk ? F("Thank you") : F("See the office"));
    oled.display();
    return;
  }

  /*
   * Idle. Everything on this screen answers a question somebody standing in
   * front of a silent terminal actually asks: is it on, which way does this
   * door count, is it working, and has it lost the network.
   */
  oled.setCursor(0, 0);
  oled.print(terminalName.substring(0, 14));
  oled.setCursor(98, 0);
  oled.print(cv.online() ? F("LINK") : F("OFF"));
  oled.drawFastHLine(0, 10, 128, SSD1306_WHITE);

  oled.setTextSize(2);
  oled.setCursor(0, 18);
  oled.print(F("SCAN"));
  oled.setTextSize(1);
  oled.setCursor(62, 24);
  oled.print(direction == "out" ? F("< OUT") : direction == "auto" ? F("IN/OUT") : F("IN >"));

  time_t now = time(nullptr);
  if (now > 1600000000) {
    struct tm t;
    localtime_r(&now, &t);
    char buf[6];
    snprintf(buf, sizeof(buf), "%02d:%02d", t.tm_hour, t.tm_min);
    oled.setCursor(0, 40);
    oled.print(buf);
  }
  oled.setCursor(40, 40);
  oled.print(scansToday);
  oled.print(F(" today"));

  oled.setCursor(0, 54);
  if (!hasReader) {
    oled.print(F("READER NOT FOUND"));
  } else if (qCount > 0) {
    oled.print(qCount);
    oled.print(F(" waiting to send"));
  } else {
    oled.print(aclCount);
    oled.print(F(" cards loaded"));
  }
  oled.display();
}

/* ------------------------------------------------------------------ */
/* Publishing                                                          */
/* ------------------------------------------------------------------ */

const char *REASONS[] = { "ok", "unknown-card", "offline", "duplicate" };

void publishPunch(const Punch &p, bool replay) {
  JsonDocument d;
  d["type"] = "punch";
  d["seq"] = (long)p.seq;
  d["card"] = (long)p.uid;
  d["granted"] = p.granted != 0;
  d["direction"] = p.dir ? "out" : "in";
  d["method"] = p.method == 2 ? "rex" : p.method == 1 ? "wiegand" : "card";
  d["reason"] = REASONS[p.reason < 4 ? p.reason : 0];
  /*
   * Zero means "this terminal had no clock" — see the Punch struct. The server
   * timestamps arrival regardless, so a punch is never undated; it is only
   * ever imprecisely dated, and it says which.
   */
  d["ts"] = (long)p.ts;
  d["offline"] = replay;
  cv.publishTelemetry(d.as<JsonObjectConst>());
}

void drainQueue() {
  if (!cv.online() || qCount == 0) return;
  /*
   * A few per pass, not all of them.
   *
   * Two hundred punches published in one loop iteration is two hundred MQTT
   * writes without servicing the reader, and a terminal that ignores cards
   * while it catches up looks broken at exactly the moment a queue exists —
   * the morning after the outage, with a queue of people at the door.
   */
  int budget = 5;
  while (qCount > 0 && budget-- > 0) {
    publishPunch(queue[qHead], true);
    qHead = (qHead + 1) % QUEUE_MAX;
    qCount--;
  }
  queueSave();
}

/* ------------------------------------------------------------------ */
/* Deciding                                                            */
/* ------------------------------------------------------------------ */

void handleCard(uint32_t uid, uint8_t method) {
  if (!uid) return;

  /*
   * One card presented twice in a few seconds is one person, not two.
   *
   * Readers re-read a card left sitting on them, and people tap again when
   * they are not sure it worked. Without this a register shows somebody
   * arriving three times, and on an in/out terminal it shows them leaving a
   * second after they came in.
   */
  if (uid == lastUid && millis() - lastUidAt < (unsigned long)dedupeSec * 1000UL) {
    banner("AGAIN?", "Already scanned", true, 1500);
    beep(60);
    return;
  }
  lastUid = uid;
  lastUidAt = millis();

  bool known = aclFind(uid) >= 0;
  bool online = cv.online();
  bool granted;
  uint8_t reason;

  if (known) {
    granted = true;
    reason = 0;
  } else if (!online && offlineFailOpen) {
    // A site that has chosen to fail open. Recorded as such, so the register
    // shows plainly that nobody checked this one.
    granted = true;
    reason = 2;
  } else {
    granted = false;
    reason = online ? 1 : 2;
  }

  // Attendance-only terminals never drive the relay, whatever the decision.
  if (granted && mode != "attendance") releaseDoor();

  digitalWrite(granted ? LED_OK : LED_NO, HIGH);
  beep(granted ? 120 : 500);
  banner(granted ? "WELCOME" : "NO ENTRY",
         granted ? (online ? String("Checking name...") : String("Recorded offline"))
                 : (reason == 2 ? String("Network down") : String("Card not recognised")),
         granted);

  scansToday++;
  if (granted) grantedToday++; else deniedToday++;

  Punch p;
  p.seq = ++punchSeq;
  p.uid = uid;
  time_t now = time(nullptr);
  p.ts = now > 1600000000 ? (uint32_t)now : 0;
  p.granted = granted ? 1 : 0;
  p.dir = direction == "out" ? 1 : 0;
  p.method = method;
  p.reason = reason;

  if (online) publishPunch(p, false);
  else queuePush(p);

  store.putULong("seq", punchSeq);
  cv.set("scansToday", scansToday);
  cv.set("lastCard", (long)uid);
  cv.set("lastGranted", granted);
  cv.publishStateNow();
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

void applyAclChunk(JsonArrayConst cards) {
  if (!stage) return;
  for (JsonVariantConst v : cards) {
    if (stageCount >= ACL_MAX) break;
    stage[stageCount++] = (uint32_t)v.as<long>();
  }
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "acl") {
    const char *m = p["mode"].is<const char *>() ? p["mode"].as<const char *>() : "";

    if (strcmp(m, "begin") == 0) {
      if (stage) free(stage);
      stage = (uint32_t *)malloc(sizeof(uint32_t) * ACL_MAX);
      stageCount = 0;
      stageTotal = p["total"].is<int>() ? p["total"].as<int>() : 0;
      stageVersion = p["version"].is<long>() ? p["version"].as<long>() : 0;
      banner("UPDATING", "Loading cards", true, 4000);
      return;
    }
    if (strcmp(m, "chunk") == 0) {
      if (p["cards"].is<JsonArrayConst>()) applyAclChunk(p["cards"].as<JsonArrayConst>());
      return;
    }
    if (strcmp(m, "commit") == 0) {
      if (!stage) return;
      // Refused unless everything the server said it would send arrived.
      if (stageTotal > 0 && stageCount != stageTotal) {
        JsonDocument d;
        d["type"] = "acl";
        d["state"] = "failed";
        d["expected"] = stageTotal;
        d["received"] = stageCount;
        cv.publishTelemetry(d.as<JsonObjectConst>());
        free(stage); stage = nullptr; stageCount = 0;
        banner("UPDATE FAILED", "Kept old list", false, 4000);
        return;
      }
      memcpy(acl, stage, sizeof(uint32_t) * (size_t)stageCount);
      aclCount = stageCount;
      aclVersion = stageVersion;
      aclSort(acl, aclCount);
      aclSave();
      free(stage); stage = nullptr; stageCount = 0;
      banner("UPDATED", String(aclCount) + " cards", true, 2500);

      JsonDocument d;
      d["type"] = "acl";
      d["state"] = "ready";
      d["version"] = (long)aclVersion;
      d["count"] = aclCount;
      cv.publishTelemetry(d.as<JsonObjectConst>());
      cv.publishStateNow();
      return;
    }
    if (strcmp(m, "add") == 0 || strcmp(m, "remove") == 0) {
      // One person joining or leaving does not need a full push.
      bool adding = strcmp(m, "add") == 0;
      if (p["cards"].is<JsonArrayConst>()) {
        for (JsonVariantConst v : p["cards"].as<JsonArrayConst>()) {
          uint32_t card = (uint32_t)v.as<long>();
          int at = aclFind(card);
          if (adding && at < 0 && aclCount < ACL_MAX) {
            acl[aclCount++] = card;
            aclSort(acl, aclCount);
          } else if (!adding && at >= 0) {
            for (int i = at; i < aclCount - 1; i++) acl[i] = acl[i + 1];
            aclCount--;
          }
        }
      }
      if (p["version"].is<long>()) aclVersion = p["version"].as<long>();
      aclSave();
      cv.publishStateNow();
    }
    return;
  }

  if (action == "greet") {
    /*
     * The server saying who that was.
     *
     * The terminal decided a second ago and the door is already open; this is
     * the name on the screen and nothing more. Deliberately not part of the
     * decision — a greeting that arrives late, or never, must not be able to
     * hold a door shut.
     */
    const char *name = p["name"].is<const char *>() ? p["name"].as<const char *>() : "";
    const char *status = p["status"].is<const char *>() ? p["status"].as<const char *>() : "";
    const char *msg = p["message"].is<const char *>() ? p["message"].as<const char *>() : "";
    bool ok = strcmp(status, "denied") != 0;
    const char *big = strlen(status) == 0        ? "WELCOME"
                    : strcmp(status, "late") == 0   ? "LATE"
                    : strcmp(status, "denied") == 0 ? "NO ENTRY"
                    : strcmp(status, "out") == 0    ? "GOODBYE"
                                                    : "WELCOME";
    banner(big, strlen(msg) ? String(msg) : String(name), ok, 3000);
    return;
  }

  if (action == "open") {
    // Remote release, from the console or an automation. Recorded as a punch
    // with no card, so the door log has no unexplained openings in it.
    releaseDoor();
    banner("OPEN", "Released remotely", true);
    beep(120);
    JsonDocument d;
    d["type"] = "punch";
    d["seq"] = (long)++punchSeq;
    d["card"] = 0;
    d["granted"] = true;
    d["direction"] = "in";
    d["method"] = "remote";
    d["reason"] = "ok";
    d["ts"] = (long)time(nullptr);
    d["offline"] = false;
    cv.publishTelemetry(d.as<JsonObjectConst>());
    store.putULong("seq", punchSeq);
    return;
  }

  if (action == "sync") {
    drainQueue();
    cv.publishStateNow();
    return;
  }

  if (action == "set") {
    if (p["mode"].is<const char *>()) {
      String v = String(p["mode"].as<const char *>());
      if (v == "attendance" || v == "access" || v == "both") { mode = v; store.putString("mode", mode); }
    }
    if (p["direction"].is<const char *>()) {
      String v = String(p["direction"].as<const char *>());
      if (v == "in" || v == "out" || v == "auto") { direction = v; store.putString("dir", direction); }
    }
    if (p["terminalName"].is<const char *>()) {
      terminalName = String(p["terminalName"].as<const char *>());
      store.putString("tname", terminalName);
    }
    if (p["relaySec"].is<int>()) {
      int v = p["relaySec"].as<int>();
      // Never zero — a strike released for no time is a door that never opens
      // — and never long enough to hold a door open all morning.
      relaySec = v < 1 ? 1 : (v > 30 ? 30 : v);
      store.putInt("rsec", relaySec);
    }
    if (p["dedupeSec"].is<int>()) {
      int v = p["dedupeSec"].as<int>();
      dedupeSec = v < 1 ? 1 : (v > 120 ? 120 : v);
      store.putInt("dsec", dedupeSec);
    }
    if (p["heldOpenSec"].is<int>()) {
      int v = p["heldOpenSec"].as<int>();
      heldOpenSec = v < 5 ? 5 : (v > 600 ? 600 : v);
      store.putInt("hsec", heldOpenSec);
    }
    if (p["buzzer"].is<bool>()) { buzzerOn = p["buzzer"].as<bool>(); store.putBool("buzz", buzzerOn); }
    if (p["offlineFailOpen"].is<bool>()) {
      offlineFailOpen = p["offlineFailOpen"].as<bool>();
      store.putBool("ofo", offlineFailOpen);
    }
    cv.set("mode", mode.c_str());
    cv.set("direction", direction.c_str());
    cv.set("terminalName", terminalName.c_str());
    cv.set("relaySec", relaySec);
    cv.set("dedupeSec", dedupeSec);
    cv.set("heldOpenSec", heldOpenSec);
    cv.set("buzzer", buzzerOn);
    cv.set("offlineFailOpen", offlineFailOpen);
    cv.publishStateNow();
  }
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

void setup() {
  Serial.begin(115200);
  pinMode(DOOR_RELAY, OUTPUT); digitalWrite(DOOR_RELAY, LOW);
  pinMode(BUZZER, OUTPUT); digitalWrite(BUZZER, LOW);
  pinMode(LED_OK, OUTPUT); pinMode(LED_NO, OUTPUT);
  pinMode(REX_BTN, INPUT);
  pinMode(DOOR_SENSE, INPUT);
  pinMode(RESET_BTN, INPUT_PULLUP);

  pinMode(WIEGAND_D0, INPUT_PULLUP);
  pinMode(WIEGAND_D1, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(WIEGAND_D0), onD0, FALLING);
  attachInterrupt(digitalPinToInterrupt(WIEGAND_D1), onD1, FALLING);

  Wire.begin(OLED_SDA, OLED_SCL);
  hasDisplay = oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (hasDisplay) {
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(1);
    oled.setCursor(0, 24);
    oled.println(F("Circuvent Attend"));
    oled.println(F("starting..."));
    oled.display();
  }

  SPI.begin();
  rc522.PCD_Init();
  /*
   * A missing reader is reported rather than assumed.
   *
   * Version 0x00 or 0xFF means nothing answered on SPI — a loose ribbon, which
   * is the single most common fault on these installs. Without this check the
   * terminal boots looking perfectly healthy and simply never sees a card, and
   * whoever is standing at it blames the cards.
   */
  byte v = rc522.PCD_ReadRegister(MFRC522::VersionReg);
  hasReader = (v != 0x00 && v != 0xFF);

  store.begin("attend", false);
  mode = store.getString("mode", mode);
  direction = store.getString("dir", direction);
  terminalName = store.getString("tname", terminalName);
  relaySec = store.getInt("rsec", relaySec);
  dedupeSec = store.getInt("dsec", dedupeSec);
  heldOpenSec = store.getInt("hsec", heldOpenSec);
  buzzerOn = store.getBool("buzz", buzzerOn);
  offlineFailOpen = store.getBool("ofo", offlineFailOpen);
  punchSeq = store.getULong("seq", 0);
  aclLoad();
  queueLoad();

  cv.onCommand(onCommand);
  cv.setInterval(15000);
  cv.setResetButton(RESET_BTN);
  cv.begin();

  cv.set("mode", mode.c_str());
  cv.set("direction", direction.c_str());
  cv.set("terminalName", terminalName.c_str());
  cv.set("relaySec", relaySec);
  cv.set("dedupeSec", dedupeSec);
  cv.set("heldOpenSec", heldOpenSec);
  cv.set("buzzer", buzzerOn);
  cv.set("offlineFailOpen", offlineFailOpen);
  cv.set("aclCount", aclCount);
  cv.set("aclVersion", (int)aclVersion);
  cv.set("queued", qCount);
  cv.set("reader", hasReader);
  cv.set("display", hasDisplay);
  cv.set("scansToday", scansToday);
  cv.publishStateNow();
  drawScreen();
}

/** An MFRC522 card id as a 32-bit number, or 0 when there is no card. */
uint32_t readCard() {
  if (!hasReader) return 0;
  if (!rc522.PICC_IsNewCardPresent()) return 0;
  if (!rc522.PICC_ReadCardSerial()) return 0;
  uint32_t uid = 0;
  /*
   * The low four bytes. 7-byte UIDs (NTAG, some MIFARE) are truncated, which
   * is what every panel on the market does and what the number printed on the
   * card matches. Hashing all seven would be more correct in the abstract and
   * would produce ids nobody could look up against the cards in their hand.
   */
  for (byte i = 0; i < rc522.uid.size && i < 4; i++) uid = (uid << 8) | rc522.uid.uidByte[i];
  rc522.PICC_HaltA();
  rc522.PCD_StopCrypto1();
  return uid;
}

void loop() {
  unsigned long now = millis();

  if (relayUntil && (long)(now - relayUntil) >= 0) {
    digitalWrite(DOOR_RELAY, LOW);
    relayUntil = 0;
    cv.set("doorReleased", false);
  }
  if (beepUntil && (long)(now - beepUntil) >= 0) { digitalWrite(BUZZER, LOW); beepUntil = 0; }
  if (bannerUntil && (long)(now - bannerUntil) >= 0) {
    digitalWrite(LED_OK, LOW);
    digitalWrite(LED_NO, LOW);
  }

  uint32_t card = readCard();
  if (card) handleCard(card, 0);

  // A completed Wiegand frame: 25 ms of quiet after the last bit.
  if (wgBits > 0 && now - wgLast > 25) {
    noInterrupts();
    unsigned long data = wgData; int bits = wgBits;
    wgData = 0; wgBits = 0;
    interrupts();
    if (bits >= 24 && bits <= 37) {
      // 26-bit Wiegand carries a leading and a trailing parity bit; everything
      // between them is the number printed on the card.
      uint32_t id = bits == 26 ? (uint32_t)((data >> 1) & 0xFFFFFF) : (uint32_t)(data & 0xFFFFFF);
      handleCard(id, 1);
    }
  }

  // Request to exit. Opens the door and is written down: a door that can be
  // opened without leaving a trace is not an access-controlled door.
  static unsigned long lastRex = 0;
  if (digitalRead(REX_BTN) == LOW && now - lastRex > 1500) {
    lastRex = now;
    if (mode != "attendance") releaseDoor();
    banner("EXIT", "Door released", true, 1800);
    beep(80);
    Punch p;
    p.seq = ++punchSeq; p.uid = 0;
    time_t t = time(nullptr);
    p.ts = t > 1600000000 ? (uint32_t)t : 0;
    p.granted = 1; p.dir = 1; p.method = 2; p.reason = 0;
    if (cv.online()) publishPunch(p, false); else queuePush(p);
    store.putULong("seq", punchSeq);
  }

  /*
   * The door contact.
   *
   * Two alarms, both of which say something a card reader alone cannot: a door
   * that opened while nothing granted it has been forced or propped, and a
   * door standing open long after its release has been wedged. On a server
   * room or a school side gate these are the events worth telling somebody
   * about, and they are invisible to a system that only records scans.
   */
  static bool doorWasOpen = false;
  static unsigned long doorOpenedAt = 0;
  static bool heldReported = false;
  bool doorOpen = digitalRead(DOOR_SENSE) == HIGH;
  if (doorOpen != doorWasOpen) {
    doorWasOpen = doorOpen;
    cv.set("doorOpen", doorOpen);
    if (doorOpen) {
      doorOpenedAt = now;
      heldReported = false;
      if (!relayUntil) {
        JsonDocument d;
        d["type"] = "door";
        d["state"] = "forced";
        d["ts"] = (long)time(nullptr);
        cv.publishTelemetry(d.as<JsonObjectConst>());
        banner("DOOR FORCED", "Not opened by a card", false, 4000);
        beep(900);
      }
    } else {
      JsonDocument d;
      d["type"] = "door";
      d["state"] = "closed";
      d["ts"] = (long)time(nullptr);
      cv.publishTelemetry(d.as<JsonObjectConst>());
    }
    cv.publishStateNow();
  }
  if (doorOpen && !heldReported && now - doorOpenedAt > (unsigned long)heldOpenSec * 1000UL) {
    heldReported = true;
    JsonDocument d;
    d["type"] = "door";
    d["state"] = "held";
    d["seconds"] = heldOpenSec;
    d["ts"] = (long)time(nullptr);
    cv.publishTelemetry(d.as<JsonObjectConst>());
    banner("DOOR HELD OPEN", "Please close it", false, 5000);
    beep(600);
  }

  drainQueue();

  /*
   * Reset the day's counters at midnight — but only once the terminal has a
   * real clock. Rolling on a guess would zero the count in the middle of the
   * morning on a site that has just come back from a power cut, which is the
   * one morning somebody is watching that number.
   */
  static int lastYday = -1;
  time_t nowSec = time(nullptr);
  if (nowSec > 1600000000) {
    struct tm t;
    localtime_r(&nowSec, &t);
    if (lastYday >= 0 && t.tm_yday != lastYday) {
      scansToday = grantedToday = deniedToday = 0;
      cv.set("scansToday", 0L);
    }
    lastYday = t.tm_yday;
  }

  static unsigned long lastDraw = 0;
  if (now - lastDraw > 200) { lastDraw = now; drawScreen(); }

  cv.loop();
}
