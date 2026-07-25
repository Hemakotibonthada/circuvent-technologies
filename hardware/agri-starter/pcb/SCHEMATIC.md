# Agri Starter - Schematic / Netlist

ESP32 + GSM agricultural pump starter. A relay switches an external contactor coil; opto-isolated inputs sense mains/phase presence for dry-run protection; a SIM800L accepts missed-call/SMS control. Mains and LV logic are isolated (HLK PSU + optos).

## Power
```
J1(L) --[F1 1A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM01)
J1(N) -----------+-------------+--> PS1.AC-N
PS1.+5V -> 5V rail (K1 coil, U2.IN) ; SIM800L from a 4V buck + 1000u bulk ; PS1.-V -> GND
U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 470u 5V ; C2 100u 3V3 ; C3..C6 100n
```

## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/agri-starter/agri-starter.ino)
| Signal | ESP32 GPIO | Net / connector |
| --- | --- | --- |
| PUMP_RELAY | 26 | -> PC1 -> Q1 -> K1 -> J2 contactor coil (A1/A2) |
| MAINS_SENSE | 34 | <- PC2 AC opto (phase present, HIGH when powered) |
| SIM_RX | 16 | <- SIM800L TX (UART2) |
| SIM_TX | 17 | -> SIM800L RX (UART2) |

## Contactor drive + mains sensing + GSM
```
IO26 -> PC1 -> Q1 -> K1 coil ; D1 across coil ; K1 dry contact -> J2 (contactor A1/A2)
Mains sense: phase --[R + PC814 AC opto]--> IO34 (HIGH = power present); repeat per phase
SIM800L: 4V buck + 1000u bulk ; NET antenna ; SIM holder ; UART2 IO16/17
Dry-run: firmware asserts K1 only while MAINS_SENSE is HIGH (agri-starter.ino applyPump)
```

## Layout / safety rules
- Switch the CONTACTOR COIL only (J2) - the motor runs through the contactor + overload relay, never this board.
- Fuse + MOV at entry; opto-isolate every phase-sense input; >= 8 mm creepage mains-to-LV.
- SIM800L bursts ~2 A: a dedicated 4 V buck + bulk cap; keep the GSM antenna clear of mains.
- IP54 gland entries; conformal-coat for farm humidity + dust.
- Silk: shock warning, ratings, serial/QR, CE/BIS mark area.

See README.md for the KiCad project + Gerber/fab checklist.
