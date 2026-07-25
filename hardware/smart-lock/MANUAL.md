# Smart Lock Controller - Quick Start

## 1. Mount & wire the lock
1. Power off the 12 V supply.
2. Wire the lock to J2: use COM+NO for fail-secure (locked without power) or COM+NC for fail-safe (unlocked without power).
3. Fit the supplied flyback diode across the lock coil (polarity as marked).
4. Optionally wire a door reed to J3. Connect the 12 V supply to J1 (observe polarity).

## 2. Power on & connect to Wi-Fi
1. The status LED shows the lock state.
2. Join Wi-Fi "Circuvent-Setup-XXXX" on your phone.
3. Open the setup page (or http://192.168.4.1); pick your Wi-Fi, Save & connect.

## 3. Link to your account
1. Open the Circuvent app -> Add a device -> enter the Device ID + Key.
2. The lock appears with lock/unlock, door state and auto-lock.

## 4. Use it
1. Tap lock/unlock in the app, or press the button.
2. Set an auto-lock timer (e.g., re-lock 10 s after unlock).
3. Enable auto-lock-on-close if a reed is fitted.

## Troubleshooting
- Lock buzzes/chatters: check the flyback + snubber and that the 12 V supply meets the lock's current.
- Wrong behaviour on power loss: swap NO/NC at J2 for fail-safe vs fail-secure.
- Door state stuck: check the reed gap and wiring at J3.
