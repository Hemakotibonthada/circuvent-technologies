# Home Automation Hub - Quick Start

## 1. Wire (electrician)
1. Switch off the mains at the board before wiring.
2. Connect incoming **L/N** to `J1` (through the supplied fuse).
3. Connect each load's live wire to an output `J2.OUT1..OUT4`; connect all load
   neutrals to the common **N**. Observe **<= 6 A per channel** (resistive).
4. Mount in a modular box / wall enclosure.

## 2. Power on & connect to Wi-Fi
1. Power on - the green LED shows power.
2. On your phone, join Wi-Fi **"Circuvent-Setup-XXXX"**.
3. The setup page opens (or visit `http://192.168.4.1`); pick your Wi-Fi, enter
   the password, **Save & connect**. The hub restarts and comes online.

## 3. Link to your account
1. Open the **Circuvent app** (or circuvent.com -> Store -> Devices).
2. **Add a device** -> enter the **Device ID + Key** from the sticker.
3. Each channel now appears with on/off, scenes and schedules.

## 4. Use it
- **Buttons:** press a channel button to toggle that load (works offline too).
- **Scenes:** tap Home / Away / Night / Movie in the app.
- **Schedules:** set daily on/off times per channel (needs internet for clock sync).
- **After a power cut:** channels return to their last state (configurable).

## Troubleshooting
- *Offline:* hold the config button to reopen the Wi-Fi setup portal.
- *Schedule not firing:* ensure the hub has internet so its clock can sync (NTP).
- *Load not switching:* check wiring to the correct `OUT` terminal and the fuse.
