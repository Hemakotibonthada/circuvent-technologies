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

/*
 * Lowest duty that still emits visible light rather than nothing.
 *
 * A linear map sent brightness 1 to duty 2, which on most LED drivers is below
 * the forward-voltage knee: the lamp goes dark and the user concludes the
 * bottom of the slider is broken.
 */
#define MIN_LED_DUTY 3

/*
 * Perceived brightness is not duty cycle.
 *
 * The eye's response is roughly a power law, so a linear percent-to-duty map
 * spends most of the slider's travel in a range that all looks the same:
 * 50% appears far brighter than half, and the bottom third does almost
 * nothing. Applying a gamma of about 2.2 makes equal movements of the slider
 * look like equal changes in brightness, which is the whole point of a dimmer.
 *
 * The wire format is unchanged — still 0..100 — so nothing else has to know.
 */
int pctToDuty(int pct) {
  pct = constrain(pct, 0, 100);
  if (pct <= 0) return 0;
  float f = (float)pct / 100.0f;
  int duty = (int)(powf(f, 2.2f) * 255.0f + 0.5f);
  return constrain(duty, MIN_LED_DUTY, 255);
}

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
  digitalWrite(RELAY_PIN, power ? HIGH : LOW);
  ledcWrite(WHITE_CH, whiteDuty);
  /* The colour channels scale by the same gamma-corrected duty as white.
     Scaling them linearly by percent while white was corrected made a dimmed
     colour drift — the RGB mix fell away faster than the white channel, so
     warm white turned blue-grey on the way down. */
  ledcWrite(RED_CH, (int)r * whiteDuty / 255);
  ledcWrite(GREEN_CH, (int)g * whiteDuty / 255);
  ledcWrite(BLUE_CH, (int)b * whiteDuty / 255);
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