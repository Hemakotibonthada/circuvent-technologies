/*
 * Circuvent Smart Light — ESP32 firmware
 * Relay/MOSFET power + white PWM brightness + optional RGB PWM channels.
 * Deps: CircuventDevice, ArduinoJson. Board: ESP32.
 */
/* Version history
 *   1.1.0  first build that survives a power cut with the router still down —
 *          see tests/firmware-power-restore.test.ts. Declared explicitly so the
 *          fleet can tell fixed devices from unfixed ones; without it every
 *          sketch reported the library default and they were indistinguishable.
 *   1.2.0  The local button no longer fights the reset gesture. BTN_PIN is
 *          GPIO0, which is also the pin `setResetButton(0)` watches, and the
 *          test here was level-triggered with a 400 ms rate limit — so it was
 *          not "on press" but "every 400 ms while held". Holding BOOT for three
 *          seconds to change the Wi-Fi strobed the lamp seven times and left it
 *          wherever the timing landed; eight seconds for a factory reset did it
 *          twenty times, committing `power` to NVS on each one. It also acted
 *          on a pin that was already low at boot, which after a power cut is
 *          not a press at all. Now a tap, via CvTapButton.
 *
 *          Setting a brightness on a lamp that is off turns it on, the way
 *          setting a speed on a stopped fan does. It did not, so the slider
 *          moved, the command was confirmed, the stored brightness changed and
 *          the room stayed dark.
 */
#define CV_FW_VERSION "1.2.0"
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
CvTapButton btn;

bool power = false, savedPower = false;
int brightness = 100, savedBrightness = 100;
String color = "#FFFFFF", savedColor = "#FFFFFF";

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
  cvRelayWrite(RELAY_PIN, power);
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
  if (p["brightness"].is<int>()) {
    brightness = constrain(p["brightness"].as<int>(), 0, 100);
    /*
     * A brightness is a statement about a lamp that is meant to be lit.
     *
     * Without this, dragging the slider on a light that is off changed the
     * stored brightness, published it, and satisfied the console's projection
     * — so the command confirmed, the slider stayed where it was put, and the
     * room stayed dark until the user found the separate power switch. The fan
     * has had the equivalent rule for exactly this reason; the light was
     * simply missed.
     *
     * Zero means off, and an explicit `power` in the same command still wins,
     * so "set brightness 40 but leave it off" remains expressible.
     */
    if (brightness == 0) power = false;
    else if (!p["power"].is<bool>()) power = true;
  }
  if (p["color"].is<const char *>()) {
    uint8_t r, g, b;
    parseHexColor(String(p["color"].as<const char *>()), r, g, b);
  }
  applyLight();
}

void setup() {
  Serial.begin(115200);
  cvRelayInit(RELAY_PIN);
  btn.begin(BTN_PIN);
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
  /* A tap toggles; a long hold belongs to the reset gesture the library is
     already timing on this same pin. */
  if (btn.tapped()) { power = !power; applyLight(); }
  cv.loop();
}