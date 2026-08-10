/*
 * DShot300 ESC output over the ESP32 RMT peripheral.
 *
 * WHY DSHOT AND NOT PWM
 *
 * Analogue PWM encodes throttle as a pulse width, so every microsecond of
 * timing jitter is a throttle error on that motor. On a general-purpose MCU
 * running a network stack, jitter is not hypothetical. DShot sends a 16-bit
 * digital frame with a checksum: it either arrives intact or the ESC ignores
 * it, and there is no analogue value to corrupt.
 *
 * WHY RMT AND NOT BIT-BANGING
 *
 * The RMT peripheral clocks the waveform out in hardware from a buffer, so an
 * interrupt during transmission cannot stretch a bit. Bit-banging four
 * channels from the control loop would put motor timing at the mercy of every
 * other interrupt in the system — and the failure mode is a desynced ESC,
 * which on a quad means one motor stops while three keep pulling.
 *
 * FRAME
 *
 *   11 bits  throttle (0 = disarmed, 48..2047 = throttle range)
 *    1 bit   telemetry request
 *    4 bits  CRC, xor of the three preceding nibbles
 */
#pragma once

#include "fc-config.h"
#include <esp32-hal-rmt.h>

/*
 * 100 ns per RMT tick.
 *
 * A DShot300 bit is 3333 ns, which is 33.3 ticks. Rounded to 33 the bit runs
 * 3300 ns -- 1% fast. DShot's timing tolerance is around 10%, so this is well
 * inside spec while keeping every duration an integer; a fractional tick count
 * truncates silently and skews the whole frame.
 *
 * The Arduino 2.x RMT wrapper is used rather than the IDF 5 `rmt_tx.h` driver,
 * because that header does not exist in this core and the build fails on an
 * include rather than on anything to do with ESC protocol.
 */
#define DSHOT_TICK_NS 100.0f
#define DSHOT_T1H 25   // 2500 ns
#define DSHOT_T1L 8    //  800 ns
#define DSHOT_T0H 12   // 1200 ns
#define DSHOT_T0L 21   // 2100 ns

class DShot {
 public:
  bool begin(const int pins[MOTOR_COUNT]) {
    for (int i = 0; i < MOTOR_COUNT; i++) {
      // 64 RMT symbols is a whole 16-bit frame plus the reset gap, so a frame
      // is never split across two buffer loads.
      _rmt[i] = rmtInit(pins[i], true, RMT_MEM_64);
      if (_rmt[i] == nullptr) return false;
      rmtSetTick(_rmt[i], DSHOT_TICK_NS);
    }
    _ready = true;
    return true;
  }

  /** @param throttle 0..1 per motor; anything <= 0 sends the disarmed frame. */
  void write(const float throttle[MOTOR_COUNT]) {
    if (!_ready) return;
    for (int i = 0; i < MOTOR_COUNT; i++) {
      uint16_t value = 0;
      if (throttle[i] > 0.0f) {
        // 48 is the first throttle value; 0..47 are reserved for commands.
        value = (uint16_t)(48.0f + clampf(throttle[i], 0.0f, 1.0f) * (2047.0f - 48.0f));
      }
      sendFrame(i, value, false);
    }
  }

  /** Explicit all-stop. Used by every disarm path. */
  void stopAll() {
    if (!_ready) return;
    for (int i = 0; i < MOTOR_COUNT; i++) sendFrame(i, 0, false);
  }

 private:
  void sendFrame(int idx, uint16_t value, bool telemetry) {
    uint16_t packet = (uint16_t)((value << 1) | (telemetry ? 1 : 0));
    // CRC is the xor of the three nibbles above it. The ESC recomputes it and
    // drops the frame on a mismatch, which is what makes a corrupted frame a
    // dropped update rather than a wrong throttle.
    const uint16_t crc = (uint16_t)((packet ^ (packet >> 4) ^ (packet >> 8)) & 0x0F);
    packet = (uint16_t)((packet << 4) | crc);

    for (int b = 0; b < 16; b++) {
      const bool one = (packet & 0x8000) != 0;
      packet <<= 1;
      _sym[b].level0 = 1;
      _sym[b].duration0 = one ? DSHOT_T1H : DSHOT_T0H;
      _sym[b].level1 = 0;
      _sym[b].duration1 = one ? DSHOT_T1L : DSHOT_T0L;
    }

    /*
     * Non-blocking write. `rmtWriteBlocking` would stall the rate loop for the
     * ~53 us a frame takes, four times per cycle -- 212 us of a 1000 us budget
     * spent waiting on hardware that is perfectly capable of clocking itself.
     */
    rmtWrite(_rmt[idx], _sym, 16);
  }

  rmt_obj_t *_rmt[MOTOR_COUNT] = {nullptr, nullptr, nullptr, nullptr};
  rmt_data_t _sym[16] = {};
  bool _ready = false;
};
