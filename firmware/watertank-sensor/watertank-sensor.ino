/*
 * Circuvent Tank Sensor — the unit that sits on the tank
 * =====================================================
 * Half of the WaterTank Duo. Measures the water level in the overhead tank and
 * sends it down to the starter by LoRa. Battery powered, so it spends almost
 * all of its life asleep.
 *
 * It has no WiFi and no MQTT, which is the point: it is on a roof, often out of
 * range of the house router and always out of reach of mains power. The starter
 * is the half that talks to the platform, and the only thing this unit has to
 * do reliably is say how much water there is.
 *
 * Deps: CircuventDevice (for CvTankLink + tweetnacl), LoRa by Sandeep Mistry.
 * Board: ESP32.
 */
#define CV_FW_VERSION "1.0.1"

#include <Arduino.h>
#include <LoRa.h>
#include <Preferences.h>
#include <SPI.h>
#include <esp_sleep.h>

#include "CvTankLink.h"

// ---- pins ----
#define TRIG_PIN 25
#define ECHO_PIN 26
#define LORA_SS 5
#define LORA_RST 14
#define LORA_DIO0 13
#define BATT_ADC 34   // divider off the cell; input-only pin
#define PAIR_BTN 0    // BOOT
#define LED_PIN 2
#define SENSOR_EN 27  // switches the ultrasonic module's supply

/*
 * A pin used twice is a fault that costs an afternoon on a bench and never
 * shows up as an error — the second peripheral simply misbehaves. The camera
 * firmware guards its pins this way for the same reason.
 */
#if (TRIG_PIN == ECHO_PIN) || (LORA_SS == LORA_RST) || (LORA_SS == LORA_DIO0) || \
    (TRIG_PIN == LORA_SS) || (ECHO_PIN == LORA_SS) || (SENSOR_EN == TRIG_PIN)
#error "CV_PIN_CLASH: two peripherals are assigned the same pin"
#endif

/*
 * 433 MHz. Chosen for the concrete, not for the data rate — see CvTankLink.h.
 * Must match the starter exactly; a mismatch here is silent on both sides.
 */
#define LORA_FREQ 433E6
#define LORA_SF 9         // spreading factor: range against airtime
#define LORA_TX_POWER 17  // dBm

Preferences store;

uint8_t linkKey[CV_TANK_KEY_BYTES];
uint8_t pairId = 0;
bool paired = false;

/*
 * Survives deep sleep. The sequence counter must never repeat or go backwards,
 * because the starter refuses anything it has already seen — that is what stops
 * a recorded packet being replayed at the pump later. RTC memory keeps it
 * across sleep; NVS keeps it across a power cut.
 */
RTC_DATA_ATTR uint32_t rtcSeq = 0;
RTC_DATA_ATTR bool rtcSeqValid = false;

/*
 * The highest downlink sequence accepted, kept across sleep for the same
 * reason in the other direction: without it a recorded "measure now" could be
 * replayed at this unit repeatedly, and each replay costs a transmission —
 * which on a battery is the attack that matters here, not the instruction
 * itself.
 */
RTC_DATA_ATTR uint32_t rtcDownSeq = 0;

/** Report cadence, tunable from the app so a roof visit is not needed. */
RTC_DATA_ATTR uint16_t rtcIntervalS = 0;

uint16_t lastMm = 0;
bool pairAcked = false;

// ------------------------------------------------------------------ sensing --

/** One ultrasonic reading, in mm. 0 means no usable echo. */
uint16_t readDistanceMm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(3);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long us = pulseIn(ECHO_PIN, HIGH, 40000UL);  // ~6.8 m ceiling
  if (us == 0) return 0;
  float mm = (us * 0.343f) / 2.0f;
  if (mm < 20.0f || mm > 6000.0f) return 0;
  return (uint16_t)mm;
}

/**
 * Median of several readings.
 *
 * A single ultrasonic sample off a water surface is not trustworthy: ripple
 * from the inlet, foam, and the tank wall all produce occasional wild returns.
 * A median throws those away, where an average would let one bad sample drag
 * the answer — and a level wrong by a metre for one cycle can start a pump that
 * did not need to run.
 */
uint16_t medianDistanceMm() {
  const int N = 7;
  uint16_t v[N];
  int good = 0;
  for (int i = 0; i < N; i++) {
    uint16_t d = readDistanceMm();
    if (d > 0) v[good++] = d;
    delay(60);
  }
  if (good == 0) return 0;
  for (int i = 0; i < good; i++)
    for (int j = i + 1; j < good; j++)
      if (v[j] < v[i]) { uint16_t t = v[i]; v[i] = v[j]; v[j] = t; }
  return v[good / 2];
}

uint16_t readBatteryMv() {
  long acc = 0;
  for (int i = 0; i < 32; i++) { acc += analogRead(BATT_ADC); delayMicroseconds(200); }
  float counts = acc / 32.0f;
  // 2:1 divider into a 3.3 V, 12-bit ADC.
  float v = (counts * 3.3f / 4095.0f) * 2.0f;
  return (uint16_t)(v * 1000.0f);
}

// ------------------------------------------------------------------ pairing --

void loadIdentity() {
  store.begin("cvtank", false);
  paired = store.getBool("paired", false);
  pairId = store.getUChar("pairId", 0);
  size_t n = store.getBytes("key", linkKey, sizeof(linkKey));

  if (n != sizeof(linkKey)) {
    /*
     * First boot: mint a key. Generated here rather than shipped as a per-batch
     * constant, so recovering one unit's key tells an attacker nothing about
     * any other unit.
     */
    for (size_t i = 0; i < sizeof(linkKey); i++) linkKey[i] = (uint8_t)esp_random();
    store.putBytes("key", linkKey, sizeof(linkKey));
    // A pair id derived from the key keeps two neighbouring installs from
    // colliding before either has been paired.
    pairId = linkKey[0];
    store.putUChar("pairId", pairId);
    paired = false;
  }

  if (!rtcSeqValid) {
    /*
     * Resume the counter after a power cut, and jump forward.
     *
     * NVS is only written every so often to spare the flash, so the stored
     * value lags the one actually transmitted. Continuing from the stored value
     * would re-send sequence numbers the starter has already seen and rejected
     * as replays — the link would look dead until it caught up. The jump costs
     * nothing: the counter is 32 bits wide.
     */
    rtcSeq = store.getUInt("seq", 0) + 1000;
    rtcSeqValid = true;
    rtcIntervalS = store.getUShort("interval", 0);
  }
}

void persistSeq() {
  static uint32_t lastSaved = 0;
  if (rtcSeq - lastSaved >= 500) {
    store.putUInt("seq", rtcSeq);
    lastSaved = rtcSeq;
  }
}

/**
 * Offer ourselves to a starter that is listening.
 *
 * This is the one moment the key is on the air. It is bounded to a short
 * window, has to be started by hand on this unit, and the starter only listens
 * when its own owner has opened a pairing window from the app. An attacker
 * would need to be in radio range during those same seconds. That is the
 * standard trade for pairing without a second channel, and it is written down
 * here rather than left for someone to discover.
 */
void sendPairOffer() {
  CvTankPacket p;
  cvTankInitPacket(p, CV_TANK_MSG_PAIR, pairId);
  p.levelMm = lastMm;
  p.batteryMv = readBatteryMv();
  p.seq = ++rtcSeq;

  /*
   * Signed with the key it carries, which proves the sender holds the key it is
   * presenting. It does not conceal it — that is the limitation above.
   */
  cvTankSign(p, linkKey);

  LoRa.beginPacket();
  LoRa.write((const uint8_t *)&p, sizeof(p));
  LoRa.write(linkKey, sizeof(linkKey));
  LoRa.endPacket();
}

void pairingMode() {
  uint32_t started = millis();
  bool led = false;
  pairAcked = false;

  /*
   * Stop as soon as the starter acknowledges, rather than transmitting for the
   * full minute regardless. The installer is standing on a roof; telling them
   * immediately that it worked is most of the value of having a downlink at all.
   */
  while (millis() - started < CV_TANK_PAIR_WINDOW_MS && !pairAcked) {
    sendPairOffer();
    listenForDownlink();
    led = !led;
    digitalWrite(LED_PIN, led ? HIGH : LOW);
    if (!pairAcked) delay(900);
  }

  if (pairAcked) {
    // Solid, unmistakable: paired.
    for (int i = 0; i < 3; i++) {
      digitalWrite(LED_PIN, HIGH); delay(220);
      digitalWrite(LED_PIN, LOW); delay(120);
    }
  } else {
    /*
     * Nothing heard us. Say so, rather than claiming success — the previous
     * behaviour sent people back up a ladder to find out.
     */
    for (int i = 0; i < 10; i++) {
      digitalWrite(LED_PIN, HIGH); delay(60);
      digitalWrite(LED_PIN, LOW); delay(60);
    }
  }
  digitalWrite(LED_PIN, LOW);
}

// ------------------------------------------------------------------- report --

void sendReading(uint16_t mm, uint16_t mv) {
  CvTankPacket p;
  cvTankInitPacket(p, CV_TANK_MSG_READING, pairId);
  p.levelMm = mm;
  p.batteryMv = mv;
  p.seq = ++rtcSeq;

  if (mm == 0) p.flags |= CV_TANK_FLAG_SENSOR_FAULT;
  if (mv < CV_TANK_BATT_LOW_MV) p.flags |= CV_TANK_FLAG_LOW_BATTERY;

  cvTankSign(p, linkKey);

  LoRa.beginPacket();
  LoRa.write((const uint8_t *)&p, sizeof(p));
  LoRa.endPacket();

  persistSeq();
}

bool radioUp() {
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ)) return false;
  LoRa.setSpreadingFactor(LORA_SF);
  LoRa.setTxPower(LORA_TX_POWER);
  LoRa.enableCrc();
  return true;
}

// ----------------------------------------------------------------- downlink --

/**
 * Listen briefly for an instruction from the starter.
 *
 * Called immediately after transmitting, which is the only moment a
 * deep-sleeping unit can cheaply be reached: the radio is already on, and the
 * starter knows to within milliseconds when to answer. Returns true if a
 * "measure now" arrived, so the caller can take a fresh reading before sleeping.
 */
bool listenForDownlink() {
  LoRa.receive();
  uint32_t until = millis() + CV_TANK_RX_WINDOW_MS;
  bool measureNow = false;

  while ((int32_t)(millis() - until) < 0) {
    int sz = LoRa.parsePacket();
    if (sz <= 0) { delay(2); continue; }

    if (sz != (int)sizeof(CvTankDownlink)) {
      while (LoRa.available()) LoRa.read();   // someone else on the band
      continue;
    }

    CvTankDownlink d;
    uint8_t *raw = (uint8_t *)&d;
    for (size_t i = 0; i < sizeof(d) && LoRa.available(); i++) raw[i] = (uint8_t)LoRa.read();
    while (LoRa.available()) LoRa.read();

    if (d.pairId != pairId) continue;
    if (!cvTankVerifyDownlink(d, linkKey)) continue;
    // Replays cost this unit a transmission each, which on a battery is the
    // part worth defending against.
    if (d.seq <= rtcDownSeq) continue;
    rtcDownSeq = d.seq;

    if (d.instructions & CV_TANK_DOWN_PAIR_ACK) {
      /*
       * The starter has us. This is what pairing was missing: the sensor used
       * to transmit for the full window and then declare success whether or not
       * anything heard it, so an installer got a confident "done" indication,
       * climbed down, and found nothing worked.
       */
      pairAcked = true;
      paired = true;
      store.putBool("paired", true);
    }

    if (d.reportIntervalS != 0) {
      uint16_t want = cvTankClampInterval(d.reportIntervalS);
      if (want != rtcIntervalS) {
        rtcIntervalS = want;
        store.putUShort("interval", want);
      }
    }

    if (d.instructions & CV_TANK_DOWN_IDENTIFY) {
      for (int i = 0; i < 8; i++) {
        digitalWrite(LED_PIN, HIGH); delay(60);
        digitalWrite(LED_PIN, LOW); delay(60);
      }
    }

    if (d.instructions & CV_TANK_DOWN_MEASURE_NOW) measureNow = true;

    break;   // One instruction per window is enough.
  }

  return measureNow;
}

void sleepUntilNextReport() {
  LoRa.sleep();
  SPI.end();
  digitalWrite(SENSOR_EN, LOW);  // the ultrasonic module is the biggest idle draw
  uint32_t ms = (uint32_t)rtcIntervalS * 1000UL;
  if (ms == 0) ms = CV_TANK_REPORT_INTERVAL_MS;
  esp_sleep_enable_timer_wakeup((uint64_t)ms * 1000ULL);
  /*
   * Also wake on the pairing button, so pairing does not mean holding a button
   * through a whole sleep cycle on a roof.
   */
  esp_sleep_enable_ext0_wakeup((gpio_num_t)PAIR_BTN, 0);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(PAIR_BTN, INPUT_PULLUP);
  pinMode(SENSOR_EN, OUTPUT);
  digitalWrite(SENSOR_EN, HIGH);
  analogReadResolution(12);

  loadIdentity();

  if (!radioUp()) {
    /*
     * Without a radio this unit has no purpose, and a tight retry loop on a
     * battery is worse than useless. Sleep and try again next cycle — a loose
     * module often works after a power cycle.
     */
    for (int i = 0; i < 6; i++) {
      digitalWrite(LED_PIN, HIGH); delay(80);
      digitalWrite(LED_PIN, LOW); delay(80);
    }
    sleepUntilNextReport();
  }

  delay(80);  // let the ultrasonic module settle after its supply comes up

  bool wantsPairing =
      esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_EXT0 || digitalRead(PAIR_BTN) == LOW;

  lastMm = medianDistanceMm();

  if (wantsPairing) pairingMode();

  uint16_t mv = readBatteryMv();
  sendReading(lastMm, mv);

  /*
   * Listen once, right after speaking. If the starter asked for a fresh
   * reading — someone pulled to refresh in the app — take one and send it now
   * rather than making them wait out the sleep interval.
   */
  if (listenForDownlink()) {
    lastMm = medianDistanceMm();
    sendReading(lastMm, readBatteryMv());
    listenForDownlink();   // the reply may carry a new interval
  }

  // A short blink is worth the microamps: it is the only way an installer on a
  // roof can tell the unit is alive.
  digitalWrite(LED_PIN, HIGH);
  delay(20);
  digitalWrite(LED_PIN, LOW);

  sleepUntilNextReport();
}

void loop() {
  // Never reached: setup() always ends in deep sleep. Kept because the Arduino
  // core requires it to link.
}
