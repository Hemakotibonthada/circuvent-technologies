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
 *
 *   1.12.0 Record to the microSD card on the board itself.
 *
 * WHY THE CARD MATTERS MORE THAN IT LOOKS
 *
 * Every route this firmware had for getting a picture out needs something
 * else to be working: the broker, the relay, the site, or a viewer standing
 * on the same LAN. All three fail together the moment the house loses its
 * uplink — which is the exact minute footage is worth having. The card is the
 * only path with nothing else in it, so a break-in during an outage is
 * recorded rather than merely unwatched.
 *
 * Clips are written as indexed AVI/MJPEG. That is not a fashionable
 * container, but it is the only one this chip can write honestly: the sensor
 * already emits JPEG, so frames are stored exactly as captured with nothing
 * re-encoded and nothing interpolated over a dropped frame. An MP4 would mean
 * either transcoding the ESP32 cannot afford, or lying about the timebase.
 *
 *   1.13.0 Make live video run at the frame rate it always claimed to.
 *
 * WHY THIS WAS 3 fps
 *
 * A console reported "UXGA · 44 KB · 3 fps" over a relay that was working
 * perfectly. Nothing was broken; three separate decisions simply multiplied.
 *
 *   1. One resolution governed both stills and video, so choosing UXGA for a
 *      snapshot set 1600x1200 as the size of every *streamed* frame too. An
 *      OV2640 reads a UXGA frame out at around 5 fps on a good day.
 *   2. XCLK ran at 10 MHz, half the driver's standard, which roughly doubles
 *      the time that readout takes.
 *   3. fb_count was 1, so the driver could not expose the next frame until the
 *      current one had finished being pushed through TLS. Capture and transmit
 *      were serial when they only ever needed to overlap.
 *
 * Each was individually defensible and the combination was not: about 5 fps
 * halved to 2.5, then serialised with a 44 KB publish. The fix is one change
 * per cause — a streaming resolution ceiling, 20 MHz, and a second frame
 * buffer with CAMERA_GRAB_LATEST — and none of them is a network change,
 * because the network was never the problem.
 *
 *   1.14.0 Take the ceilings off, and spend the budget deliberately.
 *
 * 1.13.0 fixed the sensor and immediately exposed what was behind it. Three
 * more ceilings, none of them the camera's fault:
 *
 *   - FPS_MAX was 30, so 60 could not be asked for.
 *   - The control plane dropped every frame above 30 before it reached a
 *     socket, so a camera sending more was paying to be ignored.
 *   - Every 1 KB of a frame became its own TLS record. A 22 KB frame paid that
 *     toll twenty-two times, per frame, for nothing.
 *
 * And one honest limit that no ceiling was hiding: frame rate and picture size
 * are the same budget. 24 fps of 22 KB frames is 4.2 Mbit/s out of a chip that
 * is also encrypting all of it, and no amount of raising limits changes that.
 * So the camera now spends the budget itself — adaptTick measures what it
 * actually achieved and trims quality, then size, to hold the rate that was
 * asked for, handing both back when the link recovers. It also publishes what
 * it settled on, because a picture that has quietly traded sharpness for
 * smoothness must not look identical to one that is broken.
 *
 *   1.14.1 Stop the second frame buffer taking the camera with it.
 *
 * 1.13.0 set fb_count = 2 unconditionally, and that was a landmine rather than
 * a bug. Two buffers at VGA or SVGA are comfortable; two at UXGA cannot be
 * allocated, and the failure is silent in the worst way — esp_camera_init()
 * succeeds, the sensor answers on SCCB, sensorPid reads back, and then no frame
 * ever arrives. captureWorksWithin() correctly declares the camera dead.
 *
 * Nothing goes wrong when the resolution is *changed*, so it detonates on the
 * next reboot with a large picture stored, which may be weeks later and looks
 * exactly like failed hardware. Here it was an OTA that finally rebooted it,
 * and it took the camera out on a firmware that was otherwise fine — the
 * rollback to 1.13.0 stayed broken, which is what proved where it came from.
 *
 * Two fixes, because one of them is the bug and the other is the class:
 *   - fb_count is 2 only where the configured picture can afford it. Above
 *     SVGA the pipelining is given up rather than the camera, and that costs
 *     almost nothing, since live video is capped at STREAM_RES_MAX anyway and
 *     the only thing running larger is a still with nothing to overlap.
 *   - A failed first capture now walks the resolution down before giving up. A
 *     camera must not disable itself over a *setting*, in a house nobody can
 *     visit, when it could have lowered the number by itself.
 */
#define CV_FW_VERSION "1.14.3"

#include "esp_camera.h"
#include "esp_http_server.h"
#include "img_converters.h"
#include "esp_heap_caps.h"
#include <CircuventDevice.h>
#include <Preferences.h>
#include <FS.h>
#include <SD_MMC.h>
#include <time.h>

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
// microSD
// ---------------------------------------------------------------------------
/*
 * ONE DATA LINE, NOT FOUR — AND THIS IS NOT A PERFORMANCE COMPROMISE TO FIX
 * LATER.
 *
 * The AI-Thinker's slot is wired to the SDMMC peripheral: CLK 14, CMD 15,
 * D0 2, D1 4, D2 12, D3 13. GPIO 4 is also the white illuminator LED, and
 * GPIO 12 is the MTDI strapping pin that selects the flash voltage at reset.
 *
 * In 4-bit mode the card driver takes both. The visible symptom is the
 * illuminator glowing at full brightness whenever the card is touched — it is
 * being driven as a data line, so the LED tracks the bits, and applyFlash()
 * loses the pin entirely. The invisible one is worse: a card pulling GPIO 12
 * high at boot tells the chip its flash is 1.8 V, and a 3.3 V part then
 * returns garbage. That is a board which "randomly stops booting with a card
 * inserted", and nothing in the log names the card.
 *
 * 1-bit mode uses CLK, CMD and D0 only. It halves peak throughput to roughly
 * 1.5-2 MB/s, which is still five times what VGA MJPEG at 15 fps needs, and
 * it leaves 4, 12 and 13 alone. The bandwidth is not the constraint here; the
 * pins are.
 */
#define CV_SD_CLK   14
#define CV_SD_CMD   15
#define CV_SD_D0     2

#ifndef CV_SD_ENABLED
#define CV_SD_ENABLED 1
#endif

// ---------------------------------------------------------------------------
// Two-way audio
// ---------------------------------------------------------------------------
/*
 * OFF BY DEFAULT, AND NOT OUT OF CAUTION.
 *
 * The AI-Thinker ESP32-CAM has no microphone and no amplifier. Not a disabled
 * one, not one that needs a driver — the parts are absent from the board. Any
 * amount of firmware produces silence. Two-way audio needs an I2S MEMS mic
 * (INMP441 or SPH0645) and an I2S amplifier (MAX98357A) soldered on, and this
 * code is what runs once they are.
 *
 * THE PIN BUDGET, WHICH IS THE REAL CONSTRAINT
 *
 * The ESP32 has 34 GPIOs and this board has almost none left:
 *   camera   0, 5, 18, 19, 21, 22, 23, 25, 26, 27, 32, 34, 35, 36, 39
 *   microSD  2, 14, 15                (1-bit mode; 4, 12, 13 stay free)
 *   PSRAM    16, 17                   <- the trap
 *   flash    4
 *   status   33
 *   console  1, 3
 *
 * GPIO 16 is the one that catches people. Every ESP32-CAM pinout diagram
 * lists it as free, and it is — on modules without PSRAM. This board is a
 * WROVER, where 16 and 17 are the PSRAM chip select and clock. Wiring a mic to
 * 16 does not fail cleanly: PSRAM keeps half working, the camera DMAs frames
 * into memory that no longer holds them, and the board panics somewhere
 * unrelated minutes later.
 *
 * That leaves 12, 13, 33, and the console pair. Full duplex on one I2S
 * peripheral shares the bit clock and word select between input and output, so
 * four pins is enough where two separate peripherals would need six. There is
 * still no fourth pin that is free of charge:
 *
 *   BCLK  12   free (SD D2, unused in 1-bit mode)
 *   LRCLK 13   free (SD D3, unused in 1-bit mode)
 *   DOUT  33   costs the small red status LED
 *   DIN    3   costs the serial console's receive line
 *
 * DIN takes the console's RX rather than the illuminator, because the
 * illuminator is a feature a user can see and RX is only used for typing into
 * a board that is normally in a ceiling. Serial output still works; you simply
 * cannot type back. Set CV_I2S_DIN to 4 to trade the other way.
 *
 * GPIO 12 is MTDI, which selects the flash voltage at reset. It is assigned as
 * BCLK — an output this chip drives — precisely so nothing external holds it
 * high during boot. Wiring a mic's clock *input* here is safe; wiring anything
 * with a pull-up is not, and produces a board that boots only sometimes.
 *
 * If audio matters more than the compromises above, the honest answer is an
 * ESP32-S3 camera board, which has the pins.
 */
#ifndef CV_AUDIO
#define CV_AUDIO 0
#endif

#ifndef CV_I2S_BCLK
#define CV_I2S_BCLK  12
#endif
#ifndef CV_I2S_LRCLK
#define CV_I2S_LRCLK 13
#endif
#ifndef CV_I2S_DOUT
#define CV_I2S_DOUT  33
#endif
#ifndef CV_I2S_DIN
#define CV_I2S_DIN    3
#endif

/*
 * 8 kHz, 16-bit, mono.
 *
 * Speech is intelligible at 8 kHz — it is what every telephone call used for a
 * century — and it costs 16 kB/s. This device already sustains one 30 kB JPEG
 * a second over TLS, so that fits with headroom. 16 kHz would sound slightly
 * better and double a budget that is the actual limit here.
 *
 * PCM in a WAV wrapper, with no codec. An ADPCM or Opus stream would be
 * smaller, but every consumer of this — the browser, the phone, ffmpeg —
 * plays WAV with nothing added, and a codec that has to be shipped to three
 * clients to save 8 kB/s is a bad trade.
 */
#define CV_AUDIO_RATE      8000
#define CV_AUDIO_CHUNK_MS  1000   // upload cadence while someone is listening
#define CV_AUDIO_MAX_SPEAK 320000 // 20 s of playback; a bounded fetch, not a stream

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
#if CV_SD_ENABLED
#if CV_PIN_CLASH(CV_SD_CLK) || CV_PIN_CLASH(CV_SD_CMD) || CV_PIN_CLASH(CV_SD_D0)
#error "An SD pin shares a pin with the camera on this board. Set CV_SD_ENABLED=0."
#endif
// The whole reason for 1-bit mode is that GPIO 4 stays free for the
// illuminator. If someone later moves the LED onto a card line, that must
// fail here rather than at 2am in a dark hallway.
#if FLASH_GPIO_NUM == CV_SD_CLK || FLASH_GPIO_NUM == CV_SD_CMD || FLASH_GPIO_NUM == CV_SD_D0
#error "FLASH_GPIO_NUM is on an SD data line. The illuminator and the card cannot share it."
#endif
#endif

#if CV_AUDIO
#if CV_PIN_CLASH(CV_I2S_BCLK) || CV_PIN_CLASH(CV_I2S_LRCLK) || CV_PIN_CLASH(CV_I2S_DOUT) || CV_PIN_CLASH(CV_I2S_DIN)
#error "An I2S pin collides with the camera. See the pin budget note above."
#endif
#if CV_SD_ENABLED
#if CV_I2S_BCLK == CV_SD_CLK || CV_I2S_BCLK == CV_SD_CMD || CV_I2S_BCLK == CV_SD_D0 || \
    CV_I2S_LRCLK == CV_SD_CLK || CV_I2S_LRCLK == CV_SD_CMD || CV_I2S_LRCLK == CV_SD_D0 || \
    CV_I2S_DOUT == CV_SD_CLK || CV_I2S_DOUT == CV_SD_CMD || CV_I2S_DOUT == CV_SD_D0 || \
    CV_I2S_DIN == CV_SD_CLK || CV_I2S_DIN == CV_SD_CMD || CV_I2S_DIN == CV_SD_D0
#error "An I2S pin collides with the microSD card. Move it, or build with CV_SD_ENABLED=0."
#endif
#endif
/*
 * The PSRAM trap, caught at build time.
 *
 * On a WROVER module — which is what an ESP32-CAM with PSRAM is — GPIO 16 and
 * 17 are the PSRAM chip select and clock. Pinout diagrams list them as free
 * because they are, on the modules without it. Taking one here does not fail
 * cleanly: PSRAM half-works, the camera writes frames into memory that no
 * longer holds them, and the board panics somewhere else entirely.
 */
#ifdef BOARD_HAS_PSRAM
#if CV_I2S_BCLK == 16 || CV_I2S_BCLK == 17 || CV_I2S_LRCLK == 16 || CV_I2S_LRCLK == 17 || \
    CV_I2S_DOUT == 16 || CV_I2S_DOUT == 17 || CV_I2S_DIN == 16 || CV_I2S_DIN == 17
#error "GPIO 16/17 are the PSRAM chip select and clock on this module. They are not free."
#endif
#endif
#if CV_I2S_DIN < 0 || CV_I2S_DOUT < 0
#error "Both an input and an output pin are required for two-way audio."
#endif
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
/*
 * 60 is reachable at small frame sizes, where a frame is a few kilobytes and
 * the sensor is nowhere near its own limit. It is not reachable at SVGA over
 * MQTT+TLS, and it never will be — that path is throughput-bound, and the
 * arithmetic is unforgiving: 24 fps of 22 KB frames is already 4.2 Mbit/s out
 * of an ESP32 that is also encrypting all of it.
 *
 * The ceiling is therefore the *small-frame* ceiling, and the sender simply
 * falls behind its target rather than misbehaving. What closes the gap is
 * CV_ADAPTIVE below, which trades picture size for frame rate on purpose
 * instead of leaving the user to discover the trade by moving two sliders.
 */
#define FPS_MAX                60
#define FPS_DEFAULT            24

/*
 * The live stream and the still image are two different products of one sensor,
 * and conflating them is what held this camera at 3 fps.
 *
 * `resolution` is the picture the user chose, and at UXGA it is 1600x1200 —
 * 6.25x the pixels of VGA, roughly 44 KB a frame. An OV2640 cannot read a UXGA
 * frame out, JPEG it, and have an ESP32 push it through TLS twenty-four times a
 * second; the sensor alone tops out near 5 fps there. Left as one setting, the
 * resolution someone picked for a *snapshot* silently became the ceiling on
 * their *video*, and the console dutifully reported the 3 fps that produced.
 *
 * So the stream gets its own ceiling, exactly like the main-stream/sub-stream
 * split every IP camera ships. Snapshots and recordings still use the full
 * chosen resolution — nothing is taken away — but while somebody is watching
 * live, the sensor runs at a size that can actually sustain the frame rate.
 *
 * SVGA (800x600) is the highest that holds 24 fps with the pipelining below.
 * Raising this is not free: it costs frame rate first and stability second.
 */
#define STREAM_RES_MAX      "SVGA"

/*
 * Adaptive streaming.
 *
 * Frame rate and picture size are the same budget spent two ways, and until now
 * the user was left to discover that by moving two sliders and guessing. Ask for
 * 30 fps at SVGA and the camera simply fell short, reported the shortfall, and
 * offered no hint that quality was the thing standing in the way.
 *
 * So the firmware now spends the budget itself: it measures what it actually
 * achieved and, if it is short of what was asked, trims JPEG quality — and only
 * when quality is exhausted, steps the picture down a size. When it is
 * comfortably ahead it walks both back up toward what the user chose.
 *
 * The thresholds are deliberately asymmetric. Stepping down happens quickly
 * (below 80% of target) because a stuttering picture is the complaint; stepping
 * back up needs sustained headroom (above 95%) so a momentary lull does not
 * start an oscillation the viewer sees as pulsing sharpness.
 */
#define ADAPT_WINDOW_MS     2000UL   // how long a measurement window is
#define ADAPT_DOWN_RATIO      0.80f  // below this share of target, give something up
#define ADAPT_UP_RATIO        0.95f  // above this, try to give something back
#define ADAPT_Q_STEP             4   // JPEG quality moves in steps this size
#define ADAPT_Q_LIMIT           28   // worst quality adaptation may choose
#define ADAPT_RES_FLOOR    "QVGA"    // smallest picture adaptation may choose

/*
 * Sensor master clock.
 *
 * This ran at 10 MHz, half the 20 MHz the driver examples use, and that was a
 * deliberate trade: the sensor, the parallel data bus and the DMA writes behind
 * them all scale with this clock, and on AI-Thinker-class boards — especially
 * HW-297 / ESP-32S clones with a small on-board regulator — 20 MHz is what
 * pushes a marginal supply over the edge once Wi-Fi is also transmitting. It
 * also makes SCCB writes more reliable, since the sensor clocks its register
 * logic from XCLK.
 *
 * What that trade cost was never written down in frames per second, so it is
 * worth stating plainly: at 10 MHz the sensor needs about twice as long to read
 * a frame out, which puts a ceiling under the frame rate that no amount of
 * network tuning can lift. Nobody tuning the relay would ever have found it.
 *
 * The default is therefore the standard 20 MHz, and the old value is one build
 * flag away. If a particular unit browns out, resets under load, or fills the
 * log with SCCB failures, build that board with -DCV_CAM_XCLK_HZ=10000000
 * rather than lowering the clock for the whole fleet.
 */
#ifndef CV_CAM_XCLK_HZ
#define CV_CAM_XCLK_HZ   20000000
#endif
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

// ---- microSD recording ----
#define REC_DIR             "/clips"
#define REC_FPS_DEFAULT         10
#define REC_SEG_SECS_DEFAULT   300   // 5 minutes a clip
#define REC_SEG_SECS_MIN        10
#define REC_SEG_SECS_MAX      3600
/*
 * A clip is also capped by frame count, because the AVI index lives in RAM
 * until the clip closes and 16 bytes an entry is the one cost that grows
 * without bound. 9000 frames is 15 minutes at 10 fps and 144 kB of index,
 * which PSRAM carries comfortably; boards without it get the smaller cap
 * below and simply roll over to a new clip sooner.
 */
#define REC_MAX_FRAMES_PSRAM  9000
#define REC_MAX_FRAMES_HEAP    900
/* Keep this much of the card free. Filling a FAT volume completely makes it
 * slow to write and awkward to recover, and the oldest clip is always the one
 * worth least. */
#define REC_KEEP_FREE_MB        64
#define REC_MOTION_TAIL_MS   15000UL  // keep recording this long after motion stops
#define REC_MAX_CLIPS          512    // directory entries we are willing to walk

CircuventDevice cv("camera");
Preferences store;

// ---- runtime state ----
bool  camReady     = false;
bool  hasPsram     = false;
bool  streaming    = false;
int   fps          = FPS_DEFAULT;

/*
 * What adaptation has currently settled on. Both start at "follow the user",
 * and only move while a stream is running.
 *
 * These are deliberately NOT persisted. They describe the network the camera
 * happened to have while somebody was watching, which is the least durable fact
 * about it — restoring last week's congestion onto a good link would be a
 * camera that never recovers its picture quality.
 */
bool  adaptive     = true;
int   adaptQ       = 0;          // 0 = follow `quality`
String adaptRes    = "";         // "" = follow the streaming ceiling
float lastAchieved = 0;          // measured fps, published for the UI
unsigned long adaptWindowAt = 0;
uint32_t adaptFrames = 0;
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

/*
 * A grab target, declared up here rather than beside the code that uses it.
 *
 * The .ino build injects generated prototypes just above the first function in
 * the file, so any type named in a signature must already exist at that point.
 * Declaring FrameBuf next to grabInto() compiles cleanly by eye and then fails
 * with "'FrameBuf' was not declared in this scope" pointing at an unrelated
 * line four hundred lines earlier, because the prototype the build wrote is
 * the thing that cannot see it.
 *
 * There are three consumers that each need a frame to survive past
 * esp_camera_fb_return() — the LAN viewer, the cloud pusher and the SD
 * recorder — and they run at different rates. One shared buffer would mean a
 * recorder writing to the card while a viewer overwrites the bytes underneath
 * it, which corrupts the clip and is invisible until someone tries to play it
 * back. Each consumer owns its own, grown once and reused, so there is still
 * no per-frame malloc.
 */
struct FrameBuf {
  uint8_t *p   = nullptr;
  size_t   cap = 0;
};

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
static volatile int      lanViewers = 0;

static FrameBuf lanBuf;    // LAN viewers and the cloud pusher (both on paced paths)
static FrameBuf recBuf;    // SD recorder

static bool camLock(uint32_t ms) {
  return camMux && xSemaphoreTake(camMux, pdMS_TO_TICKS(ms)) == pdTRUE;
}
static void camUnlock() {
  if (camMux) xSemaphoreGive(camMux);
}

/** Copies a frame out so the driver buffer can be returned before network I/O. */
static bool copyFrameInto(FrameBuf &dst, const camera_fb_t *fb) {
  if (fb->len > dst.cap) {
    uint8_t *grown = (uint8_t *)heap_caps_realloc(
        dst.p, fb->len, hasPsram ? MALLOC_CAP_SPIRAM : MALLOC_CAP_8BIT);
    if (!grown) return false;
    dst.p = grown;
    dst.cap = fb->len;
  }
  memcpy(dst.p, fb->buf, fb->len);
  return true;
}

/**
 * Grabs one frame into `dst`. Returns 0 on failure.
 *
 * The driver buffer is handed back before the caller writes to a socket or to
 * the card. A viewer on a slow link would otherwise hold a frame buffer for
 * the length of its transfer, and with two buffers that stalls the next
 * capture — the same reason sendFrame() returns early.
 */
static size_t grabInto(FrameBuf &dst, int *w = nullptr, int *h = nullptr) {
  if (!camReady || !sensorLive) return 0;
  if (!camLock(3000)) return 0;
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) { camUnlock(); return 0; }
  size_t len = fb->format == PIXFORMAT_JPEG && copyFrameInto(dst, fb) ? fb->len : 0;
  if (len) { if (w) *w = fb->width; if (h) *h = fb->height; }
  esp_camera_fb_return(fb);
  camUnlock();
  return len;
}

static size_t lanGrab() { return grabInto(lanBuf); }

// ---------------------------------------------------------------------------
// microSD card
// ---------------------------------------------------------------------------
/*
 * Everything here is written so that a camera with no card, a card that was
 * pulled while recording, or a card that is full behaves like a camera
 * without recording — never like a camera that has stopped working. A storage
 * fault must not cost the device its stream, its motion detection or its OTA
 * path, so every entry point checks `sdReady` and every write failure closes
 * the clip and drops back to not recording rather than retrying into a wall.
 */
bool     sdReady   = false;
uint64_t sdTotalB  = 0;
String   sdFault;                 // why the card is unavailable, in plain words

/**
 * Is this one of our clips?
 *
 * Case-insensitive, because the 8.3 fallback in aviOpen() writes uppercase
 * names. Matching only ".avi" meant a card that had ever rejected a long
 * filename produced clips that recorded correctly, sat on the card, and were
 * then invisible to the listing, undeletable, undownloadable and never
 * reclaimed when the card filled — a storage leak that looks like footage
 * silently going missing.
 */
static bool isClipName(const String &n) {
  if (n.length() < 5) return false;
  String ext = n.substring(n.length() - 4);
  ext.toLowerCase();
  return ext == ".avi";
}

static uint64_t sdFreeB() {
  if (!sdReady) return 0;
  uint64_t total = SD_MMC.totalBytes(), used = SD_MMC.usedBytes();
  return total > used ? total - used : 0;
}

static bool sdMount() {
#if !CV_SD_ENABLED
  sdFault = "disabled in this build";
  return false;
#else
  if (sdReady) return true;
  /*
   * No setPins() call. On the classic ESP32 the SDMMC host is bonded to those
   * pads through IOMUX and cannot be routed anywhere by the GPIO matrix, so
   * the constants above are a contract with the hardware rather than a
   * configuration — they exist to be checked against the camera and flash
   * assignments at build time, which is the only way this can actually go
   * wrong. Calling setPins here would compile only on newer cores and fail at
   * runtime on this chip regardless.
   */
  // true  = 1-bit mode (see the pin note above — this argument is the whole
  //         reason the illuminator still works)
  // false = do not format a card we failed to read. A camera that silently
  //         erased the last month of footage because a card was briefly
  //         unreadable would be worse than one that records nothing.
  if (!SD_MMC.begin("/sdcard", true, false)) {
    sdFault = "no card, or the card could not be read";
    return false;
  }
  uint8_t type = SD_MMC.cardType();
  if (type == CARD_NONE) {
    SD_MMC.end();
    sdFault = "no card in the slot";
    return false;
  }
  sdTotalB = SD_MMC.totalBytes();
  if (!SD_MMC.exists(REC_DIR) && !SD_MMC.mkdir(REC_DIR)) {
    SD_MMC.end();
    sdFault = "card is not writable";
    return false;
  }
  sdReady = true;
  sdFault = "";
  Serial.printf("[SD] mounted, %llu MB total, %llu MB free\n",
                sdTotalB / (1024ULL * 1024ULL), sdFreeB() / (1024ULL * 1024ULL));
#if FLASH_GPIO_NUM >= 0
  /*
   * Re-attach the illuminator.
   *
   * 1-bit mode leaves GPIO 4 out of the slot configuration, but the SDMMC
   * host driver still runs its pad setup over the peripheral's full pin set
   * on some IDF versions, and that detaches the LEDC output without reporting
   * anything. The symptom is a flash control that answers every command and
   * changes nothing. Re-binding costs two register writes and removes the
   * question entirely.
   */
  ledcAttachPin(FLASH_GPIO_NUM, FLASH_LEDC_CH);
#endif
  return true;
#endif
}

/** Marks the card gone. Called when a write fails — a pulled card is common. */
static void sdLost(const char *why) {
  if (!sdReady) return;
  sdReady = false;
  sdFault = why;
  SD_MMC.end();
  Serial.printf("[SD] card lost: %s\n", why);
}

// ---------------------------------------------------------------------------
// AVI/MJPEG writer
// ---------------------------------------------------------------------------
/*
 * WHY AVI, WRITTEN BY HAND
 *
 * The sensor hands us a finished JPEG. AVI is the one container that can hold
 * those bytes unchanged, is understood by VLC, ffmpeg, QuickTime and every
 * NVR, and can be written by a microcontroller in a single forward pass with
 * seven fields patched at the end. MP4 would need either a full re-encode this
 * chip cannot afford, or a fabricated constant timebase — and the timebase is
 * exactly the thing that is not constant when a camera drops a frame.
 *
 * The index is the part people leave out, and leaving it out is why so much
 * ESP32 footage "plays but will not seek and reports no duration". Players
 * fall back to scanning the movi list, get no frame count, and show a
 * zero-length clip that only plays forward. idx1 is 16 bytes a frame and it
 * is what makes the file a real recording rather than a pile of JPEGs with a
 * header on it.
 *
 * Layout, all little-endian:
 *    0  RIFF <fileSize-8> AVI
 *   12  LIST <192> hdrl
 *   24    avih <56> MainAVIHeader
 *   88    LIST <116> strl
 *  100      strh <56> AVIStreamHeader
 *  164      strf <40> BITMAPINFOHEADER
 *  212  LIST <moviSize> movi
 *  224    00dc <len> <jpeg> [pad to even] ...
 *   ..  idx1 <16*frames> entries
 */
#define AVI_HDR_BYTES   224
#define AVI_OFF_RIFFSZ    4
#define AVI_OFF_USPF     32     // avih.dwMicroSecPerFrame
#define AVI_OFF_MAXBPS   36     // avih.dwMaxBytesPerSec
#define AVI_OFF_TOTFRM   48     // avih.dwTotalFrames
#define AVI_OFF_SUGBUF   60     // avih.dwSuggestedBufferSize
#define AVI_OFF_RATE    132     // strh.dwRate
#define AVI_OFF_LENGTH  140     // strh.dwLength
#define AVI_OFF_STRBUF  144     // strh.dwSuggestedBufferSize
#define AVI_OFF_MOVISZ  216     // movi LIST size
#define AVI_MOVI_FOURCC 220     // idx1 offsets are relative to this

File     recF;
bool     recording   = false;
bool     recEnabled  = false;    // the user's intent, which survives a lost card
bool     recMotion   = false;    // record only while motion is present
int      recFps      = REC_FPS_DEFAULT;
uint32_t recSegSecs  = REC_SEG_SECS_DEFAULT;
String   recName;
uint32_t recFrames   = 0;
uint32_t recBytes    = 0;        // movi payload only
uint32_t recMaxJpeg  = 0;
unsigned long recStartMs = 0, lastRecFrameAt = 0, recMotionSeenAt = 0;
long     recClips    = 0;
uint32_t *recIdx     = nullptr;  // {offset, size} pairs
uint32_t  recIdxCap  = 0;

static inline void put32(uint8_t *p, uint32_t v) {
  p[0] = v; p[1] = v >> 8; p[2] = v >> 16; p[3] = v >> 24;
}
static inline void put16(uint8_t *p, uint16_t v) { p[0] = v; p[1] = v >> 8; }
static inline void putTag(uint8_t *p, const char *t) { memcpy(p, t, 4); }

/** Rewrites one dword in a header already on the card. */
static bool patch32(uint32_t off, uint32_t v) {
  uint8_t b[4];
  put32(b, v);
  return recF.seek(off) && recF.write(b, 4) == 4;
}

static void aviHeader(uint8_t *h, int w, int h_px, int fpsOut) {
  memset(h, 0, AVI_HDR_BYTES);
  putTag(h + 0, "RIFF");  put32(h + 4, 0);            // patched at close
  putTag(h + 8, "AVI ");
  putTag(h + 12, "LIST"); put32(h + 16, 192);
  putTag(h + 20, "hdrl");
  putTag(h + 24, "avih"); put32(h + 28, 56);
  put32(h + 32, 1000000UL / (uint32_t)max(fpsOut, 1));  // dwMicroSecPerFrame
  put32(h + 36, 0);                                     // dwMaxBytesPerSec
  put32(h + 40, 0);                                     // dwPaddingGranularity
  put32(h + 44, 0x10);                                  // AVIF_HASINDEX
  put32(h + 48, 0);                                     // dwTotalFrames
  put32(h + 52, 0);                                     // dwInitialFrames
  put32(h + 56, 1);                                     // dwStreams
  put32(h + 60, 0);                                     // dwSuggestedBufferSize
  put32(h + 64, (uint32_t)w);
  put32(h + 68, (uint32_t)h_px);
  putTag(h + 88, "LIST"); put32(h + 92, 116);
  putTag(h + 96, "strl");
  putTag(h + 100, "strh"); put32(h + 104, 56);
  putTag(h + 108, "vids");
  putTag(h + 112, "MJPG");
  put32(h + 128, 1);                                    // dwScale
  put32(h + 132, (uint32_t)max(fpsOut, 1));             // dwRate
  put32(h + 140, 0);                                    // dwLength
  put32(h + 148, 0xFFFFFFFFUL);                         // dwQuality: "not set"
  // rcFrame occupies the last 8 bytes of strh: left, top, right, bottom.
  // left/top stay zero from the memset.
  put16(h + 160, (uint16_t)w);                          // rcFrame.right
  put16(h + 162, (uint16_t)h_px);                       // rcFrame.bottom
  putTag(h + 164, "strf"); put32(h + 168, 40);
  put32(h + 172, 40);                                   // biSize
  put32(h + 176, (uint32_t)w);
  put32(h + 180, (uint32_t)h_px);
  put16(h + 184, 1);                                    // biPlanes
  put16(h + 186, 24);                                   // biBitCount
  putTag(h + 188, "MJPG");                              // biCompression
  put32(h + 192, (uint32_t)(w * h_px * 3));             // biSizeImage
  putTag(h + 212, "LIST"); put32(h + 216, 4);           // patched at close
  putTag(h + AVI_MOVI_FOURCC, "movi");
}

/**
 * Deletes the oldest clips until `need` bytes are free.
 *
 * Oldest by name, and the names are zero-padded and time-ordered for exactly
 * this reason: f.getLastWrite() returns 0 on a card written before NTP
 * resolved, so sorting by mtime would pick a victim at random on precisely
 * the boots where it matters. The name is written by us and is always
 * ordered, so it is the honest key.
 */
static bool sdMakeRoom(uint64_t need) {
  if (!sdReady) return false;
  for (int pass = 0; pass < REC_MAX_CLIPS; pass++) {
    if (sdFreeB() >= need) return true;
    File dir = SD_MMC.open(REC_DIR);
    if (!dir) return false;
    String oldest;
    for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
      String n = f.name();
      int slash = n.lastIndexOf('/');
      if (slash >= 0) n = n.substring(slash + 1);
      f.close();
      if (!isClipName(n)) continue;
      if (recording && n == recName) continue;     // never eat the live clip
      if (!oldest.length() || n < oldest) oldest = n;
    }
    dir.close();
    if (!oldest.length()) return false;            // nothing left to reclaim
    String path = String(REC_DIR) + "/" + oldest;
    Serial.printf("[SD] reclaiming %s\n", path.c_str());
    if (!SD_MMC.remove(path)) return false;
  }
  return sdFreeB() >= need;
}

/**
 * A name that sorts chronologically whether or not the clock is set.
 *
 * sdMakeRoom() reclaims the lexicographically smallest name, so this ordering
 * is the retention policy. Timestamped clips sort first and are therefore
 * deleted oldest-first, which is what "oldest footage goes first" should mean.
 * Unstamped ones begin with 'u', which sorts after every digit, so a clip
 * recorded before NTP resolved outlives the dated ones around it. That is
 * deliberate: its position in time is the one thing nobody can reconstruct
 * later, so it is the clip most worth keeping and the least safe to guess at.
 */
static String clipName() {
  time_t now = time(nullptr);
  char buf[40];
  if (now > 1700000000) {
    struct tm t;
    gmtime_r(&now, &t);
    snprintf(buf, sizeof(buf), "%04d%02d%02d-%02d%02d%02d.avi",
             t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec);
  } else {
    // No NTP yet. "up" keeps these together, and it sorts after every digit so
    // sdMakeRoom() reclaims dated clips before these — see the note above.
    snprintf(buf, sizeof(buf), "up%08lu.avi", (unsigned long)(millis() / 1000));
  }
  return String(buf);
}

static void recPublishState();

/** Opens a new clip. Returns false and leaves recording off on any failure. */
static bool aviOpen(int w, int h_px) {
  if (!sdReady || recording) return false;

  uint32_t cap = hasPsram ? REC_MAX_FRAMES_PSRAM : REC_MAX_FRAMES_HEAP;
  if (!recIdx || recIdxCap != cap) {
    if (recIdx) heap_caps_free(recIdx);
    recIdx = (uint32_t *)heap_caps_malloc(
        (size_t)cap * 2 * sizeof(uint32_t), hasPsram ? MALLOC_CAP_SPIRAM : MALLOC_CAP_8BIT);
    if (!recIdx) {
      // Fall back rather than refuse: a shorter clip that seeks is worth more
      // than no clip at all.
      cap = REC_MAX_FRAMES_HEAP;
      recIdx = (uint32_t *)heap_caps_malloc((size_t)cap * 2 * sizeof(uint32_t), MALLOC_CAP_8BIT);
      if (!recIdx) { recIdxCap = 0; Serial.println(F("[REC] no memory for the clip index")); return false; }
    }
    recIdxCap = cap;
  }

  // Room for a whole segment plus the reserve, worked out from what frames
  // actually cost rather than a guess: recMaxJpeg carries over between clips.
  uint32_t perFrame = recMaxJpeg ? recMaxJpeg : 60000;
  uint64_t want = (uint64_t)perFrame * (uint64_t)recFps * (uint64_t)min(recSegSecs, (uint32_t)60)
                + (uint64_t)REC_KEEP_FREE_MB * 1024ULL * 1024ULL;
  if (!sdMakeRoom(want)) {
    Serial.println(F("[REC] card is full and nothing could be reclaimed"));
    return false;
  }

  String name = clipName();
  String path = String(REC_DIR) + "/" + name;
  recF = SD_MMC.open(path, FILE_WRITE);
  if (!recF) {
    /*
     * Long filenames are configured in every Arduino-ESP32 core this builds
     * against, but a card formatted by a tool that disabled them, or a core
     * built without CONFIG_FATFS_LFN, rejects a 19-character name with the
     * same null this returns for a dead card. Retrying in 8.3 tells the two
     * apart, and a camera that records under an ugly name is better than one
     * that reports a storage failure it does not have.
     */
    char shortName[13];
    snprintf(shortName, sizeof(shortName), "R%07lu.AVI", (unsigned long)(millis() / 1000) % 10000000UL);
    name = shortName;
    path = String(REC_DIR) + "/" + name;
    recF = SD_MMC.open(path, FILE_WRITE);
    if (!recF) { sdLost("could not create a clip"); return false; }
    Serial.println(F("[REC] card rejected a long filename — using 8.3"));
  }

  uint8_t hdr[AVI_HDR_BYTES];
  aviHeader(hdr, w, h_px, recFps);
  if (recF.write(hdr, AVI_HDR_BYTES) != AVI_HDR_BYTES) {
    recF.close();
    SD_MMC.remove(path);
    sdLost("could not write a clip header");
    return false;
  }

  recording  = true;
  recName    = name;
  recFrames  = 0;
  recBytes   = 0;
  recStartMs = millis();
  Serial.printf("[REC] recording %s (%dx%d @ %d fps)\n", name.c_str(), w, h_px, recFps);
  return true;
}

/** Finishes the clip: writes idx1, patches the seven size fields, closes. */
static void aviClose(const char *why) {
  if (!recording) return;
  recording = false;

  bool ok = recF;
  uint32_t frames = recFrames;
  uint32_t secs = (millis() - recStartMs) / 1000;

  if (ok && frames && recIdx) {
    uint8_t e[16];
    putTag(e + 0, "00dc");
    put32(e + 4, 0x10);                     // AVIIF_KEYFRAME — every MJPEG frame is
    ok = recF.seek(recF.size());
    if (ok) {
      uint8_t idxHdr[8];
      putTag(idxHdr + 0, "idx1");
      put32(idxHdr + 4, frames * 16);
      ok = recF.write(idxHdr, 8) == 8;
    }
    for (uint32_t i = 0; ok && i < frames; i++) {
      put32(e + 8, recIdx[i * 2]);
      put32(e + 12, recIdx[i * 2 + 1]);
      ok = recF.write(e, 16) == 16;
    }
  }

  if (ok) {
    uint32_t total = recF.size();
    uint32_t moviSz = 4 + recBytes;
    // Real elapsed time, not the requested rate. A card that made us miss
    // frames produces a clip that is genuinely slower, and writing the
    // nominal fps here would play it back too fast and quietly misrepresent
    // when things happened — which is the one thing footage is for.
    uint32_t realFps = (uint32_t)(recFps > 0 ? recFps : 1);
    if (secs > 0) {
      uint32_t measured = (frames + secs / 2) / secs;
      realFps = measured ? measured : 1;
    }
    ok = patch32(AVI_OFF_RIFFSZ, total - 8)
      && patch32(AVI_OFF_USPF, 1000000UL / realFps)
      && patch32(AVI_OFF_MAXBPS, secs ? recBytes / secs : recBytes)
      && patch32(AVI_OFF_TOTFRM, frames)
      && patch32(AVI_OFF_SUGBUF, recMaxJpeg)
      && patch32(AVI_OFF_RATE, realFps)
      && patch32(AVI_OFF_LENGTH, frames)
      && patch32(AVI_OFF_STRBUF, recMaxJpeg)
      && patch32(AVI_OFF_MOVISZ, moviSz);
  }
  if (recF) { recF.flush(); recF.close(); }

  if (!ok) {
    sdLost("the clip could not be finalised");
    Serial.printf("[REC] %s left incomplete\n", recName.c_str());
  } else {
    recClips++;
    Serial.printf("[REC] closed %s — %lu frames in %lus (%s)\n",
                  recName.c_str(), (unsigned long)frames, (unsigned long)secs, why);
    JsonDocument d;
    d["type"]   = "clip";
    d["name"]   = recName;
    d["frames"] = (long)frames;
    d["secs"]   = (long)secs;
    d["bytes"]  = (long)recBytes;
    d["reason"] = why;
    cv.publishTelemetry(d.as<JsonObjectConst>());
  }
  recName = "";
  recFrames = 0;
}

/** Appends one JPEG. Closes the clip rather than half-writing it on failure. */
static bool aviAddFrame(const uint8_t *jpeg, size_t len) {
  if (!recording || !recF || !len) return false;

  uint32_t off = recF.position();
  uint8_t ck[8];
  putTag(ck + 0, "00dc");
  put32(ck + 4, (uint32_t)len);
  if (recF.write(ck, 8) != 8 || recF.write(jpeg, len) != len) {
    aviClose("write failed");
    sdLost("the card stopped accepting data");
    return false;
  }
  // RIFF chunks are word-aligned. Without this pad an odd-length JPEG shifts
  // every following chunk by one byte and the file stops parsing at frame two.
  if (len & 1) {
    uint8_t z = 0;
    if (recF.write(&z, 1) != 1) { aviClose("write failed"); sdLost("the card stopped accepting data"); return false; }
  }

  recIdx[recFrames * 2]     = off - AVI_MOVI_FOURCC;
  recIdx[recFrames * 2 + 1] = (uint32_t)len;
  recFrames++;
  recBytes += 8 + len + (len & 1);
  if (len > recMaxJpeg) recMaxJpeg = (uint32_t)len;

  // Flush periodically so a power cut costs seconds, not the whole clip. The
  // header is still unpatched at that point, but ffmpeg and VLC both recover a
  // movi list without an index; nothing is recoverable if it is still in a
  // cache when the lights go out.
  if ((recFrames % 32) == 0) recF.flush();
  return true;
}

/** Deletes every clip. Used by the "clear card" command. */
static int recDeleteAll() {
  if (!sdReady) return 0;
  if (recording) aviClose("card cleared");
  File dir = SD_MMC.open(REC_DIR);
  if (!dir) return 0;
  int removed = 0;
  for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
    String n = f.name();
    int slash = n.lastIndexOf('/');
    if (slash >= 0) n = n.substring(slash + 1);
    f.close();
    if (isClipName(n) && SD_MMC.remove(String(REC_DIR) + "/" + n)) removed++;
  }
  dir.close();
  return removed;
}

static void recPublishState() {
  cv.set("sd", sdReady);
  cv.set("sdTotalMb", (long)(sdTotalB / (1024ULL * 1024ULL)));
  cv.set("sdFreeMb", (long)(sdFreeB() / (1024ULL * 1024ULL)));
  cv.set("sdFault", sdFault.c_str());
  cv.set("recording", recording);
  cv.set("recEnabled", recEnabled);
  cv.set("recMotion", recMotion);
  cv.set("recFps", recFps);
  cv.set("recSegment", (int)recSegSecs);
  cv.set("recFile", recName.c_str());
  cv.set("recFrames", (long)recFrames);
  cv.set("recSecs", (long)(recording ? (millis() - recStartMs) / 1000 : 0));
  cv.set("recClips", recClips);
}

/**
 * One recording tick, called from loop().
 *
 * Capture happens here rather than piggybacking on sendFrame() so that
 * recording keeps its own cadence: the stream is armed by a viewer and stops
 * twenty seconds after they leave, and footage that only exists while someone
 * is watching is not a recording. The card write happens outside the capture
 * mutex, so a slow card delays this clip and nothing else.
 */
static void recTick() {
  unsigned long now = millis();

  bool want = recEnabled && camReady && sensorLive && !cv.isProvisioning();
  if (want && recMotion) {
    if (motionActive) recMotionSeenAt = now;
    want = recMotionSeenAt && (now - recMotionSeenAt <= REC_MOTION_TAIL_MS);
  }

  if (!want) {
    if (recording) aviClose(recEnabled ? "motion ended" : "stopped");
    return;
  }
  if (!sdReady) {
    // Re-mounting is how a card pushed in after boot starts working, and how
    // one that was pulled and returned recovers. Paced, because a mount
    // attempt against an empty slot is not free.
    static unsigned long lastTry = 0;
    if (now - lastTry < 10000UL) return;
    lastTry = now;
    if (!sdMount()) return;
    recPublishState();
    cv.publishStateNow();
  }

  unsigned long period = 1000UL / (unsigned long)max(recFps, 1);
  if (now - lastRecFrameAt < period) return;
  lastRecFrameAt = now;

  int w = 0, h = 0;
  size_t len = grabInto(recBuf, &w, &h);
  if (!len) return;

  if (recording &&
      ((millis() - recStartMs) / 1000 >= recSegSecs || recFrames >= recIdxCap)) {
    aviClose("segment complete");
  }
  if (!recording && !aviOpen(w, h)) {
    // Opening failed for a reason aviOpen has already reported. Back off by
    // pretending this tick used its slot, so a full card does not spin.
    lastRecFrameAt = now + 2000;
    return;
  }
  aviAddFrame(recBuf.p, len);
}

/** Starts or stops recording, and says what actually happened. */
static String recSet(bool on) {
  recEnabled = on;
  store.putBool("recon", on);
  if (!on) {
    if (recording) aviClose("stopped");
    recMotionSeenAt = 0;
    return "stopped";
  }
  if (!sdReady && !sdMount()) {
    // The intent is kept even though the attempt failed: recTick() retries the
    // mount every ten seconds, so pushing a card in later just starts it.
    return sdFault.length() ? sdFault : "no card — will start when one is inserted";
  }
  recMotionSeenAt = recMotion ? 0 : millis();
  return recMotion ? "armed for motion" : "recording";
}

// ---------------------------------------------------------------------------
// Two-way audio
// ---------------------------------------------------------------------------
/*
 * Listening and talking, both push-to-talk shaped rather than a phone call.
 *
 * WHY NOT A REAL FULL-DUPLEX CALL
 *
 * A continuous voice link needs a bidirectional low-latency socket. This
 * device has no public address, the broker relay is the thing that has been
 * unreliable all along, and an ESP32 running TLS has neither the throughput
 * nor the jitter budget for conversational audio. Building it that way would
 * produce something that demos on a bench and fails in a house.
 *
 * So each direction is a separate, bounded transfer over the path already
 * proven to work here:
 *
 *   Listening — while a viewer has armed it, the device POSTs one second of
 *   WAV at a time to the site, exactly like cloudPushFrame does with JPEGs.
 *   The arming expires on its own, so a closed tab cannot leave a microphone
 *   uploading a household's conversations indefinitely. That is a privacy
 *   property, not a bandwidth one.
 *
 *   Talking — the app uploads a clip to the site, the site issues a `speak`
 *   command carrying a URL and a one-shot token, and the device fetches and
 *   plays it. The device pulls, because nothing on the internet can reach into
 *   a home network to push, and a camera that accepted unsolicited audio from
 *   anywhere would be a speaker in someone's home that strangers can use.
 *
 * Both are capability-gated: a board with no parts fitted reports hasMic and
 * hasSpeaker false and the apps hide the controls, rather than offering a
 * button that produces silence and no explanation.
 */
#if CV_AUDIO
#include <driver/i2s.h>

#define CV_I2S_PORT I2S_NUM_0
/* One second of 16-bit mono at the working rate. */
#define AUDIO_CHUNK_SAMPLES ((CV_AUDIO_RATE * CV_AUDIO_CHUNK_MS) / 1000)
#define AUDIO_CHUNK_BYTES   (AUDIO_CHUNK_SAMPLES * 2)
#define WAV_HEADER_BYTES    44
#endif

bool     audioReady = false;
bool     micOn      = false;          // armed by a listener, expires on its own
String   audioUrl, audioToken;
unsigned long audioArmedAt = 0, audioTtlMs = CLOUD_TTL_MS, lastAudioAt = 0;
long     audioSent = 0, audioFail = 0, spokeCount = 0;
int      speakerVolume = 80;          // 0..100, applied in software
String   audioFault;

/** Fills a 44-byte canonical WAV header for `bytes` of 16-bit mono PCM. */
static void wavHeader(uint8_t *h, uint32_t bytes) {
  const uint32_t rate = CV_AUDIO_RATE;
  memcpy(h, "RIFF", 4);            put32(h + 4, 36 + bytes);
  memcpy(h + 8, "WAVEfmt ", 8);    put32(h + 16, 16);
  h[20] = 1; h[21] = 0;                       // PCM
  h[22] = 1; h[23] = 0;                       // mono
  put32(h + 24, rate);
  put32(h + 28, rate * 2);                    // byte rate
  h[32] = 2; h[33] = 0;                       // block align
  h[34] = 16; h[35] = 0;                      // bits per sample
  memcpy(h + 36, "data", 4);       put32(h + 40, bytes);
}

#if CV_AUDIO
/**
 * Brings up one I2S peripheral in full duplex.
 *
 * Full duplex rather than two peripherals because the bit clock and word
 * select are shared, which is the difference between needing four pins and
 * needing six — and on this board four is already more than is comfortably
 * free. It also guarantees the microphone and the speaker cannot drift onto
 * different clocks, which is what produces the slow warble people spend a
 * weekend chasing in software.
 */
static bool audioInit() {
  if (audioReady) return true;

  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_RX);
  cfg.sample_rate = CV_AUDIO_RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;   // see the shift in micRead()
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 6;
  cfg.dma_buf_len = 256;
  cfg.use_apll = false;
  cfg.tx_desc_auto_clear = true;

  if (i2s_driver_install(CV_I2S_PORT, &cfg, 0, nullptr) != ESP_OK) {
    audioFault = "the I2S driver would not start";
    return false;
  }
  i2s_pin_config_t pins = {};
  pins.bck_io_num = CV_I2S_BCLK;
  pins.ws_io_num = CV_I2S_LRCLK;
  pins.data_out_num = CV_I2S_DOUT;
  pins.data_in_num = CV_I2S_DIN;
  if (i2s_set_pin(CV_I2S_PORT, &pins) != ESP_OK) {
    i2s_driver_uninstall(CV_I2S_PORT);
    audioFault = "the I2S pins could not be assigned";
    return false;
  }
  i2s_zero_dma_buffer(CV_I2S_PORT);
  audioReady = true;
  audioFault = "";
  Serial.printf("[AUD] I2S up — bclk %d, lrclk %d, out %d, in %d\n",
                CV_I2S_BCLK, CV_I2S_LRCLK, CV_I2S_DOUT, CV_I2S_DIN);
  return true;
}

/**
 * Reads one chunk from the microphone into 16-bit samples.
 *
 * I2S MEMS mics send 24 bits left-justified in a 32-bit slot, so the peripheral
 * is configured for 32 bits and the top 16 are taken here. Configuring it for
 * 16 bits instead reads the *middle* of the sample and produces audio that is
 * recognisably speech but sounds broken, which is a much harder fault to
 * diagnose than silence.
 *
 * Returns the number of bytes written, which may be short — a partial chunk is
 * still worth sending.
 */
static size_t micRead(int16_t *out, size_t samples, uint32_t waitMs) {
  static int32_t raw[256];
  size_t got = 0;
  while (got < samples) {
    size_t want = samples - got;
    if (want > 256) want = 256;
    size_t bytes = 0;
    if (i2s_read(CV_I2S_PORT, raw, want * sizeof(int32_t), &bytes, pdMS_TO_TICKS(waitMs)) != ESP_OK) break;
    size_t n = bytes / sizeof(int32_t);
    if (!n) break;
    for (size_t i = 0; i < n; i++) out[got + i] = (int16_t)(raw[i] >> 16);
    got += n;
  }
  return got * sizeof(int16_t);
}

/** Writes 16-bit samples to the amplifier, scaled by the volume setting. */
static void speakerWrite(const int16_t *pcm, size_t samples) {
  static int32_t slot[256];
  const int32_t gain = constrain(speakerVolume, 0, 100);
  size_t done = 0;
  while (done < samples) {
    size_t n = samples - done;
    if (n > 256) n = 256;
    for (size_t i = 0; i < n; i++) {
      // Scaled in 32-bit space before being left-justified, so a quiet setting
      // does not throw away the low bits of every sample.
      int32_t v = ((int32_t)pcm[done + i] * gain) / 100;
      slot[i] = v << 16;
    }
    size_t written = 0;
    if (i2s_write(CV_I2S_PORT, slot, n * sizeof(int32_t), &written, pdMS_TO_TICKS(500)) != ESP_OK) break;
    if (!written) break;
    done += written / sizeof(int32_t);
  }
}
#endif // CV_AUDIO

static bool audioArmed() {
  return micOn && audioUrl.length() && millis() - audioArmedAt <= audioTtlMs;
}

/** Uploads one second of microphone audio as a self-contained WAV. */
static void audioPushChunk() {
#if !CV_AUDIO
  return;
#else
  if (!audioReady) return;
  static uint8_t *buf = nullptr;
  if (!buf) {
    buf = (uint8_t *)heap_caps_malloc(WAV_HEADER_BYTES + AUDIO_CHUNK_BYTES,
                                      hasPsram ? MALLOC_CAP_SPIRAM : MALLOC_CAP_8BIT);
    if (!buf) { audioFail++; return; }
  }
  size_t pcmBytes = micRead((int16_t *)(buf + WAV_HEADER_BYTES), AUDIO_CHUNK_SAMPLES, 1200);
  if (pcmBytes < 2) { audioFail++; return; }
  wavHeader(buf, (uint32_t)pcmBytes);

  // Same held-open TLS session as the frame uploader, for the same reason: a
  // handshake per second costs more than the audio does.
  static WiFiClientSecure client;
  static HTTPClient http;
  static bool pinned = false;
  if (!pinned) { cv.pinRoot(client); pinned = true; }

  if (!http.begin(client, audioUrl)) { audioFail++; return; }
  http.setReuse(true);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "audio/wav");
  http.addHeader("X-CV-Device", cv.deviceId());
  http.addHeader("X-CV-Token", audioToken);
  int code = http.POST(buf, WAV_HEADER_BYTES + pcmBytes);
  http.end();

  if (code == 200) {
    audioSent++;
  } else {
    audioFail++;
    // A refusal that will not fix itself must stop the uploads, or the device
    // records the room for the rest of the window and posts it nowhere.
    if (code == 403 || code == 409 || code == 410) {
      Serial.printf("[AUD] listening refused (%d) — stopping\n", code);
      micOn = false;
      audioUrl = "";
    }
  }
#endif
}

/**
 * Fetches a clip and plays it.
 *
 * Bounded and blocking on purpose. Twenty seconds of 8 kHz mono is 320 kB and
 * takes about as long to play as it does to arrive, so it is streamed
 * straight from the socket to the amplifier without ever holding the whole
 * clip. The loop is stalled while it plays — that is a real cost, and it is
 * the right one: the alternatives are a second task fighting for the same TLS
 * stack, or buffering 320 kB the device does not have.
 */
static void audioSpeak(const String &url, const String &token) {
#if !CV_AUDIO
  (void)url; (void)token;
#else
  if (!audioReady && !audioInit()) return;

  WiFiClientSecure client;
  cv.pinRoot(client);
  HTTPClient http;
  if (!http.begin(client, url)) { Serial.println(F("[AUD] speak: bad url")); return; }
  http.setTimeout(10000);
  if (token.length()) http.addHeader("X-CV-Token", token);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[AUD] speak refused (%d)\n", code);
    http.end();
    return;
  }

  WiFiClient *s = http.getStreamPtr();
  int remaining = http.getSize();
  // Skip the WAV header. The site sends canonical 44-byte headers; anything
  // else is not something this can play, and guessing at the offset would
  // emit the header itself as a burst of noise through the speaker.
  uint8_t hdr[WAV_HEADER_BYTES];
  if (s->readBytes(hdr, WAV_HEADER_BYTES) != WAV_HEADER_BYTES ||
      memcmp(hdr, "RIFF", 4) != 0 || memcmp(hdr + 8, "WAVE", 4) != 0) {
    Serial.println(F("[AUD] speak: not a WAV"));
    http.end();
    return;
  }
  if (remaining > 0) remaining -= WAV_HEADER_BYTES;

  int16_t pcm[256];
  long played = 0;
  unsigned long deadline = millis() + 30000UL;
  while ((remaining > 0 || remaining < 0) && http.connected() && millis() < deadline) {
    if (played >= CV_AUDIO_MAX_SPEAK) break;
    int want = sizeof(pcm);
    if (remaining > 0 && remaining < want) want = remaining;
    int got = s->readBytes((uint8_t *)pcm, want);
    if (got <= 0) break;
    speakerWrite(pcm, (size_t)(got / 2));
    played += got;
    if (remaining > 0) remaining -= got;
    cv.loop();                 // keep MQTT alive through a long clip
  }
  i2s_zero_dma_buffer(CV_I2S_PORT);   // stop the amp humming on the last sample
  http.end();
  spokeCount++;
  Serial.printf("[AUD] played %ld bytes\n", played);
#endif
}

static void audioPublishState() {
  // Reported unconditionally, including the false case. A board with no parts
  // fitted has to say so, or the apps show a talk button that produces silence
  // and every layer gets blamed before the hardware does.
  cv.set("hasMic", (bool)(CV_AUDIO != 0) && audioReady);
  cv.set("hasSpeaker", (bool)(CV_AUDIO != 0) && audioReady);
  cv.set("listening", audioArmed());
  cv.set("volume", speakerVolume);
  cv.set("audioFault", audioFault.c_str());
}

/** Paced from loop(); uploads while a listener is armed and not after. */
static void audioTick() {
#if CV_AUDIO
  static bool was = false;
  bool now = audioArmed();
  if (now != was) {
    was = now;
    cv.set("listening", now);
    cv.publishStateNow();
    if (!now) Serial.println(F("[AUD] listening stopped"));
  }
  if (!now) return;
  unsigned long t = millis();
  if (t - lastAudioAt < CV_AUDIO_CHUNK_MS) return;
  lastAudioAt = t;
  audioPushChunk();
#endif
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
  return httpd_resp_send(req, (const char *)lanBuf.p, len);
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
    if (res == ESP_OK) res = httpd_resp_send_chunk(req, (const char *)lanBuf.p, len);
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
      "<p><a href='/snapshot'>Still image</a> · <a href='/rec/list'>Recordings on the card</a></p>";
  httpd_resp_set_type(req, "text/html; charset=utf-8");
  return httpd_resp_send(req, page, sizeof(page) - 1);
}

// ---------------------------------------------------------------------------
// Clips over HTTP
// ---------------------------------------------------------------------------
/*
 * These handlers run on the HTTP server task, which must never touch `cv`:
 * PubSubClient holds one connection with one buffer and is not thread-safe,
 * so publishing from here while loop() is mid-publish corrupts the stream.
 * Start and stop therefore only raise a flag that loop() acts on, and answer
 * "accepted" rather than pretending to know the outcome. Reading the card is
 * safe from either task — FATFS serialises it — but the *writing* file handle
 * belongs to loop(), so the clip being recorded is never served or deleted
 * from here.
 */
static volatile int recPending = 0;    // 0 none, 1 start, 2 stop

static esp_err_t lanJson(httpd_req_t *req, const String &body, const char *status = nullptr) {
  if (status) httpd_resp_set_status(req, status);
  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Cache-Control", "no-store");
  return httpd_resp_send(req, body.c_str(), body.length());
}

/**
 * Pulls `?f=` out and refuses anything that is not a bare clip name.
 *
 * The card holds more than clips and the handler builds a path by
 * concatenation, so "f=../../wpa_supplicant.conf" would otherwise read
 * whatever it likes off the volume. Only [A-Za-z0-9._-] survives, and the
 * name must still end in .avi.
 */
static bool lanClipName(httpd_req_t *req, String &out) {
  char q[128];
  if (httpd_req_get_url_query_str(req, q, sizeof(q)) != ESP_OK) return false;
  char v[64];
  if (httpd_query_key_value(q, "f", v, sizeof(v)) != ESP_OK) return false;
  String n(v);
  if (n.length() < 5 || n.length() > 48 || !isClipName(n)) return false;
  for (size_t i = 0; i < n.length(); i++) {
    char c = n[i];
    bool okc = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
               (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-';
    if (!okc) return false;
  }
  if (n.indexOf("..") >= 0) return false;
  out = n;
  return true;
}

static esp_err_t lanSdStatus(httpd_req_t *req) {
  JsonDocument d;
  d["card"]      = sdReady;
  d["fault"]     = sdFault;
  d["totalMb"]   = (long)(sdTotalB / (1024ULL * 1024ULL));
  d["freeMb"]    = (long)(sdFreeB() / (1024ULL * 1024ULL));
  d["recording"] = recording;
  d["enabled"]   = recEnabled;
  d["motionOnly"] = recMotion;
  d["fps"]       = recFps;
  d["segment"]   = (long)recSegSecs;
  d["file"]      = recName;
  d["frames"]    = (long)recFrames;
  d["clips"]     = recClips;
  String out;
  serializeJson(d, out);
  return lanJson(req, out);
}

static esp_err_t lanRecList(httpd_req_t *req) {
  if (!sdReady) return lanJson(req, String("{\"error\":\"") + (sdFault.length() ? sdFault : String("no card")) + "\"}", "503 Service Unavailable");
  File dir = SD_MMC.open(REC_DIR);
  if (!dir) return lanJson(req, "{\"error\":\"clips folder is missing\"}", "503 Service Unavailable");

  // Streamed rather than assembled: a card with hundreds of clips would build
  // a JSON string larger than the free heap, and running out of memory to
  // describe recordings that are sitting safely on the card would be an
  // absurd way to lose them.
  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Cache-Control", "no-store");
  httpd_resp_send_chunk(req, "{\"clips\":[", HTTPD_RESP_USE_STRLEN);
  bool first = true;
  int n = 0;
  for (File f = dir.openNextFile(); f && n < REC_MAX_CLIPS; f = dir.openNextFile()) {
    String name = f.name();
    int slash = name.lastIndexOf('/');
    if (slash >= 0) name = name.substring(slash + 1);
    uint32_t size = f.size();
    uint32_t mtime = (uint32_t)f.getLastWrite();
    f.close();
    if (!isClipName(name)) continue;
    char row[160];
    snprintf(row, sizeof(row), "%s{\"name\":\"%s\",\"bytes\":%lu,\"mtime\":%lu,\"live\":%s}",
             first ? "" : ",", name.c_str(), (unsigned long)size, (unsigned long)mtime,
             (recording && name == recName) ? "true" : "false");
    httpd_resp_send_chunk(req, row, HTTPD_RESP_USE_STRLEN);
    first = false;
    n++;
  }
  dir.close();
  char tail[96];
  snprintf(tail, sizeof(tail), "],\"freeMb\":%lu,\"totalMb\":%lu}",
           (unsigned long)(sdFreeB() / (1024ULL * 1024ULL)),
           (unsigned long)(sdTotalB / (1024ULL * 1024ULL)));
  httpd_resp_send_chunk(req, tail, HTTPD_RESP_USE_STRLEN);
  return httpd_resp_send_chunk(req, nullptr, 0);
}

static esp_err_t lanRecGet(httpd_req_t *req) {
  String name;
  if (!lanClipName(req, name)) return lanJson(req, "{\"error\":\"bad clip name\"}", "400 Bad Request");
  if (!sdReady) return lanJson(req, "{\"error\":\"no card\"}", "503 Service Unavailable");
  if (recording && name == recName) {
    // Its header still says zero frames and it has no index. Handing that over
    // would produce a file that looks broken, and someone would reasonably
    // conclude the recorder is broken.
    return lanJson(req, "{\"error\":\"that clip is still being recorded\"}", "409 Conflict");
  }
  File f = SD_MMC.open(String(REC_DIR) + "/" + name);
  if (!f || f.isDirectory()) { if (f) f.close(); return lanJson(req, "{\"error\":\"no such clip\"}", "404 Not Found"); }

  httpd_resp_set_type(req, "video/x-msvideo");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  String disp = String("attachment; filename=\"") + name + "\"";
  httpd_resp_set_hdr(req, "Content-Disposition", disp.c_str());

  static uint8_t buf[4096];
  esp_err_t res = ESP_OK;
  while (res == ESP_OK) {
    int got = f.read(buf, sizeof(buf));
    if (got <= 0) break;
    res = httpd_resp_send_chunk(req, (const char *)buf, got);
  }
  f.close();
  httpd_resp_send_chunk(req, nullptr, 0);
  return res;
}

static esp_err_t lanRecDelete(httpd_req_t *req) {
  String name;
  if (!lanClipName(req, name)) return lanJson(req, "{\"error\":\"bad clip name\"}", "400 Bad Request");
  if (!sdReady) return lanJson(req, "{\"error\":\"no card\"}", "503 Service Unavailable");
  if (recording && name == recName) return lanJson(req, "{\"error\":\"that clip is still being recorded\"}", "409 Conflict");
  bool ok = SD_MMC.remove(String(REC_DIR) + "/" + name);
  return lanJson(req, ok ? "{\"ok\":true}" : "{\"error\":\"could not delete\"}",
                 ok ? nullptr : "500 Internal Server Error");
}

static esp_err_t lanRecStart(httpd_req_t *req) {
  recPending = 1;
  return lanJson(req, "{\"accepted\":true,\"action\":\"start\"}", "202 Accepted");
}
static esp_err_t lanRecStop(httpd_req_t *req) {
  recPending = 2;
  return lanJson(req, "{\"accepted\":true,\"action\":\"stop\"}", "202 Accepted");
}

void startLanVideo() {
  if (lanHttpd) return;
  httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();
  cfg.server_port = CV_LAN_PORT;
  cfg.ctrl_port   = 32769;          // default 32768 belongs to the portal server
  cfg.stack_size  = 8192;           // JPEG chunking overruns the 4 kB default
  cfg.max_uri_handlers = 12;        // three video routes plus six clip routes
  cfg.lru_purge_enable = true;
  if (httpd_start(&lanHttpd, &cfg) != ESP_OK) {
    lanHttpd = nullptr;
    Serial.println(F("[CAM] LAN video server failed to start"));
    return;
  }
  httpd_uri_t routes[] = {
      {"/",           HTTP_GET, lanIndex,     nullptr},
      {"/stream",     HTTP_GET, lanStream,    nullptr},
      {"/snapshot",   HTTP_GET, lanSnapshot,  nullptr},
      {"/sd",         HTTP_GET, lanSdStatus,  nullptr},
      {"/rec/list",   HTTP_GET, lanRecList,   nullptr},
      {"/rec/get",    HTTP_GET, lanRecGet,    nullptr},
      {"/rec/delete", HTTP_GET, lanRecDelete, nullptr},
      {"/rec/start",  HTTP_GET, lanRecStart,  nullptr},
      {"/rec/stop",   HTTP_GET, lanRecStop,   nullptr},
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
  int code = http.POST(lanBuf.p, len);
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

/**
 * The resolution to run the sensor at *while streaming*.
 *
 * FRAMESIZE_* is ordered ascending by pixel count, so the cap is a comparison
 * rather than another list of names that would have to be kept in step with
 * resFromName() — the parity bug this codebase keeps finding.
 *
 * Returns the chosen resolution untouched when it is already small enough, so
 * a user streaming at VGA is not silently promoted to SVGA.
 */
String clampStreamRes(const String &n) {
  const String base = clampRes(n);
  return resFromName(base) > resFromName(STREAM_RES_MAX) ? String(STREAM_RES_MAX) : base;
}

/**
 * Picture sizes in ascending order, so adaptation can step without a second
 * table of names to keep in step with resFromName().
 */
static const char *RES_LADDER[] = {
  "QQVGA", "QVGA", "CIF", "VGA", "SVGA", "XGA", "SXGA", "UXGA"
};
static const int RES_LADDER_N = (int)(sizeof(RES_LADDER) / sizeof(RES_LADDER[0]));

static int resRung(const String &n) {
  for (int i = 0; i < RES_LADDER_N; i++) if (n == RES_LADDER[i]) return i;
  return 3;  // VGA — the same fallback resFromName uses
}

/** The size frames actually leave at right now: the ceiling, then adaptation. */
String activeStreamRes() {
  const String ceiling = clampStreamRes(resName);
  if (!adaptive || adaptRes.length() == 0) return ceiling;
  // Adaptation may only ever make the picture smaller than the ceiling, never
  // larger — otherwise a slow link could talk the camera into UXGA.
  return resRung(adaptRes) < resRung(ceiling) ? adaptRes : ceiling;
}

/** The JPEG quality in force right now. Larger is worse, per the sensor API. */
int activeQuality() {
  if (!adaptive || adaptQ == 0) return quality;
  return adaptQ > quality ? adaptQ : quality;
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
  /*
   * While somebody is watching live, the sensor runs at the streaming ceiling
   * rather than the chosen resolution — and below it if adaptation has had to
   * buy frame rate with picture size.
   *
   * A snapshot taken *during* a live stream therefore arrives at the streaming
   * size, not the chosen one. That is deliberate and worth knowing: raising the
   * framesize for one capture and lowering it again stalls the pipeline and
   * leaves the sensor's auto-exposure and gain to re-converge, so the snapshot
   * that cost a visible hiccup in the video is also the one most likely to come
   * back dark. Every IP camera resolves this the same way — stills come off the
   * stream while the stream is running.
   *
   * Stop the stream and the full chosen resolution is restored on the next
   * transition, so a UXGA snapshot is still a UXGA snapshot.
   */
  s->set_framesize(s, resFromName(streaming ? activeStreamRes() : clampRes(resName)));
  s->set_quality(s, streaming ? activeQuality() : quality);
  s->set_vflip(s, rotation == 180 ? 1 : 0);
  s->set_hmirror(s, rotation == 180 ? 1 : 0);
  // Changing framesize invalidates the motion baseline (different geometry).
  mdPrimed = false;
}

void publishSettings() {
  cv.set("resolution", resName.c_str());
  /*
   * The size frames are actually leaving at, which is not always the size the
   * user chose — see applySensorSettings(). Publishing only `resolution` would
   * have the console confidently label an 800x600 stream "UXGA", and the first
   * person to notice would be someone measuring a picture that did not match
   * its own caption. A device that reports what it wishes were true is worse
   * than one that reports nothing.
   */
  cv.set("streamResolution", activeStreamRes().c_str());
  cv.set("quality", quality);
  /*
   * What the stream is actually encoding at, and what it actually achieved.
   *
   * Without these the console can show a frame rate but never why it is what it
   * is, so a picture that has quietly traded sharpness for smoothness looks
   * identical to one that is simply broken. `achievedFps` is measured, not
   * requested — the requested figure is already in `fps`, and reporting it twice
   * would be reporting a wish as a result.
   */
  cv.set("streamQuality", activeQuality());
  cv.set("adaptive", adaptive);
  cv.set("achievedFps", (int)(lastAchieved + 0.5f));
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
  // ---- XCLK ----
  //
  // See CV_CAM_XCLK_HZ in the tunables above for why this is 20 MHz and when to
  // lower it.
  c.xclk_freq_hz = CV_CAM_XCLK_HZ;
  c.pixel_format = PIXFORMAT_JPEG;

  hasPsram = psramFound() && psramUsable();
  if (psramFound() && !hasPsram) {
    Serial.println("[CAM] PSRAM present but failed verification — using DRAM");
  }

  if (hasPsram) {
    /*
     * Two buffers, and take the newest — but only where two can be afforded.
     *
     * WHY THIS IS CONDITIONAL, AND WHAT IT COST TO LEARN
     *
     * 1.13.0 set fb_count = 2 unconditionally. Two frame buffers at VGA or SVGA
     * are comfortable; two at UXGA are not, and the failure is silent in the
     * worst way: esp_camera_init() still succeeds, the sensor still answers on
     * SCCB, `sensorPid` still reads back — and then no frame ever arrives.
     * captureWorksWithin() correctly declares the camera dead and the device
     * runs without it.
     *
     * It is a landmine rather than a bug, because nothing goes wrong when the
     * setting is changed. It detonates on the next *reboot* with a large
     * resolution stored, which may be weeks later and will look like failed
     * hardware. On this camera it was an OTA that finally rebooted it.
     *
     * So the second buffer is taken only when the configured picture fits it.
     * Above SVGA the pipelining is given up rather than the camera — and that
     * costs less than it sounds, because live video is capped at STREAM_RES_MAX
     * anyway, so the only thing running above SVGA is a still, which has
     * nothing to overlap with.
     */
    const framesize_t bootSize = resFromName(clampRes(resName));
    const bool canDoubleBuffer = bootSize <= FRAMESIZE_SVGA;

    c.frame_size   = bootSize;
    c.jpeg_quality = quality;
    /*
     * CAMERA_GRAB_LATEST rather than WHEN_EMPTY matters as much as the count:
     * with a queue of two, WHEN_EMPTY hands back the older frame, so a viewer
     * sees video that is a frame behind and drifts further under load. LATEST
     * drops the stale one. For live video a late frame is worthless — the same
     * reasoning that already makes frames QoS 0 and never retained.
     */
    c.fb_count     = canDoubleBuffer ? 2 : 1;
    c.fb_location  = CAMERA_FB_IN_PSRAM;
    c.grab_mode    = canDoubleBuffer ? CAMERA_GRAB_LATEST : CAMERA_GRAB_WHEN_EMPTY;
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
  adaptFrames++;
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
  /*
   * Every stream starts from the user's own settings rather than inheriting
   * whatever the last session's network talked the camera into. A viewer who
   * fixes their Wi-Fi and reopens the page should see the picture they paid
   * for, not yesterday's compromise.
   */
  adaptQ = 0;
  adaptRes = "";
  lastAchieved = 0;
  adaptWindowAt = 0;
  adaptFrames = 0;
  /*
   * Re-apply the sensor settings on every transition, because the framesize
   * depends on `streaming` now. Without this the cap is computed once at boot
   * and the whole stream/snapshot split silently does nothing — a control that
   * looks present and has no effect, which is the failure this codebase finds
   * most often.
   */
  applySensorSettings();
  cv.set("streaming", streaming);
  publishSettings();
  cv.publishStateNow();
  Serial.printf("[CAM] stream %s\n", on ? "on" : "off");
}

/**
 * Spends the frame-rate budget.
 *
 * Called once per loop; does nothing until a measurement window closes. When it
 * does, the camera compares what it achieved against what was asked and gives
 * up — or takes back — exactly one step. One step per window is what keeps this
 * a controller rather than a see-saw: two steps on one bad window is how you
 * end up at QVGA because a neighbour's microwave ran for two seconds.
 */
void adaptTick(unsigned long now) {
  if (!adaptive || !streaming || !camReady) return;

  if (adaptWindowAt == 0) { adaptWindowAt = now; adaptFrames = 0; return; }
  if (now - adaptWindowAt < ADAPT_WINDOW_MS) return;

  const float secs = (now - adaptWindowAt) / 1000.0f;
  lastAchieved = secs > 0 ? adaptFrames / secs : 0;
  adaptWindowAt = now;
  adaptFrames = 0;

  /*
   * Published every window, not only when something changes.
   *
   * It was inside the `changed` branch, which meant the number froze at
   * whatever was measured during convergence and then stayed there — so a
   * stream that settled at 46 fps reported the 27 it passed through on the way.
   * A measurement that stops updating is worse than none: it looks live.
   */
  cv.set("achievedFps", (int)(lastAchieved + 0.5f));

  const float target = (float)max(fps, FPS_MIN);
  const String ceiling = clampStreamRes(resName);
  bool changed = false;

  if (lastAchieved < target * ADAPT_DOWN_RATIO) {
    // Quality first: it is invisible for far longer than a size change is.
    if (activeQuality() < ADAPT_Q_LIMIT) {
      adaptQ = activeQuality() + ADAPT_Q_STEP;
      if (adaptQ > ADAPT_Q_LIMIT) adaptQ = ADAPT_Q_LIMIT;
      changed = true;
    } else if (resRung(activeStreamRes()) > resRung(ADAPT_RES_FLOOR)) {
      adaptRes = RES_LADDER[resRung(activeStreamRes()) - 1];
      // A smaller picture is cheaper per frame, so the quality that was
      // bought to survive the larger one is handed back with it.
      adaptQ = 0;
      changed = true;
    }
  } else if (lastAchieved > target * ADAPT_UP_RATIO) {
    // Give back in the reverse order it was taken, so the picture recovers its
    // size before it recovers its sharpness — size is the one people notice.
    if (adaptRes.length() && resRung(adaptRes) < resRung(ceiling)) {
      adaptRes = RES_LADDER[resRung(adaptRes) + 1];
      if (resRung(adaptRes) >= resRung(ceiling)) adaptRes = "";
      changed = true;
    } else if (adaptQ > quality) {
      adaptQ = activeQuality() - ADAPT_Q_STEP;
      if (adaptQ <= quality) adaptQ = 0;
      changed = true;
    }
  }

  if (changed) {
    applySensorSettings();
    publishSettings();
    cv.publishStateNow();
    Serial.printf("[CAM] adapt: %.1f/%d fps -> %s q%d\n",
                  lastAchieved, fps, activeStreamRes().c_str(), activeQuality());
  }
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
  } else if (action == "record") {
    // Recording to the card. Settings are applied before the on/off decision
    // so a single command can say "10 fps, motion only, go" and mean it.
    if (p["fps"].is<int>()) {
      recFps = constrain(p["fps"].as<int>(), FPS_MIN, FPS_MAX);
      store.putInt("recfps", recFps);
    }
    if (p["segment"].is<int>()) {
      recSegSecs = (uint32_t)constrain(p["segment"].as<int>(), REC_SEG_SECS_MIN, REC_SEG_SECS_MAX);
      store.putInt("recseg", (int)recSegSecs);
    }
    if (p["motionOnly"].is<bool>()) {
      recMotion = p["motionOnly"].as<bool>();
      store.putBool("recmd", recMotion);
      // Motion-only recording is meaningless with the detector off, and
      // silently recording nothing is the worst way to discover that.
      if (recMotion && !motionOn) {
        motionOn = true;
        store.putBool("md", true);
        mdPrimed = false;
        cv.set("motion", true);
      }
    }
    String outcome = "unchanged";
    if (p["on"].is<bool>()) outcome = recSet(p["on"].as<bool>());
    else if (recEnabled) outcome = recSet(true);          // re-apply new settings
    recPublishState();
    cv.publishStateNow();
    Serial.printf("[REC] %s\n", outcome.c_str());

  } else if (action == "sdclear") {
    int removed = recDeleteAll();
    Serial.printf("[SD] cleared %d clips\n", removed);
    JsonDocument d;
    d["type"]    = "sdclear";
    d["removed"] = removed;
    cv.publishTelemetry(d.as<JsonObjectConst>());
    recPublishState();
    cv.publishStateNow();

  } else if (action == "listen") {
    // Microphone. Armed by a listener and re-armed while they listen; it
    // lapses on its own so a closed tab cannot leave a microphone in someone's
    // home uploading indefinitely. That expiry is a privacy property and not
    // an optimisation, which is why it is not configurable to "never".
#if CV_AUDIO
    if (!audioReady) audioInit();
#endif
    if (!audioReady) {
      Serial.println(F("[AUD] no microphone fitted on this board"));
      audioPublishState();
      cv.publishStateNow();
      return;
    }
    if (p["on"] | false) {
      audioUrl   = (const char *)(p["url"]   | "");
      audioToken = (const char *)(p["token"] | "");
      long ttl   = p["ttl"] | 0;
      audioTtlMs = ttl > 0 ? (unsigned long)ttl * 1000UL : CLOUD_TTL_MS;
      audioArmedAt = millis();
      micOn = audioUrl.length() > 0;
      Serial.println(F("[AUD] listening armed"));
    } else {
      micOn = false;
      audioUrl = "";
      Serial.println(F("[AUD] listening stopped"));
    }
    audioPublishState();
    cv.publishStateNow();

  } else if (action == "speak") {
    if (p["volume"].is<int>()) {
      speakerVolume = constrain(p["volume"].as<int>(), 0, 100);
      store.putInt("vol", speakerVolume);
    }
    const char *url = p["url"] | "";
    if (url && *url) audioSpeak(String(url), String((const char *)(p["token"] | "")));
    audioPublishState();
    cv.publishStateNow();

  } else if (action == "reboot") {
    // Never leave a half-written clip behind because someone pressed Reboot.
    if (recording) aviClose("rebooting");
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
    if (p["adaptive"].is<bool>()) {
      adaptive = p["adaptive"].as<bool>();
      store.putBool("adapt", adaptive);
      // Turning it off must hand the picture straight back, not leave the
      // viewer on whatever compromise was in force when they switched it off.
      if (!adaptive) { adaptQ = 0; adaptRes = ""; }
      touchSensor = true;
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
  recFps      = store.getInt("recfps", recFps);
  recSegSecs  = (uint32_t)store.getInt("recseg", (int)recSegSecs);
  recMotion   = store.getBool("recmd", recMotion);
  // Recording intent survives a power cut on purpose. A camera set to record
  // that quietly stops after a brownout is worse than one that never
  // recorded: the gap looks like nothing happened.
  recEnabled  = store.getBool("recon", false);
  speakerVolume = store.getInt("vol", speakerVolume);
  adaptive      = store.getBool("adapt", adaptive);

  /*
   * Raise the frame rate on cameras that never chose one.
   *
   * FPS_DEFAULT went from 8 to 24, but a default only applies to a device with
   * nothing stored, and every camera already in a house has `fps` in NVS from
   * the first time it published settings. Without this the whole 24 fps change
   * would have landed as an OTA that measurably improved nothing on the entire
   * installed fleet, while passing every test — the exact shape of failure this
   * codebase keeps finding, and the reason the number on the console would
   * still have read 8 after a "fix" for it.
   *
   * Only a stored value equal to the *old default* is raised. That is a value
   * the user cannot have chosen deliberately, because it is the one they would
   * have got by never opening the slider. Anyone who picked 5 to save
   * bandwidth, or 15, keeps exactly what they picked.
   *
   * `fpsv` records that this ran, so someone who now deliberately selects 8
   * keeps it through the next reboot instead of being overridden forever.
   */
  const int FPS_PREVIOUS_DEFAULT = 8;
  if (store.getInt("fpsv", 0) < 1) {
    if (fps == FPS_PREVIOUS_DEFAULT) {
      fps = FPS_DEFAULT;
      store.putInt("fps", fps);
      Serial.printf("[CAM] frame rate raised %d -> %d (never set by the user)\n",
                    FPS_PREVIOUS_DEFAULT, fps);
    }
    store.putInt("fpsv", 1);
  }

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
      /*
       * Before giving up the camera entirely, try a smaller picture.
       *
       * A capture can fail because the ribbon is not seated — in which case
       * nothing will help — or because the configured resolution simply cannot
       * be allocated on this board. The two are indistinguishable from here,
       * and they have very different remedies, so the cheap one is tried first.
       *
       * This exists because the alternative was a camera that disabled itself
       * over a *setting*, in a house nobody can visit, and reported nothing but
       * "not ready". A device must not need a person with a screwdriver to
       * recover from a number it could have lowered by itself.
       */
      for (int rung = resRung(resName) - 1; rung >= 0 && !camReady; rung--) {
        Serial.printf("[CAM] no frame at %s — retrying at %s\n",
                      resName.c_str(), RES_LADDER[rung]);
        resName = RES_LADDER[rung];
        applySensorSettings();
        if (captureWorksWithin(4000)) {
          // Persisted, so the next boot starts from a size known to work here
          // rather than walking down this ladder again every time.
          store.putString("res", resName);
          cv.set("resolutionFault",
                 "lowered automatically: the chosen size could not be captured");
          Serial.printf("[CAM] recovered at %s\n", resName.c_str());
          break;
        }
      }
      if (!camReady) {
        camReady = false;
        /*
         * Publish which of the two failures this is, because they have
         * completely different remedies and the console otherwise has to guess
         * — and the guess it used to make was "reseat the ribbon", which sends
         * somebody up a ladder to hardware that is working.
         *
         * SCCB runs on SIOD/SIOC alone. If the sensor still answers a register
         * read while no frame ever completes, the control bus is fine and the
         * parallel data lines are not: that is a ribbon. If it does not answer
         * at all, the module is unpowered or gone.
         */
        cv.set("sccbOk", sccbAlive());
        Serial.println(F("[CAM] init succeeded but no frame arrived at any size — running without the camera"));
      }
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

  /*
   * The card is mounted after the camera and after cv.begin(), and that order
   * matters in both directions. Before the camera it would not help — the
   * SDMMC driver's allocations are small — but during provisioning the portal
   * owns the radio and the heap, and a mount there is one more thing to go
   * wrong at the moment the device is least able to report it. After begin()
   * the network is up, so a mount failure can actually be published.
   */
  if (!cv.isProvisioning()) {
    sdMount();
    if (recEnabled && sdReady) {
      recMotionSeenAt = recMotion ? 0 : millis();
      Serial.println(F("[REC] resuming recording from saved settings"));
    }
#if CV_AUDIO
    /*
     * Brought up at boot rather than on the first `listen`, so the device can
     * report honestly whether audio hardware answers. Discovering that at the
     * moment someone presses Talk means the failure surfaces as a button that
     * did nothing, with no way to tell a missing part from a bad solder joint.
     */
    if (!audioInit()) Serial.printf("[AUD] unavailable — %s\n", audioFault.c_str());
#else
    audioFault = "this firmware was built without audio support";
#endif
  }
  audioPublishState();
  recPublishState();

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

  /*
   * Recording lives on this thread and nowhere else. The LAN handlers can
   * only raise `recPending`, because they run on the HTTP task and the MQTT
   * client is not thread-safe — a publish from there while this thread is
   * mid-publish corrupts the connection for everything, not just the reply
   * nobody was waiting for.
   */
  int pending = recPending;
  if (pending) {
    recPending = 0;
    String outcome = recSet(pending == 1);
    recPublishState();
    cv.publishStateNow();
    Serial.printf("[REC] %s (asked over the LAN)\n", outcome.c_str());
  }
  recTick();
  audioTick();
  // The clip counters move constantly; publishing every change would flood the
  // state topic for no benefit, so they ride the periodic publish instead.
  static unsigned long lastRecState = 0;
  if (now - lastRecState >= 15000UL) {
    lastRecState = now;
    recPublishState();
  }

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
    // After the frame, so a window always closes on a full measurement rather
    // than on one taken halfway through the capture it is measuring.
    adaptTick(millis());
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
