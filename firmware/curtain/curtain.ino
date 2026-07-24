/*
 * Circuvent Curtain — ESP32 firmware
 * Open/close motor driver with timed position tracking, local buttons and cloud control.
 * Deps: CircuventDevice, ArduinoJson. Board: ESP32.
 */
#include <CircuventDevice.h>
#include <Preferences.h>

#define MOTOR_OPEN_PIN 26
#define MOTOR_CLOSE_PIN 27
#define BTN_OPEN 32
#define BTN_CLOSE 33
#define BTN_STOP 0
#define TRAVEL_TIME_MS 20000UL

CircuventDevice cv("curtain");
Preferences store;

int position = 0, targetPosition = 0, savedPosition = 0;
int moving = 0;  // 1=open, -1=close, 0=stopped
int moveFrom = 0;
unsigned long moveStart = 0, lastBtn = 0;

void savePosition() {
  if (position != savedPosition) {
    store.putInt("pos", position);
    savedPosition = position;
  }
}

void publishState() {
  cv.set("position", position);
  cv.set("moving", moving);
}

void driveMotor(int dir) {
  moving = dir;
  digitalWrite(MOTOR_OPEN_PIN, dir > 0 ? HIGH : LOW);
  digitalWrite(MOTOR_CLOSE_PIN, dir < 0 ? HIGH : LOW);
  publishState();
}

void updateMotion() {
  if (moving == 0) return;
  unsigned long elapsed = millis() - moveStart;
  int travel = abs(targetPosition - moveFrom);
  int delta = (int)((elapsed * 100UL) / TRAVEL_TIME_MS);
  if (delta > travel) delta = travel;
  position = moving > 0 ? moveFrom + delta : moveFrom - delta;
  position = constrain(position, 0, 100);
  if (elapsed >= (unsigned long)travel * TRAVEL_TIME_MS / 100UL) {
    position = targetPosition;
    driveMotor(0);
    savePosition();
  }
}

void stopCurtain() {
  updateMotion();
  driveMotor(0);
  savePosition();
}

void moveTo(int target) {
  target = constrain(target, 0, 100);
  updateMotion();
  targetPosition = target;
  if (targetPosition == position) { stopCurtain(); return; }
  moveFrom = position;
  moveStart = millis();
  driveMotor(targetPosition > position ? 1 : -1);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set" && p["position"].is<int>()) moveTo(p["position"].as<int>());
  else if (action == "open") moveTo(100);
  else if (action == "close") moveTo(0);
  else if (action == "stop") stopCurtain();
}

void setup() {
  Serial.begin(115200);
  pinMode(MOTOR_OPEN_PIN, OUTPUT);
  pinMode(MOTOR_CLOSE_PIN, OUTPUT);
  pinMode(BTN_OPEN, INPUT_PULLUP);
  pinMode(BTN_CLOSE, INPUT_PULLUP);
  pinMode(BTN_STOP, INPUT_PULLUP);

  store.begin("curtain", false);
  position = constrain(store.getInt("pos", 0), 0, 100);
  targetPosition = position;
  savedPosition = position;
  driveMotor(0);

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.begin();
}

void loop() {
  updateMotion();
  if (millis() - lastBtn > 300) {
    if (digitalRead(BTN_OPEN) == LOW) { lastBtn = millis(); moveTo(100); }
    else if (digitalRead(BTN_CLOSE) == LOW) { lastBtn = millis(); moveTo(0); }
    else if (digitalRead(BTN_STOP) == LOW) { lastBtn = millis(); stopCurtain(); }
  }
  publishState();
  cv.loop();
}