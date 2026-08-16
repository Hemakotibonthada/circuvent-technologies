/*
 * Circuvent Smart Fan — ESP32 firmware
 * Relay power + continuous PWM speed with local button and Circuvent cloud control.
 * Deps: CircuventDevice, ArduinoJson. Board: ESP32.
 *
 * SPEED, IN TWO FORMS.
 *
 * The PWM here is 8-bit — 256 distinct duty values — and this firmware used
 * four of them. `speed` 0..3 indexed a table, so the app could only ever offer
 * a four-position switch no matter what the slider looked like. `level`
 * 0..100 exposes what the hardware could already do.
 *
 * `speed` is still accepted and still published, because fans already in
 * people's homes run the old firmware and every existing automation, schedule
 * and scene sends `speed`. A command carrying both is normal: the app sends
 * `level` for fine control and a `speed` derived from it, so an un-updated fan
 * still responds to the same slider. Where both arrive, `level` wins, because
 * it is the more precise statement of the same intent.
 *
 * MIN_DUTY is not a preference. A fan motor below roughly a third of full duty
 * does not turn slowly — it stalls, hums, and draws locked-rotor current
 * through a winding no longer being cooled by its own airflow. The original
 * table started at 85 for that reason and that floor is preserved: level 1
 * means the slowest speed the motor will actually run at, not one percent of
 * duty. Below that is off, with nothing in between.
 */
/* Version history: 1.1.0 is the first build that survives a power cut with the
   router still down - see tests/firmware-power-restore.test.ts. Declared
   explicitly so the fleet can tell fixed devices from unfixed ones; without
   it every sketch reported the library default and they were
   indistinguishable. */
#define CV_FW_VERSION "1.1.0"
#include <CircuventDevice.h>
#include <Preferences.h>

#define FAN_RELAY 26
#define SPEED_PWM_PIN 25
#define BTN_PIN 0
#define SPEED_CH 0
#define PWM_FREQ 25000
#define PWM_BITS 8

/* Lowest duty the motor will turn at rather than stall. See the note above. */
#define MIN_DUTY 85
#define MAX_DUTY 255

CircuventDevice cv("smart-fan");
Preferences store;

bool power = false, savedPower = false;
int level = 33, savedLevel = 33;   /* 0..100, the real setting */
unsigned long lastBtn = 0;

/* The four positions the button cycles, and what `speed` means. */
const uint8_t STEP_LEVEL[4] = {0, 33, 66, 100};

int levelToDuty(int pct) {
  if (pct <= 0) return 0;
  if (pct > 100) pct = 100;
  /* 1% is the slowest the motor turns, not 1% of duty. */
  return MIN_DUTY + ((long)(pct - 1) * (MAX_DUTY - MIN_DUTY)) / 99;
}

/* Nearest step, for `speed` and for the button. */
int levelToSpeed(int pct) {
  if (pct <= 0) return 0;
  int best = 1, bestDiff = 1000;
  for (int s = 1; s <= 3; s++) {
    int d = abs(pct - (int)STEP_LEVEL[s]);
    if (d < bestDiff) { bestDiff = d; best = s; }
  }
  return best;
}

void saveState() {
  if (power != savedPower) { store.putBool("power", power); savedPower = power; }
  if (level != savedLevel) { store.putInt("level", level); savedLevel = level; }
}

void applyFan() {
  level = constrain(level, 0, 100);
  cvRelayWrite(FAN_RELAY, power);
  ledcWrite(SPEED_CH, power ? levelToDuty(level) : 0);
  saveState();
  cv.set("power", power);
  /* Both are published: `speed` so older apps, automations and the timer
     engine keep reading something they understand, `level` for anything that
     can show the real setting. */
  cv.set("speed", levelToSpeed(level));
  cv.set("level", level);
}

void onCommand(const String &action, JsonObjectConst p) {
  if (action != "set") return;
  if (p["power"].is<bool>()) power = p["power"].as<bool>();

  bool changed = false;
  /* `level` is checked first and wins: when a command carries both, it is the
     precise version of the same intent. */
  if (p["level"].is<int>()) {
    level = constrain(p["level"].as<int>(), 0, 100);
    changed = true;
  } else if (p["speed"].is<int>()) {
    int s = constrain(p["speed"].as<int>(), 0, 3);
    level = STEP_LEVEL[s];
    changed = true;
  }

  if (changed) {
    /* A speed of zero means off, and setting a speed on a fan that is off
       means turn it on — otherwise dragging the slider does nothing until the
       user also finds the power switch. An explicit power in the same command
       still wins. */
    if (level == 0) power = false;
    else if (!p["power"].is<bool>()) power = true;
  }
  applyFan();
}

void setup() {
  Serial.begin(115200);
  cvRelayInit(FAN_RELAY);
  pinMode(BTN_PIN, INPUT_PULLUP);
  ledcSetup(SPEED_CH, PWM_FREQ, PWM_BITS);
  ledcAttachPin(SPEED_PWM_PIN, SPEED_CH);

  store.begin("fan", false);
  power = store.getBool("power", false);
  /* Migrate: fans flashed with the previous firmware stored a 0..3 step under
     "speed" and have no "level" yet. Reading the old key keeps a fan at the
     speed its owner left it on across the update. */
  level = store.getInt("level", -1);
  if (level < 0) level = STEP_LEVEL[constrain(store.getInt("speed", 1), 0, 3)];
  level = constrain(level, 0, 100);
  savedPower = power; savedLevel = level;
  applyFan();

  cv.onCommand(onCommand);
  cv.setInterval(8000);
  cv.setResetButton(0);  // BOOT/GPIO0: hold 3s to change Wi-Fi, 8s to factory reset
  cv.begin();
}

void loop() {
  if (digitalRead(BTN_PIN) == LOW && millis() - lastBtn > 400) {
    lastBtn = millis();
    /* The button still walks four positions: off, low, medium, high. A
       continuous slider is for the app; a wall button wants detents. */
    int s = levelToSpeed(level);
    if (!power) { power = true; if (s == 0) s = 1; }
    else if (s < 3) s++;
    else { power = false; s = 0; }
    level = STEP_LEVEL[s];
    applyFan();
  }
  cv.loop();
}
