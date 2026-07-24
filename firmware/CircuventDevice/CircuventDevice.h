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
  bool claimed() const { return _mqttUp; }
  bool online() const { return WiFi.status() == WL_CONNECTED && _mqttUp; }
  const char *firmwareVersion() const { return CV_FW_VERSION; }

  // ---- state setters (published to cv/<id>/state) -----------------------
  void set(const char *k, bool v) { _state[k] = v; }
  void set(const char *k, int v) { _state[k] = v; }
  void set(const char *k, long v) { _state[k] = v; }
  void set(const char *k, float v) { _state[k] = v; }
  void set(const char *k, const char *v) { _state[k] = v; }

  // ---- telemetry (one-off reading to cv/<id>/telemetry) -----------------
  void publishTelemetry(JsonObjectConst obj) {
    if (!_mqttUp) return;
    String s; serializeJson(obj, s);
    _mqtt.publish(_topic("telemetry").c_str(), s.c_str(), false);
  }

  // ---- lifecycle --------------------------------------------------------
  void begin(const char *ssid = nullptr, const char *pass = nullptr) {
    _cvInstance = this;
    _prefsBegin();
    _loadCreds();

    if (ssid && strlen(ssid) && !_isPlaceholder(ssid)) { _ssid = ssid; _pass = pass ? pass : ""; _saveWifi(); }

    bool haveWifi = _ssid.length() > 0;
    bool haveIdentity = !_isPlaceholder(_id.c_str()) && !_isPlaceholder(_key.c_str());

    WiFi.mode(WIFI_STA);
    WiFi.persistent(false);
    if (haveWifi) _connect();

    // B: if online but not yet provisioned, redeem the provisioning token over
    // TLS to fetch our id+key from the control plane — the permanent secret is
    // delivered cloud->device only, never carried on the local setup link.
    if (WiFi.status() == WL_CONNECTED && !haveIdentity && _token.length()) {
      if (_selfProvision()) haveIdentity = true;
    }

    // No Wi-Fi, or still not provisioned -> open the setup portal so the app
    // can push (encrypted) Wi-Fi + a provisioning token.
    if ((WiFi.status() != WL_CONNECTED || !haveIdentity) && _provisioningEnabled) { startPortal(); return; }

    _ntpSync();      // TLS cert validity needs a real clock
    _tlsSetup();
    _mqtt.setServer(_brokerHost.c_str(), _brokerPort);
    _mqtt.setCallback(_cvOnMqttMessage);
    _mqtt.setBufferSize(2048);
    _mqtt.setKeepAlive(45);
  }

  // Call from loop(). Manages Wi-Fi, MQTT (re)connect, state publishing, OTA.
  void loop() {
    if (_portalActive) { _portalLoop(); return; }

    if (WiFi.status() != WL_CONNECTED) {
      _mqttUp = false;
      uint32_t backoff = _reconnectBackoff();
      if (millis() - _lastReconnect > backoff) { _lastReconnect = millis(); WiFi.reconnect(); _reconnectTries++; }
      return;
    }
    _reconnectTries = 0;

    if (!_mqtt.connected()) { _mqttUp = false; _mqttReconnect(); }
    else { _mqtt.loop(); _mqttUp = true; }

    uint32_t now = millis();
    if (_otaInterval && (_lastOta == 0 || now - _lastOta > _otaInterval)) { _lastOta = now; checkOTA(); }
    if (_mqttUp && (now - _lastPub >= _interval)) { _lastPub = now; publishState(); }
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
  void _dispatch(uint8_t *payload, unsigned int len) {
    JsonDocument doc;
    if (deserializeJson(doc, payload, len) != DeserializationError::Ok) return;
    String action = doc["action"] | "";
    if (_handler && action.length()) _handler(action, doc.as<JsonObjectConst>());
  }

  // ---- OTA (optional; GET {api}/api/devices/firmware) -------------------
  bool checkOTA() {
    if (WiFi.status() != WL_CONNECTED) return false;
    WiFiClientSecure client;
#if defined(ESP32)
    client.setCACert(LETSENCRYPT_ROOT_CA);  // pin Let's Encrypt for the OTA-metadata call
#else
    client.setInsecure();  // OTA metadata fetch from the public website cert
#endif
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
    WiFiClientSecure otaClient; otaClient.setInsecure();
#if defined(ESP32)
    httpUpdate.rebootOnUpdate(true);
    httpUpdate.update(otaClient, binUrl);
#elif defined(ESP8266)
    ESPhttpUpdate.rebootOnUpdate(true);
    ESPhttpUpdate.update(otaClient, binUrl);
#endif
    return true;
  }

  // ---- Wi-Fi provisioning portal ---------------------------------------
  void startPortal() {
    _portalActive = true;
    if (!_boxReady) { crypto_box_keypair(_boxPk, _boxSk); _boxReady = true; }
    String ap = "Circuvent-Setup-" + _shortId();
    WiFi.mode(WIFI_AP);
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
    _server.onNotFound([this]() { _server.send(200, "text/html", _portalPage()); });
    _server.begin();
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
  uint32_t _otaInterval = 0, _lastOta = 0;
  uint32_t _lastMqttTry = 0;
  uint16_t _reconnectTries = 0, _mqttFails = 0;
  bool _mqttUp = false, _provisioningEnabled = true, _portalActive = false;
  JsonDocument _state;
  uint8_t _boxPk[32], _boxSk[32];
  bool _boxReady = false;
  String _token;

  String _topic(const char *leaf) { return String("cv/") + _id + "/" + leaf; }

  // B: redeem the provisioning token at the control plane over TLS and receive
  // this device's id+key. The secret is created server-side and delivered only
  // over this TLS response — it is never present on the local setup link.
  bool _selfProvision() {
    if (_token.length() == 0) return false;
    _ntpSync();  // TLS needs a valid clock
    WiFiClientSecure client;
#if defined(ESP32)
    client.setCACert(LETSENCRYPT_ROOT_CA);  // authenticate the control plane, not just encrypt
#else
    client.setInsecure();  // ESP8266: LE-root pinning needs a large BearSSL buffer
#endif
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

  void _connect() {
    WiFi.begin(_ssid.c_str(), _pass.c_str());
    Serial.print(F("[CV] WiFi"));
    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) { delay(400); Serial.print('.'); }
    Serial.printf("\n[CV] %s\n", WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "offline");
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
  void _portalLoop() { _dns.processNextRequest(); _server.handleClient(); }
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
  String _scanJson() {
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
#if defined(ESP32)
      o["lock"] = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
#else
      o["lock"] = (WiFi.encryptionType(i) != ENC_TYPE_NONE);
#endif
    }
    WiFi.scanDelete();
    String s; serializeJson(d, s); return s;
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
