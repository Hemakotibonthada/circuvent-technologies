# RFID Gate - Schematic / Netlist

ESP32-based UHF vehicle access controller. A long-range Wiegand-26 reader on
the driveway feeds two opto-isolated inputs; two momentary relays drive the
existing gate controller's open/close terminals. Matches
`firmware/rfid-gate/rfid-gate.ino`.

## Power
```
J1(L) --[F1 2A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM03)
J1(N) -----------+-------------+--> PS1.AC-N
PS1.+5V -> 5V rail (K1/K2 coils, U3..U6.IN) ; PS1.-V -> GND
U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 470u on 5V ; C2 100u 3V3 ; C3..C8 100n
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/rfid-gate/rfid-gate.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| OPEN_RELAY | 26 | -> PC1 -> Q1 -> K1 coil (gate open, 600 ms pulse) |
| CLOSE_RELAY | 27 | -> PC2 -> Q2 -> K2 coil (gate close, 600 ms pulse) |
| LED_PIN | 2 | -> LED1 barrier open |
| WIEGAND_D0 | 16 | <- J3 reader D0 (green, INPUT_PULLUP) |
| WIEGAND_D1 | 17 | <- J3 reader D1 (white, INPUT_PULLUP) |
| OPEN_LIMIT | 34 | <- J4 gate-fully-open limit switch (input-only) |
| LOOP_DETECT | 35 | <- J5 inductive loop / IR beam (input-only) |
| BTN_PIN | 0 | SW1 manual toggle (also BOOT/config) |

GPIO 34/35 are input-only and have no internal pull-ups, so the R-pool
provides external 10k pull-ups to 3V3. `EN` -> 10k to 3V3.

## Relay drive (x2, momentary) + Wiegand input
```
IOxx --[1k]--> PCn.anode ; PCn.cathode->GND
PCn.collector--[1k]--> Qn.base ; Qn.emitter->GND ; Qn.collector-> Kn coil(-)
Kn coil(+)->5V ; Dn (1N4007) across coil
K1/K2 contacts are DRY: COM + NO go straight to the gate controller's own
open/close inputs on J2. The board never switches gate-motor current itself.

Wiegand D0/D1 arrive on J3 with 10k pull-ups to 3V3; the reader's open-drain
outputs pull each line low for a bit. J3 also carries the reader's supply and
ground return.
```

### Recommended upgrade: isolate the Wiegand pair
The reader sits tens of metres away on its own supply, so its ground can rest
volts away from the board's. Wiring D0/D1 straight to GPIO couples that
difference - and any surge the run picks up - directly into the MCU. On an
outdoor gate post that is the single most likely way this board dies.

Two optocouplers (reader line -> LED, collector -> GPIO, emitter -> board GND)
fix it, and the layout leaves room beside J3 for them. They are **not** in the
generated netlist: this generator models an optocoupler as an output stage
(GPIO drives the LED, the transistor drives a load), so asking it for an input
isolator produces a chain wired backwards. Adding them is a schematic edit to
make before fabrication, not something to take from the generated file.

Reader supply: a UHF reader typically wants 12 V. J3 carries the board's 5 V
rail, so either fit an HLK-PM12 in place of the PM03 and derive 5 V locally, or
feed the reader from its own supply and bring only D0/D1/GND to J3.

## Layout / safety rules
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slot under PS1.
- Mains is confined to the PS1 island: F1, RV1 and J1 only. The gate-controller
  side (J2) is dry-contact and stays on the LV island.
- Outdoor unit: conformal coat after test, glanded entries, and drip loops on
  every cable leaving the enclosure.
- Reader run and loop-detector run enter on opposite edges from the mains
  entry; keep them off the relay coils.
- Silk: shock warning, dry-contact rating, serial/QR, CE/BIS mark area.

See README.md for the KiCad project + Gerber/fab checklist.
