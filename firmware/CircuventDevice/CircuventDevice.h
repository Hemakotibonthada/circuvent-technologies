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

    const bool haveWifi = _ssid.length() > 0;
    const bool haveIdentity = !_isPlaceholder(_id.c_str()) && !_isPlaceholder(_key.c_str());

    WiFi.mode(WIFI_STA);
    WiFi.persistent(false);
    if (haveWifi && haveIdentity) _connect();

    // No Wi-Fi, or not yet provisioned with an id/key -> open the setup portal
    // so the Circuvent app (or a browser) can push Wi-Fi + the assigned identity.
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
    client.setInsecure();  // OTA fetch from the public website cert
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
    String ap = "Circuvent-Setup-" + _shortId();
    WiFi.mode(WIFI_AP);
    WiFi.softAP(ap.c_str());
    _dns.start(53, "*", WiFi.softAPIP());
    _server.on("/", [this]() { _server.send(200, "text/html", _portalPage()); });
    _server.on("/info", [this]() {
      _server.sendHeader("Access-Control-Allow-Origin", "*");
      _server.send(200, "application/json", _infoJson());
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

  String _topic(const char *leaf) { return String("cv/") + _id + "/" + leaf; }

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
  // Hardware/identity info for the app's setup flow (GET /info on the portal).
  String _infoJson() {
    JsonDocument d;
    d["hwid"] = _shortId();
    d["type"] = _type;
    d["id"] = _id;
    d["claimed"] = (!_isPlaceholder(_id.c_str()) && !_isPlaceholder(_key.c_str()));
    d["fw"] = CV_FW_VERSION;
    String s; serializeJson(d, s); return s;
  }
  void _saveAll() {
#if defined(ESP32)
    _prefs.putString("ssid", _ssid);
    _prefs.putString("pass", _pass);
    if (_id.length()) _prefs.putString("id", _id);
    if (_key.length()) _prefs.putString("key", _key);
    _prefs.putString("broker", _brokerHost);
#endif
  }
  void _portalSave() {
    if (_server.hasArg("ssid")) _ssid = _server.arg("ssid");
    if (_server.hasArg("pass")) _pass = _server.arg("pass");
    // The app pushes the provisioned identity alongside Wi-Fi.
    if (_server.hasArg("id") && _server.arg("id").length()) _id = _server.arg("id");
    if (_server.hasArg("key") && _server.arg("key").length()) _key = _server.arg("key");
    if (_server.hasArg("broker") && _server.arg("broker").length()) _brokerHost = _server.arg("broker");
    _saveAll();
    _server.sendHeader("Access-Control-Allow-Origin", "*");
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
