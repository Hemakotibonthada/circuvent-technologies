/*
 * SBUS receiver input.
 *
 * SBUS is 100 kBaud 8E2, inverted, 25 bytes per frame at ~7 ms: a start byte
 * of 0x0F, 16 channels packed into 11 bits each, then a flags byte and 0x00.
 *
 * THE FLAGS BYTE IS THE IMPORTANT PART
 *
 * Bit 3 is the receiver's own failsafe flag, and bit 2 marks a lost frame. A
 * receiver that has lost the transmitter keeps sending frames — holding the
 * last values, or its configured failsafe positions — so a flight controller
 * that only checks "am I receiving bytes" concludes the link is healthy while
 * the pilot has no control at all.
 *
 * That is the failure this parser exists to catch: silence is easy to detect,
 * and a receiver cheerfully repeating a stale throttle is not.
 */
#pragma once

#include "fc-config.h"

#define SBUS_FRAME_LEN 25
#define SBUS_HEADER    0x0F
#define SBUS_FOOTER    0x00

/** How long without a good frame before the link counts as gone. */
#define RC_TIMEOUT_MS  120

class Sbus {
 public:
  void begin(HardwareSerial &port, int rxPin) {
    _port = &port;
    // `invert = true` is the whole reason SBUS needs a UART that can do it in
    // hardware; an external inverter is the usual alternative and one more
    // thing to fail.
    _port->begin(100000, SERIAL_8E2, rxPin, -1, true);
    _lastGood = 0;
    _idx = 0;
  }

  /** Drains the UART. Returns true when a fresh, trustworthy frame arrived. */
  bool poll() {
    if (!_port) return false;
    bool fresh = false;

    while (_port->available()) {
      const uint8_t b = (uint8_t)_port->read();

      if (_idx == 0) {
        if (b != SBUS_HEADER) continue;   // resync
        _buf[_idx++] = b;
        continue;
      }

      _buf[_idx++] = b;
      if (_idx < SBUS_FRAME_LEN) continue;

      _idx = 0;
      if (_buf[SBUS_FRAME_LEN - 1] != SBUS_FOOTER) { _badFrames++; continue; }

      const uint8_t flags = _buf[23];
      _frameLost = (flags & 0x04) != 0;
      _rxFailsafe = (flags & 0x08) != 0;

      decode();

      /*
       * A frame carrying the receiver's failsafe flag is decoded but does NOT
       * refresh the liveness timestamp. Its channel values are whatever the
       * receiver was configured to output with no transmitter, so treating it
       * as a live frame would mean the aircraft flies the receiver's idea of
       * failsafe while believing the pilot is in control.
       */
      if (!_rxFailsafe) {
        _lastGood = millis();
        fresh = true;
      }
      _frames++;
    }
    return fresh;
  }

  bool linkUp() const {
    return _lastGood != 0 && (millis() - _lastGood) < RC_TIMEOUT_MS && !_rxFailsafe;
  }

  /** Raw channel, 172..1811 as SBUS defines it. */
  uint16_t raw(uint8_t ch) const { return ch < 16 ? _ch[ch] : 0; }

  /** Channel mapped to -1..1. */
  float axis(uint8_t ch) const {
    if (ch >= 16) return 0.0f;
    const float v = ((float)_ch[ch] - 992.0f) / 819.0f;
    return clampf(v, -1.0f, 1.0f);
  }

  /** Channel mapped to 0..1, for throttle. */
  float unit(uint8_t ch) const {
    if (ch >= 16) return 0.0f;
    const float v = ((float)_ch[ch] - 172.0f) / (1811.0f - 172.0f);
    return clampf(v, 0.0f, 1.0f);
  }

  /** Two-position switch: high half of travel. */
  bool sw(uint8_t ch) const { return ch < 16 && _ch[ch] > 1200; }

  uint32_t frames() const { return _frames; }
  uint32_t badFrames() const { return _badFrames; }
  bool receiverFailsafe() const { return _rxFailsafe; }
  bool frameLost() const { return _frameLost; }

 private:
  void decode() {
    const uint8_t *d = _buf;
    _ch[0]  = (uint16_t)((d[1]     | d[2]  << 8) & 0x07FF);
    _ch[1]  = (uint16_t)((d[2] >> 3 | d[3]  << 5) & 0x07FF);
    _ch[2]  = (uint16_t)((d[3] >> 6 | d[4]  << 2 | d[5] << 10) & 0x07FF);
    _ch[3]  = (uint16_t)((d[5] >> 1 | d[6]  << 7) & 0x07FF);
    _ch[4]  = (uint16_t)((d[6] >> 4 | d[7]  << 4) & 0x07FF);
    _ch[5]  = (uint16_t)((d[7] >> 7 | d[8]  << 1 | d[9] << 9) & 0x07FF);
    _ch[6]  = (uint16_t)((d[9] >> 2 | d[10] << 6) & 0x07FF);
    _ch[7]  = (uint16_t)((d[10] >> 5 | d[11] << 3) & 0x07FF);
    _ch[8]  = (uint16_t)((d[12]    | d[13] << 8) & 0x07FF);
    _ch[9]  = (uint16_t)((d[13] >> 3 | d[14] << 5) & 0x07FF);
    _ch[10] = (uint16_t)((d[14] >> 6 | d[15] << 2 | d[16] << 10) & 0x07FF);
    _ch[11] = (uint16_t)((d[16] >> 1 | d[17] << 7) & 0x07FF);
    _ch[12] = (uint16_t)((d[17] >> 4 | d[18] << 4) & 0x07FF);
    _ch[13] = (uint16_t)((d[18] >> 7 | d[19] << 1 | d[20] << 9) & 0x07FF);
    _ch[14] = (uint16_t)((d[20] >> 2 | d[21] << 6) & 0x07FF);
    _ch[15] = (uint16_t)((d[21] >> 5 | d[22] << 3) & 0x07FF);
  }

  HardwareSerial *_port = nullptr;
  uint8_t _buf[SBUS_FRAME_LEN] = {};
  uint8_t _idx = 0;
  uint16_t _ch[16] = {};
  uint32_t _lastGood = 0;
  uint32_t _frames = 0, _badFrames = 0;
  bool _rxFailsafe = false, _frameLost = false;
};
