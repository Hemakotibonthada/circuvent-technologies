/*
 * Gyro and D-term filtering.
 *
 * WHY MORE THAN THE ONE LOWPASS THAT WAS HERE
 *
 * The rate loop previously filtered only the D term, at a fixed 80 Hz. That is
 * the right first move — differentiation multiplies noise by frequency, so an
 * unfiltered D term is mostly amplified vibration — but it leaves the P and I
 * terms reading raw gyro, and it does nothing about the one frequency that
 * actually matters on a multirotor.
 *
 * A quad's dominant gyro noise is not broadband. It is a narrow peak at the
 * prop's blade-passing frequency, which moves with throttle, and a second peak
 * from the frame's own bending mode, which does not. A lowpass wide enough to
 * remove them adds phase lag everywhere, and phase lag in the rate loop is
 * exactly what limits how much P and D the airframe will accept before it
 * oscillates. A notch removes a narrow band and leaves the phase elsewhere
 * almost untouched — which is why every mature flight stack has one.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * RPM-based notches, driven by bidirectional DShot telemetry from the ESCs.
 * They are better than anything below, because they know exactly where the
 * peak is instead of hunting for it. Implementing them means turning the RMT
 * channel around inside 30 microseconds of the end of each frame and decoding
 * GCR, and getting that wrong desynchronises an ESC in flight. It needs an
 * oscilloscope and an airframe, and this stack has neither yet — so it is not
 * here, rather than here and unverified.
 *
 * The peak tracker below is the honest substitute: it finds the largest
 * spectral peak by following the gyro signal itself.
 */
#pragma once

#include "fc-config.h"
#include <math.h>

/** First-order lowpass. One state, one multiply — cheap enough for every axis. */
class Pt1 {
 public:
  void configure(float cutoffHz, float dt) {
    if (cutoffHz <= 0.0f) { _alpha = 1.0f; return; }
    const float rc = 1.0f / (2.0f * (float)PI * cutoffHz);
    _alpha = dt / (rc + dt);
  }
  void reset(float v = 0.0f) { _y = v; }
  float apply(float x) { _y += _alpha * (x - _y); return _y; }
  float value() const { return _y; }

 private:
  float _alpha = 1.0f;
  float _y = 0.0f;
};

/**
 * Transposed direct form II biquad, configured as a notch.
 *
 * Transposed form II rather than direct form I because it needs two state
 * variables instead of four and is better behaved numerically in float — the
 * coefficients of a narrow notch at 1 kHz sample rate are close enough
 * together that the accumulation order matters.
 */
class Biquad {
 public:
  /**
   * @param centreHz notch centre
   * @param q        quality factor; higher is narrower
   * @param sampleHz loop rate
   */
  void notch(float centreHz, float q, float sampleHz) {
    /*
     * A notch above Nyquist is not a filter, it is an alias. Clamped rather
     * than rejected because the peak tracker feeding this can legitimately
     * chase a harmonic up past the limit, and the useful behaviour there is to
     * stop following it, not to stop filtering.
     */
    const float nyquist = sampleHz * 0.5f;
    const float f = clampf(centreHz, 10.0f, nyquist * 0.9f);
    if (q < 0.1f) q = 0.1f;

    const float w0 = 2.0f * (float)PI * f / sampleHz;
    const float cs = cosf(w0);
    const float alpha = sinf(w0) / (2.0f * q);

    const float b0 = 1.0f;
    const float b1 = -2.0f * cs;
    const float b2 = 1.0f;
    const float a0 = 1.0f + alpha;
    const float a1 = -2.0f * cs;
    const float a2 = 1.0f - alpha;

    _b0 = b0 / a0; _b1 = b1 / a0; _b2 = b2 / a0;
    _a1 = a1 / a0; _a2 = a2 / a0;
    _configured = true;
  }

  void reset() { _z1 = 0.0f; _z2 = 0.0f; }

  float apply(float x) {
    if (!_configured) return x;
    const float y = _b0 * x + _z1;
    _z1 = _b1 * x - _a1 * y + _z2;
    _z2 = _b2 * x - _a2 * y;
    return y;
  }

  bool configured() const { return _configured; }

 private:
  float _b0 = 1, _b1 = 0, _b2 = 0, _a1 = 0, _a2 = 0;
  float _z1 = 0, _z2 = 0;
  bool _configured = false;
};

/**
 * Follows the dominant noise frequency without a full FFT.
 *
 * A 256-point FFT every cycle is not affordable inside a 1 ms budget on this
 * part alongside everything else the loop does. What works instead: band-pass
 * the gyro through a bank of fixed probes spanning the range a 5-inch quad's
 * blade-passing frequency actually occupies, track the energy in each, and
 * take the centre of the strongest. It is coarse — the resolution is the probe
 * spacing — but a notch is a wide-ish instrument anyway, and being within
 * 20 Hz of the peak removes most of it.
 *
 * The estimate is smoothed hard. A notch that jumps around is worse than a
 * fixed one: every move is a discontinuity in the filtered signal, and the
 * rate loop differentiates that.
 */
class PeakTracker {
 public:
  void begin(float sampleHz) {
    _sampleHz = sampleHz;
    for (int i = 0; i < PROBES; i++) {
      /*
       * A one-pole bandpass is the difference of two lowpasses at the band
       * edges, so each probe needs both. Configuring only one — which is easy
       * to do and was done here first — leaves the other at unity gain, and
       * the difference becomes a highpass of the whole signal: every probe
       * then reports the same energy and the tracker never moves.
       *
       * Edges at ±30% of centre give eight overlapping bands covering the
       * range continuously, so a peak between two probe centres registers in
       * both rather than falling down a gap.
       */
      _upper[i].configure(probeHz(i) * 1.30f, 1.0f / sampleHz);
      _lower[i].configure(probeHz(i) * 0.70f, 1.0f / sampleHz);
      _energy[i] = 0.0f;
    }
    _estimate = probeHz(PROBES / 2);
  }

  /**
   * Feeds one gyro sample and returns the current estimate in Hz.
   *
   * The "band-pass" is a difference of two lowpasses at the probe edges, which
   * is a cheap one-pole bandpass and entirely adequate for deciding which of
   * eight buckets has the most energy.
   */
  float update(float gyro) {
    float best = 0.0f;
    int bestIdx = -1;
    for (int i = 0; i < PROBES; i++) {
      const float band = _upper[i].apply(gyro) - _lower[i].apply(gyro);
      // Energy, leaky-integrated. Absolute value rather than square: the
      // comparison only needs an ordering, and squaring a large gyro value in
      // float throws away precision for nothing.
      _energy[i] += 0.002f * (fabsf(band) - _energy[i]);
      if (_energy[i] > best) { best = _energy[i]; bestIdx = i; }
    }

    if (bestIdx >= 0 && best > MIN_ENERGY) {
      const float target = probeHz(bestIdx);
      // Slow: a full traverse of the range takes on the order of a second.
      _estimate += 0.0015f * (target - _estimate);
    }
    return _estimate;
  }

  float estimateHz() const { return _estimate; }

  void reset() {
    for (int i = 0; i < PROBES; i++) { _energy[i] = 0.0f; _upper[i].reset(); _lower[i].reset(); }
  }

 private:
  /*
   * 120 Hz to 540 Hz.
   *
   * A 2207 on 4S turns roughly 12 000 to 27 000 rpm in flight. Three blades
   * gives a blade-passing frequency of rpm/60*3, so 600 Hz at the top — above
   * that the loop cannot act on it anyway at 1 kHz, and below 120 Hz is
   * airframe motion the controller is supposed to see.
   */
  static constexpr int PROBES = 8;
  static constexpr float LOW_HZ = 120.0f;
  static constexpr float HIGH_HZ = 540.0f;
  static constexpr float MIN_ENERGY = 0.5f;

  static float probeHz(int i) {
    return LOW_HZ + (HIGH_HZ - LOW_HZ) * ((float)i / (float)(PROBES - 1));
  }

  float _sampleHz = 1000.0f;
  Pt1 _upper[PROBES], _lower[PROBES];
  float _energy[PROBES] = {};
  float _estimate = 300.0f;
};

/**
 * The per-axis chain the rate loop runs the gyro through.
 *
 *   gyro ─▶ [notch] ─▶ [lowpass] ─▶ P, I
 *                            └────▶ [D lowpass] ─▶ D
 *
 * Order matters: the notch goes first so the lowpass is not being asked to
 * remove a peak it would need to be far too aggressive to touch.
 */
class GyroChain {
 public:
  void begin(float sampleHz, float lowpassHz) {
    _sampleHz = sampleHz;
    _lp.configure(lowpassHz, 1.0f / sampleHz);
    _tracker.begin(sampleHz);
    _notch.notch(_tracker.estimateHz(), NOTCH_Q, sampleHz);
    _sinceRetune = 0;
  }

  /** @param dynamic false pins the notch where it is, for a repeatable bench test. */
  float apply(float gyro, bool dynamic) {
    if (dynamic) {
      const float hz = _tracker.update(gyro);
      /*
       * Retuned at 20 Hz, not every cycle. Recomputing five coefficients with
       * a sin and a cos at 1 kHz on every axis is real time out of the budget,
       * and the estimate moves far more slowly than that anyway.
       */
      if (++_sinceRetune >= (uint32_t)(_sampleHz / 20.0f)) {
        _sinceRetune = 0;
        _notch.notch(hz, NOTCH_Q, _sampleHz);
      }
    }
    return _lp.apply(_notch.apply(gyro));
  }

  float notchHz() const { return _tracker.estimateHz(); }

  void reset() {
    _lp.reset();
    _notch.reset();
    _tracker.reset();
  }

 private:
  // Q of 3 is about 100 Hz wide at 300 Hz — wide enough to cover the tracker's
  // error, narrow enough that the phase cost away from the notch is small.
  static constexpr float NOTCH_Q = 3.0f;

  float _sampleHz = 1000.0f;
  Pt1 _lp;
  Biquad _notch;
  PeakTracker _tracker;
  uint32_t _sinceRetune = 0;
};
