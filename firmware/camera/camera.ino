/*
 * Circuvent Camera — ESP32-CAM live video node
 * ============================================
 * Zone 2/3 of the Circuvent smart-home. A single OV2640 module that:
 *   - Streams JPEG frames on demand to cv/<id>/frame (raw binary, QoS 0).
 *   - Takes one-off snapshots on request.
 *   - Detects motion by comparing successive frames, with no extra hardware
 *     (an optional PIR input is supported for boards that have one wired).
 *   - Drives the on-board flash/illuminator LED with dimmable PWM.
 *   - Persists resolution / quality / rotation / motion settings across boots.
 *
 * WHY FRAMES ARE NOT TELEMETRY
 * ----------------------------
 * The control plane writes every cv/<id>/telemetry message into Postgres. A
 * 10fps stream would be 36,000 rows an hour, each holding a whole picture.
 * Frames therefore ride a dedicated cv/<id>/frame topic that the API relays
 * straight to watching WebSocket clients and never stores. Snapshots publish
 * the *image* on the frame topic and only a small {type:"snapshot"} record on
 * telemetry, so the event history stays queryable without holding blobs.
 *
 * STREAMING IS OPT-IN AND SELF-EXPIRING
 * -------------------------------------
 * A camera left streaming into an empty room burns bandwidth and heats the
 * board until it browns out. The app re-arms the stream every few seconds and
 * the firmware stops on its own if that stops arriving.
 *
 * Board: AI-Thinker ESP32-CAM (default). Set CV_CAM_BOARD for the others.
 */
/**
 * Version history
 *   1.0.0  initial
 *   1.1.0  streaming fixes
 *   1.2.0  OTA. Also moves the build to min_spiffs.csv: the previous
 *          huge_app.csv has a single app slot, so no camera could ever have
 *          taken an over-the-air update at all.
 */
#define CV_FW_VERSION "1.4.0"

#include "esp_camera.h"
#include "img_converters.h"
#include "esp_heap_caps.h"
#include <CircuventDevice.h>
#include <Preferences.h>

// ---------------------------------------------------------------------------
// Board pin profiles
// ---------------------------------------------------------------------------
#define CV_CAM_AI_THINKER    1
#define CV_CAM_WROVER_KIT    2
#define CV_CAM_M5STACK_WIDE  3
#define CV_CAM_TTGO_TJOURNAL 4

#ifndef CV_CAM_BOARD
#define CV_CAM_BOARD CV_CAM_AI_THINKER
#endif

#if CV_CAM_BOARD == CV_CAM_AI_THINKER
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
  #define FLASH_GPIO_NUM  4    // white illuminator LED (shared with SD DATA1)
  #define STATUS_LED_NUM 33    // small red LED, active-LOW
  // No reset button. GPIO 0 is the camera's XCLK on this board and the module
  // exposes no other button, so there is no pin to spare. Assigning GPIO 0
  // here would make CircuventDevice::begin() run pinMode(0, INPUT_PULLUP),
  // which detaches the LEDC clock output and leaves the sensor unclocked.
  #define CV_RESET_BTN   -1
#elif CV_CAM_BOARD == CV_CAM_WROVER_KIT
  #define PWDN_GPIO_NUM  -1
  #define RESET_GPIO_NUM -1
  #define XCLK_GPIO_NUM  21
  #define SIOD_GPIO_NUM  26
  #define SIOC_GPIO_NUM  27
  #define Y9_GPIO_NUM    35
  #define Y8_GPIO_NUM    34
  #define Y7_GPIO_NUM    39
  #define Y6_GPIO_NUM    36
  #define Y5_GPIO_NUM    19
  #define Y4_GPIO_NUM    18
  #define Y3_GPIO_NUM     5
  #define Y2_GPIO_NUM      4
  #define VSYNC_GPIO_NUM 25
  #define HREF_GPIO_NUM  23
  #define PCLK_GPIO_NUM  22
  #define FLASH_GPIO_NUM -1
  #define STATUS_LED_NUM -1
  #define CV_RESET_BTN   -1
#elif CV_CAM_BOARD == CV_CAM_M5STACK_WIDE
  #define PWDN_GPIO_NUM  -1
  #define RESET_GPIO_NUM 15
  #define XCLK_GPIO_NUM  27
  #define SIOD_GPIO_NUM  22
  #define SIOC_GPIO_NUM  23
  #define Y9_GPIO_NUM    19
  #define Y8_GPIO_NUM    36
  #define Y7_GPIO_NUM    18
  #define Y6_GPIO_NUM    39
  #define Y5_GPIO_NUM     5
  #define Y4_GPIO_NUM    34
  #define Y3_GPIO_NUM    35
  #define Y2_GPIO_NUM    32
  #define VSYNC_GPIO_NUM 25
  #define HREF_GPIO_NUM  26
  #define PCLK_GPIO_NUM  21
  #define FLASH_GPIO_NUM 14
  #define STATUS_LED_NUM -1
  #define CV_RESET_BTN   -1
#else  // CV_CAM_TTGO_TJOURNAL
  #define PWDN_GPIO_NUM   0
  #define RESET_GPIO_NUM 15
  #define XCLK_GPIO_NUM  27
  #define SIOD_GPIO_NUM  25
  #define SIOC_GPIO_NUM  23
  #define Y9_GPIO_NUM    19
  #define Y8_GPIO_NUM    36
  #define Y7_GPIO_NUM    18
  #define Y6_GPIO_NUM    39
  #define Y5_GPIO_NUM     5
  #define Y4_GPIO_NUM    34
  #define Y3_GPIO_NUM    35
  #define Y2_GPIO_NUM    17
  #define VSYNC_GPIO_NUM 22
  #define HREF_GPIO_NUM  26
  #define PCLK_GPIO_NUM  21
  #define FLASH_GPIO_NUM -1
  #define STATUS_LED_NUM -1
  #define CV_RESET_BTN   -1
#endif

// Optional PIR. Leave at -1 to rely purely on image differencing.
#ifndef PIR_GPIO_NUM
#define PIR_GPIO_NUM -1
#endif

// ---------------------------------------------------------------------------
// Pin sanity
// ---------------------------------------------------------------------------
// Every auxiliary pin below is handed to pinMode() at boot, which rebinds the
// pad away from whatever peripheral the camera driver attached to it. Doing
// that to a camera pin does not fail loudly: esp_camera_init() has already
// returned OK, so the device reports a healthy sensor and then quietly never
// produces a frame. XCLK is the worst case — losing it stops the sensor's
// clock, so even SCCB register writes start failing. Catch it at build time.
#define CV_PIN_CLASH(p) \
  ((p) >= 0 && ((p) == XCLK_GPIO_NUM  || (p) == SIOD_GPIO_NUM  || (p) == SIOC_GPIO_NUM  || \
                (p) == PCLK_GPIO_NUM  || (p) == VSYNC_GPIO_NUM || (p) == HREF_GPIO_NUM  || \
                (p) == Y2_GPIO_NUM    || (p) == Y3_GPIO_NUM    || (p) == Y4_GPIO_NUM    || \
                (p) == Y5_GPIO_NUM    || (p) == Y6_GPIO_NUM    || (p) == Y7_GPIO_NUM    || \
                (p) == Y8_GPIO_NUM    || (p) == Y9_GPIO_NUM    || (p) == PWDN_GPIO_NUM  || \
                (p) == RESET_GPIO_NUM))

#if CV_PIN_CLASH(CV_RESET_BTN)
#error "CV_RESET_BTN shares a pin with the camera. Set it to -1 for this board."
#endif
#if CV_PIN_CLASH(FLASH_GPIO_NUM)
#error "FLASH_GPIO_NUM shares a pin with the camera. Set it to -1 for this board."
#endif
#if CV_PIN_CLASH(STATUS_LED_NUM)
#error "STATUS_LED_NUM shares a pin with the camera. Set it to -1 for this board."
#endif
#if CV_PIN_CLASH(PIR_GPIO_NUM)
#error "PIR_GPIO_NUM shares a pin with the camera. Pick a free pin."
#endif

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
#define FPS_MIN                 1
#define FPS_MAX                15    // TLS on an ESP32 tops out well before this
#define FPS_DEFAULT             8
#define STREAM_TTL_MS      20000UL   // stop if the app stops re-arming
#define MOTION_PERIOD_MS     500UL   // how often to run the difference check
#define MOTION_HOLD_MS      8000UL   // keep "motion" true this long after the last hit
#define MOTION_COOLDOWN_MS 15000UL   // minimum gap between motion events
#define SENSOR_RETRY_MS     5000UL   // capture retry pace while the sensor is dead
#define MD_W                   40    // 1/8 scale of a QVGA frame
#define MD_H                   30
#define FLASH_LEDC_CH           7
#define FLASH_LEDC_FREQ      5000
#define FLASH_LEDC_BITS         8

CircuventDevice cv("camera");
Preferences store;

// ---- runtime state ----
bool  camReady     = false;
bool  hasPsram     = false;
bool  streaming    = false;
int   fps          = FPS_DEFAULT;
int   quality      = 12;         // 4 (best) .. 63 (worst)
int   rotation     = 0;          // 0 | 180
int   flashLevel   = 0;          // 0..100
bool  motionOn     = true;
int   sensitivity  = 45;         // 1..100, higher = trips more easily
bool  motionActive = false;
long  motionCount = 0, snapCount = 0, frameCount = 0, dropCount = 0;
String resName     = "VGA";

unsigned long streamArmedAt = 0, lastFrameAt = 0, lastMotionScan = 0;
unsigned long lastMotionHit = 0, lastMotionEvent = 0;
uint8_t  *mdPrev = nullptr;      // previous downscaled luma frame
bool      mdPrimed = false;

// Sensor health. `camReady` only ever recorded whether esp_camera_init()
// succeeded at boot, so a sensor that died afterwards still reported "Ready"
// while every capture failed — the console showed a healthy camera sending
// nothing, which is the least useful thing it could have said. Track live
// capture outcomes instead and let the reported state follow them.
#define CAPTURE_FAIL_LIMIT 5     // consecutive failures before we call it dead
int   captureFails = 0;
bool  sensorLive   = false;      // has a capture actually worked recently

bool sccbAlive();                // defined with the camera setup, below

/** Records a capture outcome and republishes `ready` when it changes. */
void noteCapture(bool got) {
  bool was = sensorLive;
  if (got) {
    captureFails = 0;
    sensorLive = true;
  } else if (captureFails < CAPTURE_FAIL_LIMIT) {
    captureFails++;
    if (captureFails >= CAPTURE_FAIL_LIMIT) sensorLive = false;
  }
  if (sensorLive != was) {
    cv.set("ready", sensorLive);
    // On the transition to dead, say *how* it is dead. "ready:false" alone
    // sends someone hunting a software fault for a ribbon that is not seated.
    if (!sensorLive) cv.set("sccbOk", sccbAlive());
    cv.publishStateNow();
    Serial.printf("[CAM] sensor %s\n", sensorLive ? "recovered" : "not responding");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
framesize_t resFromName(const String &n) {
  if (n == "QQVGA") return FRAMESIZE_QQVGA;   // 160x120
  if (n == "QVGA")  return FRAMESIZE_QVGA;    // 320x240
  if (n == "CIF")   return FRAMESIZE_CIF;     // 400x296
  if (n == "VGA")   return FRAMESIZE_VGA;     // 640x480
  if (n == "SVGA")  return FRAMESIZE_SVGA;    // 800x600
  if (n == "XGA")   return FRAMESIZE_XGA;     // 1024x768
  if (n == "SXGA")  return FRAMESIZE_SXGA;    // 1280x1024
  if (n == "UXGA")  return FRAMESIZE_UXGA;    // 1600x1200
  return FRAMESIZE_VGA;
}

/**
 * Anything above VGA needs PSRAM for the frame buffer; without it the
 * allocation fails and the driver hands back nothing at all, which looks
 * exactly like a dead camera. Clamp instead of letting that happen.
 */
String clampRes(const String &n) {
  if (hasPsram) return n;
  if (n == "SVGA" || n == "XGA" || n == "SXGA" || n == "UXGA") return "VGA";
  return n;
}

void applyFlash(int level) {
  flashLevel = constrain(level, 0, 100);
#if FLASH_GPIO_NUM >= 0
  // Cap the duty at ~60%. The AI-Thinker illuminator is a bare LED with no
  // thermal headroom; run it flat out and it cooks itself and the regulator.
  int duty = (int)((flashLevel / 100.0f) * 255.0f * 0.6f);
  ledcWrite(FLASH_LEDC_CH, duty);
#endif
  cv.set("flash", flashLevel);
}

void applySensorSettings() {
  sensor_t *s = esp_camera_sensor_get();
  if (!s) return;
  s->set_framesize(s, resFromName(resName));
  s->set_quality(s, quality);
  s->set_vflip(s, rotation == 180 ? 1 : 0);
  s->set_hmirror(s, rotation == 180 ? 1 : 0);
  // Changing framesize invalidates the motion baseline (different geometry).
  mdPrimed = false;
}

void publishSettings() {
  cv.set("resolution", resName.c_str());
  cv.set("quality", quality);
  cv.set("rotation", rotation);
  cv.set("fps", fps);
  cv.set("motion", motionOn);
  cv.set("sensitivity", sensitivity);
  cv.set("flash", flashLevel);
  cv.set("streaming", streaming);
}

// ---------------------------------------------------------------------------
// Camera bring-up
// ---------------------------------------------------------------------------
/**
 * Confirms PSRAM actually stores what is written to it.
 *
 * psramFound() reports that the SDK enumerated a chip, not that the chip
 * works. Clone modules ship with absent, mismatched or marginal PSRAM, and the
 * failure is silent in the worst way: the allocator keeps handing out external
 * addresses, the camera DMAs frames into them, and the damage surfaces much
 * later as a panic somewhere unrelated.
 *
 * Every block is written before any block is read back, so a chip that decodes
 * fewer address lines than it claims — where a later write lands on top of an
 * earlier block — is caught rather than passing a naive write-then-read.
 */
static bool psramUsable() {
  const size_t BLOCKS = 8;
  const size_t WORDS = (32 * 1024) / sizeof(uint32_t);
  uint32_t *blk[BLOCKS] = { nullptr };
  bool ok = true;

  for (size_t i = 0; i < BLOCKS; i++) {
    blk[i] = (uint32_t *)heap_caps_malloc(WORDS * sizeof(uint32_t), MALLOC_CAP_SPIRAM);
    if (!blk[i]) { ok = false; break; }
  }

  if (ok) {
    for (size_t i = 0; i < BLOCKS; i++)
      for (size_t j = 0; j < WORDS; j++)
        blk[i][j] = (uint32_t)(i * 0x9E3779B1u) ^ (uint32_t)j;

    for (size_t i = 0; i < BLOCKS && ok; i++)
      for (size_t j = 0; j < WORDS; j++)
        if (blk[i][j] != ((uint32_t)(i * 0x9E3779B1u) ^ (uint32_t)j)) { ok = false; break; }
  }

  for (size_t i = 0; i < BLOCKS; i++) if (blk[i]) heap_caps_free(blk[i]);
  return ok;
}

bool initCamera() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer   = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM;   c.pin_d1 = Y3_GPIO_NUM;
  c.pin_d2 = Y4_GPIO_NUM;   c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM;   c.pin_d5 = Y7_GPIO_NUM;
  c.pin_d6 = Y8_GPIO_NUM;   c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk     = XCLK_GPIO_NUM;
  c.pin_pclk     = PCLK_GPIO_NUM;
  c.pin_vsync    = VSYNC_GPIO_NUM;
  c.pin_href     = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM;
  c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn     = PWDN_GPIO_NUM;
  c.pin_reset    = RESET_GPIO_NUM;
  // 10 MHz rather than the 20 MHz the examples use. The sensor, the parallel
  // data bus and the DMA writes behind them all scale with this clock, and on
  // AI-Thinker-class boards — especially HW-297 / ESP-32S clones with a small
  // on-board regulator — 20 MHz is what pushes a marginal supply over the edge
  // once Wi-Fi is also transmitting. Halving it costs frame rate at the top
  // resolutions and buys a large stability margin. It also makes SCCB writes
  // far more reliable, since the sensor clocks its register logic from XCLK.
  c.xclk_freq_hz = 10000000;
  c.pixel_format = PIXFORMAT_JPEG;

  hasPsram = psramFound() && psramUsable();
  if (psramFound() && !hasPsram) {
    Serial.println("[CAM] PSRAM present but failed verification — using DRAM");
  }

  if (hasPsram) {
    c.frame_size   = FRAMESIZE_VGA;
    c.jpeg_quality = quality;
    // Single buffer. The second buffer doubles both the PSRAM footprint and
    // the DMA bandwidth for, at these frame rates, no useful overlap.
    c.fb_count     = 1;
    c.fb_location  = CAMERA_FB_IN_PSRAM;
    c.grab_mode    = CAMERA_GRAB_WHEN_EMPTY;
  } else {
    // Without PSRAM the buffer lives in the internal DRAM shared with TLS and
    // the network stack, so keep it small and single-buffered.
    c.frame_size   = FRAMESIZE_QVGA;
    c.jpeg_quality = 14;
    c.fb_count     = 1;
    c.fb_location  = CAMERA_FB_IN_DRAM;
    c.grab_mode    = CAMERA_GRAB_WHEN_EMPTY;
  }

  esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) {
    Serial.printf("[CAM] init failed 0x%x\n", err);
    return false;
  }

  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    // Published so a board that initialises but never captures can be told
    // apart from one whose sensor was never detected. Without this the console
    // shows "ready" and zero frames, and there is no way to distinguish a
    // missing module, an unseated ribbon and a dead data bus from a browser
    // that simply is not subscribed.
    cv.set("sensorPid", (int)s->id.PID);
    // OV3660 modules ship upside down and washed out.
    if (s->id.PID == OV3660_PID) {
      s->set_vflip(s, 1);
      s->set_brightness(s, 1);
      s->set_saturation(s, -2);
    }
    s->set_gain_ctrl(s, 1);
    s->set_exposure_ctrl(s, 1);
    s->set_whitebal(s, 1);
  }
  return true;
}

/**
 * Is the sensor still talking on SCCB?
 *
 * SCCB runs on SIOD/SIOC alone. The frame data rides eleven other pins —
 * PCLK, VSYNC, HREF and Y2-Y9 — so the two can fail independently, and which
 * one failed is the whole diagnosis:
 *
 *   SCCB ok + no frames  -> the sensor is alive and the parallel bus is not.
 *                           A ribbon that is seated well enough for two pins
 *                           but not thirteen looks exactly like this.
 *   SCCB fails           -> the module has lost power or is gone entirely.
 *
 * Reading a register the sensor always answers is the cheapest way to ask.
 */
bool sccbAlive() {
  sensor_t *s = esp_camera_sensor_get();
  if (!s || !s->get_reg) return false;
  // 0x0A is the product-ID high byte on every OV sensor this firmware supports.
  int v = s->get_reg(s, 0x0A, 0xFF);
  return v >= 0;
}

// ---------------------------------------------------------------------------
// Motion detection
// ---------------------------------------------------------------------------
/**
 * Decodes the JPEG at 1/8 scale into RGB565 and compares the luma of each cell
 * against the previous pass. Decoding a 40x30 thumbnail costs a few
 * milliseconds; decoding the full frame would cost tens and starve MQTT.
 */
bool detectMotion(camera_fb_t *fb) {
  if (!mdPrev || fb->format != PIXFORMAT_JPEG) return false;
  static uint8_t rgb[MD_W * MD_H * 2];

  if (!jpg2rgb565(fb->buf, fb->len, rgb, JPG_SCALE_8X)) return false;

  uint32_t changed = 0;
  // Below this a pixel delta is just sensor noise, not movement.
  const int pixelThreshold = 18;
  for (int i = 0; i < MD_W * MD_H; i++) {
    uint16_t px = (uint16_t)rgb[i * 2] | ((uint16_t)rgb[i * 2 + 1] << 8);
    uint8_t r = (px >> 11) & 0x1F, g = (px >> 5) & 0x3F, b = px & 0x1F;
    uint8_t luma = (uint8_t)(((r << 3) * 77 + (g << 2) * 150 + (b << 3) * 29) >> 8);
    if (mdPrimed && abs((int)luma - (int)mdPrev[i]) > pixelThreshold) changed++;
    mdPrev[i] = luma;
  }
  if (!mdPrimed) { mdPrimed = true; return false; }

  // sensitivity 1..100 maps to "how much of the frame must move": 12% .. 0.6%.
  uint32_t need = (uint32_t)((MD_W * MD_H) * (0.12f - (sensitivity / 100.0f) * 0.114f));
  if (need < 2) need = 2;
  return changed >= need;
}

void raiseMotion(const char *source) {
  lastMotionHit = millis();
  if (!motionActive) {
    motionActive = true;
    cv.set("motionActive", true);
    cv.publishStateNow();
  }
  if (millis() - lastMotionEvent < MOTION_COOLDOWN_MS) return;
  lastMotionEvent = millis();
  motionCount++;
  cv.set("motionCount", motionCount);

  JsonDocument d;
  d["type"]   = "motion";
  d["source"] = source;              // "image" | "pir"
  d["ts"]     = (long)(millis() / 1000);
  cv.publishTelemetry(d.as<JsonObjectConst>());
}

// ---------------------------------------------------------------------------
// Capture + publish
// ---------------------------------------------------------------------------
bool sendFrame(bool isSnapshot) {
  if (!camReady) return false;
  // A sensor already proven dead is not asked again. esp_camera_fb_get() does
  // not time out when the parallel bus is disconnected — it waits on a frame
  // queue nothing will ever fill, taking the whole loop with it. One such call
  // is enough to make the device unreachable, so a user pressing Snapshot must
  // not be able to trigger it either. Reboot re-inits and clears this.
  if (!sensorLive && captureFails >= CAPTURE_FAIL_LIMIT) { dropCount++; return false; }
  camera_fb_t *fb = esp_camera_fb_get();
  noteCapture(fb != nullptr);
  if (!fb) { dropCount++; return false; }

  bool ok = false;
  if (fb->format == PIXFORMAT_JPEG) ok = cv.publishFrame(fb->buf, fb->len);
  size_t len = fb->len;
  int w = fb->width, h = fb->height;

  // Motion runs off the same capture the stream already paid for, so an active
  // stream costs nothing extra to monitor.
  bool moved = false;
  if (motionOn && millis() - lastMotionScan >= MOTION_PERIOD_MS) {
    lastMotionScan = millis();
    moved = detectMotion(fb);
  }

  esp_camera_fb_return(fb);   // return before anything slow or capture stalls

  if (moved) raiseMotion("image");
  if (!ok) { dropCount++; return false; }

  frameCount++;
  if (isSnapshot) {
    snapCount++;
    // The image itself went out on the frame topic; this row is just the
    // searchable record that it happened.
    JsonDocument d;
    d["type"]  = "snapshot";
    d["bytes"] = (long)len;
    d["w"] = w; d["h"] = h;
    d["ts"] = (long)(millis() / 1000);
    cv.publishTelemetry(d.as<JsonObjectConst>());
    cv.set("snapshots", snapCount);
    cv.publishStateNow();
  }
  return true;
}

void setStreaming(bool on) {
  if (on) streamArmedAt = millis();
  if (streaming == on) return;
  streaming = on;
  cv.set("streaming", streaming);
  cv.publishStateNow();
  Serial.printf("[CAM] stream %s\n", on ? "on" : "off");
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
void onCommand(const String &action, JsonObjectConst p) {
  if (action == "stream") {
    if (p["fps"].is<int>()) {
      fps = constrain(p["fps"].as<int>(), FPS_MIN, FPS_MAX);
      store.putInt("fps", fps);
      cv.set("fps", fps);
    }
    setStreaming(p["on"].is<bool>() ? p["on"].as<bool>() : true);

  } else if (action == "snapshot") {
    sendFrame(true);

  } else if (action == "flash") {
    if (p["level"].is<int>()) applyFlash(p["level"].as<int>());
    else applyFlash(p["on"].is<bool>() && p["on"].as<bool>() ? 100 : 0);
    store.putInt("flash", flashLevel);
    cv.publishStateNow();

  } else if (action == "reboot") {
    cv.publishStateNow();
    delay(200);
    ESP.restart();

  } else if (action == "set") {
    bool touchSensor = false;
    if (p["resolution"].is<const char *>()) {
      resName = clampRes(String(p["resolution"].as<const char *>()));
      store.putString("res", resName);
      touchSensor = true;
    }
    if (p["quality"].is<int>()) {
      quality = constrain(p["quality"].as<int>(), 4, 63);
      store.putInt("q", quality);
      touchSensor = true;
    }
    if (p["rotation"].is<int>()) {
      rotation = p["rotation"].as<int>() == 180 ? 180 : 0;
      store.putInt("rot", rotation);
      touchSensor = true;
    }
    if (p["fps"].is<int>()) {
      fps = constrain(p["fps"].as<int>(), FPS_MIN, FPS_MAX);
      store.putInt("fps", fps);
    }
    if (p["flash"].is<int>()) { applyFlash(p["flash"].as<int>()); store.putInt("flash", flashLevel); }
    if (p["motion"].is<bool>()) {
      motionOn = p["motion"].as<bool>();
      store.putBool("md", motionOn);
      if (!motionOn && motionActive) { motionActive = false; cv.set("motionActive", false); }
      mdPrimed = false;
    }
    if (p["sensitivity"].is<int>()) {
      sensitivity = constrain(p["sensitivity"].as<int>(), 1, 100);
      store.putInt("sens", sensitivity);
    }
    if (p["streaming"].is<bool>()) setStreaming(p["streaming"].as<bool>());

    if (touchSensor) applySensorSettings();
    publishSettings();
    cv.publishStateNow();
  }
}

// ---------------------------------------------------------------------------
void setup() {
  // The brownout detector stays ON deliberately.
  //
  // This used to write RTC_CNTL_BROWN_OUT_REG = 0 because the board reset in a
  // loop on weak USB supplies. That silenced the warning without adding a
  // single milliamp of headroom: below the brownout threshold the SPI flash
  // and PSRAM stop returning correct data, so instead of a clean reset the
  // chip carries on executing corrupted code. That shows up as Guru Meditation
  // panics with nonsense program counters, shredded backtraces, and an ELF
  // SHA256 that reads as a repeating byte pattern — a crash that tells you
  // nothing about its own cause.
  //
  // A reset that prints "Brownout detector was triggered" names the fault in
  // one line. If that message appears, the supply is the problem: power the
  // board from a real 5V source rather than an FTDI adapter's regulator.

  Serial.begin(115200);
  Serial.setDebugOutput(false);

#if STATUS_LED_NUM >= 0
  pinMode(STATUS_LED_NUM, OUTPUT);
  digitalWrite(STATUS_LED_NUM, HIGH);   // active-LOW: HIGH = off
#endif
#if FLASH_GPIO_NUM >= 0
  ledcSetup(FLASH_LEDC_CH, FLASH_LEDC_FREQ, FLASH_LEDC_BITS);
  ledcAttachPin(FLASH_GPIO_NUM, FLASH_LEDC_CH);
  ledcWrite(FLASH_LEDC_CH, 0);
#endif
#if PIR_GPIO_NUM >= 0
  pinMode(PIR_GPIO_NUM, INPUT);
#endif

  store.begin("cam", false);
  resName     = store.getString("res", resName);
  quality     = store.getInt("q", quality);
  rotation    = store.getInt("rot", rotation);
  fps         = store.getInt("fps", fps);
  motionOn    = store.getBool("md", motionOn);
  sensitivity = store.getInt("sens", sensitivity);
  flashLevel  = store.getInt("flash", 0);

  camReady = initCamera();
  if (camReady) {
    resName = clampRes(resName);
    applySensorSettings();
    mdPrev = (uint8_t *)malloc(MD_W * MD_H);
    if (!mdPrev) motionOn = false;    // no baseline buffer, no differencing
  }
  sensorLive = camReady;   // init succeeded; live captures confirm or refute it
  applyFlash(flashLevel);

  cv.onCommand(onCommand);
  cv.setInterval(15000);
#if CV_RESET_BTN >= 0
  cv.setResetButton(CV_RESET_BTN);
#endif
  cv.begin();

  cv.set("hasCamera", true);          // how the apps discover a video source
  cv.set("ready", camReady);
  cv.set("psram", hasPsram);
  cv.set("motionActive", false);
  cv.set("motionCount", motionCount);
  cv.set("snapshots", snapCount);
  publishSettings();
  cv.publishStateNow();

#if STATUS_LED_NUM >= 0
  digitalWrite(STATUS_LED_NUM, camReady ? LOW : HIGH);
#endif
}

void loop() {
  unsigned long now = millis();

  /*
   * Why a dead sensor stops all automatic capture rather than retrying slowly.
   *
   * The previous version paced retries at SENSOR_RETRY_MS on the theory that
   * esp_camera_fb_get() "blocks for seconds" when the sensor is unresponsive.
   * On a board whose parallel bus is disconnected it is worse than that: with
   * no VSYNC at all the driver waits on its frame queue and does not come back,
   * so loop() never returns, cv.loop() never runs, and the device stops
   * answering MQTT entirely. It is still powered, still associated to Wi-Fi,
   * and completely deaf — which cost this unit its OTA path and needed a
   * physical power cycle to recover.
   *
   * A pacing interval cannot help with that, because the very first call after
   * the sensor dies is the one that never returns. So once CAPTURE_FAIL_LIMIT
   * consecutive failures have declared the sensor dead, nothing here touches it
   * again. Recovery is a reboot, which is what the console already tells the
   * user to do after reseating the ribbon, and which is reachable over the air
   * precisely because the device stayed connected.
   *
   * Losing the camera should cost the camera, not the device.
   */

  // A stream nobody re-armed is a stream nobody is watching.
  if (streaming && now - streamArmedAt > STREAM_TTL_MS) setStreaming(false);

  if (streaming && camReady && sensorLive) {
    unsigned long period = 1000UL / (unsigned long)max(fps, FPS_MIN);
    if (now - lastFrameAt >= period) {
      lastFrameAt = now;
      sendFrame(false);
    }
  } else if (motionOn && camReady && sensorLive &&
             now - lastMotionScan >= MOTION_PERIOD_MS) {
    // Idle: capture only as often as the motion check needs, and never publish.
    lastMotionScan = now;
    camera_fb_t *fb = esp_camera_fb_get();
    noteCapture(fb != nullptr);
    if (fb) {
      bool moved = detectMotion(fb);
      esp_camera_fb_return(fb);
      if (moved) raiseMotion("image");
    }
  }

#if PIR_GPIO_NUM >= 0
  if (motionOn && digitalRead(PIR_GPIO_NUM) == HIGH) raiseMotion("pir");
#endif

  if (motionActive && now - lastMotionHit > MOTION_HOLD_MS) {
    motionActive = false;
    cv.set("motionActive", false);
    cv.publishStateNow();
  }

  cv.set("frames", frameCount);
  cv.set("dropped", dropCount);

  cv.loop();
}
