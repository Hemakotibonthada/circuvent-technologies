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
 *   1.9.0  Serve video on the LAN as well as over MQTT.
 *
 * WHY THERE ARE NOW TWO WAYS OUT
 *
 * Frames reach the apps over MQTT, which the control plane relays only to
 * sockets that asked for them with a `watch` message. The deployed control
 * plane never reads inbound WebSocket messages at all — measured, not assumed:
 * it answers protocol pings and pushes 231 state updates a minute, but four
 * `subscribe` frames over twenty seconds drew no reply, from two independent
 * client stacks. So `watch` never lands, the relay gate never opens, and no
 * camera can show a picture no matter how healthy it is. This one had
 * published 20,522 frames with zero drops while its dashboard said "waiting
 * for the first frame".
 *
 * That fault is fixed by deploying the API. This device cannot make that
 * happen — but it can stop being the only thing in the chain with no second
 * route. An MJPEG endpoint on the LAN needs no broker, no relay and no cloud,
 * so video works on the local network while the relay is down, and keeps
 * working if it ever goes down again.
 */
#define CV_FW_VERSION "1.11.0"

#include "esp_camera.h"
#include "esp_http_server.h"
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
/*
 * 30 is reachable on the LAN, where a frame is a plain socket write. It is not
 * reachable over MQTT+TLS, where every frame is encrypted and published — that
 * path tops out around 13-15 on this chip. The ceiling is the LAN ceiling, and
 * the MQTT sender simply falls behind its target rather than misbehaving, so
 * asking for 30 gives 30 locally and the best available remotely.
 */
#define FPS_MAX                30
#define FPS_DEFAULT             8
#define STREAM_TTL_MS      20000UL   // stop if the app stops re-arming
#define CLOUD_TTL_MS      120000UL   // remote viewing window, re-armed by the app
#define MOTION_PERIOD_MS     500UL   // how often to run the difference check
#define MOTION_HOLD_MS      8000UL   // keep "motion" true this long after the last hit
#define MOTION_COOLDOWN_MS 15000UL   // minimum gap between motion events
#define SENSOR_RETRY_MS     5000UL   // capture retry pace while the sensor is dead
#define CV_LAN_PORT            81    // LAN video; 80 belongs to the setup portal
/* Motion scan geometry is derived per-frame in mdEnsureBuffers(); see the note
   there. It used to be these two constants, which is precisely the bug. */
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

/**
 * Does a capture actually complete, or does it hang?
 *
 * esp_camera_fb_get() does not time out. With the parallel bus disconnected
 * there is no VSYNC, the driver waits on a frame queue nothing will ever fill,
 * and it never returns — so loop() never returns either, cv.loop() never runs,
 * and the task watchdog resets the chip. That is a TG1WDT_SYS_RESET reboot
 * loop with no panic and no clue in it.
 *
 * Counting failures cannot defend against this, which is what the previous
 * attempt did: `sensorLive` starts true, so the very first capture runs, and a
 * call that never returns never increments a failure counter. The first attempt
 * is the one that has to be survivable.
 *
 * So the first capture happens on its own task, and the main thread waits with
 * a deadline. If it does not land, the camera is declared dead for this boot
 * and nothing calls into the driver again. The probe task stays blocked
 * forever — it is holding a queue read inside the driver and cannot be safely
 * killed — which costs one task and its stack. That is a fair price for a
 * device that stays reachable, answers MQTT, and can still be given new
 * firmware over the air.
 */
static QueueHandle_t probeQ = nullptr;

static void captureProbeTask(void *) {
  camera_fb_t *fb = esp_camera_fb_get();      // may never return
  bool ok = fb != nullptr;
  if (fb) esp_camera_fb_return(fb);
  if (probeQ) xQueueSend(probeQ, &ok, 0);
  vTaskDelete(nullptr);
}

/** Returns false if the sensor could not produce a frame within `ms`. */
bool captureWorksWithin(uint32_t ms) {
  probeQ = xQueueCreate(1, sizeof(bool));
  if (!probeQ) return false;
  if (xTaskCreate(captureProbeTask, "cvcamprobe", 4096, nullptr, 1, nullptr) != pdPASS) {
    vQueueDelete(probeQ); probeQ = nullptr;
    return false;
  }
  bool ok = false;
  if (xQueueReceive(probeQ, &ok, pdMS_TO_TICKS(ms)) != pdTRUE) {
    // Deliberately leaked: the task is parked inside the driver and deleting it
    // there would free a queue the driver still references.
    Serial.printf("[CAM] capture did not return within %ums — sensor declared dead\n", (unsigned)ms);
    probeQ = nullptr;
    return false;
  }
  vQueueDelete(probeQ); probeQ = nullptr;
  return ok;
}

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
// LAN video
// ---------------------------------------------------------------------------
/*
 * Captures now come from two threads: loop() for the MQTT stream and motion
 * scanning, and the HTTP server task for LAN viewers. esp_camera_fb_get() is
 * not safe to call concurrently — two callers race the same driver frame
 * queue — so every capture in this sketch, from either thread, is taken under
 * this mutex.
 *
 * The HTTP task must never touch `cv`. PubSubClient holds one connection with
 * one buffer and is not thread-safe, so publishing from the server task while
 * loop() is mid-publish corrupts the stream. The handlers therefore report
 * failure only to their own HTTP client and leave sensor bookkeeping to
 * loop(), which is the only thread that talks to MQTT.
 */
static SemaphoreHandle_t camMux  = nullptr;
static httpd_handle_t    lanHttpd = nullptr;
static uint8_t          *lanCopy  = nullptr;   // reusable, so no per-frame malloc
static size_t            lanCopyCap = 0;
static volatile int      lanViewers = 0;

static bool camLock(uint32_t ms) {
  return camMux && xSemaphoreTake(camMux, pdMS_TO_TICKS(ms)) == pdTRUE;
}
static void camUnlock() {
  if (camMux) xSemaphoreGive(camMux);
}

/** Copies a frame out so the driver buffer can be returned before network I/O. */
static bool lanCopyFrame(const camera_fb_t *fb) {
  if (fb->len > lanCopyCap) {
    uint8_t *grown = (uint8_t *)heap_caps_realloc(
        lanCopy, fb->len, hasPsram ? MALLOC_CAP_SPIRAM : MALLOC_CAP_8BIT);
    if (!grown) return false;
    lanCopy = grown;
    lanCopyCap = fb->len;
  }
  memcpy(lanCopy, fb->buf, fb->len);
  return true;
}

/**
 * Grabs one frame into `lanCopy`. Returns 0 on failure.
 *
 * The driver buffer is handed back before the caller writes to a socket. A
 * viewer on a slow link would otherwise hold a frame buffer for the length of
 * its transfer, and with two buffers that stalls the next capture — the same
 * reason sendFrame() returns early.
 */
static size_t lanGrab() {
  if (!camReady || !sensorLive) return 0;
  if (!camLock(3000)) return 0;
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) { camUnlock(); return 0; }
  size_t len = fb->format == PIXFORMAT_JPEG && lanCopyFrame(fb) ? fb->len : 0;
  esp_camera_fb_return(fb);
  camUnlock();
  return len;
}

#define LAN_BOUNDARY "cvframe"

/*
 * This IDF exposes no HTTPD_503 constant, and the nearest one it does offer is
 * HTTPD_500_INTERNAL_SERVER_ERROR. A camera whose ribbon is unseated has not
 * suffered a server error, and answering 500 would point whoever reads the log
 * at this firmware instead of at the cable. The status is set by hand so the
 * code stays truthful.
 */
static esp_err_t lanUnavailable(httpd_req_t *req, const char *why) {
  httpd_resp_set_status(req, "503 Service Unavailable");
  httpd_resp_set_type(req, "text/plain");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_send(req, why, HTTPD_RESP_USE_STRLEN);
  return ESP_FAIL;
}

static esp_err_t lanSnapshot(httpd_req_t *req) {
  size_t len = lanGrab();
  if (!len) return lanUnavailable(req, "camera not ready");
  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Cache-Control", "no-store");
  return httpd_resp_send(req, (const char *)lanCopy, len);
}

static esp_err_t lanStream(httpd_req_t *req) {
  if (!camReady || !sensorLive) return lanUnavailable(req, "camera not ready");
  if (httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=" LAN_BOUNDARY) != ESP_OK)
    return ESP_FAIL;
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  lanViewers++;
  char head[96];
  esp_err_t res = ESP_OK;
  while (res == ESP_OK) {
    size_t len = lanGrab();
    if (!len) { res = ESP_FAIL; break; }
    int n = snprintf(head, sizeof(head),
                     "\r\n--" LAN_BOUNDARY "\r\nContent-Type: image/jpeg\r\n"
                     "Content-Length: %u\r\n\r\n", (unsigned)len);
    res = httpd_resp_send_chunk(req, head, n);
    if (res == ESP_OK) res = httpd_resp_send_chunk(req, (const char *)lanCopy, len);
    // Pace to the configured frame rate so a LAN viewer cannot monopolise the
    // sensor and starve motion detection.
    vTaskDelay(pdMS_TO_TICKS(1000UL / (unsigned long)max(fps, FPS_MIN)));
  }
  lanViewers--;
  httpd_resp_send_chunk(req, nullptr, 0);
  return res;
}

/** Small landing page, so the printed URL is useful on its own. */
static esp_err_t lanIndex(httpd_req_t *req) {
  static const char page[] =
      "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
      "<title>Circuvent camera</title>"
      "<style>body{margin:0;background:#0b0f14;color:#e6edf3;font:15px system-ui;"
      "display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px}"
      "img{width:100%;max-width:720px;border-radius:12px;background:#000}"
      "a{color:#7cc4ff}</style>"
      "<h3>Circuvent camera — local view</h3>"
      "<img src='/stream' alt='Live camera stream'>"
      "<p><a href='/snapshot'>Still image</a></p>";
  httpd_resp_set_type(req, "text/html; charset=utf-8");
  return httpd_resp_send(req, page, sizeof(page) - 1);
}

void startLanVideo() {
  if (lanHttpd) return;
  httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();
  cfg.server_port = CV_LAN_PORT;
  cfg.ctrl_port   = 32769;          // default 32768 belongs to the portal server
  cfg.stack_size  = 8192;           // JPEG chunking overruns the 4 kB default
  cfg.max_uri_handlers = 4;
  cfg.lru_purge_enable = true;
  if (httpd_start(&lanHttpd, &cfg) != ESP_OK) {
    lanHttpd = nullptr;
    Serial.println(F("[CAM] LAN video server failed to start"));
    return;
  }
  httpd_uri_t routes[] = {
      {"/",         HTTP_GET, lanIndex,    nullptr},
      {"/stream",   HTTP_GET, lanStream,   nullptr},
      {"/snapshot", HTTP_GET, lanSnapshot, nullptr},
  };
  for (auto &r : routes) httpd_register_uri_handler(lanHttpd, &r);
  Serial.printf("[CAM] LAN video at http://%s:%d/\n",
                WiFi.localIP().toString().c_str(), CV_LAN_PORT);
}

// ---------------------------------------------------------------------------
// Remote viewing
// ---------------------------------------------------------------------------
/*
 * Posting frames to the website, for viewers who are not on this network.
 *
 * The MQTT frame relay is unreachable in the deployed control plane, and LAN
 * video only helps someone already at home. So while a viewer is watching from
 * elsewhere, frames also go out over plain HTTPS to an endpoint that hands
 * them to the browser. That path needs nothing from the broker.
 *
 * It is armed by the app and expires on its own, exactly like `streaming`: a
 * camera that uploaded around the clock would spend the household's bandwidth
 * on nobody. The token is issued per viewing session, so this firmware never
 * stores a durable upload credential.
 */
String cloudUrl, cloudToken;
int    cloudFps = 2;
unsigned long cloudArmedAt = 0, cloudTtlMs = CLOUD_TTL_MS, lastCloudAt = 0;
long   cloudSent = 0, cloudFail = 0;

static bool cloudActive() {
  return cloudUrl.length() && millis() - cloudArmedAt <= cloudTtlMs;
}

/**
 * Sends one frame to the site.
 *
 * Runs on the main thread on purpose. It is the only thread that may touch
 * `cv`, and it already owns the capture mutex through lanGrab(), so a single
 * upload cannot interleave with an MQTT publish or a LAN viewer's capture.
 * The cost is that a slow upload delays the loop, which is why the rate is
 * low and the TTL short.
 */
static void cloudPushFrame() {
  size_t len = lanGrab();
  if (!len) { cloudFail++; return; }

  /*
   * The TLS session is held open across frames.
   *
   * The first version built a WiFiClientSecure per frame, so every upload paid
   * for a full handshake — measured at roughly 1.3 s per frame against a
   * requested 2 fps, which is to say the handshake cost more than the image.
   * Keeping the connection means one handshake per viewing session instead of
   * one per frame. They are static rather than globals because nothing outside
   * this function may touch them: they belong to whichever thread is uploading.
   */
  static WiFiClientSecure client;
  static HTTPClient http;
  static bool pinned = false;
  if (!pinned) { cv.pinRoot(client); pinned = true; }

  if (!http.begin(client, cloudUrl)) { cloudFail++; return; }
  http.setReuse(true);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("X-CV-Device", cv.deviceId());
  http.addHeader("X-CV-Token", cloudToken);
  int code = http.POST(lanCopy, len);
  http.end();

  if (code == 200) {
    cloudSent++;
  } else {
    cloudFail++;
    // A refusal that will not fix itself must stop the uploads, or the device
    // hammers the endpoint for the rest of the window. 403/409/410 all mean
    // "this token is not going to start working".
    if (code == 403 || code == 409 || code == 410) {
      Serial.printf("[CAM] cloud push refused (%d) — stopping\n", code);
      cloudUrl = "";
    }
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
/**
 * Motion detection works on a 1/8-scale decode of whatever frame arrives.
 *
 * These were fixed at 40x30 — 1/8 of QVGA — with a static
 * `uint8_t rgb[MD_W * MD_H * 2]` behind them, while the camera's default
 * resolution is VGA. jpg2rgb565() decodes the whole frame, so a VGA capture
 * wrote 80x60x2 = 9600 bytes into a 2400-byte buffer and took 7200 bytes of
 * whatever followed it with it. The symptom was a reboot loop with an
 * ASCII-looking program counter, a corrupted backtrace and a corrupted ELF
 * hash — memory damage rather than a clean fault, several steps removed from
 * the code that caused it.
 *
 * It had been latent for as long as the code existed: the frames never arrived
 * on the one board running this firmware, so the decode never ran. Fixing the
 * camera is what made it reachable, which is the awkward shape of this class of
 * bug — it only appears once something else starts working.
 *
 * The buffers are now sized from the frame actually received and reallocated if
 * the resolution changes, with the decode refused outright if anything does not
 * add up. A cap keeps a UXGA frame from asking for 60 kB of DRAM; above it,
 * motion detection turns itself off rather than guessing at a smaller buffer.
 */
#define MD_MAX_PIXELS (80 * 60)   // VGA at 1/8. Covers every resolution we scan.

static uint8_t *mdRgb = nullptr;  // 1/8-scale RGB565 decode target
static int mdW = 0, mdH = 0;      // dimensions the buffers are currently sized for

/** Sizes the motion buffers for this frame. False means do not decode. */
static bool mdEnsureBuffers(int frameW, int frameH) {
  const int w = frameW / 8, h = frameH / 8;
  if (w <= 0 || h <= 0) return false;
  if (w * h > MD_MAX_PIXELS) {
    // Larger than we are willing to allocate for. Say so once and stop trying,
    // rather than silently never detecting anything.
    if (motionOn) {
      motionOn = false;
      cv.set("motion", false);
      cv.publishStateNow();
      Serial.printf("[CAM] motion detection off: %dx%d is too large to scan\n", frameW, frameH);
    }
    return false;
  }
  if (w == mdW && h == mdH && mdRgb && mdPrev) return true;

  free(mdRgb);  mdRgb = nullptr;
  free(mdPrev); mdPrev = nullptr;
  mdRgb  = (uint8_t *)malloc((size_t)w * h * 2);
  mdPrev = (uint8_t *)malloc((size_t)w * h);
  if (!mdRgb || !mdPrev) {
    free(mdRgb);  mdRgb = nullptr;
    free(mdPrev); mdPrev = nullptr;
    mdW = mdH = 0;
    motionOn = false;                 // no buffer, no differencing
    Serial.println(F("[CAM] motion detection off: could not allocate scan buffers"));
    return false;
  }
  mdW = w; mdH = h;
  mdPrimed = false;                   // geometry changed; the baseline is void
  Serial.printf("[CAM] motion scan buffers sized for %dx%d\n", w, h);
  return true;
}

bool detectMotion(camera_fb_t *fb) {
  if (fb->format != PIXFORMAT_JPEG) return false;
  if (!mdEnsureBuffers(fb->width, fb->height)) return false;

  if (!jpg2rgb565(fb->buf, fb->len, mdRgb, JPG_SCALE_8X)) return false;

  const int count = mdW * mdH;
  uint32_t changed = 0;
  // Below this a pixel delta is just sensor noise, not movement.
  const int pixelThreshold = 18;
  for (int i = 0; i < count; i++) {
    uint16_t px = (uint16_t)mdRgb[i * 2] | ((uint16_t)mdRgb[i * 2 + 1] << 8);
    uint8_t r = (px >> 11) & 0x1F, g = (px >> 5) & 0x3F, b = px & 0x1F;
    uint8_t luma = (uint8_t)(((r << 3) * 77 + (g << 2) * 150 + (b << 3) * 29) >> 8);
    if (mdPrimed && abs((int)luma - (int)mdPrev[i]) > pixelThreshold) changed++;
    mdPrev[i] = luma;
  }
  if (!mdPrimed) { mdPrimed = true; return false; }

  // sensitivity 1..100 maps to "how much of the frame must move": 12% .. 0.6%.
  uint32_t need = (uint32_t)(count * (0.12f - (sensitivity / 100.0f) * 0.114f));
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
  if (!camLock(3000)) { dropCount++; return false; }   // a LAN viewer holds it briefly
  camera_fb_t *fb = esp_camera_fb_get();
  noteCapture(fb != nullptr);
  if (!fb) { camUnlock(); dropCount++; return false; }

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
  camUnlock();

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

  } else if (action == "cloudpush") {
    // Remote viewing. The app arms this and re-arms it while someone watches;
    // it lapses on its own so a closed tab cannot leave a camera uploading.
    if (p["on"] | false) {
      cloudUrl   = (const char *)(p["url"]   | "");
      cloudToken = (const char *)(p["token"] | "");
      cloudFps   = constrain((int)(p["fps"] | 2), 1, 4);
      long ttl   = p["ttl"] | 0;
      cloudTtlMs = ttl > 0 ? (unsigned long)ttl * 1000UL : CLOUD_TTL_MS;
      cloudArmedAt = millis();
      Serial.printf("[CAM] remote viewing armed (%d fps)\n", cloudFps);
    } else {
      cloudUrl = "";
      Serial.println(F("[CAM] remote viewing stopped"));
    }
    cv.set("cloud", cloudActive());
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

  /*
   * The camera is initialised here, before cv.begin(), and torn down again if
   * begin() turns out to need the setup portal.
   *
   * Both halves of that are load-bearing, and I got it wrong in each direction
   * before landing here.
   *
   * It cannot come after begin(): the driver needs a large DMA-capable
   * allocation, and by the time Wi-Fi has associated and mbedTLS has taken its
   * working buffers the heap is too fragmented to serve one. What that produced
   * was not a clean init failure but a panic inside xTaskIncrementTick with a
   * garbage PC — the scheduler tick walking a structure that allocation damage
   * had already corrupted, several frames removed from anything this sketch
   * wrote. Decoding the return address was the only thing that identified it.
   *
   * It also cannot simply stay up during provisioning: the portal raises a soft
   * AP, a web server, a DNS server and an async scan together, and the camera's
   * DMA alongside them panics the board before a phone can list the hotspot.
   *
   * So: take the memory first, while it is contiguous, and give it back if it
   * turns out the portal needs it. Provisioning is the one moment a camera is
   * definitively useless — no network, no subscriber, nobody watching — and
   * _portalSave() restarts, so the next boot comes back through here with Wi-Fi
   * configured and takes the normal path.
   */
  camReady = initCamera();
  if (camReady) {
    resName = clampRes(resName);
    applySensorSettings();
    // The scan buffers are sized from the first frame that actually arrives,
    // because their size depends on the resolution and that can change at
    // runtime. Allocating a fixed pair here is what produced a 2400-byte
    // buffer for a 9600-byte VGA decode.    // esp_camera_init() only proves the sensor answered on SCCB — two pins.
    // Frames need eleven more, and a board whose ribbon is not seated passes
    // init and then hangs on the first capture. Find that out here, once, on a
    // task we can walk away from, rather than in loop() where it takes the
    // watchdog and the device with it.
    if (!captureWorksWithin(4000)) {
      camReady = false;
      Serial.println(F("[CAM] init succeeded but no frame arrived — running without the camera"));
    }
  }
  sensorLive = camReady;
  applyFlash(flashLevel);

  cv.onCommand(onCommand);
  cv.setInterval(15000);
#if CV_RESET_BTN >= 0
  cv.setResetButton(CV_RESET_BTN);
#endif
  cv.begin();

  if (cv.isProvisioning() && camReady) {
    esp_camera_deinit();
    camReady = false;
    sensorLive = false;
    if (mdPrev) { free(mdPrev); mdPrev = nullptr; }
    Serial.println(F("[CAM] released for provisioning — returns after Wi-Fi setup"));
  }
  Serial.printf("[CAM] free heap %u, largest block %u\n",
                (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getMaxAllocHeap());

  cv.set("hasCamera", true);          // how the apps discover a video source
  cv.set("ready", camReady);
  cv.set("psram", hasPsram);
  cv.set("motionActive", false);
  cv.set("motionCount", motionCount);
  cv.set("snapshots", snapCount);

  // LAN video is the route that does not depend on the broker or the relay.
  // Publishing the address is what lets the apps offer it: a client cannot
  // guess a DHCP lease, and without this the feature exists but is unreachable.
  camMux = xSemaphoreCreateMutex();
  if (!cv.isProvisioning() && camReady) {
    startLanVideo();
    cv.set("ip", WiFi.localIP().toString().c_str());
    cv.set("lanPort", CV_LAN_PORT);
  }
  publishSettings();
  cv.publishStateNow();

#if STATUS_LED_NUM >= 0
  digitalWrite(STATUS_LED_NUM, camReady ? LOW : HIGH);
#endif
}

void loop() {
  unsigned long now = millis();

  // While the setup portal is up, the radio, the web server and the DNS server
  // own this device. Touching the camera alongside them is what crashed the
  // board before a phone could connect, so nothing here runs until Wi-Fi is
  // configured. cv.loop() still services the portal itself.
  if (cv.isProvisioning()) { cv.loop(); return; }

  // Wi-Fi may only have arrived after setup (first-run provisioning reboots
  // into it), and a DHCP lease can move. A published address that no longer
  // belongs to this device sends viewers somewhere else on the network, so it
  // is re-checked rather than written once.
  static String lanIp;
  if (camReady && WiFi.status() == WL_CONNECTED) {
    startLanVideo();                      // no-op once running
    String ip = WiFi.localIP().toString();
    if (ip != lanIp) {
      lanIp = ip;
      cv.set("ip", ip.c_str());
      cv.set("lanPort", CV_LAN_PORT);
      cv.publishStateNow();
    }
  }

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

  // Remote viewing runs independently of the MQTT stream: someone away from
  // home has no LAN access and may not have armed the local stream at all.
  static bool cloudWas = false;
  bool cloudNow = cloudActive();
  if (cloudNow != cloudWas) {
    cloudWas = cloudNow;
    cv.set("cloud", cloudNow);
    cv.publishStateNow();
  }
  if (cloudNow && camReady && sensorLive) {
    unsigned long period = 1000UL / (unsigned long)max(cloudFps, 1);
    if (now - lastCloudAt >= period) {
      lastCloudAt = now;
      cloudPushFrame();
      now = millis();          // an upload takes real time; do not pace off a stale clock
    }
  }

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
    if (camLock(1000)) {
      camera_fb_t *fb = esp_camera_fb_get();
      noteCapture(fb != nullptr);
      if (fb) {
        bool moved = detectMotion(fb);
        esp_camera_fb_return(fb);
        camUnlock();
        if (moved) raiseMotion("image");
      } else {
        camUnlock();
      }
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
  cv.set("lanViewers", lanViewers);

  cv.loop();
}
