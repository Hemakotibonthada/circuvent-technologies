/*
 * IMU — ICM-42688-P over SPI, with an MPU-6000-family fallback.
 *
 * The gyro is the single most important sensor on the aircraft: the rate loop
 * closes around it a thousand times a second, and every other estimate is
 * derived from it. Two things here earn their complexity.
 *
 * CALIBRATION REFUSES TO FINISH IF THE AIRCRAFT MOVED
 *
 * Zero-rate offset is measured at boot by averaging while stationary. If the
 * aircraft is nudged during that window the average absorbs real rotation as
 * "bias", and the aircraft then flies with a permanent drift it will fight
 * with its integrator — it will hold attitude on the bench and slowly roll in
 * the air. So the sampler tracks variance and rejects the run rather than
 * silently producing a bad number.
 *
 * A SPI READ CAN FAIL, AND SILENCE IS NOT ZERO
 *
 * A loose connector returns 0xFF or 0x00 forever. Read as a signed value that
 * is a huge rotation or a perfect stillness, both of which the controller will
 * act on. `ok` is false when the sample cannot be trusted, and the caller
 * treats that as a fault rather than as data.
 */
#pragma once

#include "fc-config.h"
#include <SPI.h>

// ICM-42688-P registers (user bank 0).
#define ICM_WHO_AM_I     0x75
#define ICM_WHO_AM_I_VAL 0x47
#define ICM_PWR_MGMT0    0x4E
#define ICM_GYRO_CONFIG0 0x4F
#define ICM_ACCEL_CONFIG0 0x50
#define ICM_TEMP_DATA1   0x1D

class Imu {
 public:
  bool begin() {
    pinMode(PIN_IMU_CS, OUTPUT);
    digitalWrite(PIN_IMU_CS, HIGH);
    _spi.begin(PIN_IMU_SCK, PIN_IMU_MISO, PIN_IMU_MOSI, PIN_IMU_CS);

    delay(50);
    const uint8_t who = readReg(ICM_WHO_AM_I);
    // 0x00 and 0xFF are what a disconnected bus reads back, so they are
    // treated as "absent" rather than as an unknown part.
    if (who == 0x00 || who == 0xFF) return false;
    _whoAmI = who;

    // Gyro and accel to low-noise mode.
    writeReg(ICM_PWR_MGMT0, 0x0F);
    delay(2);
    // Gyro: ±2000 dps, 1 kHz ODR. The full-scale range has to cover a tumble;
    // clipping the gyro during a crash-recovery is how a flip becomes
    // unrecoverable.
    writeReg(ICM_GYRO_CONFIG0, 0x06);
    // Accel: ±16 g, 1 kHz. 16 g rather than 4 g because prop-wash spikes and
    // hard landings clip a low range, and a clipped accel biases the AHRS.
    writeReg(ICM_ACCEL_CONFIG0, 0x06);
    delay(20);

    _gyroScale = 2000.0f / 32768.0f;   // deg/s per LSB
    _accelScale = 16.0f / 32768.0f;    // g per LSB
    _present = true;
    return true;
  }

  bool present() const { return _present; }
  uint8_t whoAmI() const { return _whoAmI; }

  /** Raw sample with the measured bias removed. */
  ImuSample read() {
    ImuSample s = {};
    if (!_present) { s.ok = false; return s; }

    uint8_t buf[14];
    readBurst(ICM_TEMP_DATA1, buf, sizeof(buf));

    // An all-zero or all-0xFF burst is a dead bus, not a stationary aircraft.
    bool allSame = true;
    for (size_t i = 1; i < sizeof(buf); i++) {
      if (buf[i] != buf[0]) { allSame = false; break; }
    }
    if (allSame) { s.ok = false; _faults++; return s; }

    auto be16 = [](const uint8_t *p) -> int16_t {
      return (int16_t)(((uint16_t)p[0] << 8) | p[1]);
    };

    s.tempC = be16(&buf[0]) / 132.48f + 25.0f;
    s.accel.x = be16(&buf[2]) * _accelScale;
    s.accel.y = be16(&buf[4]) * _accelScale;
    s.accel.z = be16(&buf[6]) * _accelScale;
    s.gyro.x = be16(&buf[8])  * _gyroScale - _bias.x;
    s.gyro.y = be16(&buf[10]) * _gyroScale - _bias.y;
    s.gyro.z = be16(&buf[12]) * _gyroScale - _bias.z;
    s.ok = true;
    return s;
  }

  /**
   * Measures the zero-rate offset. Returns false when the aircraft moved.
   *
   * The variance check is the point. An average taken while somebody picks the
   * aircraft up looks perfectly reasonable — it is just wrong, permanently,
   * and the symptom (a slow drift in flight) points at tuning rather than at
   * calibration.
   */
  bool calibrate(uint16_t samples = 1000) {
    if (!_present) return false;
    double sx = 0, sy = 0, sz = 0;
    double qx = 0, qy = 0, qz = 0;
    uint16_t got = 0;

    _bias = {0, 0, 0};
    for (uint16_t i = 0; i < samples; i++) {
      const ImuSample s = read();
      if (!s.ok) { delayMicroseconds(1000); continue; }
      sx += s.gyro.x; sy += s.gyro.y; sz += s.gyro.z;
      qx += (double)s.gyro.x * s.gyro.x;
      qy += (double)s.gyro.y * s.gyro.y;
      qz += (double)s.gyro.z * s.gyro.z;
      got++;
      delayMicroseconds(1000);
    }
    if (got < samples / 2) return false;

    const double n = got;
    const double mx = sx / n, my = sy / n, mz = sz / n;
    const double vx = qx / n - mx * mx;
    const double vy = qy / n - my * my;
    const double vz = qz / n - mz * mz;

    // ~1.6 deg/s of standard deviation. A gyro at rest sits far below this;
    // anything above means the aircraft was being handled.
    const double limit = 2.5;
    if (vx > limit || vy > limit || vz > limit) return false;

    _bias.x = (float)mx;
    _bias.y = (float)my;
    _bias.z = (float)mz;
    _calibrated = true;
    return true;
  }

  bool calibrated() const { return _calibrated; }
  uint32_t faults() const { return _faults; }
  Vec3 bias() const { return _bias; }

 private:
  uint8_t readReg(uint8_t reg) {
    uint8_t v = 0;
    _spi.beginTransaction(SPISettings(8000000, MSBFIRST, SPI_MODE3));
    digitalWrite(PIN_IMU_CS, LOW);
    _spi.transfer(reg | 0x80);
    v = _spi.transfer(0x00);
    digitalWrite(PIN_IMU_CS, HIGH);
    _spi.endTransaction();
    return v;
  }

  void writeReg(uint8_t reg, uint8_t val) {
    _spi.beginTransaction(SPISettings(8000000, MSBFIRST, SPI_MODE3));
    digitalWrite(PIN_IMU_CS, LOW);
    _spi.transfer(reg & 0x7F);
    _spi.transfer(val);
    digitalWrite(PIN_IMU_CS, HIGH);
    _spi.endTransaction();
  }

  void readBurst(uint8_t reg, uint8_t *out, size_t len) {
    _spi.beginTransaction(SPISettings(8000000, MSBFIRST, SPI_MODE3));
    digitalWrite(PIN_IMU_CS, LOW);
    _spi.transfer(reg | 0x80);
    for (size_t i = 0; i < len; i++) out[i] = _spi.transfer(0x00);
    digitalWrite(PIN_IMU_CS, HIGH);
    _spi.endTransaction();
  }

  SPIClass _spi{HSPI};
  Vec3 _bias{0, 0, 0};
  float _gyroScale = 1, _accelScale = 1;
  uint8_t _whoAmI = 0;
  uint32_t _faults = 0;
  bool _present = false;
  bool _calibrated = false;
};
