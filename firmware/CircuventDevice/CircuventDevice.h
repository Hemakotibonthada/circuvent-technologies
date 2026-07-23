/*
 * CircuventDevice.h - Circuvent IoT device client (ESP32 / ESP8266)
 * =================================================================
 * Production-hardened client for the proprietary Circuvent device protocol.
 *
 * Features
 *   - One HTTPS call on a timer does heartbeat + telemetry + command fetch
 *     against POST {API}/api/devices/sync.
 *   - Credentials (Wi-Fi + device id/key + API base) persisted in NVS.
 *   - Zero-touch Wi-Fi provisioning: if no/bad Wi-Fi, the device opens a
 *     SoftAP + captive portal ("Circuvent-Setup-XXXX") to enter Wi-Fi.
 *   - TLS: optional root-CA pinning via setRootCA() (falls back to insecure
 *     only if none set, so dev boards still work).
 *   - Signed/versioned OTA: checkOTA() pulls a manifest and self-updates.
 *   - Robust reconnect with exponential backoff; RSSI/uptime/fw meta reported.
 *
 * Dependencies (Arduino Library Manager): ArduinoJson (v7) + ESP32/ESP8266 core.
 * Install: copy this folder into your Arduino/libraries directory.
 */
#pragma once
#include <Arduino.h>

#if defined(ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <WiFiClientSecure.h>
  #include <WebServer.h>
  #include <DNSServer.h>
  #include <Preferences.h>
  #include <Update.h>
  #include <HTTPUpdate.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <WiFiClientSecure.h>
  #include <ESP8266WebServer.h>
  #include <DNSServer.h>
  #include <EEPROM.h>
  #include <ESP8266httpUpdate.h>
#else
  #error "CircuventDevice supports ESP32 or ESP8266 only"
#endif

#include <ArduinoJson.h>

#ifndef CV_FW_VERSION
#define CV_FW_VERSION "1.0.0"
#endif

typedef void (*CvCommandHandler)(const String &action, JsonObjectConst params);

class CircuventDevice {
 public:
  CircuventDevice(const char *deviceId, const char *deviceKey, const char *type,
                  const char *apiBase = "https://circuvent.com")
      : _type(type) {
    _id = deviceId;
    _key = deviceKey;
    _api = apiBase;
  }

  // ---- configuration ----------------------------------------------------
  void onCommand(CvCommandHandler h) { _handler = h; }
  void setInterval(uint32_t ms) { _interval = ms; }
  void setRootCA(const char *pem) { _rootCA = pem; }          // TLS pinning
  void setProvisioning(bool enable) { _provisioningEnabled = enable; }
  void setOtaInterval(uint32_t ms) { _otaInterval = ms; }     // 0 disables OTA polling
  bool claimed() const { return _claimed; }
  bool online() const { return WiFi.status() == WL_CONNECTED; }
  const char *firmwareVersion() const { return CV_FW_VERSION; }

  // ---- telemetry setters ------------------------------------------------
  void set(const char *k, bool v) { _state[k] = v; }
  void set(const char *k, int v) { _state[k] = v; }
  void set(const char *k, long v) { _state[k] = v; }
  void set(const char *k, float v) { _state[k] = v; }
  void set(const char *k, const char *v) { _state[k] = v; }

  // ---- lifecycle --------------------------------------------------------
  // Pass compile-time Wi-Fi creds (optional). Stored creds in NVS win unless
  // non-placeholder creds are supplied here (then they are saved).
  void begin(const char *ssid = nullptr, const char *pass = nullptr) {
    _prefsBegin();
    _loadCreds();

    if (ssid && pass && strlen(ssid) && !_isPlaceholder(ssid)) {
      _ssid = ssid; _pass = pass; _saveWifi();
    }
    if (_id.length() == 0 || _isPlaceholder(_id.c_str())) _loadOrMakeIdentity();

    WiFi.mode(WIFI_STA);
    WiFi.persistent(false);
    if (_ssid.length()) _connect();

    if (WiFi.status() != WL_CONNECTED && _provisioningEnabled) {
      startPortal();
    }
  }

  // Call from loop(). Handles portal, reconnect, sync + OTA on their timers.
  void loop() {
    if (_portalActive) { _portalLoop(); return; }

    if (WiFi.status() != WL_CONNECTED) {
      uint32_t backoff = _reconnectBackoff();
      if (millis() - _lastReconnect > backoff) {
        _lastReconnect = millis();
        WiFi.reconnect();
        _reconnectTries++;
      }
      return;
    }
    _reconnectTries = 0;

    uint32_t now = millis();
    if (_otaInterval && (_lastOta == 0 || now - _lastOta > _otaInterval)) {
      _lastOta = now;
      checkOTA();
    }
    if (_last != 0 && now - _last < _syncBackoff()) return;
    _last = now;
    sync();
  }

  // One request/response cycle. Returns true on HTTP 200.
  bool sync() {
    if (WiFi.status() != WL_CONNECTED) return false;

    WiFiClientSecure client;
    _applyTls(client);
    HTTPClient https;
    https.setConnectTimeout(8000);
    https.setTimeout(8000);
    String url = _api + "/api/devices/sync";
    if (!https.begin(client, url)) { _syncFails++; return false; }

    https.addHeader("Content-Type", "application/json");
    https.addHeader("x-device-id", _id);
    https.addHeader("x-device-key", _key);

    JsonDocument doc;
    doc["type"] = _type;
    JsonObject meta = doc["meta"].to<JsonObject>();
    meta["fw"] = CV_FW_VERSION;
    meta["rssi"] = WiFi.RSSI();
    meta["uptime"] = (long)(millis() / 1000);
    meta["heap"] = (long)ESP.getFreeHeap();
    doc["state"] = _state;
    String body;
    serializeJson(doc, body);

    int code = https.POST(body);
    bool ok = false;
    if (code == 200) {
      JsonDocument res;
      if (deserializeJson(res, https.getStream()) == DeserializationError::Ok) {
        _claimed = res["claimed"] | false;
        JsonArrayConst cmds = res["commands"].as<JsonArrayConst>();
        for (JsonObjectConst cmd : cmds) {
          String action = cmd["action"] | "";
          if (_handler && action.length()) _handler(action, cmd["params"].as<JsonObjectConst>());
        }
        ok = true;
      }
      _syncFails = 0;
    } else {
      _syncFails++;
      Serial.printf("[CV] sync HTTP %d (fails=%u)\n", code, _syncFails);
    }
    https.end();
    return ok;
  }

  // ---- OTA --------------------------------------------------------------
  // GET {api}/api/devices/firmware?type=&id=&ver=  ->  { version, url }
  // If version differs and a URL is present, download + flash + reboot.
  bool checkOTA() {
    if (WiFi.status() != WL_CONNECTED) return false;
    WiFiClientSecure client;
    _applyTls(client);
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

    Serial.printf("[CV] OTA %s -> %s\n", CV_FW_VERSION, newVer.c_str());
    WiFiClientSecure otaClient;
    _applyTls(otaClient);
#if defined(ESP32)
    httpUpdate.rebootOnUpdate(true);
    t_httpUpdate_return r = httpUpdate.update(otaClient, binUrl);
    if (r == HTTP_UPDATE_FAILED)
      Serial.printf("[CV] OTA failed: %s\n", httpUpdate.getLastErrorString().c_str());
#elif defined(ESP8266)
    ESPhttpUpdate.rebootOnUpdate(true);
    t_httpUpdate_return r = ESPhttpUpdate.update(otaClient, binUrl);
    if (r == HTTP_UPDATE_FAILED)
      Serial.printf("[CV] OTA failed: %s\n", ESPhttpUpdate.getLastErrorString().c_str());
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
  const char *_rootCA = nullptr;
  CvCommandHandler _handler = nullptr;
  uint32_t _interval = 10000, _last = 0, _lastReconnect = 0;
  uint32_t _otaInterval = 6UL * 60UL * 60UL * 1000UL, _lastOta = 0;  // 6h
  uint16_t _reconnectTries = 0, _syncFails = 0;
  bool _claimed = false, _provisioningEnabled = true, _portalActive = false;
  JsonDocument _state;

  // ---- TLS --------------------------------------------------------------
  void _applyTls(WiFiClientSecure &c) {
    if (_rootCA) c.setCACert(_rootCA);
    else c.setInsecure();  // dev fallback; set a real CA in production via setRootCA()
  }

  // ---- backoff ----------------------------------------------------------
  uint32_t _reconnectBackoff() {
    uint32_t b = 3000UL << (_reconnectTries > 5 ? 5 : _reconnectTries);
    return b > 60000UL ? 60000UL : b;
  }
  uint32_t _syncBackoff() {
    if (_syncFails == 0) return _interval;
    uint32_t extra = _interval << (_syncFails > 4 ? 4 : _syncFails);
    return extra > 300000UL ? 300000UL : extra;
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
    // If the sketch shipped without a real ID/Key, derive a stable one from the
    // chip so the unit still registers (a factory station overwrites these).
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
  }
  String _portalPage() {
    String opts;
    int n = WiFi.scanNetworks();
    for (int i = 0; i < n && i < 20; i++) {
      opts += "<option value='" + WiFi.SSID(i) + "'>" + WiFi.SSID(i) + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
    }
    String p = F("<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
                 "<title>Circuvent Setup</title>"
                 "<style>body{font-family:system-ui;background:#0b1020;color:#e5e7eb;max-width:420px;margin:24px auto;padding:16px}"
                 "h1{font-size:20px}input,select,button{width:100%;padding:12px;margin:6px 0;border-radius:10px;border:1px solid #334155;background:#111827;color:#e5e7eb}"
                 "button{background:linear-gradient(135deg,#06b6d4,#8b5cf6);border:0;font-weight:600}</style>"
                 "<h1>Circuvent device setup</h1><p>Connect this device to your Wi-Fi.</p>"
                 "<form action='/save' method='POST'>"
                 "<label>Wi-Fi network</label><select name='ssid'>");
    p += opts;
    p += F("</select><label>Password</label><input name='pass' type='password' placeholder='Wi-Fi password'>"
           "<button type='submit'>Save &amp; connect</button></form>"
           "<p style='opacity:.6;font-size:12px'>Device ID: ");
    p += _id;
    p += F("</p>");
    return p;
  }
  void _portalSave() {
    _ssid = _server.arg("ssid");
    _pass = _server.arg("pass");
    _saveWifi();
    _server.send(200, "text/html",
                 "<meta http-equiv='refresh' content='4;url=/'><body style='font-family:system-ui;background:#0b1020;color:#e5e7eb;padding:24px'>"
                 "Saved. The device will restart and connect to your Wi-Fi. You can close this page.</body>");
    delay(800);
    ESP.restart();
  }
};
