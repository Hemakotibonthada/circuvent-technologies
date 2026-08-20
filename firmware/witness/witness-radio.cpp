/*
 * Circuvent Witness — the radio.
 *
 * Kept apart from the sampling so that measuring and transmitting can fail
 * independently, and so the sampling code can be exercised on a bench with
 * nothing but a serial cable.
 *
 * ESP-NOW is used rather than raw 802.15.4 for the same reason it is used on
 * the RC car: no association, no session, and nothing to re-establish after a
 * deep sleep. Every wake is a cold start on this board — the radio comes up,
 * sends one frame, and the chip goes back to microamps — so any protocol with
 * a handshake would spend the entire energy budget agreeing to talk.
 *
 * The frame is broadcast. This board has no way to discover a hub and no
 * energy to spend looking for one, so it says its piece to whoever is
 * listening and sleeps. Pairing is the hub's business: it knows which witness
 * is clamped to which appliance, because a person told it during setup.
 */
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#include "witness-types.h"

#ifndef CV_WITNESS_CHANNEL
#define CV_WITNESS_CHANNEL 6
#endif

/* Ties a frame to this device class before a hub looks at the fields. */
#define WITNESS_MAGIC 0x57544e53UL /* "WTNS" */

struct __attribute__((packed)) WitnessFrame {
  uint32_t magic;
  uint8_t version;
  uint16_t seq;
  int32_t milliamps_x10; /* fixed point: 0.1 mA resolution, no float on the wire */
  uint16_t reserveMv;
  uint32_t bootCount;
};

static const uint8_t BROADCAST[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

void witnessSend(const WitnessReport &r) {
  /*
   * The radio is brought up here, per wake, and torn down again.
   *
   * Leaving it initialised across a deep sleep is not an option — the chip
   * loses everything but RTC memory — and bringing it up early would mean it
   * was drawing current during the 40 ms of sampling, which is a fifth of the
   * energy budget spent listening to nothing.
   */
  WiFi.mode(WIFI_STA);
  esp_wifi_set_channel(CV_WITNESS_CHANNEL, WIFI_SECOND_CHAN_NONE);

  if (esp_now_init() != ESP_OK) return;

  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, BROADCAST, 6);
  peer.channel = CV_WITNESS_CHANNEL;
  peer.encrypt = false;
  esp_now_add_peer(&peer);

  WitnessFrame f;
  f.magic = WITNESS_MAGIC;
  f.version = 1;
  f.seq = r.seq;
  /*
   * Fixed point rather than a float on the wire.
   *
   * A float would be four bytes either way, but it also invites a receiver to
   * print seven significant figures of a measurement whose real resolution is
   * about a milliamp. Sending tenths says what the number is worth.
   */
  f.milliamps_x10 = (int32_t)lroundf(r.milliamps * 10.0f);
  f.reserveMv = r.reserveMv;
  f.bootCount = r.bootCount;

  esp_now_send(BROADCAST, (const uint8_t *)&f, sizeof(f));

  /*
   * A short wait, then down.
   *
   * esp_now_send queues; returning immediately into deep sleep can cut the
   * frame off mid-transmission, and a truncated frame reads as interference
   * rather than as a bug. Ten milliseconds is longer than the frame and far
   * cheaper than the retry it prevents.
   */
  delay(10);
  esp_now_deinit();
  WiFi.mode(WIFI_OFF);
}
