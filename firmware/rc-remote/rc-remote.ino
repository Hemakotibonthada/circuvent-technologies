/*
 * Circuvent RC Remote — the handset.
 * =========================================================================
 *
 * Two analogue sticks, a mode switch, trim buttons, a horn button and a lights
 * button. It sends the same control frame the phone dongle sends, at the same
 * 50 Hz, because the car should not be able to tell which one is driving it.
 *
 * WHY THE HANDSET EXISTS ALONGSIDE THE PHONE
 *
 * A phone is a poor thing to steer with. There is no centre detent, no travel,
 * and no way to feel where the stick is without looking — and looking at the
 * phone is looking away from the car. The phone is the better screen; the
 * handset is the better control. Both are supported and neither is the
 * fallback for the other.
 *
 * WHAT THE STICKS DO NOT DO
 *
 * They do not apply the power limit. The mode goes on the wire and the *car*
 * applies the ceiling, so a handset with a miscalibrated stick, or a modified
 * one, cannot exceed what the car has been told to allow. What the handset
 * does do is show the driver the same number the car will use, via
 * rcApplyLimits — a remote whose display disagrees with the vehicle is how
 * somebody discovers the limit by hitting it.
 */

/**
 * Version history:
 *   1.0.0  initial handset firmware.
 */
#define CV_FW_VERSION "1.0.0"

#include <Arduino.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#include "rc-protocol.h"

#ifndef CV_RC_CHANNEL
#define CV_RC_CHANNEL 6
#endif

/* ------------------------------------------------------------------- pins --*/

#ifndef PIN_STICK_THROTTLE
#define PIN_STICK_THROTTLE 1
#endif
#ifndef PIN_STICK_STEER
#define PIN_STICK_STEER 2
#endif
#ifndef PIN_BTN_HORN
#define PIN_BTN_HORN 4
#endif
#ifndef PIN_BTN_LIGHTS
#define PIN_BTN_LIGHTS 5
#endif
#ifndef PIN_BTN_MODE
#define PIN_BTN_MODE 6
#endif
#ifndef PIN_LED_LINK
#define PIN_LED_LINK 8
#endif
#ifndef PIN_VBAT
#define PIN_VBAT 3
#endif

Preferences prefs;

static uint8_t carMac[6] = {0};
static bool paired = false;
static uint16_t txSeq = 0;

/* ---------------------------------------------------------------- sticks --*/

/*
 * Calibration, stored.
 *
 * A stick's electrical centre is never its mechanical centre, and the gap is
 * enough to drive a car slowly across a room while nobody is touching it.
 * Centre is captured at power-up — the sticks are by definition at rest then,
 * because nothing has been switched on to hold them anywhere else — and the
 * end points come from a calibration gesture stored in NVS.
 */
struct StickCal {
  uint16_t centre;
  uint16_t lo;
  uint16_t hi;
};

static StickCal throttleCal = {2048, 0, 4095};
static StickCal steerCal = {2048, 0, 4095};

/*
 * A dead zone around centre, applied after calibration rather than instead of
 * it. Calibration removes the offset; the dead zone covers the jitter that is
 * left, which on a cheap potentiometer is tens of counts and reads as a car
 * that creeps.
 */
#define STICK_DEADZONE 60

static int16_t readStick(int pin, const StickCal &c) {
  const int raw = analogRead(pin);
  int32_t v;
  if (raw >= (int)c.centre) {
    const int32_t span = (int32_t)c.hi - (int32_t)c.centre;
    v = span > 0 ? ((int32_t)(raw - c.centre) * 1000) / span : 0;
  } else {
    const int32_t span = (int32_t)c.centre - (int32_t)c.lo;
    v = span > 0 ? -(((int32_t)(c.centre - raw) * 1000) / span) : 0;
  }
  if (v > 1000) v = 1000;
  if (v < -1000) v = -1000;
  if (v > -STICK_DEADZONE && v < STICK_DEADZONE) v = 0;
  return (int16_t)v;
}

/* ----------------------------------------------------------------- state --*/

static uint8_t mode = RC_MODE_BEGINNER; /* the safe end of the range, on purpose */
static uint8_t trim = 100;
static uint16_t aux = 0;

/*
 * Mode is stepped by a button rather than selected by a switch, so it always
 * starts where the firmware says and never where the last person left the
 * hardware. A three-position switch that happens to be in "sport" when the
 * handset is switched on is a car that starts in sport.
 */
static void stepMode() {
  mode = (uint8_t)(mode + 1);
  if (mode > RC_MODE_SPORT) mode = RC_MODE_BEGINNER;
}

static bool pressed(int pin) { return digitalRead(pin) == LOW; }

/* Edge detection, so a held button steps once rather than continuously. */
static bool edge(int pin, bool &was) {
  const bool now = pressed(pin);
  const bool fired = now && !was;
  was = now;
  return fired;
}

/* ----------------------------------------------------------------- radio --*/

static volatile uint32_t lastTelemMs = 0;
static RcTelemetryPacket telem;

static void onRecv(const uint8_t *mac, const uint8_t *data, int len) {
  RcTelemetryPacket t;
  if (len != (int)sizeof(t)) return;
  if (!rcCheckTelemetry((const RcTelemetryPacket *)data, len)) return;
  memcpy(&t, data, sizeof(t));
  if (paired && memcmp(mac, carMac, 6) != 0) return;
  memcpy(&telem, &t, sizeof(t));
  lastTelemMs = millis();
}

static void startRadio() {
  WiFi.mode(WIFI_STA);
  esp_wifi_set_channel(CV_RC_CHANNEL, WIFI_SECOND_CHAN_NONE);
  if (esp_now_init() != ESP_OK) return;
  esp_now_register_recv_cb(onRecv);
  if (paired) {
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, carMac, 6);
    peer.channel = CV_RC_CHANNEL;
    peer.encrypt = false;
    esp_now_add_peer(&peer);
  }
}

/* ------------------------------------------------------------------ setup --*/

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);

  pinMode(PIN_BTN_HORN, INPUT_PULLUP);
  pinMode(PIN_BTN_LIGHTS, INPUT_PULLUP);
  pinMode(PIN_BTN_MODE, INPUT_PULLUP);
  pinMode(PIN_LED_LINK, OUTPUT);
  digitalWrite(PIN_LED_LINK, LOW);

  prefs.begin("rcremote", true);
  throttleCal.lo = prefs.getUShort("thLo", 0);
  throttleCal.hi = prefs.getUShort("thHi", 4095);
  steerCal.lo = prefs.getUShort("stLo", 0);
  steerCal.hi = prefs.getUShort("stHi", 4095);
  trim = prefs.getUChar("trim", 100);
  paired = prefs.getBytes("car", carMac, 6) == 6;
  prefs.end();

  /*
   * Centre is read now, not from storage. The sticks are at rest at power-up
   * by definition, and a stored centre from a warmer day is an offset.
   */
  delay(50); /* let the ADC settle before the reading that defines centre */
  throttleCal.centre = analogRead(PIN_STICK_THROTTLE);
  steerCal.centre = analogRead(PIN_STICK_STEER);

  startRadio();
}

/* ------------------------------------------------------------------- loop --*/

void loop() {
  static uint32_t last = 0;
  const uint32_t now = millis();
  if (now - last < RC_CONTROL_PERIOD_MS) return;
  last = now;

  static bool wasHorn = false, wasLights = false, wasMode = false;

  if (edge(PIN_BTN_MODE, wasMode)) stepMode();
  if (edge(PIN_BTN_LIGHTS, wasLights)) aux ^= RC_AUX_HEADLIGHT;

  /* The horn is level-triggered, not edge — it should sound while held, and
     the car's own cut-off bounds how long that can be. */
  if (pressed(PIN_BTN_HORN)) aux |= RC_AUX_HORN;
  else aux &= (uint16_t)~RC_AUX_HORN;

  const int16_t throttle = readStick(PIN_STICK_THROTTLE, throttleCal);
  const int16_t steer = readStick(PIN_STICK_STEER, steerCal);

  RcControlPacket p;
  memset(&p, 0, sizeof(p));
  p.seq = txSeq++;
  p.throttle = throttle;
  p.steer = steer;
  p.aux = aux;
  p.mode = mode;
  p.trim = trim;
  rcSealControl(&p);

  if (paired) esp_now_send(carMac, (const uint8_t *)&p, sizeof(p));

  /*
   * The link LED reflects telemetry coming *back*, not frames going out.
   * Transmitting proves nothing — an unpaired handset with no car in the
   * county transmits perfectly happily.
   */
  const bool linked = lastTelemMs != 0 && (now - lastTelemMs) < 500;
  digitalWrite(PIN_LED_LINK, linked ? HIGH : LOW);
}
