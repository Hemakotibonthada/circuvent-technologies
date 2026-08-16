/*
 * CircuventDevice.h - Circuvent IoT device client (ESP32 / ESP8266)
 * =================================================================
 * Push-based MQTT client for the self-hosted Circuvent control plane.
 *
 * Transport (fully self-owned — see platform/):
 *   - Connects to OUR MQTT broker over TLS (mqtt.circuvent.com:8883) using the
 *     embedded Circuvent CA below. Auth = device id (username) + key (password).
 *   - Subscribes to  cv/<id>/cmd     (commands from the app/control-plane)
 *   - Publishes      cv/<id>/state   (retained full state, on a timer + on demand)
 *                    cv/<id>/telemetry (one-off readings)
 *                    cv/<id>/status  ({"online":true} on connect; LWT {"online":false})
 *   - Sub-second command delivery — no HTTP polling.
 *
 * Features retained from the HTTP client: NVS credential storage, zero-touch
 * Wi-Fi captive-portal provisioning, exponential reconnect backoff, optional OTA.
 *
 * Deps (Arduino Library Manager): ArduinoJson (v7), PubSubClient, ESP32/ESP8266 core.
 * Install: copy this folder into your Arduino/libraries directory.
 */
#pragma once
#include <Arduino.h>

#if defined(ESP32)
  #include <WiFi.h>
  #include <WiFiClientSecure.h>
  #include <HTTPClient.h>
  #include <WebServer.h>
  #include <DNSServer.h>
  #include <Preferences.h>
  #include <HTTPUpdate.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <WiFiClientSecure.h>
  #include <ESP8266HTTPClient.h>
  #include <ESP8266WebServer.h>
  #include <DNSServer.h>
  #include <ESP8266httpUpdate.h>
#else
  #error "CircuventDevice supports ESP32 or ESP8266 only"
#endif

#include <time.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <mbedtls/base64.h>
#if defined(ESP32)
#include <esp_system.h>
#endif
extern "C" {
#include "tweetnacl.h"
}
// PRNG required by tweetnacl (device keypair generation). Defined once — only the
// sketch translation unit includes this header.
extern "C" void randombytes(unsigned char *p, unsigned long long n) {
  for (unsigned long long i = 0; i < n; ++i) {
#if defined(ESP32)
    p[i] = (unsigned char)(esp_random() & 0xFF);
#else
    p[i] = (unsigned char)(os_random() & 0xFF);
#endif
  }
}

#ifndef CV_FW_VERSION
#define CV_FW_VERSION "1.0.0"
#endif

/*
 * How much of a streamed binary payload is handed to TLS at a time.
 *
 * This governs the per-frame cost of live video, so it is a frame-rate knob
 * rather than a memory one. Each chunk becomes a TLS record with its own
 * header, MAC and padding, and its own trip through mbedtls; at 1 KB a 22 KB
 * frame paid that toll twenty-two times.
 *
 * 4 KB stays under the 16 KB TLS record limit and inside the ESP32 output
 * buffer, so a single write still cannot block for long. A board that is short
 * of RAM can lower it; nothing else needs to change.
 */
#ifndef CV_PUBLISH_CHUNK
#define CV_PUBLISH_CHUNK 4096
#endif

/*
 * Relay polarity.
 *
 * The relay boards in use are opto-isolated and negative-trigger: pulling the
 * GPIO LOW energises the coil. Driving them as if HIGH meant "on" inverts every
 * channel — the switch says on and the load is off — which is what was
 * happening in the field.
 *
 * Active LOW is the default because it is what the hardware is. A board wired
 * the other way defines CV_RELAY_ACTIVE_LOW 0 before including this.
 */
#ifndef CV_RELAY_ACTIVE_LOW
#define CV_RELAY_ACTIVE_LOW 1
#endif

/**
 * Shortest press that counts as a press at all.
 *
 * Below this it is electrical noise on a button cable, not a finger. Without
 * it a glitch that straddled two polls could still reach the three-second
 * branch and erase somebody's Wi-Fi.
 */
#ifndef CV_RESET_DEBOUNCE_MS
#define CV_RESET_DEBOUNCE_MS 80
#endif

/**
 * How often a device sitting in its setup portal re-checks for its home Wi-Fi.
 *
 * Only ever used when credentials exist. A portal raised on a device that has
 * somewhere to go is a temporary state, and the router coming back is the
 * event that should end it — not somebody noticing and power-cycling.
 */
#ifndef CV_PORTAL_WIFI_RETRY_MS
#define CV_PORTAL_WIFI_RETRY_MS 20000UL
#endif

/** The level that drives a relay to `on`, given the board's polarity. */
static inline int cvRelayLevel(bool on) {
#if CV_RELAY_ACTIVE_LOW
  return on ? LOW : HIGH;
#else
  return on ? HIGH : LOW;
#endif
}

/*
 * Claim a relay pin without clicking it first.
 *
 * An ESP32 output latch reads LOW before anything is written to it, so on an
 * active-low board `pinMode(pin, OUTPUT)` energises the relay the instant the
 * pin becomes an output — every channel switches ON at power-up, for as long as
 * it takes the sketch to reach its state restore. On a four-gang board that is
 * four loads turning themselves on after every power cut.
 *
 * Writing the safe level BEFORE pinMode sets the latch first, so the pin drives
 * "off" from the moment it starts driving anything at all. The second write is
 * belt and braces on cores where the order is reversed internally.
 */
static inline void cvRelayInit(uint8_t pin) {
  digitalWrite(pin, cvRelayLevel(false));
  pinMode(pin, OUTPUT);
  digitalWrite(pin, cvRelayLevel(false));
}

/** Drive a relay, honouring the board's polarity. */
static inline void cvRelayWrite(uint8_t pin, bool on) {
  digitalWrite(pin, cvRelayLevel(on));
}

// Circuvent's own device CA (public cert). Embedded so every device trusts our
// self-hosted broker. The CA private key never leaves the server. Rotate via
// setRootCA() if you ever regenerate it (platform/scripts/gen-certs.sh).
static const char CIRCUVENT_DEFAULT_CA[] =
"-----BEGIN CERTIFICATE-----\n"
"MIIFXzCCA0egAwIBAgIUCH5rDZwry/65ir5NhSmj6oln4JcwDQYJKoZIhvcNAQEL\n"
"BQAwPzEfMB0GA1UECgwWQ2lyY3V2ZW50IFRlY2hub2xvZ2llczEcMBoGA1UEAwwT\n"
"Q2lyY3V2ZW50IERldmljZSBDQTAeFw0yNjA3MjQxMzMyMDlaFw0zNjA3MjExMzMy\n"
"MDlaMD8xHzAdBgNVBAoMFkNpcmN1dmVudCBUZWNobm9sb2dpZXMxHDAaBgNVBAMM\n"
"E0NpcmN1dmVudCBEZXZpY2UgQ0EwggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIK\n"
"AoICAQC2jwwBRCHXYw3Y4PV+tanbR5YOpfbLVgmcpVz7pNvQ4tgArT0ir4XrqYAL\n"
"bZVILZDkErMjAUtlEbPEeUfCtNE+YZhwUUHX+4iky6+HgPhkWad1A/XpH7VWZ0A5\n"
"Hgzbe0YO/5j4vRhMjiJeLAhSjgWhRWgzN4Ht618t54x4MgX3Vei1oswOToiwp1Ez\n"
"P41AvoeoQoETRgFb/uJKQIQz9mm6pkPOx8aKIW7teXNNS5AhojOvTJv8kVe/iEUl\n"
"SINgdsAzLe41aiGwKg0WzsLx1hUoRLEzko/n5WBP4jKC940R3b7eB5uGJddOAXQB\n"
"pJ5RNMo8IxaqbKeOeZmx4iXwaVWfCzi6mDgRkMdDbLsz6UZAsF8ZoaPepqT9Osq2\n"
"iKy1c16WxlxLzV/3pIP3Qj2bv4+y3D0i6opmjzg3scpH556oQ06clyjmwd5uz12D\n"
"v1yv7u9fwZ3kDo7fBj8p7YDu0Tw0VhLwW0c+mPyr9JYH9soLLWVu3VVv4O6pKbo2\n"
"jmxyLdgCdI2oDqLIJx666x4pHk3ARjkhhkNRMFlfdWYm6sRAfQnHiT195Zk0vXGZ\n"
"ovwGoh3aeNeuG34acExlculIstUxFbrzYgU6o3hiZKYfYoj/Jr9ZEu3Qy8otcXIe\n"
"I2TtKMk/TrENj/Lui6GFRaborSNNhflIGGyUk7YcI9xZ7qM5PwIDAQABo1MwUTAd\n"
"BgNVHQ4EFgQUlp+EXB4QjfyQSzJLH2DmLlDtQT8wHwYDVR0jBBgwFoAUlp+EXB4Q\n"
"jfyQSzJLH2DmLlDtQT8wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOC\n"
"AgEAIKUVupvjqJLHiYeT/rVoLQc187tfCBS7+ykSJwSyKmrUVg9zX6Yv+shGPegz\n"
"RNmZYrY9v3l7346IV7Wnyfu/4RAzUvnTWkieCXxCvIzi/gmdzUjxPfiNOPq2ZgZe\n"
"A7MY+PR8+SpoAAhrqtXU7WgVdr9zW3cH5ABw+ptrHPrdIKiiTnWm9yrR5taf5L94\n"
"247dCNSUFsFXo7zVoyxDa6U9R1uRZVEj08t0XnvWAsU3aJhECU8tfZ+dU9PNlBHc\n"
"AHCVFvgdYLZiOZ/2ZkMhHjH9DJVTroTWuF8T+sPdaG7nULwsuAFt2q1NLShKGtPV\n"
"WkdJxT0JWBfiyOxq8MlBtdOlcBVJHsdYLc2DU+Yh1SumbSPEuA2h1YZfPVRFnzYT\n"
"fCzP6Ol1TU9L24E+vQH/axQtUCxQ+PmdLhXWVimIjodlEpgjVTdAKQkY9PMdZyuu\n"
"Q2RJO1cNnoxl/fnDOo6kB9yHsGMBfc1FzmzcrweMYyrGpp3S7aDOGurL7DYWThED\n"
"a47SFS0GmmDzwL5SisI+9EBOgYKnzz2/7+BWBeQ7gJnQYiPlr7QCiLtvOTE6ut+K\n"
"Qjmddjy3CduwZuboFMZ9dBJ+eVd6syhCXb4mWGdP5UceV0x2Zp9NJuDVu/DuNoV+\n"
"AFbLdWlzr1fhQdcCDxflbPSAugqyDfZUlj5vUHw2Wem6SwY=\n"
"-----END CERTIFICATE-----\n";

// Let's Encrypt roots (ISRG Root X1 + X2). api.circuvent.com (Caddy auto-TLS)
// and circuvent.com (Vercel) both chain to ISRG Root X1; X2 covers any ECDSA
// chain. Pinned for the control-plane self-provision (and OTA-metadata) HTTPS
// calls so the device authenticates the cloud, not merely encrypts to it.
static const char LETSENCRYPT_ROOT_CA[] =
"-----BEGIN CERTIFICATE-----\n"
"MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n"
"TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh\n"
"cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4\n"
"WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu\n"
"ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY\n"
"MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc\n"
"h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+\n"
"0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U\n"
"A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW\n"
"T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH\n"
"B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC\n"
"B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv\n"
"KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn\n"
"OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn\n"
"jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw\n"
"qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI\n"
"rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV\n"
"HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq\n"
"hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL\n"
"ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ\n"
"3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK\n"
"NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5\n"
"ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur\n"
"TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC\n"
"jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc\n"
"oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq\n"
"4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA\n"
"mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d\n"
"emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=\n"
"-----END CERTIFICATE-----\n"
"-----BEGIN CERTIFICATE-----\n"
"MIICGzCCAaGgAwIBAgIQQdKd0XLq7qeAwSxs6S+HUjAKBggqhkjOPQQDAzBPMQsw\n"
"CQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFyY2gg\n"
"R3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMjAeFw0yMDA5MDQwMDAwMDBaFw00\n"
"MDA5MTcxNjAwMDBaME8xCzAJBgNVBAYTAlVTMSkwJwYDVQQKEyBJbnRlcm5ldCBT\n"
"ZWN1cml0eSBSZXNlYXJjaCBHcm91cDEVMBMGA1UEAxMMSVNSRyBSb290IFgyMHYw\n"
"EAYHKoZIzj0CAQYFK4EEACIDYgAEzZvVn4CDCuwJSvMWSj5cz3es3mcFDR0HttwW\n"
"+1qLFNvicWDEukWVEYmO6gbf9yoWHKS5xcUy4APgHoIYOIvXRdgKam7mAHf7AlF9\n"
"ItgKbppbd9/w+kHsOdx1ymgHDB/qo0IwQDAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0T\n"
"AQH/BAUwAwEB/zAdBgNVHQ4EFgQUfEKWrt5LSDv6kviejM9ti6lyN5UwCgYIKoZI\n"
"zj0EAwMDaAAwZQIwe3lORlCEwkSHRhtFcP9Ymd70/aTSVaYgLXTWNLxBo1BfASdW\n"
"tL4ndQavEi51mI38AjEAi/V3bNTIZargCyzuFJ0nN6T5U6VR5CmD1/iQMVtCnwr1\n"
"/q4AaOeMSQ+2b1tbFfLn\n"
"-----END CERTIFICATE-----\n";

typedef void (*CvCommandHandler)(const String &action, JsonObjectConst params);

class CircuventDevice;
static CircuventDevice *_cvInstance = nullptr;
static void _cvOnMqttMessage(char *topic, uint8_t *payload, unsigned int len);

class CircuventDevice {
 public:
  CircuventDevice(const char *deviceId, const char *deviceKey, const char *type,
                  const char *apiBase = "https://circuvent.com")
      : _type(type) {
    _id = deviceId;
    _key = deviceKey;
    _api = apiBase;
  }

  // Identical-firmware constructor: NO baked id/key. Identity is assigned by the
  // Circuvent app during setup (pushed to the portal) and stored in NVS, or
  // loaded from NVS on later boots. Flash the same binary to every device.
  explicit CircuventDevice(const char *type, const char *apiBase = "https://circuvent.com")
      : _type(type) {
    _api = apiBase;
  }

  // ---- configuration ----------------------------------------------------
  void onCommand(CvCommandHandler h) { _handler = h; }
  void setInterval(uint32_t ms) { _interval = ms; }          // state publish cadence
  void setRootCA(const char *pem) { _rootCA = pem; }         // override embedded CA
  void setBroker(const char *host, uint16_t port = 8883) { _brokerHost = host; _brokerPort = port; }
  void setProvisioning(bool enable) { _provisioningEnabled = enable; }
  void setOtaInterval(uint32_t ms) { _otaInterval = ms; }    // 0 disables OTA polling (default off)
  // Physical reset button (e.g. the BOOT/GPIO0 button): hold ~3s to clear Wi-Fi
  // (change network, keeps identity), hold ~8s for a full factory reset.
  void setResetButton(int pin, bool activeLow = true) { _resetPin = pin; _resetActiveLow = activeLow; }
  bool claimed() const { return _mqttUp; }
  bool online() const { return WiFi.status() == WL_CONNECTED && _mqttUp; }
  const char *firmwareVersion() const { return CV_FW_VERSION; }

  /** This device's assigned id — needed to identify itself over plain HTTPS. */
  const String &deviceId() const { return _id; }

  /**
   * Applies the pinned root CA to a caller's TLS client.
   *
   * Exposed so a sketch making its own HTTPS request gets the same trust
   * anchor as OTA. The alternative a sketch reaches for is setInsecure(),
   * which is how a device ends up accepting any certificate presented to it.
   */
  void pinRoot(WiFiClientSecure &c) const { _pinRoot(c); }

  // ---- state setters (published to cv/<id>/state) -----------------------
  // Each setter marks the state dirty ONLY when the value actually changes, so
  // a physical button press / local event pushes to the cloud within _minGap
  // (see loop()) — the app reflects manual control in real time (<1s).
  void set(const char *k, bool v) { if (!_state[k].is<bool>() || _state[k].as<bool>() != v) { _state[k] = v; _dirty = true; } }
  void set(const char *k, int v) { if (!_state[k].is<int>() || _state[k].as<int>() != v) { _state[k] = v; _dirty = true; } }
  void set(const char *k, long v) { if (!_state[k].is<long>() || _state[k].as<long>() != v) { _state[k] = v; _dirty = true; } }
  void set(const char *k, float v) { if (!_state[k].is<float>() || _state[k].as<float>() != v) { _state[k] = v; _dirty = true; } }
  void set(const char *k, const char *v) {
    const char *cur = _state[k].as<const char *>();
    if (!cur || strcmp(cur, v) != 0) { _state[k] = v; _dirty = true; }
  }
  /** Force an immediate state push (e.g. right after a physical toggle). */
  void publishStateNow() { if (_mqttUp) { _lastPub = millis(); _dirty = false; publishState(); } }

  // ---- telemetry (one-off reading to cv/<id>/telemetry) -----------------
  void publishTelemetry(JsonObjectConst obj) {
    if (!_mqttUp) return;
    String s; serializeJson(obj, s);
    _mqtt.publish(_topic("telemetry").c_str(), s.c_str(), false);
  }

  // ---- live video frames (cv/<id>/frame) --------------------------------
  /**
   * Publishes a raw binary payload (a JPEG straight out of the camera driver)
   * to cv/<id>/frame.
   *
   * Streamed with beginPublish/write/endPublish rather than publish(): a plain
   * publish() would need the whole frame to fit inside PubSubClient's buffer,
   * which would mean sizing that buffer for the largest possible frame (tens
   * of KB) for the entire fleet. Streaming keeps the buffer small and copies
   * nothing — the frame goes from the camera's DMA buffer to the socket.
   *
   * QoS 0 and not retained: a late frame is worthless, and a retained one would
   * hand the last picture taken to anything that subscribes later.
   */
  bool publishFrame(const uint8_t *data, size_t len) {
    return publishBinary("frame", data, len);
  }

  /**
   * Publishes a raw binary payload to cv/<id>/<leaf>, in two parts if `head`
   * is given. Same streaming write as publishFrame, and the implementation
   * publishFrame now delegates to, so there is one chunking loop to get right.
   *
   * The two-part form exists because a binary topic has nowhere to put
   * metadata: `head` lets a caller prefix a fixed-size record (which capture
   * this frame belongs to, its index in a burst, why it was taken) without
   * copying the image out of the camera's DMA buffer to concatenate them.
   *
   * QoS 0 and never retained, for the same reasons as a frame: a late capture
   * is worth less than the memory to retransmit it, and a retained one would
   * hand the last picture taken to anything that subscribes later.
   */
  bool publishBinary(const char *leaf, const uint8_t *data, size_t len,
                     const uint8_t *head = nullptr, size_t headLen = 0) {
    if (!_mqttUp || !data || len == 0) return false;
    if (!head) headLen = 0;
    if (!_mqtt.beginPublish(_topic(leaf).c_str(), headLen + len, false)) return false;
    if (headLen && _mqtt.write(head, headLen) != headLen) { _mqtt.endPublish(); return false; }
    size_t sent = 0;
    while (sent < len) {
      /*
       * Chunked so a large frame cannot stall the TCP write in one call.
       *
       * This was 1024 bytes, which is the PubSubClient *buffer* size — but a
       * streamed publish does not go through that buffer, it writes straight to
       * the TLS client. So the only thing 1 KB chunks bought was arithmetic:
       * every chunk becomes its own TLS record, each paying a header, a MAC and
       * padding, plus a full pass through mbedtls. A 22 KB frame was 22 records
       * where it could be 6, and that overhead is per frame — it is exactly the
       * cost that stops a camera going faster once the sensor no longer is.
       *
       * 4 KB is chosen to sit under the 16 KB TLS record ceiling with room for
       * the record overhead, and to stay well inside the ESP32's TLS output
       * buffer so a write still never blocks for long. Larger is not better
       * here: a chunk that exceeds the output buffer is split internally again
       * and the gain disappears.
       */
      size_t chunk = len - sent;
      if (chunk > CV_PUBLISH_CHUNK) chunk = CV_PUBLISH_CHUNK;
      size_t n = _mqtt.write(data + sent, chunk);
      if (n == 0) { _mqtt.endPublish(); return false; }
      sent += n;
    }
    return _mqtt.endPublish();
  }

  // ---- lifecycle --------------------------------------------------------
  void begin(const char *ssid = nullptr, const char *pass = nullptr) {
    _cvInstance = this;
    if (_resetPin >= 0) pinMode(_resetPin, _resetActiveLow ? INPUT_PULLUP : INPUT);
    _prefsBegin();
    _loadCreds();

    if (ssid && strlen(ssid) && !_isPlaceholder(ssid)) { _ssid = ssid; _pass = pass ? pass : ""; _saveWifi(); }

    bool haveWifi = _ssid.length() > 0;
    bool haveIdentity = !_isPlaceholder(_id.c_str()) && !_isPlaceholder(_key.c_str());

    WiFi.mode(WIFI_STA);
    WiFi.persistent(false);
    /*
     * Let the SDK re-associate on its own as well as our retry in loop().
     * Belt and braces: the supplicant recovers from a brief AP outage faster
     * than our backoff notices, and our backoff covers the cases it gives up
     * on.
     */
    WiFi.setAutoReconnect(true);
    if (haveWifi) _connect();

    // B: if online but not yet provisioned, redeem the provisioning token over
    // TLS to fetch our id+key from the control plane — the permanent secret is
    // delivered cloud->device only, never carried on the local setup link.
    if (WiFi.status() == WL_CONNECTED && !haveIdentity && _token.length()) {
      if (_selfProvision()) haveIdentity = true;
    }

    /*
     * The setup AP opens because there is nothing to connect to — never
     * because connecting failed.
     *
     * This used to read "not connected OR not provisioned -> startPortal()",
     * with _connect() giving up after twenty seconds. A device restores power
     * and is on Wi-Fi in about a second; a domestic router takes thirty to
     * ninety to finish booting. So after any power cut the whole fleet would
     * time out, open a setup hotspot and `return` — and loop() begins with
     * `if (_portalActive) return`, so nothing ever attempted Wi-Fi again. The
     * devices stayed in AP mode until somebody power-cycled them a second
     * time, by which point the router was up. From the outside: everything
     * offline in the app after a power cut, and a row of unfamiliar
     * "Circuvent-Setup-XXXX" networks in the phone's Wi-Fi list.
     *
     * Stored credentials now mean the device keeps trying for as long as it
     * takes. The AP is for a device that has been reset or has never been set
     * up — the two cases where waiting could not possibly help.
     *
     * The second arm stays: connected, but with no identity and no token to
     * redeem for one. That is not a Wi-Fi problem and waiting will not fix it
     * either; the app has to push a token over the setup link.
     */
    bool needsPortal = !haveWifi || (WiFi.status() == WL_CONNECTED && !haveIdentity && !_token.length());
    if (needsPortal && _provisioningEnabled) { startPortal(); return; }

    _ntpSync();      // TLS cert validity needs a real clock
    _tlsSetup();
    _mqtt.setServer(_brokerHost.c_str(), _brokerPort);
    _mqtt.setCallback(_cvOnMqttMessage);
    _mqtt.setBufferSize(2048);
    _mqtt.setKeepAlive(45);
  }

  // Call from loop(). Manages Wi-Fi, MQTT (re)connect, state publishing, OTA.
  void loop() {
    _pollResetButton();
    if (_portalActive) { _portalLoop(); return; }

    if (WiFi.status() != WL_CONNECTED) {
      _mqttUp = false;
      uint32_t backoff = _reconnectBackoff();
      if (millis() - _lastReconnect > backoff) {
        _lastReconnect = millis();
        /*
         * begin() again, not reconnect().
         *
         * WiFi.reconnect() re-uses the association the supplicant last had.
         * After a boot where the AP was never reachable there is no such
         * association, so it returns false and does nothing at all — which is
         * the state a device is in after a power cut, and exactly when
         * retrying matters. begin() re-runs the association from the stored
         * credentials and works from either state.
         */
        if (_ssid.length()) WiFi.begin(_ssid.c_str(), _pass.c_str());
        _reconnectTries++;
        if (_reconnectTries % 20 == 0) {
          Serial.printf("[CV] WiFi still down after %u tries — will keep trying\n", _reconnectTries);
        }
      }
      return;
    }
    _reconnectTries = 0;

    /*
     * Redeem the provisioning token now that there is a network.
     *
     * A device set up while the internet was down reaches here with
     * credentials and a token but no identity. Before, that combination
     * dropped it into the setup AP at boot; now it waits, and this is what
     * finishes the job the moment the network returns, without anybody having
     * to go and press anything.
     */
    if (_token.length() && (_isPlaceholder(_id.c_str()) || _isPlaceholder(_key.c_str()))) {
      if (millis() - _lastProvisionTry > 30000UL) {
        _lastProvisionTry = millis();
        if (_selfProvision()) { _ntpSync(); _tlsSetup(); }
      }
      return;  // nothing can be published until the device has an identity
    }

    if (!_mqtt.connected()) { _mqttUp = false; _mqttReconnect(); }
    else { _mqtt.loop(); _mqttUp = true; }

    uint32_t now = millis();
    if (_otaInterval && (_lastOta == 0 || now - _lastOta > _otaInterval)) { _lastOta = now; checkOTA(); }
    // Publish on the heartbeat interval OR promptly after a local state change
    // (coalesced by _minGap) so manual/physical control shows up in the app fast.
    bool heartbeat = (now - _lastPub >= _interval);
    bool changed = _dirty && (now - _lastPub >= _minGap);
    if (_mqttUp && (heartbeat || changed)) { _lastPub = now; _dirty = false; publishState(); }
  }

  // Publish the current accumulated state (retained) so the app sees it instantly.
  void publishState() {
    if (!_mqttUp) return;
    JsonDocument doc;
    doc.set(_state.as<JsonObjectConst>());
    doc["fw"] = CV_FW_VERSION;
    doc["rssi"] = WiFi.RSSI();
    doc["uptime"] = (long)(millis() / 1000);
    String s; serializeJson(doc, s);
    _mqtt.publish(_topic("state").c_str(), s.c_str(), true);  // retained
  }

  // Called by the MQTT callback trampoline — parses a command and dispatches it.
  // The state produced by a command is published immediately (bypassing the
  // change-coalescing gap) so the app's optimistic switch is confirmed by the
  // device in one network round trip instead of waiting for the next tick.
  void _dispatch(uint8_t *payload, unsigned int len) {
    JsonDocument doc;
    if (deserializeJson(doc, payload, len) != DeserializationError::Ok) return;
    String action = doc["action"] | "";
    if (!action.length()) return;

    /*
     * Platform actions are handled here, before the sketch's handler.
     *
     * `ota` used to be delegated like everything else, and not one of the
     * twenty product sketches implemented it — every one of them starts with
     * `if (action != "set") return;` or an equivalent. So the admin console
     * had an OTA button, the control plane published the command, and every
     * device in the fleet silently ignored it. Pull-polling was no help
     * either: setOtaInterval defaults to 0 and no sketch calls it. The result
     * was a fleet that could not be updated remotely at all, which is only
     * discovered when a fix urgently needs to ship.
     *
     * Handling it at this layer is what makes OTA a property of the platform
     * rather than something each product has to remember to opt into.
     */
    if (action == "ota") {
      String url = doc["url"] | "";
      String ver = doc["version"] | "";
      _applyOta(url, ver);
      return;  // a successful update reboots and never reaches here
    }

    /*
     * Move the device to a different Wi-Fi network without a factory reset.
     *
     * Changing Wi-Fi used to mean holding the reset button, joining the
     * device's setup AP and provisioning again — which also discards the
     * device's identity, so it comes back as a new device and everything
     * attached to the old id (rooms, scenes, automations, history) is orphaned.
     * A router replaced or a password rotated should not cost any of that.
     *
     * The identity is untouched here; only the network changes.
     */
    if (action == "wifi") {
      String ssid = doc["ssid"] | "";
      String pass = doc["pass"] | "";
      if (ssid.length()) _applyWifi(ssid, pass);
      return;
    }

    /*
     * Open setup mode on request from the app.
     *
     * The AP no longer opens by itself when Wi-Fi is unreachable, which is
     * what it should never have done — but that removed the only way a device
     * could offer its setup link without someone walking to it and holding the
     * button. This is the replacement: the owner taps "set up again" in the
     * app or the console while the device is still online, and it raises the
     * hotspot deliberately.
     *
     * It is only reachable over an authenticated MQTT command on the device's
     * own topic, so it cannot be triggered by anything on the local network.
     */
    if (action == "setup" || action == "provision") {
      uint32_t mins = doc["minutes"] | 10;
      _openSetupWindow(mins);
      return;
    }

    if (!_handler) return;
    _handler(action, doc.as<JsonObjectConst>());
    if (_dirty) publishStateNow();
  }

  // ---- OTA (optional; GET {api}/api/devices/firmware) -------------------
  /**
   * Applies a firmware image from `binUrl`.
   *
   * SECURITY: the binary is fetched with the same pinned root as the metadata
   * call. It used to use setInsecure(), which disables certificate validation
   * entirely — anyone able to intercept that connection (a rogue access point,
   * poisoned DNS, a compromised upstream) could serve arbitrary firmware and
   * take permanent control of a board that switches mains relays and door
   * locks. An OTA that fails loudly on an unexpected certificate is far better
   * than one that quietly accepts any.
   *
   * Host firmware on a domain covered by the pinned root. If that ever has to
   * change, change the pin — do not reach for setInsecure().
   */
  /**
   * Reports an OTA outcome over MQTT.
   *
   * The previous version wrote failures to Serial and nothing else, which on a
   * deployed device means nowhere. "I pressed update and nothing happened" was
   * therefore indistinguishable from "the command never arrived" — and that is
   * precisely how OTA stayed broken across the entire fleet without anyone
   * noticing. A rollout mechanism that cannot report its own failure is barely
   * better than not having one.
   *
   * Success needs no message: the device reboots and reports the new version.
   */
  void _otaStatus(const String &s) {
    set("otaStatus", s.c_str());
    publishStateNow();
  }

  /**
   * Switches Wi-Fi networks, and comes back if the new one does not work.
   *
   * The rollback is the entire point. A device that accepts credentials and
   * then cannot associate has removed its own only route home: it is powered,
   * silent, and needs someone to find it and hold a button — which is the
   * outcome this command exists to avoid. So the old credentials are kept in
   * memory, the new ones are tried, and they are only written to NVS after the
   * association actually succeeds. A typo costs about forty seconds of downtime
   * instead of a trip to wherever the device is mounted.
   *
   * The last message before the link drops reports what is about to happen,
   * because from the app's point of view the device is about to go quiet for a
   * while and "offline" on its own is indistinguishable from a crash.
   */
  bool _applyWifi(const String &ssid, const String &pass) {
    const String oldSsid = _ssid, oldPass = _pass;
    if (ssid == oldSsid && pass == oldPass) {
      set("wifiStatus", "unchanged");
      publishStateNow();
      return true;
    }

    set("wifiStatus", String("switching to " + ssid).c_str());
    publishStateNow();
    delay(400);  // let that publish leave before the radio drops

    _mqttUp = false;
    _mqtt.disconnect();
    WiFi.disconnect(false, false);
    delay(300);

    _ssid = ssid; _pass = pass;
    _connect();

    if (WiFi.status() == WL_CONNECTED) {
      _saveWifi();
      Serial.printf("[CV] Wi-Fi changed to %s\n", ssid.c_str());
      set("wifiStatus", "ok");
      set("ssid", _ssid.c_str());
      _dirty = true;         // published as soon as MQTT is back up
      return true;
    }

    Serial.printf("[CV] Wi-Fi change to %s failed — restoring %s\n", ssid.c_str(), oldSsid.c_str());
    _ssid = oldSsid; _pass = oldPass;
    WiFi.disconnect(false, false);
    delay(300);
    _connect();
    set("wifiStatus", String("failed: could not join " + ssid).c_str());
    _dirty = true;
    return false;
  }

  bool _applyOta(const String &binUrl, const String &newVer) {    if (binUrl.length() == 0) return false;
    // Re-flashing the running version would reboot the device on every
    // repeated broadcast, which is an outage rather than an update.
    if (newVer.length() && newVer == CV_FW_VERSION) {
      _otaStatus("skipped: already on " + newVer);
      return false;
    }

    _otaStatus("downloading " + newVer);

    WiFiClientSecure otaClient;
    _pinRoot(otaClient);
#if defined(ESP32)
    httpUpdate.rebootOnUpdate(true);
    t_httpUpdate_return r = httpUpdate.update(otaClient, binUrl);
    if (r == HTTP_UPDATE_FAILED) {
      String why = String(httpUpdate.getLastError()) + " " + httpUpdate.getLastErrorString();
      Serial.printf("[OTA] failed: %s\n", why.c_str());
      // Distinguishes a TLS rejection from a 404 from a bad image, which is
      // the difference between fixing a pinned root, a URL, and a build.
      _otaStatus("failed: " + why);
      return false;
    }
    if (r == HTTP_UPDATE_NO_UPDATES) {
      _otaStatus("no update offered at url");
      return false;
    }
#elif defined(ESP8266)
    ESPhttpUpdate.rebootOnUpdate(true);
    t_httpUpdate_return r = ESPhttpUpdate.update(otaClient, binUrl);
    if (r == HTTP_UPDATE_FAILED) {
      String why = String(ESPhttpUpdate.getLastError()) + " " + ESPhttpUpdate.getLastErrorString();
      Serial.printf("[OTA] failed: %s\n", why.c_str());
      _otaStatus("failed: " + why);
      return false;
    }
#endif
    return true;
  }

  bool checkOTA() {
    if (WiFi.status() != WL_CONNECTED) return false;
    WiFiClientSecure client;
    // The manifest names the URL that _applyOta will flash and reboot into, so
    // it needs the same authentication as the download itself. Leaving this leg
    // unvalidated let an on-path attacker answer with any url they liked.
    _pinRoot(client);
    HTTPClient https;
    String url = _api + "/api/devices/firmware?type=" + _type + "&id=" + _id + "&ver=" + CV_FW_VERSION;
    if (!https.begin(client, url)) return false;
    https.addHeader("x-device-id", _id);
    https.addHeader("x-device-key", _key);
    int code = https.GET();
    String binUrl, newVer;
    if (code == 200) {
      JsonDocument m;
      if (deserializeJson(m, https.getStream()) == DeserializationError::Ok) {
        newVer = String((const char *)(m["version"] | ""));
        binUrl = String((const char *)(m["url"] | ""));
      }
    }
    https.end();
    if (binUrl.length() == 0 || newVer.length() == 0 || newVer == CV_FW_VERSION) return false;
    return _applyOta(binUrl, newVer);
  }

  // ---- Wi-Fi provisioning portal ---------------------------------------
  /**
   * True while the Wi-Fi provisioning portal is running.
   *
   * Sketches need this because the portal is not a quiet background task: it
   * brings up a soft AP, a web server, a DNS server and an asynchronous Wi-Fi
   * scan, all at once, on a board that has not yet joined a network. Anything
   * the sketch does concurrently is competing with that for memory and for the
   * radio, and on the ESP32-CAM specifically, running the camera's DMA at the
   * same time panics the chip before a phone can even list the AP.
   */
  bool isProvisioning() const { return _portalActive; }

  /**
   * Raises the setup AP for a bounded time at the owner's request.
   *
   * Bounded because this one can be opened remotely. A device left in AP mode
   * is a device that is not doing its job and is broadcasting an open network
   * to the street, and the person who tapped the button may be nowhere near it
   * — they may have tapped it by accident, or given up and driven home. When
   * the window closes the device reboots and goes straight back to the network
   * it already had credentials for.
   *
   * A device with no credentials is not on a timer: there is nothing for it to
   * go back to, so its portal stays up until somebody provisions it.
   */
  void _openSetupWindow(uint32_t minutes) {
    if (_portalActive) return;
    if (minutes < 1) minutes = 1;
    if (minutes > 60) minutes = 60;
    _portalDeadline = _ssid.length() ? millis() + minutes * 60000UL : 0;
    Serial.printf("[CV] Setup mode requested (%u min)\n", (unsigned)minutes);
    startPortal();
  }

  void startPortal() {
    _portalActive = true;
    if (!_boxReady) { crypto_box_keypair(_boxPk, _boxSk); _boxReady = true; }
    String ap = "Circuvent-Setup-" + _shortId();
    WiFi.mode(WIFI_AP_STA);  // AP for the app + STA so we can scan for home networks
    WiFi.softAP(ap.c_str());
    _dns.start(53, "*", WiFi.softAPIP());
    _server.on("/", [this]() { _server.send(200, "text/html", _portalPage()); });
    _server.on("/info", [this]() {
      _server.sendHeader("Access-Control-Allow-Origin", "*");
      _server.send(200, "application/json", _infoJson());
    });
    _server.on("/scan", [this]() {
      _server.sendHeader("Access-Control-Allow-Origin", "*");
      _server.send(200, "application/json", _scanJson());
    });
    _server.on("/save", [this]() { _portalSave(); });
    // Allow the app to re-open setup / clear Wi-Fi remotely while on the hotspot.
    _server.on("/reset", [this]() {
      _server.sendHeader("Access-Control-Allow-Origin", "*");
      bool full = _server.hasArg("full") && _server.arg("full") == "1";
      _server.send(200, "application/json", full ? "{\"ok\":true,\"mode\":\"factory\"}" : "{\"ok\":true,\"mode\":\"wifi\"}");
      delay(400);
      if (full) _factoryReset(); else _clearWifi();
    });
    _server.onNotFound([this]() { _server.send(200, "text/html", _portalPage()); });
    _server.begin();
    _kickScan();  // start an async Wi-Fi scan so the first GET /scan returns fast
    Serial.printf("[CV] Provisioning AP: %s  (open http://192.168.4.1)\n", ap.c_str());
  }

 private:
#if defined(ESP32)
  WebServer _server{80};
#else
  ESP8266WebServer _server{80};
#endif
  DNSServer _dns;
#if defined(ESP32)
  Preferences _prefs;
#endif

  const char *_type;
  String _id, _key, _api, _ssid, _pass;
  String _brokerHost = "mqtt.circuvent.com";
  uint16_t _brokerPort = 8883;
  const char *_rootCA = CIRCUVENT_DEFAULT_CA;
  CvCommandHandler _handler = nullptr;

  WiFiClientSecure _net;
  PubSubClient _mqtt{_net};

  uint32_t _interval = 10000, _lastPub = 0, _lastReconnect = 0;
  uint32_t _minGap = 80;   // min ms between change-triggered publishes (coalesce bursts)
  bool _dirty = false;     // a state value changed locally since the last publish
  /*
   * OTA poll interval.
   *
   * Defaults to 6 hours rather than 0 (off). Push OTA over MQTT is the primary
   * path and is instant, but it only reaches devices that are online at the
   * moment the command is published — a unit that was powered down during a
   * rollout would otherwise stay on old firmware indefinitely, with nothing
   * indicating it had been missed. This poll is the backstop that closes that
   * gap without anyone having to notice.
   *
   * The cost is one HTTPS GET per device every six hours, and the endpoint
   * returns an empty manifest when nothing is published, so the steady-state
   * cost is negligible. setOtaInterval(0) still disables it.
   */
  uint32_t _otaInterval = 6UL * 60UL * 60UL * 1000UL, _lastOta = 0;
  uint32_t _lastMqttTry = 0;
  uint16_t _reconnectTries = 0, _mqttFails = 0;
  uint32_t _lastProvisionTry = 0;
  /** Deadline for a remotely-requested setup window; 0 means no timer. */
  uint32_t _portalDeadline = 0;
  bool _mqttUp = false, _provisioningEnabled = true, _portalActive = false;
  JsonDocument _state;
  uint8_t _boxPk[32], _boxSk[32];
  bool _boxReady = false;
  String _token;
  // physical reset button
  int _resetPin = -1;
  bool _resetActiveLow = true;
  uint32_t _resetHoldStart = 0;
  bool _resetLatched = false;
  /*
   * False until the reset pin has been seen released since boot.
   *
   * A long press that was already in progress when the device powered on is
   * not a press — nobody was holding it *for this boot*. See _pollResetButton.
   */
  bool _resetArmed = false;
  bool _resetBootWarned = false;
  uint32_t _lastPortalWifiTry = 0;
  // cached async Wi-Fi scan (keeps GET /scan fast for the app)
  String _scanCache = "[]";
  uint32_t _scanStartedAt = 0;
  bool _scanPending = false;

  String _topic(const char *leaf) { return String("cv/") + _id + "/" + leaf; }

  // B: redeem the provisioning token at the control plane over TLS and receive
  // this device's id+key. The secret is created server-side and delivered only
  // over this TLS response — it is never present on the local setup link.
  bool _selfProvision() {
    if (_token.length() == 0) return false;
    _ntpSync();  // TLS needs a valid clock
    WiFiClientSecure client;
    // The response to this POST contains the device's permanent id, key and
    // broker host — the credentials it will authenticate to MQTT with for the
    // rest of its life. The comment above states that the secret "is never
    // present on the local setup link" and is delivered only over this TLS
    // response; that guarantee is worth nothing if the response is not
    // authenticated. Anyone on the provisioning network could otherwise answer
    // it, harvest the credentials, and hand back a broker of their choosing.
    _pinRoot(client);
    HTTPClient https;
    if (!https.begin(client, "https://api.circuvent.com/provisioning/self")) return false;
    https.addHeader("Content-Type", "application/json");
    String payload = String("{\"token\":\"") + _token + "\",\"hwid\":\"" + _shortId() + "\"}";
    int code = https.POST(payload);
    bool ok = false;
    if (code == 200) {
      JsonDocument doc;
      if (deserializeJson(doc, https.getStream()) == DeserializationError::Ok) {
        String id = String((const char *)(doc["id"] | ""));
        String key = String((const char *)(doc["key"] | ""));
        String br = String((const char *)(doc["broker"] | ""));
        if (id.length() && key.length()) {
          _id = id; _key = key;
          if (br.length()) _brokerHost = br;
          _token = "";  // one-time use
          _saveAll();
          ok = true;
          Serial.printf("[CV] self-provisioned as %s\n", _id.c_str());
        }
      }
    } else {
      Serial.printf("[CV] self-provision HTTP %d\n", code);
    }
    https.end();
    return ok;
  }

  /**
   * Pins the Let's Encrypt root on a one-shot HTTPS client.
   *
   * Every outbound HTTPS call in this library must authenticate the control
   * plane, not merely encrypt to it. The three that did not — the OTA manifest
   * fetch, the firmware download, and self-provisioning — each called
   * `setInsecure()` on ESP8266 with the justification that the chip "lacks the
   * memory for a full chain check".
   *
   * That was wrong, and demonstrably so: `_tlsSetup()` below has been pinning
   * this same root on ESP8266 for the MQTT connection all along, using exactly
   * the BearSSL trust-anchor + 1 kB buffer arrangement used here. The claim was
   * never tested, and it excused turning off validation on the one request that
   * installs new code and the one that carries the device's permanent
   * credentials.
   *
   * The X509List is static because BearSSL keeps a reference to it for the life
   * of the connection; a stack-local would be freed underneath the handshake.
   */
  static void _pinRoot(WiFiClientSecure &c) {
#if defined(ESP32)
    c.setCACert(LETSENCRYPT_ROOT_CA);
#elif defined(ESP8266)
    static BearSSL::X509List otaRoots(LETSENCRYPT_ROOT_CA);
    c.setTrustAnchors(&otaRoots);
    c.setBufferSizes(1024, 1024);
#endif
  }

  void _tlsSetup() {
#if defined(ESP32)
    _net.setCACert(_rootCA);
#elif defined(ESP8266)
    static BearSSL::X509List caList(_rootCA);
    _net.setTrustAnchors(&caList);
    _net.setBufferSizes(1024, 1024);
#endif
  }

  void _ntpSync() {
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    uint32_t start = millis();
    while (time(nullptr) < 1700000000 && millis() - start < 8000) delay(200);
  }

  void _mqttReconnect() {
    uint32_t backoff = _mqttBackoff();
    if (_lastMqttTry != 0 && millis() - _lastMqttTry < backoff) return;
    _lastMqttTry = millis();

    String will = _topic("status");
    if (_mqtt.connect(_id.c_str(), _id.c_str(), _key.c_str(), will.c_str(), 1, true, "{\"online\":false}")) {
      _mqttFails = 0; _mqttUp = true;
      String online = String("{\"online\":true,\"fw\":\"") + CV_FW_VERSION + "\"}";
      _mqtt.publish(will.c_str(), online.c_str(), true);           // retained
      _mqtt.subscribe(_topic("cmd").c_str(), 1);
      publishState();
      Serial.println(F("[CV] MQTT connected"));
    } else {
      _mqttFails++;
      Serial.printf("[CV] MQTT connect failed rc=%d (fails=%u)\n", _mqtt.state(), _mqttFails);
    }
  }

  uint32_t _reconnectBackoff() {
    uint32_t b = 3000UL << (_reconnectTries > 5 ? 5 : _reconnectTries);
    return b > 60000UL ? 60000UL : b;
  }
  uint32_t _mqttBackoff() {
    if (_mqttFails == 0) return 2000UL;
    uint32_t b = 2000UL << (_mqttFails > 4 ? 4 : _mqttFails);
    return b > 60000UL ? 60000UL : b;
  }

  /**
   * One association attempt at boot.
   *
   * The wait is a convenience, not a decision: connecting here lets begin()
   * finish NTP, TLS and MQTT setup in one pass on the normal path. Failing it
   * no longer means anything — loop() retries for as long as the device is
   * powered — so the window is short. It used to be twenty seconds, which was
   * both too long to sit blocking in setup() and far too short to outlast a
   * router still booting after a power cut.
   */
  void _connect() {
    WiFi.begin(_ssid.c_str(), _pass.c_str());
    Serial.print(F("[CV] WiFi"));
    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) { delay(250); Serial.print('.'); }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("\n[CV] %s\n", WiFi.localIP().toString().c_str());
    } else {
      Serial.println(F("\n[CV] offline — will keep retrying in the background"));
    }
  }

  static bool _isPlaceholder(const char *s) {
    String v(s); v.toUpperCase();
    return v.startsWith("YOUR_") || v.startsWith("REPLACE") || v == "";
  }

  String _shortId() {
#if defined(ESP32)
    uint32_t chip = (uint32_t)(ESP.getEfuseMac() & 0xFFFF);
#else
    uint32_t chip = ESP.getChipId() & 0xFFFF;
#endif
    char buf[6]; snprintf(buf, sizeof(buf), "%04X", chip); return String(buf);
  }

  // ---- NVS credential store --------------------------------------------
  void _prefsBegin() {
#if defined(ESP32)
    _prefs.begin("circuvent", false);
#endif
  }
  void _loadCreds() {
#if defined(ESP32)
    _ssid = _prefs.getString("ssid", _ssid);
    _pass = _prefs.getString("pass", _pass);
    String api = _prefs.getString("api", "");
    if (api.length()) _api = api;
    String broker = _prefs.getString("broker", "");
    if (broker.length()) _brokerHost = broker;
    String id = _prefs.getString("id", "");
    String key = _prefs.getString("key", "");
    if (id.length()) _id = id;
    if (key.length()) _key = key;
    _token = _prefs.getString("token", "");
#endif
  }
  void _saveWifi() {
#if defined(ESP32)
    _prefs.putString("ssid", _ssid);
    _prefs.putString("pass", _pass);
#endif
  }
  void _loadOrMakeIdentity() {
    if (_isPlaceholder(_id.c_str())) _id = String("CV-") + String(_type) + "-" + _shortId();
    if (_isPlaceholder(_key.c_str())) _key = "K-" + _shortId() + _shortId();
#if defined(ESP32)
    _prefs.putString("id", _id);
    _prefs.putString("key", _key);
#endif
  }

  // ---- captive portal ---------------------------------------------------
  void _portalLoop() {
    _dns.processNextRequest();
    _server.handleClient();

    /*
     * A portal on a device that still has credentials is a temporary state.
     *
     * The event that should end it is the router coming back, not somebody
     * noticing and power-cycling. This is the belt to the braces in begin():
     * that one stops the AP being raised after a power cut in the first place,
     * and this one gets a device home if it is in AP mode for any other reason
     * — a setup window nobody used, a portal raised before this firmware was
     * installed, or a rejoin that happened while the owner was mid-setup.
     *
     * Silent about failure on purpose. This runs every twenty seconds forever,
     * and a device with a router that is genuinely gone would otherwise fill
     * its log with the same line all night.
     */
    if (_ssid.length() && millis() - _lastPortalWifiTry > CV_PORTAL_WIFI_RETRY_MS) {
      _lastPortalWifiTry = millis();
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println(F("[CV] Home Wi-Fi is back — leaving setup mode"));
        delay(200);
        ESP.restart();
      } else {
        // STA is still up alongside the AP (WIFI_AP_STA), so this costs the
        // portal nothing: the phone stays connected while the attempt runs.
        WiFi.begin(_ssid.c_str(), _pass.c_str());
      }
    }

    /*
     * Close a requested setup window that nobody used, and go back to work.
     * Only ever set when credentials exist, so this cannot strand a device
     * that has nothing to return to.
     */
    if (_portalDeadline && (int32_t)(millis() - _portalDeadline) >= 0) {
      Serial.println(F("[CV] Setup window expired — returning to Wi-Fi"));
      delay(200);
      ESP.restart();
    }
  }

  // ---- reset button + credential clearing -------------------------------
  // Erase only the Wi-Fi (keep id/key/token) → device re-opens the portal so the
  // user can push new Wi-Fi from the app; the device keeps its identity/history.
  void _clearWifi() {
    Serial.println(F("[CV] Clearing Wi-Fi — reopening setup portal"));
    _ssid = ""; _pass = "";
#if defined(ESP32)
    _prefs.remove("ssid");
    _prefs.remove("pass");
#endif
    delay(300);
    ESP.restart();
  }
  // Full factory reset — wipe every stored credential (fresh device).
  void _factoryReset() {
    Serial.println(F("[CV] FACTORY RESET — wiping all credentials"));
#if defined(ESP32)
    _prefs.clear();
#endif
    delay(300);
    ESP.restart();
  }
  bool _resetPressed() {
    if (_resetPin < 0) return false;
    int v = digitalRead(_resetPin);
    return _resetActiveLow ? (v == LOW) : (v == HIGH);
  }

  /**
   * Long-press handling: ~3s → Wi-Fi reset, ~8s → factory reset. Fires on release.
   *
   * WHY A PRESS MUST BE SEEN TO START
   *
   * This used to act on whatever the pin read from the first pass of loop(),
   * which meant a pin that was *already* low when the device booted counted as
   * a deliberate long press. Nobody can hold a button for a device that is not
   * running yet, so that reading was always wrong — and the consequences were
   * the two most destructive things this library can do.
   *
   * It matters most after a power cut, which is exactly when it is least
   * survivable. The reset line is GPIO0 on every one of our boards: a
   * strapping pin, usually on an RC network, often wired to an auto-reset
   * circuit. On a slow or dirty mains restore it can sit low for seconds while
   * the rail comes up. The device then wakes, reads a three-second press it
   * invented, erases the Wi-Fi credentials, and opens its setup hotspot — or
   * reads eight seconds and factory-resets, taking the relay states with it.
   *
   * From the outside that is: the power came back, and the device never
   * rejoined the network. Not "it could not reach the router" — it has nothing
   * left to reach it with, so it will still be sitting in AP mode hours later
   * when the router has long since recovered. Which is the fault as reported
   * from the field.
   *
   * So the button is armed only once it has been observed released. A real
   * press always begins with a release before it; a phantom one at boot never
   * does.
   */
  void _pollResetButton() {
    if (_resetPin < 0) return;

    if (!_resetArmed) {
      // Not yet seen released since boot. Ignore everything until it is.
      if (!_resetPressed()) {
        _resetArmed = true;
      } else if (!_resetBootWarned) {
        _resetBootWarned = true;
        Serial.println(F("[CV] Reset pin held at boot — ignoring until released. "
                         "A press cannot have started before the device did."));
      }
      return;
    }

    if (_resetPressed()) {
      if (_resetHoldStart == 0) _resetHoldStart = millis();
      uint32_t held = millis() - _resetHoldStart;
      // brief visual cue on the LED-less path via Serial; act on release below
      if (held > 8000 && !_resetLatched) { _resetLatched = true; }  // armed for factory
      return;
    }
    // released
    if (_resetHoldStart) {
      uint32_t held = millis() - _resetHoldStart;
      _resetHoldStart = 0; _resetLatched = false;
      /*
       * A press shorter than the debounce window is electrical noise, not a
       * finger. Without this a glitch on a long button cable could still reach
       * the three-second branch if it happened to straddle two polls.
       */
      if (held < CV_RESET_DEBOUNCE_MS) return;
      if (held >= 8000) _factoryReset();
      else if (held >= 3000) _clearWifi();
    }
  }

  String _portalPage() {
    String opts;
    int n = WiFi.scanNetworks();
    for (int i = 0; i < n && i < 20; i++)
      opts += "<option value='" + WiFi.SSID(i) + "'>" + WiFi.SSID(i) + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
    String p = F("<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
                 "<title>Circuvent Setup</title>"
                 "<style>body{font-family:system-ui;background:#0b1020;color:#e5e7eb;max-width:420px;margin:24px auto;padding:16px}"
                 "h1{font-size:20px}input,select,button{width:100%;padding:12px;margin:6px 0;border-radius:10px;border:1px solid #334155;background:#111827;color:#e5e7eb}"
                 "button{background:linear-gradient(135deg,#06b6d4,#8b5cf6);border:0;font-weight:600}</style>"
                 "<h1>Circuvent device setup</h1><p>Connect this device to your Wi-Fi.</p>"
                 "<form action='/save' method='POST'><label>Wi-Fi network</label><select name='ssid'>");
    p += opts;
    p += F("</select><label>Password</label><input name='pass' type='password' placeholder='Wi-Fi password'>"
           "<button type='submit'>Save &amp; connect</button></form>"
           "<p style='opacity:.6;font-size:12px'>Device ID: ");
    p += _id;
    p += F("</p>");
    return p;
  }
  // Nearby Wi-Fi networks the device can see (2.4 GHz only — that's all an ESP32
  // radio picks up), for the app's network picker. GET /scan on the portal.
  // Uses an ASYNC scan with a cached result so the HTTP response stays snappy
  // (a blocking WiFi.scanNetworks() can take 2-4s and stalls the web server).
  void _kickScan() {
#if defined(ESP32)
    if (_scanPending) return;
    WiFi.scanNetworks(true /*async*/, false /*show_hidden*/);
    _scanPending = true; _scanStartedAt = millis();
#endif
  }
  void _refreshScanCache() {
    int n = WiFi.scanComplete();
    if (n < 0) return;  // -1 running, -2 failed/idle
    JsonDocument d;
    JsonArray arr = d.to<JsonArray>();
    for (int i = 0; i < n && i < 30; i++) {
      String ss = WiFi.SSID(i);
      if (!ss.length()) continue;
      bool dup = false;
      for (JsonObject o : arr) {
        if (ss == (const char *)(o["ssid"] | "")) { dup = true; break; }
      }
      if (dup) continue;
      JsonObject o = arr.add<JsonObject>();
      o["ssid"] = ss;
      o["rssi"] = WiFi.RSSI(i);
#if defined(ESP32)
      o["lock"] = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
#else
      o["lock"] = (WiFi.encryptionType(i) != ENC_TYPE_NONE);
#endif
    }
    String s; serializeJson(d, s);
    _scanCache = s;
    WiFi.scanDelete();
    _scanPending = false;
  }
  String _scanJson() {
#if defined(ESP32)
    _refreshScanCache();                 // fold in a finished async scan, if any
    if (!_scanPending) _kickScan();      // keep a fresh scan warming for next time
    // First call before any scan finishes: fall back to one quick blocking scan
    // so the app isn't left with an empty list.
    if (_scanCache == "[]" && WiFi.scanComplete() == WIFI_SCAN_FAILED) {
      int n = WiFi.scanNetworks();
      JsonDocument d; JsonArray arr = d.to<JsonArray>();
      for (int i = 0; i < n && i < 30; i++) {
        String ss = WiFi.SSID(i);
        if (!ss.length()) continue;
        bool dup = false;
        for (JsonObject o : arr) { if (ss == (const char *)(o["ssid"] | "")) { dup = true; break; } }
        if (dup) continue;
        JsonObject o = arr.add<JsonObject>();
        o["ssid"] = ss; o["rssi"] = WiFi.RSSI(i);
        o["lock"] = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
      }
      WiFi.scanDelete();
      String s; serializeJson(d, s); _scanCache = s;
    }
    return _scanCache;
#else
    int n = WiFi.scanNetworks();
    JsonDocument d;
    JsonArray arr = d.to<JsonArray>();
    for (int i = 0; i < n && i < 30; i++) {
      String ss = WiFi.SSID(i);
      if (!ss.length()) continue;
      bool dup = false;
      for (JsonObject o : arr) {
        if (ss == (const char *)(o["ssid"] | "")) { dup = true; break; }
      }
      if (dup) continue;
      JsonObject o = arr.add<JsonObject>();
      o["ssid"] = ss;
      o["rssi"] = WiFi.RSSI(i);
      o["lock"] = (WiFi.encryptionType(i) != ENC_TYPE_NONE);
    }
    WiFi.scanDelete();
    String s; serializeJson(d, s); return s;
#endif
  }

  // Hardware/identity info for the app's setup flow (GET /info on the portal).
  String _infoJson() {
    JsonDocument d;
    d["hwid"] = _shortId();
    d["type"] = _type;
    d["id"] = _id;
    d["claimed"] = (!_isPlaceholder(_id.c_str()) && !_isPlaceholder(_key.c_str()));
    d["fw"] = CV_FW_VERSION;
    if (!_boxReady) { crypto_box_keypair(_boxPk, _boxSk); _boxReady = true; }
    d["pk"] = _b64(_boxPk, 32);
    String s; serializeJson(d, s); return s;
  }
  void _saveAll() {
#if defined(ESP32)
    _prefs.putString("ssid", _ssid);
    _prefs.putString("pass", _pass);
    if (_id.length()) _prefs.putString("id", _id);
    if (_key.length()) _prefs.putString("key", _key);
    _prefs.putString("broker", _brokerHost);
    _prefs.putString("token", _token);
#endif
  }
  static String _b64(const uint8_t *data, size_t len) {
    size_t olen = 0;
    unsigned char out[200];
    if (mbedtls_base64_encode(out, sizeof(out) - 1, &olen, data, len) != 0) return String();
    out[olen] = 0;
    return String((const char *)out);
  }
  static int _b64dec(const String &in, uint8_t *out, size_t outcap) {
    size_t olen = 0;
    if (mbedtls_base64_decode(out, outcap, &olen, (const unsigned char *)in.c_str(), in.length()) != 0) return -1;
    return (int)olen;
  }
  static String _urldec(const String &s) {
    String o;
    auto hx = [](char h) -> int { return h <= '9' ? h - '0' : (h | 0x20) - 'a' + 10; };
    for (size_t i = 0; i < s.length(); i++) {
      char c = s[i];
      if (c == '+') o += ' ';
      else if (c == '%' && i + 2 < s.length()) { o += (char)((hx(s[i + 1]) << 4) | hx(s[i + 2])); i += 2; }
      else o += c;
    }
    return o;
  }
  void _parseForm(const String &body) {
    int start = 0;
    while (start < (int)body.length()) {
      int amp = body.indexOf('&', start);
      if (amp < 0) amp = body.length();
      int eq = body.indexOf('=', start);
      if (eq > start && eq < amp) {
        String k = body.substring(start, eq);
        String v = _urldec(body.substring(eq + 1, amp));
        if (k == "ssid") _ssid = v;
        else if (k == "pass") _pass = v;
        else if (k == "token") _token = v;
        else if (k == "id" && v.length()) _id = v;
        else if (k == "key" && v.length()) _key = v;
        else if (k == "broker" && v.length()) _brokerHost = v;
      }
      start = amp + 1;
    }
  }
  // A: decrypt an app payload sealed to our box public key (NaCl crypto_box).
  bool _decryptSave() {
    uint8_t epk[32], nonce[24];
    if (_b64dec(_server.arg("epk"), epk, sizeof(epk)) != 32) return false;
    if (_b64dec(_server.arg("nonce"), nonce, sizeof(nonce)) != 24) return false;
    static uint8_t c[600], m[600];
    memset(c, 0, 16);
    int bl = _b64dec(_server.arg("box"), c + 16, sizeof(c) - 16);
    if (bl <= 16) return false;
    unsigned long long clen = 16 + (unsigned long long)bl;
    if (crypto_box_open(m, c, clen, nonce, epk, _boxSk) != 0) return false;
    int plen = (int)clen - 32;
    if (plen < 0) return false;
    String body;
    body.reserve(plen);
    for (int i = 0; i < plen; i++) body += (char)m[32 + i];
    _parseForm(body);
    return true;
  }
  void _portalSave() {
    bool ok = true;
    if (_server.hasArg("enc") && _server.hasArg("box")) {
      ok = _decryptSave();  // A: encrypted handoff
    } else {
      // Backward-compatible plaintext path.
      if (_server.hasArg("ssid")) _ssid = _server.arg("ssid");
      if (_server.hasArg("pass")) _pass = _server.arg("pass");
      if (_server.hasArg("id") && _server.arg("id").length()) _id = _server.arg("id");
      if (_server.hasArg("key") && _server.arg("key").length()) _key = _server.arg("key");
      if (_server.hasArg("token") && _server.arg("token").length()) _token = _server.arg("token");
      if (_server.hasArg("broker") && _server.arg("broker").length()) _brokerHost = _server.arg("broker");
    }
    _server.sendHeader("Access-Control-Allow-Origin", "*");
    if (!ok) { _server.send(200, "application/json", "{\"ok\":false,\"error\":\"decrypt\"}"); return; }
    _saveAll();
    _server.send(200, "application/json", "{\"ok\":true}");
    delay(600);
    ESP.restart();
  }
};

// MQTT callback trampoline -> the singleton device instance.
static void _cvOnMqttMessage(char *topic, uint8_t *payload, unsigned int len) {
  (void)topic;
  if (_cvInstance) _cvInstance->_dispatch(payload, len);
}
