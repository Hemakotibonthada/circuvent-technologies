# AquaGuard - Quick Start

## 1. Mount & wire (electrician)
1. Wall-mount the controller near the pump starter (dry, shaded spot).
2. Wire mains **L/N** to `J1` through the supplied fuse.
3. Wire `J2` (contactor out) to your motor **contactor coil** (A1/A2). Do not
   connect the motor directly to the board.
4. Fix the ultrasonic probe on the tank lid, pointing straight down; run its
   cable to `J3`. Optionally fit the two float switches (low + overflow) to `J4`.

## 2. Power on & connect to Wi-Fi
1. Power on. The green LED indicates power.
2. On your phone, open Wi-Fi settings and join **"Circuvent-Setup-XXXX"**.
3. A setup page opens automatically (or visit `http://192.168.4.1`). Pick your
   home Wi-Fi, enter the password, tap **Save & connect**. The device restarts.

## 3. Link to your account
1. Open the **Circuvent app** (or circuvent.com -> Store -> Devices).
2. Tap **Add a device** and enter the **Device ID + Key** from the sticker.
3. The dashboard now shows live tank level and pump status.

## 4. Configure
- Set **start %** (auto-on level) and **stop %** (auto-off level) in the app.
- Toggle **Auto/Manual**; in Manual you control the pump directly.
- Set the tank empty/full distances during first calibration.

## Indicators & alerts
- **Green LED:** power/online. **Red LED:** pump running / alert.
- **Buzzer beeps:** dry-run (no water reaching tank) or overflow detected -
  the pump is stopped automatically for safety.

## Manual override
Press the button on the unit to toggle the pump (switches to Manual mode).

## Troubleshooting
- *Device offline:* hold the config button to re-open the Wi-Fi setup portal.
- *Wrong level:* re-check the probe is vertical and re-calibrate empty/full.
- *Pump won't start:* check the restart cool-down timer and the overflow float.
