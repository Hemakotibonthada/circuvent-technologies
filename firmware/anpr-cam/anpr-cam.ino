/*
 * Circuvent ANPR Camera — vehicle capture node for a gate, driveway or
 * parking entry (ESP32-S3-CAM, with an AI-Thinker ESP32-CAM fallback).
 * =========================================================================
 *
 * WHAT THIS DEVICE DOES, AND WHAT IT DELIBERATELY DOES NOT
 *
 * It watches one lane continuously, decides *when a vehicle is present*, and
 * publishes the few best JPEGs of that vehicle to `cv/<id>/anpr`. The control
 * plane reads the number plate. That split is not a staging post on the way to
 * on-device OCR — it is the design.
 *
 * An ESP32 cannot read a number plate. Plate localisation plus character
 * recognition is a two-stage neural pipeline; the smallest useful versions want
 * tens of MB of weights and hundreds of MFLOPs per frame. This board has 8 MB
 * of PSRAM shared with the frame buffer and no NPU. Anything here that claimed
 * to do it would be a template matcher that works on the plate it was tuned
 * against and silently misreads every other one — and a misread plate opens a
 * gate for the wrong car. So the device does the part it is uniquely good at:
 * it is the only thing that knows what the lane looks like right now, so it
 * decides what is worth sending, and sends very little.
 *
 * WHY NOT JUST STREAM AND LET THE SERVER DECIDE
 *
 * A continuous 10 fps SVGA stream is ~250 kB/s per camera, forever, and every
 * frame would have to be run through a detector. A gate sees a vehicle a few
 * dozen times a day. This device sends ~3 frames per arrival, so the recogniser
 * runs on the order of a hundred times a day rather than a million. That is the
 * difference between the VM in Docs/12-vm-runbook.md coping and not.
 *
 * TRIGGERING
 *
 *   IDLE ──motion inside the ROI, or the loop input closes──▶ SETTLE
 *   SETTLE ──settleMs, so the car is in frame rather than entering it──▶ BURST
 *   BURST ──`burst` frames, `burstGapMs` apart, published──▶ COOLDOWN
 *   COOLDOWN ──cooldownMs of quiet──▶ IDLE
 *
 * The ROI is the point of a dedicated device type. A road camera sees trees,
 * sky, a footpath and next door's gate; a whole-frame motion detector fires on
 * all of them all day. Motion is only counted inside a configurable rectangle,
 * expressed in percent so it survives a resolution change.
 *
 * A `loop` input (inductive loop or IR beam — the same part rfid-gate already
 * uses) is supported and is strictly better than image motion where it is
 * fitted: it cannot be fooled by a shadow, a headlight sweep or rain. Image
 * motion is the fallback for installs without one.
 *
 * Standard Circuvent protocol (cv/<id>/state|telemetry|frame|anpr).
 * See Docs/04-mqtt-protocol.md and platform/PROTOCOL.md.
 */

/** Version history: 1.0.0 initial ANPR capture node. */
#define CV_FW_VERSION "1.0.0"

#include <CircuventDevice.h>
#include <Preferences.h>
#include "esp_camera.h"
#include "img_converters.h"

// ---------------------------------------------------------------------------
// Board profiles
// ---------------------------------------------------------------------------
#define CV_ANPR_S3_WROOM    1   // Freenove ESP32-S3 WROOM CAM  (primary)
#define CV_ANPR_XIAO_S3     2   // Seeed XIAO ESP32S3 Sense
#define CV_ANPR_AI_THINKER  3   // AI-Thinker ESP32-CAM         (fallback)

#ifndef CV_ANPR_BOARD
#define CV_ANPR_BOARD CV_ANPR_S3_WROOM
#endif

#if CV_ANPR_BOARD == CV_ANPR_S3_WROOM
  #define PWDN_GPIO_NUM  -1
  #define RESET_GPIO_NUM -1
  #define XCLK_GPIO_NUM  15
  #define SIOD_GPIO_NUM   4
  #define SIOC_GPIO_NUM   5
  #define Y9_GPIO_NUM    16
  #define Y8_GPIO_NUM    17
  #define Y7_GPIO_NUM    18
  #define Y6_GPIO_NUM    12
  #define Y5_GPIO_NUM    10
  #define Y4_GPIO_NUM     8
  #define Y3_GPIO_NUM     9
  #define Y2_GPIO_NUM    11
  #define VSYNC_GPIO_NUM  6
  #define HREF_GPIO_NUM   7
  #define PCLK_GPIO_NUM  13
  #define CV_BOARD_NAME  "esp32s3-wroom-cam"
  // An S3 has enough GPIO that none of these have to fight the camera bus,
  // which is the main reason it is the primary target for this device.
  #ifndef LOOP_GPIO_NUM
  #define LOOP_GPIO_NUM  40
  #endif
  #ifndef ILLUM_GPIO_NUM
  #define ILLUM_GPIO_NUM 41
  #endif
  #ifndef RELAY_GPIO_NUM
  #define RELAY_GPIO_NUM 42
  #endif
  #ifndef CV_RESET_BTN
  #define CV_RESET_BTN   0
  #endif

#elif CV_ANPR_BOARD == CV_ANPR_XIAO_S3
  #define PWDN_GPIO_NUM  -1
  #define RESET_GPIO_NUM -1
  #define XCLK_GPIO_NUM  10
  #define SIOD_GPIO_NUM  40
  #define SIOC_GPIO_NUM  39
  #define Y9_GPIO_NUM    48
  #define Y8_GPIO_NUM    11
  #define Y7_GPIO_NUM    12
  #define Y6_GPIO_NUM    14
  #define Y5_GPIO_NUM    16
  #define Y4_GPIO_NUM    18
  #define Y3_GPIO_NUM    17
  #define Y2_GPIO_NUM    15
  #define VSYNC_GPIO_NUM 38
  #define HREF_GPIO_NUM  47
  #define PCLK_GPIO_NUM  13
  #define CV_BOARD_NAME  "xiao-esp32s3-sense"
  #ifndef LOOP_GPIO_NUM
  #define LOOP_GPIO_NUM   1
  #endif
  #ifndef ILLUM_GPIO_NUM
  #define ILLUM_GPIO_NUM  2
  #endif
  #ifndef RELAY_GPIO_NUM
  #define RELAY_GPIO_NUM  3
  #endif
  #ifndef CV_RESET_BTN
  #define CV_RESET_BTN   -1
  #endif

#elif CV_ANPR_BOARD == CV_ANPR_AI_THINKER
  #define PWDN_GPIO_NUM  32
  #define RESET_GPIO_NUM -1
  #define XCLK_GPIO_NUM   0
  #define SIOD_GPIO_NUM  26
  #define SIOC_GPIO_NUM  27
  #define Y9_GPIO_NUM    35
  #define Y8_GPIO_NUM    34
  #define Y7_GPIO_NUM    39
  #define Y6_GPIO_NUM    36
  #define Y5_GPIO_NUM    21
  #define Y4_GPIO_NUM    19
  #define Y3_GPIO_NUM    18
  #define Y2_GPIO_NUM     5
  #define VSYNC_GPIO_NUM 25
  #define HREF_GPIO_NUM  23
  #define PCLK_GPIO_NUM  22
  #define CV_BOARD_NAME  "ai-thinker-esp32cam"
  // GPIO 4 is the white flood LED. It works as an illuminator but it is very
  // bright and very close to the lens, so at short range it blows out a
  // retro-reflective plate — the opposite of what is wanted. Available,
  // defaulted off, and covered in the manual rather than made the default.
  #ifndef ILLUM_GPIO_NUM
  #define ILLUM_GPIO_NUM  4
  #endif
  #ifndef LOOP_GPIO_NUM
  #define LOOP_GPIO_NUM  13
  #endif
  #ifndef RELAY_GPIO_NUM
  #define RELAY_GPIO_NUM 16
  #endif
  // NOT GPIO 0: that is XCLK on this board. A reset button there silently
  // kills the camera — esp_camera_init() still returns OK and the device keeps
  // reporting a healthy sensor while sending nothing. That fault shipped once
  // already; see Docs/15-troubleshooting.md.
  #ifndef CV_RESET_BTN
  #define CV_RESET_BTN   -1
  #endif

#else
  #error "Unknown CV_ANPR_BOARD. Use 1 (S3-WROOM), 2 (XIAO-S3) or 3 (AI-Thinker)."
#endif

// ---------------------------------------------------------------------------
// Compile-time pin-clash guard.
//
// Copied from firmware/camera/camera.ino on purpose. A pin collision on a
// camera board is neither a compile error nor a runtime error: pinMode() on a
// camera pin simply stops the sensor working while every status the device
// reports stays green. Here is the only place it can be caught.
// ---------------------------------------------------------------------------
#define CV_IS_CAM_PIN(p) (                                                     \
  (p) == XCLK_GPIO_NUM  || (p) == SIOD_GPIO_NUM  || (p) == SIOC_GPIO_NUM ||    \
  (p) == VSYNC_GPIO_NUM || (p) == HREF_GPIO_NUM  || (p) == PCLK_GPIO_NUM ||    \
  (p) == Y2_GPIO_NUM    || (p) == Y3_GPIO_NUM    || (p) == Y4_GPIO_NUM   ||    \
  (p) == Y5_GPIO_NUM    || (p) == Y6_GPIO_NUM    || (p) == Y7_GPIO_NUM   ||    \
  (p) == Y8_GPIO_NUM    || (p) == Y9_GPIO_NUM    ||                            \
  ((PWDN_GPIO_NUM)  >= 0 && (p) == (PWDN_GPIO_NUM)) ||                         \
  ((RESET_GPIO_NUM) >= 0 && (p) == (RESET_GPIO_NUM)))

#if (CV_RESET_BTN) >= 0 && CV_IS_CAM_PIN(CV_RESET_BTN)
  #error "CV_RESET_BTN shares a pin with the camera bus. setResetButton() calls pinMode(INPUT_PULLUP) at boot and the sensor then stops working with no error reported anywhere."
#endif
#if (ILLUM_GPIO_NUM) >= 0 && CV_IS_CAM_PIN(ILLUM_GPIO_NUM)
  #error "ILLUM_GPIO_NUM shares a pin with the camera bus."
#endif
#if (LOOP_GPIO_NUM) >= 0 && CV_IS_CAM_PIN(LOOP_GPIO_NUM)
  #error "LOOP_GPIO_NUM shares a pin with the camera bus."
#endif
#if (RELAY_GPIO_NUM) >= 0 && CV_IS_CAM_PIN(RELAY_GPIO_NUM)
  #error "RELAY_GPIO_NUM shares a pin with the camera bus."
#endif
#if (LOOP_GPIO_NUM) >= 0 && (LOOP_GPIO_NUM) == (ILLUM_GPIO_NUM)
  #error "LOOP_GPIO_NUM and ILLUM_GPIO_NUM are the same pin."
#endif
#if (RELAY_GPIO_NUM) >= 0 && (RELAY_GPIO_NUM) == (ILLUM_GPIO_NUM)
  #error "RELAY_GPIO_NUM and ILLUM_GPIO_NUM are the same pin."
#endif
#if (RELAY_GPIO_NUM) >= 0 && (RELAY_GPIO_NUM) == (LOOP_GPIO_NUM)
  #error "RELAY_GPIO_NUM and LOOP_GPIO_NUM are the same pin."
#endif
#if CV_ANPR_BOARD == CV_ANPR_AI_THINKER
  #if (RELAY_GPIO_NUM) == 16 || (RELAY_GPIO_NUM) == 17
    #warning "GPIO 16/17 back the PSRAM on WROVER-based ESP32-CAM modules. If captures come back blank, move RELAY_GPIO_NUM."
  #endif
  #if (RELAY_GPIO_NUM) == 12 || (LOOP_GPIO_NUM) == 12
    #warning "GPIO 12 selects the flash voltage at reset. A board that finds it pulled high at power-on may not boot."
  #endif
#endif

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
#define SCAN_PERIOD_MS      250    // how often the lane is examined when idle
#define SETTLE_MS_DEFAULT   350    // trigger -> first capture
#define BURST_DEFAULT         3
#define BURST_GAP_DEFAULT   220    // ms between frames in a burst
#define COOLDOWN_DEFAULT   6000    // quiet period before the lane can retrigger
#define SENS_DEFAULT         55    // 1..100
#define QUALITY_DEFAULT      10    // JPEG quantiser: lower is sharper
#define STREAM_TTL_MS     20000    // live-view lease, same as firmware/camera
#define FPS_MIN               1
#define FPS_MAX              15
#define FPS_DEFAULT           8
#define RELAY_PULSE_MS      600
#define MD_MAX_PIXELS  (80 * 60)   // motion buffer ceiling (1/8-scale VGA)
#define PLATE_MAX            15
#define HEARTBEAT_MS      15000
#define DIRECTION_MAX         5

/** Trigger reasons. Mirrored by REASONS[] in platform/api/src/anpr/protocol.ts. */
enum TriggerReason : uint8_t { TRG_MOTION = 0, TRG_LOOP = 1, TRG_MANUAL = 2, TRG_PERIODIC = 3 };

enum Phase : uint8_t { PH_IDLE = 0, PH_SETTLE = 1, PH_BURST = 2, PH_COOLDOWN = 3 };
static const char *PHASE_NAMES[] = { "idle", "settle", "burst", "cooldown" };

CircuventDevice cv("anpr-cam");
Preferences store;

// ---- persisted settings ---------------------------------------------------
bool     armed        = true;
int      sensitivity  = SENS_DEFAULT;
int      quality      = QUALITY_DEFAULT;
int      rotation     = 0;
int      illum        = 0;      // 0..100
int      burstCount   = BURST_DEFAULT;
int      burstGapMs   = BURST_GAP_DEFAULT;
int      settleMs     = SETTLE_MS_DEFAULT;
int      cooldownMs   = COOLDOWN_DEFAULT;
int      roiX = 0, roiY = 25, roiW = 100, roiH = 65;   // percent of the frame
framesize_t anprRes   = FRAMESIZE_SVGA;                // capture resolution
framesize_t liveRes   = FRAMESIZE_VGA;                 // live-view resolution

/*
 * Which way traffic moves past this lens.
 *
 *   "in"    an entry lane — every vehicle read here is arriving
 *   "out"   an exit lane
 *   "both"  one camera covering a shared lane in both directions
 *
 * It is a property of the *installation*, not of a capture, which is why it
 * lives here and not in the per-frame header: the mounting decides it and it
 * cannot change between two frames of one burst.
 *
 * "both" is the default because it is the cheap single-camera install, and it
 * is the honest default: claiming "in" for a lane that is also the exit would
 * log every departure as a second arrival. The control plane resolves a "both"
 * lane by alternating against the vehicle's own last movement.
 */
char     direction[DIRECTION_MAX + 1] = "both";

// ---- runtime --------------------------------------------------------------
bool     hasPsram      = false;
bool     camReady      = false;
bool     streaming     = false;
int      fps           = FPS_DEFAULT;
uint32_t streamArmedAt = 0;
uint32_t lastStreamFrame = 0;
Phase    phase         = PH_IDLE;
uint32_t phaseAt       = 0;
uint32_t lastScan      = 0;
uint32_t lastHeartbeat = 0;
uint32_t captureId     = 0;
int      burstSent     = 0;
uint32_t nextBurstAt   = 0;
long     captures      = 0;   // vehicles triggered
long     published     = 0;   // JPEGs sent on cv/<id>/anpr
long     dropped       = 0;   // captures that failed to send
long     reads         = 0;   // plates the control plane resolved
bool     motionActive  = false;
bool     loopClosed    = false;
uint32_t relayUntil    = 0;
char     lastPlate[PLATE_MAX + 1] = "";
int      lastConfidence = 0;
char     lastDecision[16] = "";
long     lastPlateTs   = 0;
TriggerReason pendingReason = TRG_MOTION;

// motion baseline (luma, ROI only)
uint8_t *mdPrev = nullptr;
size_t   mdLen  = 0;
int      mdW = 0, mdH = 0;

// ---------------------------------------------------------------------------
// The wire header prefixed to every JPEG on cv/<id>/anpr.
//
// A binary topic has nowhere to put metadata, and publishing it separately on
// telemetry would make the worker correlate two streams by timestamp — which
// breaks exactly when two vehicles arrive close together, i.e. when it matters.
// 16 bytes, little-endian, parsed by platform/api/src/anpr/protocol.ts.
// ---------------------------------------------------------------------------
struct __attribute__((packed)) AnprHeader {
  char     magic[4];   // "CVAN"
  uint8_t  ver;        // 1
  uint8_t  seq;        // 0-based index within the burst
  uint8_t  burst;      // frames in this burst
  uint8_t  reason;     // TriggerReason
  uint32_t capture;    // groups a burst
  uint16_t width;
  uint16_t height;
};
static_assert(sizeof(AnprHeader) == 16, "AnprHeader must stay 16 bytes — the worker slices a fixed offset");

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
static framesize_t resFromName(const char *n, framesize_t fallback) {
  if (!n) return fallback;
  String s(n); s.toUpperCase();
  if (s == "QQVGA") return FRAMESIZE_QQVGA;
  if (s == "QVGA")  return FRAMESIZE_QVGA;
  if (s == "CIF")   return FRAMESIZE_CIF;
  if (s == "VGA")   return FRAMESIZE_VGA;
  if (s == "SVGA")  return FRAMESIZE_SVGA;
  if (s == "XGA")   return FRAMESIZE_XGA;
  if (s == "SXGA")  return FRAMESIZE_SXGA;
  if (s == "UXGA")  return FRAMESIZE_UXGA;
  return fallback;
}

static const char *resName(framesize_t f) {
  switch (f) {
    case FRAMESIZE_QQVGA: return "QQVGA";
    case FRAMESIZE_QVGA:  return "QVGA";
    case FRAMESIZE_CIF:   return "CIF";
    case FRAMESIZE_VGA:   return "VGA";
    case FRAMESIZE_SVGA:  return "SVGA";
    case FRAMESIZE_XGA:   return "XGA";
    case FRAMESIZE_SXGA:  return "SXGA";
    case FRAMESIZE_UXGA:  return "UXGA";
    default:              return "VGA";
  }
}

/**
 * Without PSRAM a frame above VGA cannot be allocated at all, so a request for
 * one is clamped rather than refused: an installer who types SXGA on an
 * AI-Thinker gets the best the board can do plus a state field that says so,
 * instead of a camera that stops capturing.
 *
 * A plate needs roughly 100 px across its characters to be readable. SVGA at a
 * 4 m stand-off with the stock lens is about the floor for that, which is why
 * SVGA is the default and why the AI-Thinker is documented as the fallback
 * board rather than the recommended one.
 */
static framesize_t clampRes(framesize_t f) {
  if (hasPsram) return f;
  return (f > FRAMESIZE_VGA) ? FRAMESIZE_VGA : f;
}

static bool initCamera() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer   = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM;   c.pin_d1 = Y3_GPIO_NUM;
  c.pin_d2 = Y4_GPIO_NUM;   c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM;   c.pin_d5 = Y7_GPIO_NUM;
  c.pin_d6 = Y8_GPIO_NUM;   c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk  = XCLK_GPIO_NUM;   c.pin_pclk  = PCLK_GPIO_NUM;
  c.pin_vsync = VSYNC_GPIO_NUM;  c.pin_href  = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM; c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn  = PWDN_GPIO_NUM;   c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  // A queued frame of a moving car is worse than no frame: it is the lane a
  // second ago, and the car that triggered the burst has already moved on.
  c.grab_mode    = CAMERA_GRAB_LATEST;

  hasPsram = psramFound();
  if (hasPsram) {
    c.frame_size   = FRAMESIZE_SVGA;
    c.jpeg_quality = QUALITY_DEFAULT;
    c.fb_count     = 2;              // one filling while one is being published
    c.fb_location  = CAMERA_FB_IN_PSRAM;
  } else {
    c.frame_size   = FRAMESIZE_VGA;
    c.jpeg_quality = 14;
    c.fb_count     = 1;
    c.fb_location  = CAMERA_FB_IN_DRAM;
  }

  if (esp_camera_init(&c) != ESP_OK) return false;

  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    /*
     * A plate is a small, high-contrast, retro-reflective target in a scene
     * that is usually far darker or far brighter than it is. Default
     * auto-exposure meters the whole frame, so at night it exposes for the
     * dark surroundings and the plate — lit by the car's own headlights and
     * bouncing them straight back — clips to white. Pulling the AE level down
     * and capping the gain keeps the plate inside the sensor's range at the
     * cost of a darker background that nobody needs to read.
     */
    s->set_ae_level(s, -1);
    s->set_gainceiling(s, GAINCEILING_8X);
    s->set_saturation(s, -1);
    s->set_sharpness(s, 1);
    s->set_whitebal(s, 1);
  }
  return true;
}

static void applyRes(framesize_t f) {
  sensor_t *s = esp_camera_sensor_get();
  if (s) s->set_framesize(s, clampRes(f));
  // The baseline is per-geometry; keeping it across a resize would make the
  // first scan afterwards look like the whole lane moved.
  if (mdPrev) { free(mdPrev); mdPrev = nullptr; mdLen = 0; }
}

static void applyQuality(int q) {
  sensor_t *s = esp_camera_sensor_get();
  if (s) s->set_quality(s, constrain(q, 4, 63));
}

static void applyRotation(int deg) {
  sensor_t *s = esp_camera_sensor_get();
  if (!s) return;
  const bool flip = (deg == 180);
  s->set_vflip(s, flip ? 1 : 0);
  s->set_hmirror(s, flip ? 1 : 0);
}

static void applyIllum(int level) {
#if (ILLUM_GPIO_NUM) >= 0
  illum = constrain(level, 0, 100);
  ledcWrite(7, map(illum, 0, 100, 0, 255));
#else
  illum = 0;
  (void)level;
#endif
}

// ---------------------------------------------------------------------------
// Motion, restricted to the region of interest
// ---------------------------------------------------------------------------
/**
 * Decodes the JPEG at 1/8 scale, crops to the ROI, and counts pixels whose
 * luma moved by more than a fixed threshold.
 *
 * Working at 1/8 scale is not only a speed decision. A full-resolution
 * difference is dominated by sensor noise and JPEG ringing, while a car
 * crossing the lane moves whole blocks. Downsampling is a cheap low-pass
 * filter that removes precisely the signal responsible for false triggers.
 *
 * The first call after any geometry change only primes the baseline and
 * returns false, so a resolution or ROI edit can never itself look like a
 * vehicle.
 */
static bool motionInRoi(const uint8_t *jpg, size_t len, int w, int h) {
  const int sw = w / 8, sh = h / 8;
  if (sw <= 0 || sh <= 0 || (size_t)(sw * sh) > MD_MAX_PIXELS) return false;

  uint8_t *rgb = (uint8_t *)malloc((size_t)sw * sh * 2);
  if (!rgb) return false;
  if (!jpg2rgb565(jpg, len, rgb, JPG_SCALE_8X)) { free(rgb); return false; }

  // ROI in downsampled coordinates, clamped so a bad rectangle cannot walk off
  // the buffer.
  const int x0 = constrain((roiX * sw) / 100, 0, sw - 1);
  const int y0 = constrain((roiY * sh) / 100, 0, sh - 1);
  const int x1 = constrain(x0 + (roiW * sw) / 100, x0 + 1, sw);
  const int y1 = constrain(y0 + (roiH * sh) / 100, y0 + 1, sh);
  const int rw = x1 - x0, rh = y1 - y0;
  const size_t need = (size_t)rw * rh;

  if (mdPrev && (mdLen != need || mdW != rw || mdH != rh)) {
    free(mdPrev); mdPrev = nullptr; mdLen = 0;
  }

  const uint16_t *px = (const uint16_t *)rgb;
  #define CV_LUMA(p) ((uint8_t)((((( (p) >> 11) & 0x1F) * 8) * 30 +           \
                                 ((((p) >> 5)  & 0x3F) * 4) * 59 +           \
                                 (((p) & 0x1F) * 8) * 11) / 100))

  if (!mdPrev) {
    mdPrev = (uint8_t *)malloc(need);
    if (!mdPrev) { free(rgb); return false; }
    mdLen = need; mdW = rw; mdH = rh;
    for (int y = 0; y < rh; y++)
      for (int x = 0; x < rw; x++)
        mdPrev[y * rw + x] = CV_LUMA(px[(y0 + y) * sw + (x0 + x)]);
    free(rgb);
    return false;
  }

  // sensitivity 1..100 -> 12% .. 0.6% of the ROI must move. Same mapping as
  // firmware/camera, so an installer's intuition carries between the two.
  const float frac = 0.12f - (sensitivity / 100.0f) * 0.114f;
  const int needPixels = max(2, (int)(need * frac));

  int changed = 0;
  for (int y = 0; y < rh; y++) {
    for (int x = 0; x < rw; x++) {
      const uint8_t luma = CV_LUMA(px[(y0 + y) * sw + (x0 + x)]);
      const int idx = y * rw + x;
      if (abs((int)luma - (int)mdPrev[idx]) > 18) changed++;
      mdPrev[idx] = luma;
    }
  }
  #undef CV_LUMA
  free(rgb);
  return changed >= needPixels;
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------
static void publishAnprFrame(camera_fb_t *fb, uint8_t seq, TriggerReason reason) {
  AnprHeader h;
  memcpy(h.magic, "CVAN", 4);
  h.ver     = 1;
  h.seq     = seq;
  h.burst   = (uint8_t)burstCount;
  h.reason  = (uint8_t)reason;
  h.capture = captureId;
  h.width   = (uint16_t)fb->width;
  h.height  = (uint16_t)fb->height;

  if (cv.publishBinary("anpr", fb->buf, fb->len, (const uint8_t *)&h, sizeof(h))) published++;
  else dropped++;
}

static void beginCapture(TriggerReason reason) {
  if (!camReady || !armed) return;
  captureId++;
  captures++;
  burstSent = 0;
  pendingReason = reason;
  phase = PH_SETTLE;
  phaseAt = millis();
  nextBurstAt = phaseAt + (uint32_t)settleMs;

  // Announced before the images, so the timeline shows an arrival even when
  // every frame in the burst turns out to be unreadable. "A vehicle came and
  // we could not read it" and "nothing happened" need to look different.
  JsonDocument d;
  d["type"]    = "vehicle";
  d["capture"] = (long)captureId;
  d["reason"]  = reason == TRG_LOOP ? "loop"
               : reason == TRG_MANUAL ? "manual"
               : reason == TRG_PERIODIC ? "periodic" : "motion";
  d["ts"]      = (long)(millis() / 1000);
  cv.publishTelemetry(d.as<JsonObjectConst>());

  cv.set("phase", PHASE_NAMES[phase]);
  cv.set("captures", captures);
  cv.publishStateNow();
}

/** One frame of the burst. Returns true while the burst still has frames left. */
static bool stepBurst() {
  if (millis() < nextBurstAt) return true;

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    dropped++;
  } else {
    if (fb->format == PIXFORMAT_JPEG) publishAnprFrame(fb, (uint8_t)burstSent, pendingReason);
    else dropped++;
    esp_camera_fb_return(fb);
  }

  burstSent++;
  nextBurstAt = millis() + (uint32_t)burstGapMs;
  return burstSent < burstCount;
}

static void sendLiveFrame() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) return;
  if (fb->format == PIXFORMAT_JPEG) cv.publishFrame(fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

static void pulseRelay() {
#if (RELAY_GPIO_NUM) >= 0
  digitalWrite(RELAY_GPIO_NUM, HIGH);
  relayUntil = millis() + RELAY_PULSE_MS;
#endif
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
static void saveSettings() {
  store.putBool("armed", armed);
  store.putInt("sens", sensitivity);
  store.putInt("qual", quality);
  store.putInt("rot", rotation);
  store.putInt("illum", illum);
  store.putInt("burst", burstCount);
  store.putInt("gap", burstGapMs);
  store.putInt("settle", settleMs);
  store.putInt("cool", cooldownMs);
  store.putInt("rx", roiX); store.putInt("ry", roiY);
  store.putInt("rw", roiW); store.putInt("rh", roiH);
  store.putInt("ares", (int)anprRes);
  store.putString("dir", direction);
}

static void loadSettings() {
  armed       = store.getBool("armed", armed);
  sensitivity = store.getInt("sens", sensitivity);
  quality     = store.getInt("qual", quality);
  rotation    = store.getInt("rot", rotation);
  illum       = store.getInt("illum", illum);
  burstCount  = store.getInt("burst", burstCount);
  burstGapMs  = store.getInt("gap", burstGapMs);
  settleMs    = store.getInt("settle", settleMs);
  cooldownMs  = store.getInt("cool", cooldownMs);
  roiX        = store.getInt("rx", roiX);
  roiY        = store.getInt("ry", roiY);
  roiW        = store.getInt("rw", roiW);
  roiH        = store.getInt("rh", roiH);
  anprRes     = (framesize_t)store.getInt("ares", (int)anprRes);
  String d    = store.getString("dir", direction);
  if (d == "in" || d == "out" || d == "both") {
    strncpy(direction, d.c_str(), DIRECTION_MAX);
    direction[DIRECTION_MAX] = '\0';
  }
}

static void publishFullState() {
  cv.set("hasCamera", true);          // how both apps discover a video source
  cv.set("ready", camReady);
  cv.set("psram", hasPsram);
  cv.set("board", CV_BOARD_NAME);
  cv.set("armed", armed);
  cv.set("phase", PHASE_NAMES[phase]);
  cv.set("streaming", streaming);
  cv.set("fps", fps);
  cv.set("resolution", resName(clampRes(anprRes)));
  cv.set("quality", quality);
  cv.set("rotation", rotation);
  cv.set("illum", illum);
  cv.set("sensitivity", sensitivity);
  cv.set("burst", burstCount);
  cv.set("burstGapMs", burstGapMs);
  cv.set("settleMs", settleMs);
  cv.set("cooldownMs", cooldownMs);
  cv.set("roiX", roiX); cv.set("roiY", roiY);
  cv.set("roiW", roiW); cv.set("roiH", roiH);
  cv.set("hasLoop", (int)(LOOP_GPIO_NUM) >= 0);
  cv.set("hasRelay", (int)(RELAY_GPIO_NUM) >= 0);
  cv.set("direction", direction);
  cv.set("vehiclePresent", loopClosed || motionActive);
  cv.set("motionActive", motionActive);
  cv.set("captures", captures);
  cv.set("published", published);
  cv.set("dropped", dropped);
  cv.set("reads", reads);
  cv.set("lastPlate", lastPlate);
  cv.set("lastConfidence", lastConfidence);
  cv.set("lastDecision", lastDecision);
  cv.set("lastPlateAt", lastPlateTs);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set") {
    bool dirty = false;
    if (p["armed"].is<bool>())      { armed = p["armed"].as<bool>(); dirty = true; }
    if (p["sensitivity"].is<int>()) { sensitivity = constrain(p["sensitivity"].as<int>(), 1, 100); dirty = true; }
    if (p["quality"].is<int>())     { quality = constrain(p["quality"].as<int>(), 4, 63); applyQuality(quality); dirty = true; }
    if (p["rotation"].is<int>())    { rotation = (p["rotation"].as<int>() == 180) ? 180 : 0; applyRotation(rotation); dirty = true; }
    if (p["illum"].is<int>())       { applyIllum(p["illum"].as<int>()); dirty = true; }
    if (p["burst"].is<int>())       { burstCount = constrain(p["burst"].as<int>(), 1, 8); dirty = true; }
    if (p["burstGapMs"].is<int>())  { burstGapMs = constrain(p["burstGapMs"].as<int>(), 80, 2000); dirty = true; }
    if (p["settleMs"].is<int>())    { settleMs = constrain(p["settleMs"].as<int>(), 0, 5000); dirty = true; }
    if (p["cooldownMs"].is<int>())  { cooldownMs = constrain(p["cooldownMs"].as<int>(), 500, 60000); dirty = true; }
    if (p["fps"].is<int>())         { fps = constrain(p["fps"].as<int>(), FPS_MIN, FPS_MAX); dirty = true; }
    if (p["resolution"].is<const char *>()) {
      anprRes = resFromName(p["resolution"].as<const char *>(), anprRes);
      if (!streaming) applyRes(anprRes);
      dirty = true;
    }
    if (p["direction"].is<const char *>()) {
      // Validated against the three the control plane understands rather than
      // stored as typed: an unrecognised value would publish cleanly and then
      // be treated as "both" server-side, so the device would report a lane
      // setting nothing actually honours.
      String d = p["direction"].as<const char *>();
      d.toLowerCase();
      if (d == "in" || d == "out" || d == "both") {
        strncpy(direction, d.c_str(), DIRECTION_MAX);
        direction[DIRECTION_MAX] = '\0';
        dirty = true;
      }
    }
    /*
     * The ROI is set as a group, never edge by edge. Accepting one side at a
     * time would let a half-applied rectangle (new x with the old width) exist
     * between two messages — and that rectangle is what motion is judged
     * against, so the lane would briefly be watching the wrong place.
     */
    if (p["roi"].is<JsonObjectConst>()) {
      JsonObjectConst r = p["roi"].as<JsonObjectConst>();
      if (r["x"].is<int>()) roiX = constrain(r["x"].as<int>(), 0, 99);
      if (r["y"].is<int>()) roiY = constrain(r["y"].as<int>(), 0, 99);
      if (r["w"].is<int>()) roiW = constrain(r["w"].as<int>(), 1, 100 - roiX);
      if (r["h"].is<int>()) roiH = constrain(r["h"].as<int>(), 1, 100 - roiY);
      if (mdPrev) { free(mdPrev); mdPrev = nullptr; mdLen = 0; }
      dirty = true;
    }
    if (dirty) { saveSettings(); publishFullState(); cv.publishStateNow(); }

  } else if (action == "capture") {
    // A manual capture ignores the cooldown: it is a person asking, and the
    // usual reason for asking is that the automatic trigger just missed.
    phase = PH_IDLE;
    beginCapture(TRG_MANUAL);

  } else if (action == "stream") {
    const bool on = p["on"].is<bool>() ? p["on"].as<bool>() : true;
    if (p["fps"].is<int>()) fps = constrain(p["fps"].as<int>(), FPS_MIN, FPS_MAX);
    if (on) {
      // Live view exists to aim the camera during installation, so it drops to
      // a lighter resolution: the installer needs to see framing, not read a
      // plate, and a full-resolution stream competes with the captures.
      if (!streaming) applyRes(liveRes);
      streaming = true;
      streamArmedAt = millis();
    } else if (streaming) {
      streaming = false;
      applyRes(anprRes);
    }
    cv.set("streaming", streaming);
    cv.publishStateNow();

  } else if (action == "illuminate") {
    applyIllum(p["level"].is<int>() ? p["level"].as<int>() : 0);
    saveSettings();
    cv.set("illum", illum);
    cv.publishStateNow();

  } else if (action == "open") {
    pulseRelay();

  } else if (action == "result") {
    /*
     * The control plane echoing back what it read.
     *
     * The device cannot recognise a plate, so without this an installer aiming
     * the camera has no feedback loop at all — they would have to watch the web
     * console on a phone while standing at the lens. It is display state, and
     * it is treated as such: nothing here decides anything.
     *
     * The one action it may take is pulsing the barrier relay, and only when
     * the control plane has already decided `allow` AND explicitly asked for
     * the barrier. The decision is made where the allow-list lives; a plate
     * string arriving on the wire never authorises anything by itself.
     */
    if (p["plate"].is<const char *>()) {
      strncpy(lastPlate, p["plate"].as<const char *>(), PLATE_MAX);
      lastPlate[PLATE_MAX] = '\0';
    }
    if (p["confidence"].is<int>()) lastConfidence = constrain(p["confidence"].as<int>(), 0, 100);
    if (p["decision"].is<const char *>()) {
      strncpy(lastDecision, p["decision"].as<const char *>(), sizeof(lastDecision) - 1);
      lastDecision[sizeof(lastDecision) - 1] = '\0';
    }
    lastPlateTs = (long)(millis() / 1000);
    reads++;
    if (strcmp(lastDecision, "allow") == 0 && p["open"].is<bool>() && p["open"].as<bool>()) pulseRelay();
    publishFullState();
    cv.publishStateNow();

  } else if (action == "reboot") {
    delay(200);
    ESP.restart();
  }
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(100);

#if (LOOP_GPIO_NUM) >= 0
  pinMode(LOOP_GPIO_NUM, INPUT_PULLUP);
#endif
#if (RELAY_GPIO_NUM) >= 0
  pinMode(RELAY_GPIO_NUM, OUTPUT);
  digitalWrite(RELAY_GPIO_NUM, LOW);
#endif
#if (ILLUM_GPIO_NUM) >= 0
  ledcSetup(7, 5000, 8);
  ledcAttachPin(ILLUM_GPIO_NUM, 7);
  ledcWrite(7, 0);
#endif

  store.begin("anpr", false);
  loadSettings();

  camReady = initCamera();
  if (camReady) {
    applyRes(anprRes);
    applyQuality(quality);
    applyRotation(rotation);
    applyIllum(illum);
  } else {
    Serial.println("[anpr] camera init FAILED");
  }

  cv.onCommand(onCommand);
  cv.setInterval(15000);
#if (CV_RESET_BTN) >= 0
  cv.setResetButton(CV_RESET_BTN);
#endif
  cv.begin();

  phase = PH_IDLE;
  publishFullState();
  cv.publishStateNow();
}

void loop() {
#if (RELAY_GPIO_NUM) >= 0
  if (relayUntil && millis() > relayUntil) { digitalWrite(RELAY_GPIO_NUM, LOW); relayUntil = 0; }
#endif

  // The live-view lease, identical to firmware/camera: a viewer that closes a
  // laptop lid must not leave the board streaming and cooking.
  if (streaming && millis() - streamArmedAt > STREAM_TTL_MS) {
    streaming = false;
    applyRes(anprRes);
    cv.set("streaming", false);
    cv.publishStateNow();
  }

  const uint32_t now = millis();

#if (LOOP_GPIO_NUM) >= 0
  // Active-low. Both the inductive loop and the IR beam close a contact to
  // ground, which is also the safe failure direction: a cut cable reads open
  // and simply stops triggering, rather than holding the lane permanently busy.
  const bool loopNow  = digitalRead(LOOP_GPIO_NUM) == LOW;
  const bool loopRose = loopNow && !loopClosed;
  loopClosed = loopNow;
#else
  const bool loopRose = false;
#endif

  if (camReady) {
    if (streaming) {
      const uint32_t period = 1000 / max(fps, FPS_MIN);
      if (now - lastStreamFrame >= period) {
        lastStreamFrame = now;
        sendLiveFrame();
      }
    }

    switch (phase) {
      case PH_IDLE: {
        if (!armed) break;
        if (loopRose) { beginCapture(TRG_LOOP); break; }
        /*
         * Image motion is only consulted while the loop reads clear, and is
         * skipped entirely during live view. A fitted loop is the better
         * signal and running both would double-trigger on every arrival;
         * scanning while streaming would fight the stream for the sensor and
         * halve both frame rates.
         */
        if (!loopClosed && !streaming && now - lastScan >= SCAN_PERIOD_MS) {
          lastScan = now;
          camera_fb_t *fb = esp_camera_fb_get();
          if (fb) {
            bool hit = false;
            if (fb->format == PIXFORMAT_JPEG) {
              hit = motionInRoi(fb->buf, fb->len, fb->width, fb->height);
              motionActive = hit;
            }
            esp_camera_fb_return(fb);
            if (hit) { beginCapture(TRG_MOTION); break; }
          }
        }
        break;
      }

      case PH_SETTLE:
        if (now >= nextBurstAt) {
          phase = PH_BURST;
          phaseAt = now;
          cv.set("phase", PHASE_NAMES[phase]);
        }
        break;

      case PH_BURST:
        if (!stepBurst()) {
          phase = PH_COOLDOWN;
          phaseAt = now;
          cv.set("phase", PHASE_NAMES[phase]);
          cv.set("published", published);
          cv.set("dropped", dropped);
          cv.publishStateNow();
        }
        break;

      case PH_COOLDOWN:
        if (now - phaseAt >= (uint32_t)cooldownMs) {
          phase = PH_IDLE;
          motionActive = false;
          // The lane no longer looks like the stored baseline — the vehicle
          // that triggered this has left. Discarding it stops the departure
          // being counted as a second arrival.
          if (mdPrev) { free(mdPrev); mdPrev = nullptr; mdLen = 0; }
          cv.set("phase", PHASE_NAMES[phase]);
          cv.publishStateNow();
        }
        break;
    }
  }

  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    cv.set("vehiclePresent", loopClosed || motionActive);
    cv.set("motionActive", motionActive);
    cv.set("ready", camReady);
    cv.set("captures", captures);
    cv.set("published", published);
    cv.set("dropped", dropped);
  }

  cv.loop();
}
