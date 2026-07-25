/*
 * Circuvent Smart Fan — ESP32 firmware
 * Relay power + PWM speed steps with local button and Circuvent cloud control.
 * Deps: CircuventDevice, ArduinoJson. Board: ESP32.
 */
#include <CircuventDevice.h>
#include <Preferences.h>

#define FAN_RELAY 26
#define SPEED_PWM_PIN 25
#define BTN_PIN 0
#define SPEED_CH 0
#define PWM_FREQ 25000
#define PWM_BITS 8

CircuventDevice cv("smart-fan");
Preferences store;

bool power = false, savedPower = false;
int speed = 1, savedSpeed = 1;
unsigned long lastBtn = 0;
const uint8_t SPEED_DUTY[4] = {0, 85, 170, 255};

void saveState() {
  if (power != savedPower) { store.putBool("power", power); savedPower = power; }
  if (speed != savedSpeed) { store.putInt("speed", speed); savedSpeed = speed; }
}

void applyFan() {
  speed = constrain(speed, 0, 3);
  digitalWrite(FAN_RELAY, power ? HIGH : LOW);
  ledcWrite(SPEED_CH, power ? SPEED_DUTY[speed] : 0);
  saveState();
  cv.set("power", power);
  cv.set("speed", speed);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action != "set") return;
  if (p["power"].is<bool>()) power = p["power"].as<bool>();
  if (p["speed"].is<int>()) {
    speed = constrain(p["speed"].as<int>(), 0, 3);
    if (speed == 0) power = false;
    else if (!p["power"].is<bool>()) power = true;
  }
  applyFan();
}

void setup() {
  Serial.begin(115200);
  pinMode(FAN_RELAY, OUTPUT);
  pinMode(BTN_PIN, INPUT_PULLUP);
  ledcSetup(SPEED_CH, PWM_FREQ, PWM_BITS);
  ledcAttachPin(SPEED_PWM_PIN, SPEED_CH);

  store.begin("fan", false);
  power = store.getBool("power", false);
  speed = constrain(store.getInt("speed", 1), 0, 3);
  savedPower = power; savedSpeed = speed;
  applyFan();

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
}

void loop() {
  if (digitalRead(BTN_PIN) == LOW && millis() - lastBtn > 400) {
    lastBtn = millis();
    if (!power) { power = true; if (speed == 0) speed = 1; }
    else if (speed < 3) speed++;
    else { power = false; speed = 0; }
    applyFan();
  }
  cv.loop();
}