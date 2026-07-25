# Smart Fan Regulator - Quick Start

## 1. Wire (electrician)
1. Switch off the mains at the board.
2. Connect incoming L/N to J1 (through the fuse).
3. Connect fan power to J2; connect the fan's 0-10 V speed lead to J3 (or a DC fan to the MOSFET terminals).
4. Mount in a modular box near the fan point.

## 2. Power on & connect to Wi-Fi
1. Power on - the green LED shows power.
2. Join Wi-Fi "Circuvent-Setup-XXXX" on your phone.
3. Open the setup page (or http://192.168.4.1); pick your Wi-Fi, Save & connect.

## 3. Link account + voice
1. Open the Circuvent app -> Add a device -> enter the Device ID + Key.
2. Optionally discover it in Alexa/Google as a fan.

## 4. Use it
1. Drag the speed slider or tap a preset.
2. Button: press to cycle speed (works offline).
3. Schedules: auto-set speed by time of day.

## Troubleshooting
- Fan won't vary speed: confirm it accepts a 0-10 V/PWM input (older AC fans need a TRIAC variant).
- Buzzing at low speed: use the 0-10 V output, not raw PWM, into the fan.
- Offline: hold the button ~5 s to reopen the Wi-Fi setup portal.
