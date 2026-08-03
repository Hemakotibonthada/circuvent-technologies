# Sentinel - Schematic / Netlist

ESP32-based gas + climate safety panel with four opto-isolated relay channels.
A gas sensor, a PIR and a DHT feed the safety logic; the buzzer and the relay
cut-outs are driven locally so the panel keeps protecting the site with the
network down. Matches the default DevKit profile in
`firmware/sentinel/sentinel.ino`.

## Power
```
J1(L) --[F1 6A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM03)
J1(N) -----------+-------------+--> PS1.AC-N
PS1.+5V -> 5V rail (K1..K4 coils, U3..U6.IN, sensors, FB1) ; PS1.-V -> GND
U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 470u on 5V ; C2 100u 3V3 ; C3..C8 100n
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/sentinel/sentinel.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| RELAY1 | 19 | -> PC1 -> Q1 -> K1 coil (channel 1) |
| RELAY2 | 21 | -> PC2 -> Q2 -> K2 coil (channel 2) |
| RELAY3 | 22 | -> PC3 -> Q3 -> K3 coil (channel 3) |
| RELAY4 | 23 | -> PC4 -> Q4 -> K4 coil (channel 4) |
| BUZZER | 27 | -> FB1 gas / safety alarm |
| STATUS_LED | 2 | -> LED1 alarm / status |
| TOUCH1 (T0) | 4 | TP1 copper touch pad (channel 1) |
| TOUCH2 (T4) | 13 | TP2 copper touch pad (channel 2) |
| TOUCH3 (T6) | 14 | TP3 copper touch pad (channel 3) |
| TOUCH4 (T8) | 33 | TP4 copper touch pad (channel 4) |
| DHT_PIN | 18 | <- J6 DHT11/DHT22 data (INPUT_PULLUP) |
| GAS_ANALOG | 34 | <- J4 gas sensor AO (input-only, ADC1) |
| GAS_DIGITAL | 35 | <- J4 gas sensor DO comparator (input-only) |
| PIR_PIN | 39 | <- J5 PIR module OUT (input-only) |
| BTN_PIN | 0 | SW1 reset (also BOOT/config) |

Three constraints the firmware enforces at compile time and the layout has to
honour:

- **GAS_ANALOG must be on ADC1 (GPIO 32-39).** ADC2 stops converting the
  moment Wi-Fi comes up, so a gas sensor wired there reads perfectly on the
  bench and returns garbage in the field.
- **Relays avoid GPIO 0, 2, 5, 12 and 15.** Those are strapping pins that
  pulse while the chip boots, which on a relay board means an audible click
  and a mains load flicking on at every restart.
- **Touch pads skip GPIO 12 (MTDI).** It selects the flash voltage at boot; a
  hand resting on the panel during a power cut could stop it booting at all.

The touch pads carry **no pull-up** - `touchRead()` measures the pad's
charge/discharge time, and a resistor to 3V3 swamps the signal being measured.
`EN` -> 10k to 3V3; UART TXD0/RXD0 -> JP.

## Per-channel relay drive (x4, opto-isolated)
```
IOxx --[1k]--> PCn.anode ; PCn.cathode->GND
PCn.collector--[1k]--> Qn.base ; Qn.emitter->GND ; Qn.collector-> Kn coil(-)
Kn coil(+)->5V ; Dn (1N4007) across coil
Kn COM-> mains L bus ; Kn NO -> J2/J3 OUTn ; loads return to common N
```

## Sensors
```
J4 gas   : AO -> IO34 (ADC1), DO -> IO35, GND ; 5 V feed shared with J6
J5 PIR   : OUT -> IO39, GND
J6 DHT   : DATA -> IO18 with a 10k pull-up to 3V3, sensor 5 V, GND
FB1      : IO27 -> active buzzer, other terminal to GND
```

An MQ-series gas sensor runs a heater and needs a few minutes to settle from
cold; the firmware's alarm logic must not be trusted during that window.

## Layout / safety rules
- Single mains-L bus to the 4 relay COMs; keep switched-L outputs separated.
- >= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots under the
  optos and the PSU.
- Fuse + MOV at entry; 2 oz traces + thermal relief on relay pads.
- Per-channel current derating on the silk; total limited by F1 + PSU + copper.
- The gas sensor needs airflow: vent the enclosure above it and keep it away
  from the relay/PSU thermal plume, which will otherwise bias the reading.
- Route touch traces short and guarded; keep them off the mains island.
- Silk: shock warning, ratings, serial/QR, CE/BIS mark area.

See README.md for the KiCad project + Gerber/fab checklist.
