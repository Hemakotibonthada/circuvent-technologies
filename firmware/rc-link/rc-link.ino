/*
 * Circuvent RC Link — the dongle that plugs into the phone.
 * =========================================================================
 *
 * A small board on the end of a USB-C OTG cable. It gives the phone the one
 * thing a phone does not have: a radio that speaks the car's control link.
 *
 * WHY THE PHONE NEEDS A DONGLE AT ALL
 *
 * A phone cannot speak ESP-NOW. It has a Wi-Fi radio, but no way to send raw
 * 802.11 action frames and no way to avoid association. Driving a vehicle over
 * an associating link means every roam, every background scan and every
 * power-save decision the phone makes arrives as a steering delay. The dongle
 * owns the radio so the phone never has to.
 *
 * HOW THE PHONE TALKS TO IT
 *
 * As a network interface, not a serial port.
 *
 * The obvious design is USB CDC-ACM: a serial port, a byte stream, a small
 * protocol on top. It is also the design that needs a native Android module,
 * because React Native cannot open a USB serial device — and that module needs
 * a config plugin, a development build, and a permission dialog on every
 * reconnect.
 *
 * CDC-NCM instead. The dongle enumerates as a USB Ethernet adapter, Android
 * brings it up as a network interface, and the app speaks ordinary HTTP and
 * WebSocket to a fixed address on it. No native module, no plugin, no custom
 * permission — the same client code that would talk to the car over Wi-Fi
 * talks to the dongle over USB, and only the address changes.
 *
 * WHAT RUNS WHERE
 *
 *   core 1  -- ESP-NOW to the car at 50 Hz. Nothing else.
 *   core 0  -- USB, HTTP, WebSocket. Bulk, bursty, allowed to block.
 *
 * Control frames are generated on core 1 from whatever the phone last sent,
 * and they keep going at 50 Hz whether or not the phone said anything new.
 * That decouples the radio's cadence from the app's: the phone can send at
 * 10 Hz, or in bursts, or stall for a garbage collection, and the car still
 * sees a steady stream.
 *
 * WHAT IT DOES WHEN THE PHONE GOES AWAY
 *
 * Stops sending. It does *not* keep repeating the last throttle. A dongle that
 * carries on driving after the app has died is precisely the failure the car's
 * failsafe exists to catch, and covering it up would be worse than useless —
 * silence here is what makes the car stop there.
 */

/**
 * Version history:
 *   1.0.0  initial dongle firmware: control link complete, USB host interface
 *          still to come (see loop()).
 */
#define CV_FW_VERSION "1.0.0"

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#include "rc-protocol.h"

#ifndef CV_RC_CHANNEL
#define CV_RC_CHANNEL 6
#endif

/* ---------------------------------------------------------------- state --- */

/*
 * What the phone last asked for, and when.
 *
 * Written by the USB side, read by the radio task. Every field is a word or
 * less, and the radio tolerates a torn read of one field for one frame at
 * 50 Hz — 20 ms of a stale steering angle, which is far less than the jitter a
 * lock on the control path would cost.
 */
static volatile int16_t wantThrottle = 0;
static volatile int16_t wantSteer = 0;
static volatile uint16_t wantAux = 0;
static volatile uint8_t wantMode = RC_MODE_IMMOBILISED;
static volatile uint8_t wantTrim = 100;
static volatile uint32_t lastPhoneMs = 0;

/*
 * How long the dongle keeps transmitting after the phone stops talking.
 *
 * Longer than one round trip, so a single dropped WebSocket frame does not
 * stop the car. Deliberately shorter than RC_CONTROL_TIMEOUT_MS, so an app
 * that has genuinely gone away results in the *car* deciding to stop, on its
 * own timer, rather than the dongle deciding on its behalf.
 */
#define PHONE_GRACE_MS 80

static uint8_t carMac[6] = {0};
static bool paired = false;

static volatile uint16_t txSeq = 0;
static volatile uint32_t framesSent = 0;

/* Latest telemetry from the car, for the phone to read. */
static RcTelemetryPacket lastTelem;
static volatile bool haveTelem = false;
static volatile uint32_t lastTelemMs = 0;

/* ----------------------------------------------------------------- radio --- */

static void onRecv(const uint8_t *mac, const uint8_t *data, int len) {
  RcTelemetryPacket t;
  if (len != (int)sizeof(t)) return;
  memcpy(&t, data, sizeof(t));
  if (!rcCheckTelemetry(&t, sizeof(t))) return;
  if (paired && memcmp(mac, carMac, 6) != 0) return;

  memcpy(&lastTelem, &t, sizeof(t));
  haveTelem = true;
  lastTelemMs = millis();
}

/**
 * The control task: pinned to core 1, doing nothing else.
 */
static void controlTask(void *) {
  const TickType_t period = pdMS_TO_TICKS(RC_CONTROL_PERIOD_MS);
  TickType_t last = xTaskGetTickCount();

  for (;;) {
    const uint32_t now = millis();
    const bool phoneAlive = lastPhoneMs != 0 && (now - lastPhoneMs) < PHONE_GRACE_MS;

    if (paired && phoneAlive) {
      RcControlPacket p;
      memset(&p, 0, sizeof(p));
      p.seq = txSeq++;
      p.throttle = wantThrottle;
      p.steer = wantSteer;
      p.aux = wantAux;
      p.mode = wantMode;
      p.trim = wantTrim;
      rcSealControl(&p);
      esp_now_send(carMac, (const uint8_t *)&p, sizeof(p));
      framesSent++;
    }
    /* When the phone is not alive nothing is sent at all — see the header. */

    vTaskDelayUntil(&last, period);
  }
}

/**
 * Accepts a command from the phone.
 *
 * Split out so the USB transport, whatever it ends up being, has one entry
 * point and the limits are applied in one place. The mode is passed through
 * rather than trusted: the *car* re-applies the ceiling, and this is only the
 * value it will be asked for.
 */
void rcLinkOnPhoneCommand(int16_t throttle, int16_t steer, uint16_t aux, uint8_t mode, uint8_t trim) {
  wantThrottle = throttle < -1000 ? -1000 : (throttle > 1000 ? 1000 : throttle);
  wantSteer = steer < -1000 ? -1000 : (steer > 1000 ? 1000 : steer);
  wantAux = aux;
  wantMode = mode;
  wantTrim = trim;
  lastPhoneMs = millis();
}

/* ------------------------------------------------------------------ setup --- */

static void startRadio() {
  WiFi.mode(WIFI_STA);
  /* Fixed channel, agreed with the car. Peers that disagree simply do not hear
     each other, and there is no error to see — it looks exactly like being out
     of range, which is the hardest kind of fault to chase. */
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

void setup() {
  Serial.begin(115200);
  startRadio();

  /*
   * The control task gets core 1 and a priority above the USB stack. The USB
   * side moves camera frames, which is exactly the bulk traffic that must not
   * delay a steering frame — the reason the two links are separate at all.
   */
  xTaskCreatePinnedToCore(controlTask, "rc-control", 4096, nullptr, 5, nullptr, 1);
}

void loop() {
  /*
   * The USB side belongs here, on core 0.
   *
   * NOT IMPLEMENTED YET: the CDC-NCM interface and the HTTP/WebSocket server
   * the phone talks to. The radio half above is complete; this half needs
   * TinyUSB's NCM class brought up against the ESP32-S3 and verified with a
   * phone on the other end of the cable, which cannot be done without the
   * hardware.
   *
   * Left as a stated gap rather than a plausible-looking stub. A stub would
   * compile, enumerate as nothing, and be indistinguishable from a dongle that
   * simply is not plugged in — which is the worst way to spend an afternoon.
   *
   * rcLinkOnPhoneCommand() above is the seam it plugs into.
   */
  delay(10);
}
