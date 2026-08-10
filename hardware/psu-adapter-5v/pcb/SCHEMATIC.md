# Circuvent Adapter 5V — 230 VAC → 5 V 1 A

External plug-top / in-line supply for the camera module and any other 5 V
device. Same flyback as `psu-5v3v3`, stripped to one rail and rebuilt on the
compact part set.

**Rating:** 85–265 VAC in, 5.0 V @ 1.0 A (5 W). Switcher TNY275 (the 274 tops
out near 4 W at 230 VAC in an enclosed adapter and would run hot at 1 A).

## Setpoint — check this before first power-on
```
Vout = Vref x (1 + R4/R5),  Vref = 2.495 V
     = 2.495 x (1 + 10k/10k) = 4.99 V
```
Use 1 % resistors. At 5 % the spread is roughly ±0.25 V, and the camera browns
out at the bottom of that while the ESP32's absolute maximum sits not far above
the top.

## What makes it small
The 5 W adapter is dominated by four parts, so those are the ones that were
attacked:

| Part | Compact choice | What the device boards use | Saving |
| --- | --- | --- | --- |
| Fuse | 1206 SMD | 5x20 holder | 26 x 10 mm → 3.6 x 2.2 mm |
| Mains/DC terminals | 3.5 mm pitch | 5.08 mm Phoenix | 12 x 11 mm → 9 x 9 mm each |
| Passives | 0603 | 0805 | ~40 % area |
| 3.3 V LDO | removed | AMS1117 + 2 caps | an external adapter has no use for it |

The transformer, the 400 V bulk capacitor and the output capacitor set the
floor and cannot be shrunk without dropping power. That floor is why this is a
small board rather than a tiny one.

## Circuit
Identical to `hardware/psu-5v3v3/pcb/SCHEMATIC.md` — read that file for the
topology, the RCD clamp, the HV- warning and the pinout table. The only
differences are the single output rail, the divider above, and the compact
package set.

## Blocking pre-fab items (shared with psu-5v3v3)
- [ ] **TL431 SOT-23 pinout** — TI state TL432 differs from TL431 in DBZ, so
      the orderable part decides it. Asserted 1=REF, 2=ANODE, 3=CATHODE.
- [ ] **EE13 bobbin drawing** vs `hardware/lib/Circuvent.pretty`
- [ ] Order T1 to a written spec: Lp 1.2 mH ±10 %, reinforced insulation,
      4 kVAC hipot, triple-insulated or margin-wound secondary
- [ ] CY1 is Y1-rated; CX1 is X2-rated; R1/R2 in series
- [x] TNY274/275 DIP-8C pinout confirmed: 1=EN/UV 2=BYPASS 4=DRAIN
      5,6,7,8=SOURCE, 3 omitted

## Not certified
EN 55032 conducted emissions, EN 62368-1 safety and BIS registration all
apply to an external adapter in their own right — arguably more strictly than
to a supply buried inside an appliance, because this one is a separately
placed-on-the-market product. Production hipot 3 kVAC on 100 % of units.
Until that exists, buy a certified adapter for anything that ships.
