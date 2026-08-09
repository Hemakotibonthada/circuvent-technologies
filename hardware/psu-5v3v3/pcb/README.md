# PSU-5 PCB — KiCad project + fab checklist

Design source: SCHEMATIC.md (netlist) + BOM.csv. Open cv-psu5.kicad_pro in KiCad.

## Board spec
- 2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on the primary.
- ≥ 8 mm creepage / 6 mm clearance primary-to-secondary; milled slot under T1
  and PC1.
- Size target ~ 45 x 30 mm; 2x M3. The HLK-PM03 it replaces is 34 x 20 x 15 mm,
  so this is not smaller — the transformer, the bulk cap and the output cap set
  the floor. What it buys is BOM cost, a second source, and the 3.3 V rail.

## Blocking pre-fab checklist
- [x] **TNY274PN DIP-8C pinout confirmed** against the TinySwitch-III datasheet:
      1=EN/UV, 2=BYPASS, 4=DRAIN, 5/6/7/8=SOURCE, 3 omitted. (The design
      previously had DRAIN and SOURCE swapped.)
- [ ] **Confirm the TL431 SOT-23 pinout.** Asserted 1=REF, 2=ANODE, 3=CATHODE.
      TI states TL432 has a different DBZ pinout from TL431, so check the exact
      ordered part against the printed package drawing.
- [ ] **Confirm the EE13 bobbin drawing** against
      `hardware/lib/Circuvent.pretty/Transformer_EE13_10pin.kicad_mod`
      (2.54 mm pitch, 10.16 mm row spacing, 5+5). Regenerate with
      `python hardware/make_lib.py` if the supplier differs.
- [ ] Order T1 to the written specification, not "an EE13 flyback".
- [ ] CY1 is Y1-rated. A general-purpose 2.2 nF ceramic here is a fatal defect.
- [ ] CX1 is X2-rated; R1/R2 are two in series across the clamp.

## Pre-fab (DFM) checklist
- [ ] ERC/DRC clean at fab rules; barrier enforced as keepout
- [ ] Switching loop (C1− → U1 SOURCE → T1 primary) kept tight
- [ ] Fuse before MOV; both on the primary island
- [ ] Test points: HV+ (probe with care), +5V, +3V3, GND
- [ ] Fiducials; no silk in the barrier band

## Export for fab / assembly
- [ ] Gerbers + Excellon → gerbers/; IPC-356 netlist
- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP
- [ ] Order boards + stencil

## Bring-up (EVT) — isolation transformer on the bench, always
- [ ] Hipot 3 kVAC primary-to-secondary before powering anything
- [ ] Dim-bulb tester on first mains application
- [ ] 5 V within ±2 % from 85 to 265 VAC, no load to full load
- [ ] Drain voltage stays below 650 V at 265 VAC with the load stepped
- [ ] Efficiency ≥ 75 % at 230 VAC full load; T1 rise < 40 K after 1 h
- [ ] Short the secondary, open the feedback loop, short the opto — nothing
      catches fire and the fuse is the only casualty
- [ ] Conducted EMI pre-scan on a LISN before committing to a build
