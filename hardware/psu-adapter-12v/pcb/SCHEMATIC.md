# Circuvent Adapter 12V — 230 VAC → 12 V 1 A

External supply for the 12 V loads: the FaceDoor electric strike, the RFID
gate's UHF reader, and anything else that wants 12 V. Same flyback as
`psu-5v3v3`, one rail, compact part set.

**Rating:** 85–265 VAC in, 12.0 V @ 1.0 A (12 W). Switcher TNY277 — 12 W is
well beyond the 274/275, and undersizing here shows up as the adapter running
hot and current-limiting on the strike's inrush rather than as a clean failure.

## Setpoint — check this before first power-on
```
Vout = Vref x (1 + R4/R5),  Vref = 2.495 V
     = 2.495 x (1 + 38k3/10k) = 12.05 V
```
1 % resistors. An electric strike is an inductive load with a large inrush;
size C5 for that, not for the steady-state current.

## Differences from the 5 V build
- **TNY277** rather than 275, and an EE16 core rather than EE13 — 12 W does
  not fit an EE13 without running the flux density too close to saturation at
  85 VAC.
- **SS36 (60 V)** secondary rectifier rather than SS34 (40 V). At 12 V out the
  reverse voltage across the diode is the output plus the reflected input; a
  40 V part is marginal and dies slowly.
- **15 uF/400 V** bulk (roughly 1 uF per watt at 230 VAC) and 25 V output caps.
- Divider is 38k3/10k rather than 10k/10k.

## Circuit
Identical topology to `hardware/psu-5v3v3/pcb/SCHEMATIC.md` — read that file
for the RCD clamp, the HV- warning and the pinout table.

## Blocking pre-fab items
- [ ] **TL431 SOT-23 pinout** — confirm against the orderable part
- [ ] **EE16 bobbin drawing.** The footprint in
      `hardware/lib/Circuvent.pretty` is drawn to EE13 geometry; an EE16 bobbin
      is physically larger and needs its own footprint. Regenerate with
      `python hardware/make_lib.py` after changing the constants, or this board
      will not accept the transformer it is specified with.
- [ ] Order T1 to spec: Lp 0.9 mH ±10 %, reinforced insulation, 4 kVAC hipot
- [ ] CY1 Y1-rated; CX1 X2-rated; R1/R2 in series
- [x] TNY27x DIP-8C pinout confirmed from the datasheet

## Not certified
As with the 5 V build: EN 55032, EN 62368-1, BIS, and 100 % production hipot.
A 12 W adapter driving a door strike is also a fault-tolerance question — work
out what happens when the strike is shorted or its freewheel diode is missing
before this powers a lock anyone depends on.
