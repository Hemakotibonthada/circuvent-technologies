/*
 * Circuvent RC Car — the camera, and why it is kept at arm's length.
 *
 * The car carries a forward-facing camera whose stream the driver watches on a
 * phone. This file is where that happens, and the whole point of it being a
 * separate file on a separate core is that it must never be able to delay a
 * steering frame.
 *
 * THE RULE
 *
 * Video is bulk traffic. It is large, it is bursty, and losing a frame costs
 * nothing. Steering is twenty bytes that have to arrive on time. They share
 * one 2.4 GHz radio on this board, and they must not share a queue, a core, or
 * a fate:
 *
 *   core 0  -- ESP-NOW control, drive, lights. Never blocks.
 *   core 1  -- this file: capture, JPEG, Wi-Fi, HTTP. Allowed to block.
 *
 * If the video stalls, the car keeps steering and the picture freezes. That is
 * the correct failure. The reverse -- a car that drives straight on while the
 * picture is still moving -- is the one this arrangement exists to prevent.
 *
 * WHY MJPEG OVER HTTP AND NOT SOMETHING BETTER
 *
 * A phone can display multipart/x-mixed-replace in an <img> tag with no codec,
 * no player, no negotiation and no dependency. H.264 would be a quarter of the
 * bitrate and would need an encoder this part does not have, plus a decoding
 * path on the phone that has to be told when to give up. For a camera whose
 * job is "let the driver see where the front of the car is pointing", latency
 * and simplicity beat efficiency.
 *
 * FRAME SIZE
 *
 * QVGA by default, and deliberately small. The sensor will happily produce
 * UXGA; a UXGA JPEG is around 100 KB, which at any useful rate is more than
 * the link carries, so the queue grows, latency climbs, and the driver ends up
 * steering by a picture of where the car was two seconds ago. A late frame is
 * worse than a small one.
 */
#pragma once

#include <Arduino.h>
#include <esp_camera.h>
#include <WiFi.h>
#include <WebServer.h>

/* ------------------------------------------------------------------- pins --*/
/*
 * ESP32-S3 with an OV2640 on the standard S3-EYE style pinout. These are
 * separate from every pin in rc-drive.h, and the compile-time guard there
 * covers the motor and servo; the camera bus is checked here.
 */
#ifndef CAM_PIN_XCLK
#define CAM_PIN_XCLK  10
#define CAM_PIN_SIOD  40
#define CAM_PIN_SIOC  39
#define CAM_PIN_D7    48
#define CAM_PIN_D6    11
#define CAM_PIN_D5    12
#define CAM_PIN_D4    14
#define CAM_PIN_D3    16
#define CAM_PIN_D2    18
#define CAM_PIN_D1    17
#define CAM_PIN_D0    15
#define CAM_PIN_VSYNC 38
#define CAM_PIN_HREF  47
#define CAM_PIN_PCLK  13
#define CAM_PIN_PWDN  -1
#define CAM_PIN_RESET -1
#endif

/* The AP the phone or the dongle joins for video. Separate SSID from anything
   else on site, and open — see the note in begin(). */
#ifndef CV_RC_CAM_SSID
#define CV_RC_CAM_SSID "Circuvent-RC"
#endif

class RcCamera {
 public:
  /**
   * Brings up the sensor and the AP.
   *
   * @return false when no sensor answers, which is a supported state: the car
   *         drives perfectly well without a camera, and reporting the absence
   *         is better than retrying forever with the motor waiting.
   */
  bool begin(const char *pass) {
    camera_config_t c = {};
    c.ledc_channel = LEDC_CHANNEL_6; /* not one of rc-drive.h's channels */
    c.ledc_timer = LEDC_TIMER_2;
    c.pin_d0 = CAM_PIN_D0; c.pin_d1 = CAM_PIN_D1; c.pin_d2 = CAM_PIN_D2;
    c.pin_d3 = CAM_PIN_D3; c.pin_d4 = CAM_PIN_D4; c.pin_d5 = CAM_PIN_D5;
    c.pin_d6 = CAM_PIN_D6; c.pin_d7 = CAM_PIN_D7;
    c.pin_xclk = CAM_PIN_XCLK;
    c.pin_pclk = CAM_PIN_PCLK;
    c.pin_vsync = CAM_PIN_VSYNC;
    c.pin_href = CAM_PIN_HREF;
    c.pin_sccb_sda = CAM_PIN_SIOD;
    c.pin_sccb_scl = CAM_PIN_SIOC;
    c.pin_pwdn = CAM_PIN_PWDN;
    c.pin_reset = CAM_PIN_RESET;
    c.xclk_freq_hz = 20000000;
    c.pixel_format = PIXFORMAT_JPEG;
    c.frame_size = FRAMESIZE_QVGA;
    c.jpeg_quality = 12;
    /*
     * Two frame buffers, so the sensor can fill one while the other is on the
     * wire. One buffer means capture and transmit alternate and the frame rate
     * halves; three would add a frame of latency for no gain, and latency is
     * the thing the driver actually feels.
     */
    c.fb_count = 2;
    c.fb_location = CAMERA_FB_IN_PSRAM;
    c.grab_mode = CAMERA_GRAB_LATEST;

    if (!psramFound()) {
      /*
       * Without PSRAM a QVGA JPEG still fits in internal RAM, but two do not.
       * Dropping to one buffer halves the frame rate and keeps the car
       * driving, which is the right trade — refusing to start the camera
       * would take the picture away entirely over a board variant.
       */
      c.fb_count = 1;
      c.fb_location = CAMERA_FB_IN_DRAM;
    }

    if (esp_camera_init(&c) != ESP_OK) return false;

    sensor_t *s = esp_camera_sensor_get();
    if (s) {
      /*
       * The sensor is mounted upside down on this chassis so the ribbon can
       * reach without a fold. Corrected here rather than in the app, so every
       * consumer — phone, console, a recording — sees the same picture.
       */
      s->set_vflip(s, 1);
      s->set_hmirror(s, 0);
    }

    /*
     * AP mode, and the password matters.
     *
     * An open AP on a moving vehicle is a camera anybody within range can
     * watch, and on this design it is also the network the driving app talks
     * over. It is created with WPA2 whenever a password is configured, and a
     * car with no password set stays off the air rather than broadcasting an
     * open one.
     */
    if (!pass || strlen(pass) < 8) return false;
    WiFi.softAP(CV_RC_CAM_SSID, pass, CV_RC_CHANNEL);

    _server.on("/stream", HTTP_GET, [this]() { streamHandler(); });
    _server.on("/still", HTTP_GET, [this]() { stillHandler(); });
    _server.begin();
    _up = true;
    return true;
  }

  /** Pumps the HTTP server. Called only from the camera task, on core 1. */
  void loop() {
    if (_up) _server.handleClient();
  }

  bool up() const { return _up; }
  uint32_t frames() const { return _frames; }

 private:
  void stillHandler() {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) { _server.send(503, "text/plain", "no frame"); return; }
    _server.setContentLength(fb->len);
    _server.send(200, "image/jpeg", "");
    _server.client().write(fb->buf, fb->len);
    esp_camera_fb_return(fb);
    _frames++;
  }

  void streamHandler() {
    WiFiClient client = _server.client();
    client.print(
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: multipart/x-mixed-replace; boundary=cvframe\r\n"
        /* No caching anywhere. A proxy that buffered this would hand the
           driver a picture from further back the longer they drove. */
        "Cache-Control: no-store\r\n"
        "Connection: close\r\n\r\n");

    while (client.connected()) {
      camera_fb_t *fb = esp_camera_fb_get();
      if (!fb) break;

      client.printf("--cvframe\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n",
                    (unsigned)fb->len);
      const size_t sent = client.write(fb->buf, fb->len);
      client.print("\r\n");
      esp_camera_fb_return(fb);
      _frames++;

      /*
       * A short write means the client is not keeping up. Dropping the
       * connection is better than queueing: a backlog of JPEGs is latency the
       * driver cannot see accumulating, and reconnecting costs a fraction of a
       * second while a two-second-old picture costs a wall.
       */
      if (sent == 0) break;

      /* Yield so the Wi-Fi stack and the watchdog both get a look in. */
      delay(1);
    }
  }

  WebServer _server{80};
  bool _up = false;
  uint32_t _frames = 0;
};
