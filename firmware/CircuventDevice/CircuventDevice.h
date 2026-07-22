/*
 * CircuventDevice.h — Circuvent IoT device client (ESP32 / ESP8266)
 * ------------------------------------------------------------------
 * A tiny, dependency-light client for the proprietary Circuvent device
 * protocol. One HTTPS call on a timer does heartbeat + telemetry + command
 * fetch against POST {API}/api/devices/sync.
 *
 * Dependencies (install via Arduino Library Manager):
 *   - ArduinoJson (v7)          by Benoit Blanchon
 *   - (ESP32 or ESP8266 core)   by Espressif
 *
 * Install: copy this folder (CircuventDevice) into your Arduino/libraries
 * directory, then `#include <CircuventDevice.h>` from any sketch.
 */
#pragma once
#include <Arduino.h>

#if defined(ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <WiFiClientSecure.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <WiFiClientSecure.h>
#else
  #error "CircuventDevice supports ESP32 or ESP8266 only"
#endif

#include <ArduinoJson.h>

typedef void (*CvCommandHandler)(const String &action, JsonObjectConst params);

class CircuventDevice {
 public:
  CircuventDevice(const char *deviceId, const char *deviceKey, const char *type,
                  const char *apiBase = "https://circuvent.com")
      : _id(deviceId), _key(deviceKey), _type(type), _api(apiBase) {}

  void begin(const char *ssid, const char *pass) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, pass);
    Serial.print(F("[CV] Connecting WiFi"));
    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 30000) {
      delay(400);
      Serial.print('.');
    }
    Serial.printf("\n[CV] %s | id=%s\n",
                  WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "offline",
                  _id);
  }

  void onCommand(CvCommandHandler h) { _handler = h; }
  void setInterval(uint32_t ms) { _interval = ms; }
  bool claimed() const { return _claimed; }

  // --- telemetry setters -------------------------------------------------
  void set(const char *k, bool v) { _state[k] = v; }
  void set(const char *k, int v) { _state[k] = v; }
  void set(const char *k, float v) { _state[k] = v; }
  void set(const char *k, const char *v) { _state[k] = v; }

  // Call from loop(); syncs on the configured interval (and reconnects WiFi).
  void loop() {
    if (WiFi.status() != WL_CONNECTED) {
      if (millis() - _lastReconnect > 5000) {
        _lastReconnect = millis();
        WiFi.reconnect();
      }
      return;
    }
    uint32_t now = millis();
    if (_last != 0 && now - _last < _interval) return;
    _last = now;
    sync();
  }

  // One request/response cycle. Returns true on HTTP 200.
  bool sync() {
    if (WiFi.status() != WL_CONNECTED) return false;

    WiFiClientSecure client;
    client.setInsecure();  // TODO: pin the Circuvent CA fingerprint in production
    HTTPClient https;
    String url = String(_api) + "/api/devices/sync";
    if (!https.begin(client, url)) return false;

    https.addHeader("Content-Type", "application/json");
    https.addHeader("x-device-id", _id);
    https.addHeader("x-device-key", _key);

    JsonDocument doc;
    doc["type"] = _type;
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
    } else {
      Serial.printf("[CV] sync HTTP %d\n", code);
    }
    https.end();
    return ok;
  }

 private:
  const char *_id;
  const char *_key;
  const char *_type;
  const char *_api;
  CvCommandHandler _handler = nullptr;
  uint32_t _interval = 10000, _last = 0, _lastReconnect = 0;
  bool _claimed = false;
  JsonDocument _state;
};
