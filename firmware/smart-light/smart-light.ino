/*
 * Circuvent Smart Light — ESP32 firmware
 * Relay/MOSFET power + white PWM brightness + optional RGB PWM channels.
 * Deps: CircuventDevice, ArduinoJson. Board: ESP32.
 */
#include <CircuventDevice.h>
#include <Preferences.h>

#define RELAY_PIN 26
#define WHITE_PWM_PIN 25
#define RGB_R_PIN 32
#define RGB_G_PIN 33
#define RGB_B_PIN 27
#define BTN_PIN 0

#define WHITE_CH 0
#define RED_CH 1
#define GREEN_CH 2
#define BLUE_CH 3
#define PWM_FREQ 5000
#define PWM_BITS 8

CircuventDevice cv("smart-light");
Preferences store;

bool power = false, savedPower = false;
int brightness = 100, savedBrightness = 100;
String color = "#FFFFFF", savedColor = "#FFFFFF";
unsigned long lastBtn = 0;

int pctToDuty(int pct) { return map(constrain(pct, 0, 100), 0, 100, 0, 255); }

bool parseHexColor(const String &value, uint8_t &r, uint8_t &g, uint8_t &b) {
  String s = value;
  s.trim();
  if (s.startsWith("#")) s.remove(0, 1);
  if (s.length() != 6) return false;
  char *end = nullptr;
  unsigned long rgb = strtoul(s.c_str(), &end, 16);
  if (end == s.c_str() || *end != '\0') return false;
  r = (rgb >> 16) & 0xFF;
  g = (rgb >> 8) & 0xFF;
  b = rgb & 0xFF;
  color = "#" + s;
  color.toUpperCase();
  return true;
}

void saveState() {
  if (power != savedPower) { store.putBool("power", power); savedPower = power; }
  if (brightness != savedBrightness) { store.putInt("bright", brightness); savedBrightness = brightness; }
  if (color != savedColor) { store.putString("color", color); savedColor = color; }
}

void applyLight() {
  uint8_t r = 255, g = 255, b = 255;
  parseHexColor(color, r, g, b);
  int whiteDuty = power ? pctToDuty(brightness) : 0;
  int scale = power ? brightness : 0;
  digitalWrite(RELAY_PIN, power ? HIGH : LOW);
  ledcWrite(WHITE_CH, whiteDuty);
  ledcWrite(RED_CH, (int)r * scale / 100);
  ledcWrite(GREEN_CH, (int)g * scale / 100);
  ledcWrite(BLUE_CH, (int)b * scale / 100);
  saveState();
  cv.set("power", power);
  cv.set("brightness", brightness);
  cv.set("color", color.c_str());
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action != "set") return;
  if (p["power"].is<bool>()) power = p["power"].as<bool>();
  if (p["brightness"].is<int>()) brightness = constrain(p["brightness"].as<int>(), 0, 100);
  if (p["color"].is<const char *>()) {
    uint8_t r, g, b;
    parseHexColor(String(p["color"].as<const char *>()), r, g, b);
  }
  applyLight();
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(BTN_PIN, INPUT_PULLUP);
  ledcSetup(WHITE_CH, PWM_FREQ, PWM_BITS); ledcAttachPin(WHITE_PWM_PIN, WHITE_CH);
  ledcSetup(RED_CH, PWM_FREQ, PWM_BITS); ledcAttachPin(RGB_R_PIN, RED_CH);
  ledcSetup(GREEN_CH, PWM_FREQ, PWM_BITS); ledcAttachPin(RGB_G_PIN, GREEN_CH);
  ledcSetup(BLUE_CH, PWM_FREQ, PWM_BITS); ledcAttachPin(RGB_B_PIN, BLUE_CH);

  store.begin("light", false);
  power = store.getBool("power", false);
  brightness = constrain(store.getInt("bright", 100), 0, 100);
  color = store.getString("color", "#FFFFFF");
  savedPower = power; savedBrightness = brightness; savedColor = color;
  applyLight();

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
}

void loop() {
  if (digitalRead(BTN_PIN) == LOW && millis() - lastBtn > 400) {
    lastBtn = millis(); power = !power; applyLight();
  }
  cv.loop();
}