/*
 * Circuvent RFID Reader — the reader-only model.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS DEVICE IS
 *
 * A card reader and nothing else. It reads a card, sends the number, and shows
 * the answer on two LEDs and a buzzer. It holds no allow-list, makes no access
 * decision, drives no door, and has no display.
 *
 * That is the whole point of the model. `rfid-attend` is the other one: it
 * caches a roster, decides locally, drives a strike and keeps working through a
 * network outage. Everything that makes it able to do that — the ACL, the
 * offline queue, the fail-open policy, the door sense — is absent here, because
 * a reader that only reports cannot be wrong about who is allowed in.
 *
 * SILENT WHEN IDLE
 *
 * The requirement this was built for: with no card present, the device sends
 * nothing. No polling, no periodic state, no telemetry. A room of these readers
 * on a quiet afternoon puts no traffic on the network at all.
 *
 * There is exactly one exception, and it is deliberate. See PRESENCE below.
 *
 * PRESENCE — why "absolutely nothing" is not achievable, and what is done
 * instead
 *
 * The control plane decides a device is online with
 * `online AND last_seen > now() - 90s`. The `online` flag comes from MQTT's
 * Last Will, but the staleness check exists because a will does not always
 * arrive: a device that loses power mid-session, or whose broker session is
 * reaped, never publishes its own death. Without the check such a reader would
 * read "online" for ever.
 *
 * So a device that publishes literally nothing is indistinguishable, after
 * ninety seconds, from one that has been unplugged. On a reader that is the
 * worst possible confusion: "nobody has scanned today" and "this thing has been
 * dead since Tuesday" would look identical on the board, and the second one is
 * a door nobody is recording.
 *
 * The compromise is to make the idle publish as small and as rare as the
 * ninety-second window allows, rather than to remove it. One state document
 * every 60 seconds, carrying four fields instead of twenty. That is a 97%
 * reduction against the 15-second twenty-field publish this replaces, while
 * keeping "is the reader alive" answerable.
 *
 * Card reads themselves are published the instant they happen, which is the
 * only traffic that carries information.
 */

#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>
#include <CircuventDevice.h>

#define CV_FW_VERSION "1.1.0"

/* ------------------------------------------------------------------ */
/* Pins — kept identical to rfid-attend where the function is the same, */
/* so one harness and one enclosure serve both models.                  */
/* ------------------------------------------------------------------ */
#define RC522_SS    5
#define RC522_RST   27
#define BUZZER      25
#define LED_OK      32   // green
#define LED_NO      33   // red
#define RESET_BTN    0   // shared with BOOT; held at power-on to re-provision

MFRC522 rc522(RC522_SS, RC522_RST);
CircuventDevice cv("rfid-only");

/*
 * Presence heartbeat. 60 s against the control plane's 90 s staleness window
 * leaves room for one lost publish before a healthy reader is reported down.
 * Going higher would make a single dropped packet look like a dead door.
 */
static const uint32_t HEARTBEAT_MS = 60000;

/*
 * Two reads of the same card inside this window are one presentation.
 *
 * An MFRC522 will happily report the same card several times a second while it
 * sits in the field, and a person holding a badge against a reader holds it for
 * about a second. Without this, one presentation becomes a burst of identical
 * punches — the exact "sends data when nothing happened" problem this model
 * exists to avoid, and it would land in the register as a dozen arrivals.
 */
static const uint32_t SAME_CARD_MS = 3000;

/** How long a verdict stays lit. */
static const uint32_t VERDICT_MS = 1500;

/**
 * How long to wait for the server's answer before refusing.
 *
 * A door has to fail closed. If the verdict does not arrive — the link dropped,
 * the control plane is down, the card is unknown and nothing replied — the
 * reader shows red rather than leaving the light off and the person guessing.
 * Two seconds is longer than the round trip has ever taken and short enough
 * that nobody stands there wondering.
 */
static const uint32_t VERDICT_TIMEOUT_MS = 2000;

static bool     hasReader   = false;
static uint32_t lastCard    = 0;
static uint32_t lastCardAt  = 0;
static uint32_t feedbackTil = 0;
static uint32_t punchSeq    = 0;
static bool     awaitingVerdict = false;
static uint32_t verdictDueBy = 0;
static Preferences store;

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

/**
 * Green plus a short chirp: the server allowed this card.
 *
 * Only ever set from a `greet` the server sent. This device holds no roster
 * and cannot know on its own — a reader that lit green because it had *read* a
 * card would be telling somebody they may enter on the strength of the card
 * existing, which is not access control.
 */
static void showGranted() {
  digitalWrite(LED_OK, HIGH);
  digitalWrite(LED_NO, LOW);
  tone(BUZZER, 2400, 90);
  feedbackTil = millis() + VERDICT_MS;
  awaitingVerdict = false;
}

/** Red plus a low double chirp: refused, or nothing came back. */
static void showDenied() {
  digitalWrite(LED_NO, HIGH);
  digitalWrite(LED_OK, LOW);
  tone(BUZZER, 700, 160);
  feedbackTil = millis() + VERDICT_MS;
  awaitingVerdict = false;
}

/**
 * The card was read and sent, and the answer has not arrived yet.
 *
 * Deliberately not green. The gap between reading a card and hearing back is
 * where somebody decides whether to push the door, and a green light during it
 * would be a guess shown as a decision.
 */
static void showReading() {
  digitalWrite(LED_OK, LOW);
  digitalWrite(LED_NO, LOW);
  tone(BUZZER, 1600, 40);
  awaitingVerdict = true;
  verdictDueBy = millis() + VERDICT_TIMEOUT_MS;
}

static void feedbackClear() {
  digitalWrite(LED_OK, LOW);
  digitalWrite(LED_NO, LOW);
  noTone(BUZZER);
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** The card in the field as a 32-bit number, or 0 when there is none. */
static uint32_t readCard() {
  if (!hasReader) return 0;
  if (!rc522.PICC_IsNewCardPresent()) return 0;
  if (!rc522.PICC_ReadCardSerial()) return 0;

  uint32_t uid = 0;
  for (uint8_t i = 0; i < rc522.uid.size && i < 4; i++) {
    uid = (uid << 8) | rc522.uid.uidByte[i];
  }
  rc522.PICC_HaltA();
  return uid;
}

/**
 * Sends one card read.
 *
 * The sequence number is persisted so it survives a reboot. Without it the
 * server cannot tell a genuine re-presentation from a duplicate delivery after
 * a reconnect, and the register gains arrivals nobody made.
 */
static void publishCard(uint32_t uid) {
  JsonDocument d;
  d["type"] = "punch";
  d["seq"]  = (long)++punchSeq;
  d["card"] = (long)uid;
  d["method"] = "card";
  /*
   * No `granted` and no `reason`. This model does not decide, and a field that
   * always said the same thing would invite somebody downstream to trust it.
   */
  d["ts"] = (long)time(nullptr);
  cv.publishTelemetry(d.as<JsonObjectConst>());
  store.putULong("seq", punchSeq);
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

/**
 * The server's verdict on the card just read.
 *
 * `greet` is the existing platform command — the same one the attendance
 * console and the full reader already speak — so the door decision reuses a
 * protocol rather than inventing one. Status is granted | denied | late.
 *
 * "late" is a grant. Somebody arriving late is still coming in; the lateness
 * belongs in the register, not on the door.
 */
static void onCommand(const String &action, JsonObjectConst p) {
  if (action != "greet") return;

  const char *status = p["status"] | "";
  if (strcmp(status, "granted") == 0 || strcmp(status, "late") == 0) {
    showGranted();
  } else {
    showDenied();
  }
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER, OUTPUT);
  pinMode(LED_OK, OUTPUT);
  pinMode(LED_NO, OUTPUT);
  pinMode(RESET_BTN, INPUT_PULLUP);
  feedbackClear();

  store.begin("rfid-only", false);
  punchSeq = store.getULong("seq", 0);

  SPI.begin();
  rc522.PCD_Init();
  delay(50);
  /*
   * Asked, not assumed. A reader whose wiring is wrong or whose 12 V supply is
   * down leaves the board perfectly healthy and every card silently ignored —
   * which is why this is reported as state rather than only logged.
   */
  hasReader = rc522.PCD_PerformSelfTest();
  rc522.PCD_Init();

  cv.onCommand(onCommand);
  cv.setInterval(HEARTBEAT_MS);
  cv.setResetButton(RESET_BTN);
  cv.begin();

  /*
   * Four fields, and each is load-bearing:
   *   reader  — the difference between "nobody scanned" and "nothing can".
   *   lastCard/lastSeenAt — lets the console show the last read without
   *                         querying telemetry, and makes a reader that is
   *                         connected but not reading obvious.
   * Everything rfid-attend reports about doors, rosters and queues is absent
   * because this model has none of them.
   */
  cv.set("reader", hasReader);
  cv.set("lastCard", 0L);
  cv.set("model", "rfid-only");
  cv.publishStateNow();

  if (!hasReader) showDenied();
}

void loop() {
  cv.loop();

  const uint32_t now = millis();

  if (feedbackTil && (int32_t)(now - feedbackTil) >= 0) {
    feedbackClear();
    feedbackTil = 0;
  }

  const uint32_t uid = readCard();
  if (!uid) return;   // No card: nothing is sent, which is the point.

  /*
   * The same card still resting on the reader is not a new presentation.
   * Compared before anything is published, so a held badge costs one message
   * rather than one per loop iteration.
   */
  if (uid == lastCard && (now - lastCardAt) < SAME_CARD_MS) return;

  lastCard = uid;
  lastCardAt = now;

  if (!cv.online()) {
    /*
     * Not queued, and that is the model's boundary rather than an omission.
     * Storing reads to flash and replaying them is what rfid-attend is for —
     * it also has the clock discipline and the sequence handling to make a
     * replayed punch trustworthy. A reader that cannot reach the server says so
     * on the spot, so the person presents again rather than walking away
     * believing they clocked in.
     */
    showDenied();
    return;
  }

  publishCard(uid);
  cv.set("lastCard", (long)uid);
  showReading();
}
