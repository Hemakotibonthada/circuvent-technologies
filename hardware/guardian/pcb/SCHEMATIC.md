# Guardian SOS - Schematic / Netlist

ESP32 personal SOS beacon. A SIM800L (2G) sends SMS + places a call; a GPS module supplies location; a Li-ion cell with USB-C charging powers the unit. A button triggers SOS; a buzzer confirms. Low voltage / battery.

## Power
```
USB-C 5V -> TP4056 charge -> 18650 (BAT) -> DW01/8205 protection
BAT -> 3V3 LDO/boost (ESP32) ; SIM800L runs 3.4-4.4 V DIRECT from BAT + C_bulk 1000u (2 A bursts)
BATT_ADC: BAT --[100k/100k divider]--> IO34 (battery %)
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/guardian/guardian.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| SOS_BTN | 0 | SW1 panic (INPUT_PULLUP -> GND; also BOOT) |
| BUZZER | 25 | -> FB1 buzzer (confirmation) |
| BATT_ADC | 34 | <- battery divider (ADC1) |
| SIM_RX | 16 | <- SIM800L TX (UART2) |
| SIM_TX | 17 | -> SIM800L RX (UART2) |
| GPS_RX | 4 | <- GPS TX (UART1) |
| GPS_TX | 2 | -> GPS RX (UART1) |

## Radios + trigger
```
SIM800L: VCC->BAT (3.4-4.4 V) + 1000u bulk ; NET antenna ; SIM holder ; UART2 IO16/17
GPS: VCC->3V3 ; active antenna ; UART1 IO4/2 ; TinyGPSPlus parses NMEA
SOS: hold SW1 (IO0) -> SMS(location) + call(TRUSTED_NUMBER) + cv.set(sos); buzzer on IO25 chirps
Charge: TP4056 (USB-C) status LEDs ; DW01/8205 cell protection
```

## Layout / safety rules
- SIM800L draws ~2 A bursts: power from BAT direct + a large bulk cap - never from the 3V3 LDO.
- Use a protected 18650 (DW01 + dual MOSFET); fuse the USB-C input.
- Keep the GSM + GPS antennas apart; ground-plane relief under each antenna.
- Ship the battery per UN 38.3 transport rules.

See README.md for the KiCad project + Gerber/fab checklist.
