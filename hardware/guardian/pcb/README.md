# Guardian SOS PCB - KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-sos.kicad_pro in KiCad 8, capture, lay out, export.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free.
- Low voltage / battery; RF keep-outs under both antennas.
- Size target ~ 60 x 40 mm (pendant); battery clips + 1x M2.
- 1000u bulk right at the SIM800L VCC; SMA/IPEX for GSM + active GPS antenna.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean; antenna keep-outs + ground relief
- [ ] SIM800L powered from BAT + bulk cap (not the LDO)
- [ ] SIM footprint + card cage; USB-C charge path
- [ ] Test points: BAT, 3V3, GND, IO0/25/34, UART1/2
- [ ] UART/EN/IO0 pads for the flashing jig; fiducials

## Export for fab / assembly
- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT)
- [ ] Charge cell; rails up; flash test firmware over jig
- [ ] SIM800L registers on the network; SMS + call succeed
- [ ] GPS gets a fix outdoors; battery % reads sane
- [ ] SOS button -> SMS(location) + call + cloud alert; buzzer confirms
