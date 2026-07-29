#!/usr/bin/env python
"""
Circuvent - KiCad PCB layout generator.

Companion to gen-hardware.js. Where gen-hardware.js emits the *documentation*
package (SCHEMATIC.md / BOM.csv / kicad_pro stub), this script emits the actual
KiCad board: real footprints from the KiCad standard libraries, board outline,
mounting holes, mains/LV isolation barrier, GND pour, silkscreen and fiducials.

Design source per device: hardware/<folder>/pcb/BOM.csv + SCHEMATIC.md.
Output:                   hardware/<folder>/pcb/<model>.kicad_pcb

Must be run with KiCad's bundled Python (pcbnew).
"""

import collections
import csv
import json
import os
import re
import subprocess
import sys

import pcbnew

HW_ROOT = os.path.dirname(os.path.abspath(__file__))
FP_ROOT = os.environ.get(
    "KICAD_FP_ROOT",
    r"C:\Users\v-hbonthada\AppData\Local\Programs\KiCad\10.0\share\kicad\footprints",
)

MM = pcbnew.FromMM

# Breathing room added around every measured courtyard, in mm. Keeps
# neighbouring parts from tripping courtyard/solder-mask DRC rules.
FP_CLEARANCE = 0.5

# Extra room reserved around each line-voltage part, in mm. It has to cover
# not just pad-to-pad basic insulation but a whole mains routing corridor:
# clearance + MAINS track width + clearance = 2.0 + 1.5 + 2.0 = 5.5 mm. With
# less than that the autorouter simply cannot connect the mains island.
MAINS_PART_GROW = 6.0


def V(x_mm, y_mm):
    return pcbnew.VECTOR2I(MM(x_mm), MM(y_mm))


# --------------------------------------------------------------------------
# Device board specs (sizes/mounts taken from each pcb/README.md "Board spec")
# --------------------------------------------------------------------------
DEVICES = [
    dict(folder="smart-plug", model="cv-plug", title="Circuvent Smart Plug 16A",
         w=50, h=50, mounts=2, mains=True, creepage=8.0),
    dict(folder="smart-switch", model="cv-sw2", title="Circuvent Smart Switch 2G",
         w=45, h=45, mounts=2, mains=True, creepage=8.0),
    dict(folder="smart-light", model="cv-led", title="Circuvent Smart Light RGBW",
         w=55, h=40, mounts=2, mains=True, creepage=8.0),
    dict(folder="smart-fan", model="cv-fan", title="Circuvent Smart Fan Regulator",
         w=55, h=45, mounts=2, mains=True, creepage=8.0),
    dict(folder="smart-lock", model="cv-lock", title="Circuvent Smart Lock Ctrl",
         w=50, h=40, mounts=2, mains=True, creepage=8.0),
    dict(folder="curtain", model="cv-curt", title="Circuvent Curtain Control",
         w=70, h=50, mounts=2, mains=True, creepage=8.0),
    dict(folder="motion-sensor", model="cv-pir", title="Circuvent Motion Sensor",
         w=45, h=35, mounts=2, mains=False, creepage=0.0),
    dict(folder="energy-monitor", model="cv-em", title="Circuvent Energy Monitor",
         w=50, h=45, mounts=2, mains=True, creepage=8.0),
    dict(folder="guardian", model="cv-sos", title="Circuvent Guardian SOS",
         w=60, h=40, mounts=1, mains=False, creepage=0.0),
    dict(folder="agri-starter", model="cv-agri", title="Circuvent Agri Pump Starter",
         w=80, h=60, mounts=4, mains=True, creepage=8.0),
    dict(folder="home-automation", model="homehub", title="Circuvent Home Hub 4CH",
         w=90, h=65, mounts=4, mains=True, creepage=8.0),
    dict(folder="water-tank-controller", model="aquaguard", title="Circuvent AquaGuard",
         w=80, h=60, mounts=4, mains=True, creepage=8.0),
]

# --------------------------------------------------------------------------
# ESP32-WROOM-32E pad number -> GPIO (standard WROOM-32 pinout)
# Used to attach the documented firmware nets to real MCU pads.
# --------------------------------------------------------------------------
ESP32_PADS = {
    1: "GND", 2: "+3V3", 3: "EN", 4: "IO36", 5: "IO39", 6: "IO34", 7: "IO35",
    8: "IO32", 9: "IO33", 10: "IO25", 11: "IO26", 12: "IO27", 13: "IO14",
    14: "IO12", 15: "GND", 16: "IO13", 17: "IO9", 18: "IO10", 19: "IO11",
    20: "IO6", 21: "IO7", 22: "IO8", 23: "IO15", 24: "IO2", 25: "IO0",
    26: "IO4", 27: "IO16", 28: "IO17", 29: "IO5", 30: "IO18", 31: "IO19",
    32: "NC", 33: "IO21", 34: "IO3", 35: "IO1", 36: "IO22", 37: "IO23",
    38: "GND", 39: "GND",
}

# --------------------------------------------------------------------------
# Footprint resolution: (library, footprint, courtyard w x h mm, is_tht)
# --------------------------------------------------------------------------
FP = {
    "esp32":     ("RF_Module", "ESP32-WROOM-32E", 18.0, 25.5, False),
    "hlk":       ("Converter_ACDC", "Converter_ACDC_Hi-Link_HLK-PMxx", 34.0, 20.0, True),
    "sot223":    ("Package_TO_SOT_SMD", "SOT-223-3_TabPin2", 7.0, 7.0, False),
    "sot23":     ("Package_TO_SOT_SMD", "SOT-23", 3.5, 3.5, False),
    "to220":     ("Package_TO_SOT_THT", "TO-220-3_Vertical", 11.0, 9.0, True),
    "dip4":      ("Package_DIP", "DIP-4_W7.62mm", 10.5, 7.0, True),
    "soic8":     ("Package_SO", "SOIC-8_3.9x4.9mm_P1.27mm", 7.0, 6.0, False),
    "sop":       ("Package_SO", "SOIC-8_3.9x4.9mm_P1.27mm", 7.0, 6.0, False),
    "do41":      ("Diode_THT", "D_DO-41_SOD81_P10.16mm_Horizontal", 12.0, 4.0, True),
    "do201":     ("Diode_THT", "D_DO-201AD_P15.24mm_Horizontal", 17.0, 6.0, True),
    "sma":       ("Diode_SMD", "D_SMA", 5.5, 3.5, False),
    "smb":       ("Diode_SMD", "D_SMB", 6.5, 4.5, False),
    "relay":     ("Relay_THT", "Relay_SPDT_SANYOU_SRD_Series_Form_C", 20.0, 16.5, True),
    "r0805":     ("Resistor_SMD", "R_0805_2012Metric", 2.6, 1.8, False),
    "c0805":     ("Capacitor_SMD", "C_0805_2012Metric", 2.6, 1.8, False),
    "r2512":     ("Resistor_SMD", "R_2512_6332Metric", 7.5, 4.0, False),
    "r1206":     ("Resistor_SMD", "R_1206_3216Metric", 3.6, 2.2, False),
    "elec":      ("Capacitor_THT", "CP_Radial_D10.0mm_P5.00mm", 11.5, 11.5, True),
    "elec_sm":   ("Capacitor_THT", "CP_Radial_D6.3mm_P2.50mm", 7.5, 7.5, True),
    "sw6mm":     ("Button_Switch_THT", "SW_PUSH_6mm_H5mm", 7.5, 7.5, True),
    "led3":      ("LED_THT", "LED_D3.0mm", 4.5, 4.5, True),
    "hdr3":      ("Connector_PinHeader_2.54mm", "PinHeader_1x03_P2.54mm_Vertical", 3.5, 9.0, True),
    "hdr4":      ("Connector_PinHeader_2.54mm", "PinHeader_1x04_P2.54mm_Vertical", 3.5, 11.5, True),
    "mov":       ("Varistor", "RV_Disc_D7mm_W3.4mm_P5mm", 9.0, 5.0, True),
    "fuse5x20":  ("Fuse", "Fuseholder_Clip-5x20mm_Littelfuse_111_Inline_P20.00x5.00mm_D1.05mm_Horizontal", 26.0, 10.0, True),
    "fuse1206":  ("Fuse", "Fuse_1206_3216Metric", 3.6, 2.2, False),
    "term2":     ("TerminalBlock_Phoenix", "TerminalBlock_Phoenix_MKDS-1,5-2_1x02_P5.00mm_Horizontal", 12.0, 11.0, True),
    "term3":     ("TerminalBlock_Phoenix", "TerminalBlock_Phoenix_MKDS-1,5-3_1x03_P5.00mm_Horizontal", 17.0, 11.0, True),
    "buzzer":    ("Buzzer_Beeper", "Buzzer_D14mm_H7mm_P10mm", 15.0, 15.0, True),
    "mount_m3":  ("MountingHole", "MountingHole_3.2mm_M3", 6.5, 6.5, True),
    "mount_m2":  ("MountingHole", "MountingHole_2.2mm_M2", 4.5, 4.5, True),
    "fiducial":  ("Fiducial", "Fiducial_1mm_Mask2mm", 3.0, 3.0, False),
    "testpoint": ("TestPoint", "TestPoint_Pad_D1.5mm", 2.5, 2.5, False),
    "module_sm": ("Connector_PinHeader_2.54mm", "PinHeader_1x04_P2.54mm_Vertical", 3.5, 11.5, True),
    "coincell":  ("Battery", "BatteryHolder_Keystone_103_1x20mm", 24.0, 24.0, True),
    "rf_sma":    ("Connector_Coaxial", "SMA_Amphenol_132289_EdgeMount", 9.0, 6.5, True),
}

# Distinct pad numbers per footprint (measured from the stock libraries).
# Drives netlist completeness checks - every one of these must land on a net.
PAD_COUNT = {
    "buzzer": 2, "c0805": 2, "coincell": 2, "dip4": 4, "do201": 2, "do41": 2,
    "elec": 2, "elec_sm": 2, "esp32": 39, "fiducial": 0, "fuse1206": 2,
    "fuse5x20": 2, "hdr3": 3, "hdr4": 4, "hlk": 4, "led3": 2, "module_sm": 4,
    "mount_m2": 0, "mount_m3": 0, "mov": 2, "r0805": 2, "r1206": 2, "r2512": 2,
    "relay": 5, "rf_sma": 2, "sma": 2, "smb": 2, "soic8": 8, "sop": 8,
    "sot223": 3, "sot23": 3, "sw6mm": 2, "term2": 2, "term3": 3,
    "testpoint": 1, "to220": 3,
}

# KiCad's pcbnew.FootprintLoad() re-guesses the plugin per call and can hand back
# an undowncast handle (AttributeError) - resolve the s-expression plugin once.
_PLUGIN = None


def _plugin():
    global _PLUGIN
    if _PLUGIN is None:
        _PLUGIN = pcbnew.PCB_IO_MGR.FindPlugin(pcbnew.PCB_IO_MGR.KICAD_SEXP)
    return _PLUGIN


def _dc(obj, caster):
    """KiCad 10's SWIG bindings intermittently return undowncast SwigPyObjects.
    Normalise anything that comes back from the C++ side through the matching
    Cast_to_* helper before we touch it."""
    if obj is None:
        return None
    if hasattr(obj, "thisown"):
        return obj
    try:
        obj = caster(obj)
    except Exception:
        return None
    return obj if hasattr(obj, "thisown") else None


def find_pad(fp, number):
    return _dc(fp.FindPadByNumber(str(number)), pcbnew.Cast_to_PAD)


def set_pad_net(fp, number, net):
    """Assign a net to every pad carrying this number; returns True if any hit.

    Modules such as ESP32-WROOM repeat the thermal pad number across a whole
    via field (21 pads numbered 39), so netting only the first one makes DRC
    report a short between identically numbered pads.
    """
    n = str(number)
    pads = []
    try:
        pads = [p for p in fp.Pads() if p.GetNumber() == n]
    except Exception:
        pads = []
    if not pads:
        one = find_pad(fp, n)
        pads = [one] if one is not None else []
    hit = 0
    for p in pads:
        p = _dc(p, pcbnew.Cast_to_PAD)
        if p is None:
            continue
        p.SetNet(net)
        hit += 1
    return hit > 0


def ref_prefix(ref):
    """'Rsh' -> R, 'LED1' -> LED, 'PC1' -> PC, 'JP' -> JP."""
    m = re.match(r"^([A-Za-z]+)", ref or "")
    if not m:
        return ""
    letters = m.group(1)
    up = letters.upper()
    for known in ("LED", "TVS", "ANT", "MOD", "PS", "RV", "SW", "TP", "FB", "JP",
                  "PC", "CN", "BT", "MH", "ZD", "DZ", "FID"):
        if up.startswith(known):
            return known
    # mixed case like 'Rsh' / 'Rshunt' -> leading capital run only
    caps = re.match(r"^([A-Z]+)", letters)
    if caps and (len(caps.group(1)) < len(letters)):
        return caps.group(1)
    return up


# Designators whose meaning is fixed by convention. For these the reference
# alone decides the footprint and BOM description keywords are ignored.
STRONG_PREFIXES = {"PS", "K", "Q", "RV", "F", "FB", "SW", "LED", "ANT", "TP",
                   "PC", "U", "IC", "R", "C", "D", "J", "JP", "CN", "BT", "M",
                   "MOD", "TVS", "ZD", "DZ"}


def resolve(ref, value, package, desc):
    """Map a BOM line to a footprint key.

    The reference designator is authoritative and is tested first. BOM
    descriptions are only a fallback, because they name the *function* rather
    than the part: "NPN relay driver" is a transistor, and matching the word
    "relay" inside it used to place an SRD relay footprint for every S8050.
    """
    pre = ref_prefix(ref)
    pkg = (package or "").strip().lower()
    val = (value or "").lower()
    dsc = (desc or "").lower()

    # 1. Explicit part numbers win outright.
    if "esp32" in val:
        return "esp32"
    if "hlk" in val or "hi-link" in val:
        return "hlk"
    if "ams1117" in val or pkg == "sot-223":
        return "sot223"
    if re.search(r"\b(pc817|el817|4n35|817c)\b", val):
        return "dip4"

    # 2. Unambiguous reference designator prefixes.
    if pre == "PS":
        return "hlk"
    if pre == "K":
        return "relay"
    if pre == "Q":
        return "to220" if "to-220" in pkg else "sot23"
    if pre == "RV":
        return "mov"
    if pre == "F":
        return "fuse1206" if "1206" in pkg else "fuse5x20"
    if pre == "FB":
        return "buzzer"
    if pre == "SW":
        return "sw6mm"
    if pre.startswith("LED"):
        return "led3"
    if pre == "ANT":
        return "rf_sma"

    # 3. Keyword heuristics, only for designators with no strong meaning.
    if pre not in STRONG_PREFIXES:
        if "relay" in pkg or "relay" in dsc:
            return "relay"
        if re.search(r"\bmov\b", dsc) or pkg == "disc":
            return "mov"
        if "fuse" in dsc:
            return "fuse1206" if "1206" in pkg else "fuse5x20"
        if "buzz" in dsc:
            return "buzzer"
        if "tactile" in val or "button" in dsc:
            return "sw6mm"
    if pre in ("TVS", "ZD", "DZ"):
        if pkg == "sma":
            return "sma"
        if pkg == "smb":
            return "smb"
        return "do41"
    if pre == "D":
        if pkg == "sma":
            return "sma"
        if pkg == "smb":
            return "smb"
        if pkg == "do-201":
            return "do201"
        return "do41"
    if pre == "Q":
        return "to220" if "to-220" in pkg else "sot23"
    if pre in ("U", "IC", "PC"):
        if pkg == "dip-4" or "opto" in dsc or re.search(r"\b(pc817|817c?|el817|4n35)\b", val):
            return "dip4"
        if pkg in ("soic-8", "sop"):
            return "soic8"
        if pkg == "sot-23":
            return "sot23"
        if "smd module" in pkg or pkg in ("module", "module/smd", "sip", "sip-4"):
            return "module_sm"
        return "soic8"
    if pre == "R":
        if pkg == "2512" or "shunt" in dsc or "shunt" in val:
            return "r2512"
        if pkg == "1206":
            return "r1206"
        return "r0805"
    if pre == "C":
        if pkg == "electrolytic":
            return "elec" if re.search(r"\b(470|1000|2200)", val) else "elec_sm"
        return "c0805"
    if pre in ("J", "JP", "CN"):
        if pkg == "header":
            return "hdr4" if re.search(r"\b4p|4-pin", val) else "hdr3"
        return "term3" if re.search(r"\b3p|3-pin|3 way", val) else "term2"
    if pre == "TP":
        return "testpoint"
    if pre in ("BT", "M", "MOD"):
        if pkg in ("module", "module/smd", "smd module", "-"):
            return "module_sm"
        if "cell" in pkg:
            return "coincell"
        return "module_sm"

    # Package fallbacks
    if pkg in ("module", "module/smd", "smd module", "sip", "sip-4", "clamp", "mixed"):
        return "module_sm"
    if "cell" in pkg:
        return "coincell"
    if pkg == "0805":
        return "r0805"
    if pkg == "2512":
        return "r2512"
    if pkg == "electrolytic":
        return "elec_sm"
    if pkg == "terminal":
        return "term2"
    if pkg == "header":
        return "hdr3"
    if pkg == "smb":
        return "smb"
    if pkg == "sma":
        return "sma"
    if pkg == "tht":
        return "hdr3"
    return None


def _load_raw(libpath, name):
    """Load a footprint, tolerating KiCad's flaky SWIG downcast/plugin guessing."""
    attempts = (
        lambda: pcbnew.FootprintLoad(libpath, name),
        lambda: _plugin().FootprintLoad(libpath, name, False),
    )
    for fn in attempts:
        try:
            obj = fn()
        except Exception:
            continue
        obj = _dc(obj, pcbnew.Cast_to_FOOTPRINT)
        if obj is not None:
            return obj
    return None


def load_fp(board, key, ref, value):
    lib, name, w, h, tht = FP[key]
    fp = _load_raw(os.path.join(FP_ROOT, lib + ".pretty"), name)
    if fp is None:
        return None, 0, 0
    board.Add(fp)
    fp.SetReference(ref)
    fp.SetValue(value[:40])
    return fp, w, h


_FP_SIZE = {}
_FP_PADS = {}

# The ESP32 module's library courtyard includes its RF keep-out zone (~49x42 mm),
# which is far larger than the module body. Reserve the body plus an antenna
# keep-clear band instead, and place it against a board edge.
# The ESP32 module needs a keep-out beyond its antenna end, and the placer may
# rotate it, so reserve the keep-out on both axes rather than guessing which way
# the antenna will end up facing.
FP_PACK_SIZE = {"esp32": (20.5 + 2 * 7.0, 33.0 + 2 * 7.0)}


def fp_size(key, fallback_w, fallback_h):
    """Real courtyard extents of a footprint in mm, measured once and cached.

    The hand-written table under-estimates several parts, which pushed
    footprints into each other and across the mains barrier. Measuring the
    library footprint itself is the only reliable source.
    """
    if key in _FP_SIZE:
        return _FP_SIZE[key]
    if key in FP_PACK_SIZE:
        _FP_SIZE[key] = FP_PACK_SIZE[key]
        return _FP_SIZE[key]
    w, h = fallback_w, fallback_h
    try:
        scratch = pcbnew.BOARD()
        fp, _, _ = load_fp(scratch, key, "X1", "x")
        if fp is not None:
            try:
                fp.BuildCourtyardCaches()
            except Exception:
                pass
            measured = None
            for getter, pad in ((lambda: fp.GetCourtyard(pcbnew.F_CrtYd).BBox(), 0.0),
                                (lambda: fp.GetBoundingBox(False, False), 0.0),
                                (lambda: fp.GetFpPadsLocalBbox(), 1.0)):
                try:
                    bb = getter()
                    bw = bb.GetWidth() / 1e6 + pad
                    bh = bb.GetHeight() / 1e6 + pad
                except Exception:
                    continue
                if 0.3 < bw < 200 and 0.3 < bh < 200:
                    measured = (bw, bh)
                    break
            if measured:
                w, h = measured
    except Exception:
        pass
    _FP_SIZE[key] = (round(w + FP_CLEARANCE, 2), round(h + FP_CLEARANCE, 2))
    return _FP_SIZE[key]


def fp_pad_size(key, default_w, default_h):
    """Extent of a footprint's pad field, cached.

    Through-hole pads pierce both layers, so this - not the whole courtyard -
    is the area that must stay clear on the opposite side. Courtyards on
    opposite layers may legitimately overlap.

    Parts are positioned by courtyard centre, so the returned box is grown to
    be concentric with the courtyard; otherwise an asymmetric footprint's pads
    would sit outside the reserved area.
    """
    if key in _FP_PADS:
        return _FP_PADS[key]
    w, h = default_w, default_h
    try:
        scratch = pcbnew.BOARD()
        fp, _, _ = load_fp(scratch, key, "X1", "x")
        if fp is not None:
            try:
                fp.BuildCourtyardCaches()
            except Exception:
                pass
            pb = fp.GetFpPadsLocalBbox()
            bw, bh = pb.GetWidth() / 1e6, pb.GetHeight() / 1e6
            if 0.3 < bw < 200 and 0.3 < bh < 200:
                w, h = bw, bh
                cb = _extent_box(fp, key)
                if cb is not None:
                    dx = abs(pb.GetCenter().x - cb.GetCenter().x) / 1e6
                    dy = abs(pb.GetCenter().y - cb.GetCenter().y) / 1e6
                    w, h = w + 2 * dx, h + 2 * dy
    except Exception:
        pass
    _FP_PADS[key] = (round(w + FP_CLEARANCE, 2), round(h + FP_CLEARANCE, 2))
    return _FP_PADS[key]


def _pads_bbox(fp):
    """Union of the placed pads' bounding boxes, in absolute board coords.

    GetFpPadsLocalBbox() is in the footprint's *local* frame, so using it to
    re-centre a placed part translates it by almost the full board coordinate.
    """
    box = None
    for p in fp.Pads():
        b = _dc(p, pcbnew.PAD).GetBoundingBox()
        if box is None:
            box = pcbnew.BOX2I(b.GetOrigin(), b.GetSize())
        else:
            box.Merge(b)
    return box


def _extent_box(fp, key):
    """Bounding box actually occupied by a placed footprint, in internal units."""
    getters = [lambda: fp.GetCourtyard(pcbnew.F_CrtYd).BBox(),
               lambda: fp.GetCourtyard(pcbnew.B_CrtYd).BBox(),
               lambda: fp.GetBoundingBox(False, False)]
    if key in FP_PACK_SIZE:
        # We deliberately reserve less than the library courtyard for these,
        # so align on the pads instead or the part lands well off its slot.
        getters = [lambda: _pads_bbox(fp)] + getters
    for g in getters:
        try:
            bb = g()
            if bb.GetWidth() > 0 and bb.GetHeight() > 0:
                return bb
        except Exception:
            continue
    return None


def place_fp(fp, key, cx, cy, rotated=False, back=False):
    """Put a footprint down so its real extents are centred on (cx, cy).

    Rotation and flipping pivot around the footprint anchor, which is often
    not the courtyard centre, so the part has to be nudged back afterwards.
    """
    fp.SetPosition(V(cx, cy))
    if rotated:
        fp.SetOrientationDegrees(90)
    if back:
        fp.Flip(V(cx, cy), False)
    try:
        fp.BuildCourtyardCaches()
    except Exception:
        pass
    bb = _extent_box(fp, key)
    if bb is not None:
        c = bb.GetCenter()
        dx, dy = MM(cx) - c.x, MM(cy) - c.y
        if dx or dy:
            fp.Move(pcbnew.VECTOR2I(int(dx), int(dy)))
    fab_reference(fp, back)
    return fp


def fab_reference(fp, back=False):
    """Move the reference designator off the silkscreen onto the fab layer.

    These boards are dense enough that auto-placed reference text lands on
    neighbouring pads and silkscreen. Assembly houses read designators from the
    fab drawing and the pick-and-place file, so the silkscreen is reserved for
    safety and polarity marking - standard practice on high-density boards.
    """
    ref = fp.Reference()
    ref.SetLayer(pcbnew.B_Fab if back else pcbnew.F_Fab)
    ref.SetTextSize(pcbnew.VECTOR2I(MM(0.8), MM(0.8)))
    ref.SetTextThickness(MM(0.13))
    ref.SetMirrored(bool(back))
    val = fp.Value()
    val.SetLayer(pcbnew.B_Fab if back else pcbnew.F_Fab)
    val.SetVisible(False)


# --------------------------------------------------------------------------
# Geometry helpers
# --------------------------------------------------------------------------
def add_seg(board, layer, x1, y1, x2, y2, width=0.15):
    s = pcbnew.PCB_SHAPE(board)
    s.SetShape(pcbnew.SHAPE_T_SEGMENT)
    s.SetStart(V(x1, y1))
    s.SetEnd(V(x2, y2))
    s.SetLayer(layer)
    s.SetWidth(MM(width))
    board.Add(s)
    return s


def add_arc(board, layer, cx, cy, sx, sy, angle_deg, width=0.15):
    s = pcbnew.PCB_SHAPE(board)
    s.SetShape(pcbnew.SHAPE_T_ARC)
    s.SetCenter(V(cx, cy))
    s.SetStart(V(sx, sy))
    s.SetArcAngleAndEnd(pcbnew.EDA_ANGLE(angle_deg, pcbnew.DEGREES_T), False)
    s.SetLayer(layer)
    s.SetWidth(MM(width))
    board.Add(s)
    return s


def rounded_outline(board, x0, y0, w, h, r=3.0):
    """Board outline on Edge.Cuts with rounded corners."""
    x1, y1 = x0 + w, y0 + h
    add_seg(board, pcbnew.Edge_Cuts, x0 + r, y0, x1 - r, y0, 0.1)
    add_seg(board, pcbnew.Edge_Cuts, x1, y0 + r, x1, y1 - r, 0.1)
    add_seg(board, pcbnew.Edge_Cuts, x1 - r, y1, x0 + r, y1, 0.1)
    add_seg(board, pcbnew.Edge_Cuts, x0, y1 - r, x0, y0 + r, 0.1)
    add_arc(board, pcbnew.Edge_Cuts, x0 + r, y0 + r, x0, y0 + r, 90, 0.1)
    add_arc(board, pcbnew.Edge_Cuts, x1 - r, y0 + r, x1 - r, y0, 90, 0.1)
    add_arc(board, pcbnew.Edge_Cuts, x1 - r, y1 - r, x1, y1 - r, 90, 0.1)
    add_arc(board, pcbnew.Edge_Cuts, x0 + r, y1 - r, x0 + r, y1, 90, 0.1)


def add_text(board, layer, x, y, text, size=1.0, thick=0.15, angle=0):
    t = pcbnew.PCB_TEXT(board)
    t.SetText(text)
    t.SetPosition(V(x, y))
    t.SetLayer(layer)
    t.SetTextSize(pcbnew.VECTOR2I(MM(size), MM(size)))
    t.SetTextThickness(MM(thick))
    if layer in (pcbnew.B_SilkS, pcbnew.B_Fab, pcbnew.B_Cu):
        t.SetMirrored(True)
    if angle:
        t.SetTextAngle(pcbnew.EDA_ANGLE(angle, pcbnew.DEGREES_T))
    board.Add(t)
    return t


def poly(points):
    v = pcbnew.VECTOR_VECTOR2I()
    for (x, y) in points:
        v.append(V(x, y))
    return v


def add_zone(board, layer, points, net=None):
    z = pcbnew.ZONE(board)
    z.AddPolygon(poly(points))
    z.SetLayer(layer)
    if net is not None:
        z.SetNet(net)
    # Copper islands with no connection to the rest of the pour are a plating
    # and EMC liability, and they leave pads thermally relieved to nothing.
    if hasattr(z, "SetIslandRemovalMode"):
        z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
    board.Add(z)
    return z


def add_rule_area(board, points, name, layers=None):
    """Named rule area with no restrictions - a handle for custom DRC rules."""
    z = pcbnew.ZONE(board)
    z.AddPolygon(poly(points))
    z.SetIsRuleArea(True)
    if layers is None:
        lset = pcbnew.LSET()
        lset.addLayer(pcbnew.F_Cu)
        lset.addLayer(pcbnew.B_Cu)
        z.SetLayerSet(lset)
    else:
        z.SetLayer(layers)
    for setter in ("SetDoNotAllowCopperPour", "SetDoNotAllowTracks",
                   "SetDoNotAllowVias", "SetDoNotAllowPads"):
        if hasattr(z, setter):
            getattr(z, setter)(False)
    z.SetZoneName(name)
    board.Add(z)
    return z


def add_keepout(board, points, name="", both_layers=False):
    """Rule area forbidding copper/tracks/vias - the mains isolation barrier."""
    z = pcbnew.ZONE(board)
    z.AddPolygon(poly(points))
    if both_layers:
        lset = pcbnew.LSET()
        lset.addLayer(pcbnew.F_Cu)
        lset.addLayer(pcbnew.B_Cu)
        z.SetLayerSet(lset)
    else:
        z.SetLayer(pcbnew.F_Cu)
    z.SetIsRuleArea(True)
    for setter in ("SetDoNotAllowCopperPour", "SetDoNotAllowTracks",
                   "SetDoNotAllowVias", "SetDoNotAllowPads"):
        if hasattr(z, setter):
            getattr(z, setter)(True)
    if name:
        z.SetZoneName(name)
    board.Add(z)
    return z


# Espressif's recommended WROOM keep-out is 48 x 21 mm - larger than most of
# these boards. It is replaced with this much smaller enforced keep-out, which
# is what commercial ESP32 products actually do; radiated performance has to be
# validated on real hardware.
RF_KEEPOUT_MM = 7.0


def tame_esp32(board, fp):
    """Swap the module's advisory RF keep-out and courtyard for usable ones.

    The stock ESP32-WROOM footprint carries a 48 x 21 mm antenna keep-out rule
    area and a 48.6 x 41.6 mm courtyard that includes it. Left in place, every
    other part on the board lands inside them. Returns the enforced keep-out
    polygon, or None.
    """
    pads = _pads_bbox(fp)
    if pads is None:
        return None
    ko_box = None
    for z in list(fp.Zones()):
        z = _dc(z, pcbnew.ZONE)
        if z.GetIsRuleArea() and ko_box is None:
            ko_box = z.GetBoundingBox()
        fp.Remove(z)
    crtyd = pcbnew.B_CrtYd if fp.IsFlipped() else pcbnew.F_CrtYd
    for g in list(fp.GraphicalItems()):
        try:
            if g.GetLayer() in (pcbnew.F_CrtYd, pcbnew.B_CrtYd):
                fp.Remove(g)
        except Exception:
            continue
    m = MM(0.25)
    r = pcbnew.PCB_SHAPE(fp)
    r.SetShape(pcbnew.SHAPE_T_RECT)
    r.SetStart(pcbnew.VECTOR2I(pads.GetLeft() - m, pads.GetTop() - m))
    r.SetEnd(pcbnew.VECTOR2I(pads.GetRight() + m, pads.GetBottom() + m))
    r.SetLayer(crtyd)
    r.SetWidth(MM(0.05))
    r.SetFilled(False)
    fp.Add(r)
    try:
        fp.BuildCourtyardCaches()
    except Exception:
        pass
    if ko_box is None:
        return None

    # Extend the keep-out from the module edge in whichever direction the
    # library keep-out pointed, so it follows rotation and flipping. It is not
    # widened sideways: only the depth is reserved by FP_PACK_SIZE, and a
    # keep-out wider than the reserved slot swallows the neighbouring parts.
    d = MM(RF_KEEPOUT_MM)
    ax = ko_box.GetCenter().x - pads.GetCenter().x
    ay = ko_box.GetCenter().y - pads.GetCenter().y
    if abs(ax) >= abs(ay):
        x0, x1 = ((pads.GetLeft() - d, pads.GetLeft()) if ax < 0
                  else (pads.GetRight(), pads.GetRight() + d))
        y0, y1 = pads.GetTop(), pads.GetBottom()
    else:
        y0, y1 = ((pads.GetTop() - d, pads.GetTop()) if ay < 0
                  else (pads.GetBottom(), pads.GetBottom() + d))
        x0, x1 = pads.GetLeft(), pads.GetRight()
    iu = pcbnew.ToMM
    pts = [(iu(x0), iu(y0)), (iu(x1), iu(y0)), (iu(x1), iu(y1)), (iu(x0), iu(y1))]
    add_keepout(board, pts, name="RF_KEEPOUT", both_layers=True)
    return pts


# --------------------------------------------------------------------------
# Placement
# --------------------------------------------------------------------------
class Packer:
    """Bottom-left packer over an axis-aligned region.

    Candidate corners are generated from the edges of everything already
    placed, then the lowest/leftmost fitting corner wins. That packs
    substantially tighter than a shelf packer, which matters because these
    boards are dominated by a few large through-hole parts.

    Through-hole parts consume copper on *both* layers, so each island keeps a
    shared ``blockers`` list holding their pad fields. Front-side placements
    record into it and back-side placements test against it, which stops SMD
    parts landing on top of a through-hole pad. Courtyards on opposite layers
    may overlap freely, so only the pad field is blocked.
    """

    def __init__(self, x, y, w, h, pitch=0.5, blockers=None):
        self.x0, self.y0, self.w, self.h = x, y, w, h
        self.pitch = pitch
        self.rects = []
        self.blockers = blockers if blockers is not None else []

    def _free(self, x, y, w, h):
        if x < self.x0 - 1e-6 or y < self.y0 - 1e-6:
            return False
        if x + w > self.x0 + self.w + 1e-6 or y + h > self.y0 + self.h + 1e-6:
            return False
        p = self.pitch
        for (bx, by, bw, bh) in self.rects:
            if x < bx + bw + p and x + w + p > bx and y < by + bh + p and y + h + p > by:
                return False
        for (bx, by, bw, bh) in self.blockers:
            if x < bx + bw + p and x + w + p > bx and y < by + bh + p and y + h + p > by:
                return False
        return True

    def _corners(self):
        xs, ys = {self.x0}, {self.y0}
        for (bx, by, bw, bh) in self.rects + self.blockers:
            xs.add(bx + bw + self.pitch)
            ys.add(by + bh + self.pitch)
        xs = sorted(v for v in xs if v < self.x0 + self.w)
        ys = sorted(v for v in ys if v < self.y0 + self.h)
        return xs, ys

    def _best(self, fw, fh):
        if fw > self.w + 1e-6 or fh > self.h + 1e-6:
            return None
        xs, ys = self._corners()
        for y in ys:
            for x in xs:
                if self._free(x, y, fw, fh):
                    return x, y
        return None

    def place(self, fw, fh, blocking=False, bw=None, bh=None):
        """Returns (x_centre, y_centre, rotated) or None.

        ``bw``/``bh`` describe the area that must stay clear on the opposite
        layer (the through-hole pad field), which is smaller than the slot.
        """
        best, rot = None, False
        a = self._best(fw, fh)
        b = self._best(fh, fw)
        # prefer whichever orientation sits lower, then further left
        if a is not None and (b is None or (a[1], a[0]) <= (b[1], b[0])):
            best = a
        elif b is not None:
            best, rot = b, True
            fw, fh = fh, fw
            bw, bh = bh, bw
        if best is None:
            return None
        x, y = best
        self.rects.append((x, y, fw, fh))
        if blocking:
            ow = fw if bw is None else min(bw, fw)
            oh = fh if bh is None else min(bh, fh)
            self.blockers.append((x + (fw - ow) / 2.0, y + (fh - oh) / 2.0, ow, oh))
        return x + fw / 2.0, y + fh / 2.0, rot


MAINS_REFS = re.compile(r"^(PS|F|RV|K|RSH)\d*", re.I)


def is_mains_part(ref, desc, value):
    d = (desc + " " + value).lower()
    if MAINS_REFS.match(ref or ""):
        return True
    return any(k in d for k in ("mains", "230v", "ac ", "surge", "shunt", "metering", "triac"))


AC_PSU = re.compile(r"HLK-PM|\b\d{3}\s*VAC\b|AC-?DC", re.I)


def device_is_mains(folder):
    """Decide from the BOM whether a board actually touches line voltage.

    The DEVICES table was hand-written and marks smart-light (12-24 V strip
    supply) and smart-lock (12 V) as mains. That forces an 8 mm isolation
    barrier and AC_L/AC_N net names onto boards whose only connector is
    'Vin +/-', wasting a third of the area and making DRC unsatisfiable. A
    board is mains only if it carries an isolated AC-DC brick, a line
    varistor, or a connector the BOM itself calls mains.
    """
    for row in read_bom(folder):
        ref = (row["ref"] or "").upper()
        d = " ".join([row.get("value") or "", row.get("desc") or "",
                      row.get("desc_full") or "", row.get("package") or ""])
        if AC_PSU.search(d):
            return True
        if ref.startswith("RV") and re.search(r"\bmov\b|varistor", d, re.I):
            return True
        if re.search(r"\bmains\b", d, re.I):
            return True
    return False


def split_combo(row):
    """'U3/Q1/K1/D1' + 'PC817 + S8050 + SRD-05 + 1N4007' -> four separate rows.

    Some BOM lines bundle a small sub-assembly onto one designator. Placing one
    footprint for it would silently drop the other parts, so split positionally
    on '/' (refs, packages) and ' + ' (values) when the counts line up.
    """
    refs = [r.strip() for r in row["ref"].split("/") if r.strip()]
    if len(refs) < 2 or not all(re.match(r"^[A-Za-z]+\d*$", r) for r in refs):
        return [row]
    vals = [v.strip() for v in re.split(r"\s+\+\s+", row["value"]) if v.strip()]
    pkgs = [p.strip() for p in row["package"].split("/") if p.strip()]
    per_part = len(vals) == len(refs)
    out = []
    for i, ref in enumerate(refs):
        out.append(dict(row, ref=ref, qty="1",
                        value=vals[i] if per_part else row["value"],
                        package=pkgs[i] if len(pkgs) == len(refs) else row["package"],
                        # The bundle description ("Optional light relay") describes the
                        # sub-assembly, not each part, and would mis-resolve all of them.
                        desc=vals[i] if per_part else row["desc"],
                        desc_full=row["desc"]))
    return out


def read_bom(folder):
    path = os.path.join(HW_ROOT, folder, "pcb", "BOM.csv")
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            ref = (r.get("Ref") or "").strip()
            if not ref or ref.upper() in ("PCB", "ENC", "MISC", "HW"):
                continue
            rows.extend(split_combo(dict(
                ref=ref,
                qty=(r.get("Qty") or "1").strip(),
                value=(r.get("Value/Part") or "").strip(),
                package=(r.get("Package") or "").strip(),
                desc=(r.get("Description") or "").strip(),
            )))
    return rows


def expand_refs(ref, qty):
    """'R1-R10' qty 10 -> R1..R10 ; 'C3-C6' -> C3..C6 ; else single."""
    m = re.match(r"^([A-Za-z]+)(\d+)\s*-\s*([A-Za-z]*)(\d+)$", ref)
    if m:
        pre, a, _, b = m.group(1), int(m.group(2)), m.group(3), int(m.group(4))
        if b >= a and (b - a) < 40:
            return ["%s%d" % (pre, i) for i in range(a, b + 1)]
    try:
        n = int(qty)
    except ValueError:
        n = 1
    if n > 1 and re.match(r"^[A-Za-z]+\d*$", ref):
        base = re.match(r"^([A-Za-z]+)(\d*)$", ref)
        pre = base.group(1)
        start = int(base.group(2)) if base.group(2) else 1
        return ["%s%d" % (pre, start + i) for i in range(n)]
    return [ref]


# --------------------------------------------------------------------------
# Net assignment
# --------------------------------------------------------------------------
def parse_pins(folder):
    """Pull (gpio, SIGNAL, note) rows out of the SCHEMATIC.md I/O table.

    The third column carries the documented drive chain, e.g.
    '-> PC1 -> Q1 -> K1 coil (socket live)', which is what lets us build a
    real netlist instead of just landing signals on MCU pads.
    """
    path = os.path.join(HW_ROOT, folder, "pcb", "SCHEMATIC.md")
    rows = []
    if not os.path.exists(path):
        return rows
    seen = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            if not line.startswith("|"):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) < 3:
                continue
            gpio = cells[1]
            if not re.fullmatch(r"\d{1,2}", gpio):
                continue
            sig = re.sub(r"[^A-Za-z0-9_]", "_", cells[0]).strip("_").upper()
            if not sig or int(gpio) in seen:
                continue
            seen.add(int(gpio))
            rows.append((int(gpio), sig, " ".join(cells[2:])))
    return rows


def parse_pinmap(folder):
    return {g: s for g, s, _ in parse_pins(folder)}


# --------------------------------------------------------------------------
# Netlist construction
#
# Pin functions are asserted from the part datasheets and collected here so a
# reviewer can check every assumption in one place:
#
#   hlk     HLK-PMxx AC/DC     1=AC L, 2=AC N, 3=-Vo (GND), 4=+Vo (+5V)
#   sot223  AMS1117 LDO        1=GND, 2=VOUT (tab tied), 3=VIN
#   sot23   S8050 NPN          1=base, 2=emitter, 3=collector
#   dip4    PC817 optocoupler  1=LED anode, 2=LED cathode, 3=emitter, 4=collector
#   relay   SANYOU SRD Form C  1=COM, 2=NO, 5=NC, 3/4=coil
#           (derived from the footprint geometry: pad 1 is the offset centre
#            pole, pads 2/5 the contact corners, pads 3/4 the coil end)
#   do41    1N4007             1=cathode, 2=anode
#   led3    3 mm LED           1=anode, 2=cathode
#   term2/3 terminal block     numbered left to right
#
# Any pad with no documented function gets its own single-pad net named
# N$<ref>.<pad> rather than being tied to a rail, so the generator can never
# invent a short that is not in the documentation.
# --------------------------------------------------------------------------
GND, V5, V3 = "GND", "+5V", "+3V3"
AC_L, AC_N, AC_LF, AC_LOAD, PE = "AC_L", "AC_N", "AC_L_FUSED", "AC_LOAD", "PE"

# ESP32-WROOM-32E pads wired to the internal SPI flash - must stay unconnected.
ESP32_FLASH_PADS = {17, 18, 19, 20, 21, 22}


class Netlist:
    """Pad -> net map for one board."""

    def __init__(self):
        self.pads = {}
        self.mains = set()      # nets carrying line voltage

    def tie(self, ref, pad, net):
        self.pads[(ref, str(pad))] = net

    def mark_mains(self, *nets):
        self.mains.update(n for n in nets if n)

    def tie_many(self, ref, mapping):
        for pad, net in mapping.items():
            self.tie(ref, pad, net)

    def net_of(self, ref, pad):
        return self.pads.get((ref, str(pad)))

    def names(self):
        return sorted(set(self.pads.values()))

    def multi(self):
        """Nets with more than one pad - i.e. the ones that need routing."""
        c = collections.Counter(self.pads.values())
        return {n for n, k in c.items() if k > 1}

    def part_domain(self, ref):
        """'mains', 'selv' or 'bridge' for one reference designator.

        Classifying by net membership is the only trustworthy answer. Name
        heuristics get it wrong in both directions: smart-plug's J1 is
        described as 'India 6/16A in/out' with no mains keyword at all, while
        U3 is an MP1584 buck on four boards and a metering front-end on one.
        """
        hot = cold = False
        for (r, _), net in self.pads.items():
            if r != ref:
                continue
            if net in self.mains:
                hot = True
            elif net:
                cold = True
        if hot and cold:
            return "bridge"
        return "mains" if hot else "selv"


def build_netlist(dev, parts):
    """Derive a complete netlist: every pad of every part lands on a net."""
    nl = Netlist()
    by_ref = {p["ref"]: p for p in parts}
    mains = bool(dev["mains"])
    rows = parse_pins(dev["folder"])
    sig_of_gpio = {g: s for g, s, _ in rows}
    used = set()

    def of(*prefixes):
        out = [r for r in by_ref if ref_prefix(r) in prefixes]
        return sorted(out, key=lambda r: (len(r), r))

    def key_of(r):
        return by_ref[r]["key"]

    def npads(r):
        return PAD_COUNT.get(key_of(r), 2)

    # ---------------- power input -------------------------------------
    if mains:
        nl.mark_mains(AC_L, AC_N, AC_LF, AC_LOAD, PE)
        inlet = next((r for r in of("J") if key_of(r) in ("term2", "term3")), None)
        if inlet:
            nl.tie_many(inlet, {1: AC_L, 2: AC_N})
            if key_of(inlet) == "term3":
                nl.tie(inlet, 3, PE)
            used.add(inlet)
        fuses = of("F")
        for r in fuses:
            nl.tie_many(r, {1: AC_L, 2: AC_LF})
            used.add(r)
        hot = AC_LF if fuses else AC_L
        for r in of("RV"):
            nl.tie_many(r, {1: hot, 2: AC_N})
            used.add(r)
        for r in of("PS"):
            nl.tie_many(r, {1: hot, 2: AC_N, 3: GND, 4: V5})
            used.add(r)
    else:
        hot = None
        inlet = next((r for r in of("J") if key_of(r) in ("term2", "term3")), None)
        if inlet:
            nl.tie_many(inlet, {1: V5, 2: GND})
            if key_of(inlet) == "term3":
                nl.tie(inlet, 3, GND)
            used.add(inlet)

    # ---------------- regulator + bulk / decoupling caps ---------------
    for r in [x for x in by_ref if key_of(x) == "sot223"]:
        nl.tie_many(r, {1: GND, 2: V3, 3: V5})
        used.add(r)

    bulk = [r for r in of("C") if key_of(r) in ("elec", "elec_sm")]
    for i, r in enumerate(bulk):
        nl.tie_many(r, {1: V5 if i % 2 == 0 else V3, 2: GND})
        used.add(r)
    for r in of("C"):
        if r in used:
            continue
        nl.tie_many(r, {1: V3, 2: GND})
        used.add(r)

    # ---------------- resistor pool for series / base drive ------------
    r_pool = [r for r in of("R") if r not in used and key_of(r) in
              ("r0805", "r1206")]

    def series(sig, dest):
        """Insert a pooled resistor between sig and dest; else tie directly."""
        if not r_pool:
            return sig
        r = r_pool.pop(0)
        nl.tie_many(r, {1: sig, 2: dest})
        used.add(r)
        return dest

    # ---------------- documented drive chains --------------------------
    # SCHEMATIC.md names parts as PC1/Q1/K1 but the BOMs call the same parts
    # U3/U4/PC1/..., so resolve by part type and fall back to the n-th part of
    # that type rather than trusting the reference designator.
    KINDS = {"opto": ("dip4",), "npn": ("sot23", "to220"), "relay": ("relay",),
             "led": ("led3",), "sw": ("sw6mm",), "buzz": ("buzzer",)}
    order = sorted(by_ref, key=lambda r: (ref_prefix(r), len(r), r))
    pools = {k: [r for r in order if key_of(r) in v] for k, v in KINDS.items()}

    def take(kind, exact):
        """Prefer the documented designator, else the next free part of the type."""
        if (exact in by_ref and exact not in used
                and key_of(exact) in KINDS[kind]):
            return exact
        for r in pools[kind]:
            if r not in used:
                return r
        return None

    diodes = [r for r in of("D") if key_of(r) in ("do41", "do201", "sma", "smb")]
    consumed_sigs, out_nets = set(), []

    for gpio, sig, note in rows:
        optos = re.findall(r"\bPC(\d+)", note)
        trans = re.findall(r"\bQ[a-z]*(\d*)", note)
        relays = re.findall(r"\bK(\d+)", note)
        leds = re.findall(r"\bLED(\d+)", note)
        btns = re.findall(r"\bSW(\d+)", note)
        buzz = re.findall(r"\bFB(\d+)", note)
        drive = sig

        if optos:
            pc = take("opto", "PC" + optos[0])
            if pc:
                anode = series(sig, sig + "_OPT")
                nl.tie_many(pc, {1: anode, 2: GND, 3: sig + "_DRV", 4: V5})
                used.add(pc)
                drive, _ = sig + "_DRV", consumed_sigs.add(sig)
        if trans:
            q = take("npn", "Q" + trans[0])
            if q:
                base = drive if drive != sig else series(sig, sig + "_B")
                tail = sig + ("_COIL" if relays else "_OUT")
                nl.tie_many(q, {1: base, 2: GND, 3: tail})
                used.add(q)
                drive, _ = tail, consumed_sigs.add(sig)
                if not relays:
                    out_nets.append(tail)
        if relays:
            k = take("relay", "K" + relays[0])
            if k:
                coil = drive if drive != sig else series(sig, sig + "_COIL")
                nl.tie_many(k, {3: V5, 4: coil})
                if mains:
                    nl.tie_many(k, {1: hot, 2: sig + "_SW", 5: "N$%s.5" % k})
                    # The unused NC contact still sits at line potential.
                    nl.mark_mains(sig + "_SW", "N$%s.5" % k)
                else:
                    nl.tie_many(k, {1: V5, 2: sig + "_SW", 5: "N$%s.5" % k})
                out_nets.append(sig + "_SW")
                used.add(k)
                consumed_sigs.add(sig)
                if diodes:                       # coil flyback clamp
                    d = diodes.pop(0)
                    nl.tie_many(d, {1: V5, 2: coil})
                    used.add(d)
        for n in leds:
            led = take("led", "LED" + n)
            if led:
                nl.tie_many(led, {1: series(sig, sig + "_A"), 2: GND})
                used.add(led)
                consumed_sigs.add(sig)
        for n in btns:
            sw = take("sw", "SW" + n)
            if sw:
                nl.tie_many(sw, {1: sig, 2: GND})
                used.add(sw)
                consumed_sigs.add(sig)
        for n in buzz:
            fb = take("buzz", "FB" + n)
            if fb:
                nl.tie_many(fb, {1: sig, 2: GND})
                used.add(fb)
                consumed_sigs.add(sig)

    # ---------------- energy metering front end ------------------------
    # Shunt sits in the switched live path: relay NO -> shunt -> outlet.
    shunt = next((r for r in by_ref if key_of(r) == "r2512" and r not in used),
                 None)
    if shunt and mains:
        src = out_nets[0] if out_nets else hot
        nl.tie_many(shunt, {1: src, 2: AC_LOAD})
        used.add(shunt)
        if src in out_nets:
            out_nets[out_nets.index(src)] = AC_LOAD
        else:
            out_nets.append(AC_LOAD)

    # BL0937 / HLW8012 family (SOP-8): 1=V2P 2=V1P 3=V1N 4=GND 5=CF 6=CF1
    # 7=SEL 8=VDD. Sense pins straddle the shunt; CF/CF1/SEL follow the doc.
    meter = next((r for r in by_ref
                  if key_of(r) in ("soic8", "sop") and r not in used), None)
    if meter:
        mtr = [s for _, s, _ in rows if re.search(r"MTR|CF|SEL", s)]
        m = {4: GND, 8: V3}
        m[1] = hot if mains else V5
        if shunt:
            m[2] = nl.net_of(shunt, 1) or V5
            m[3] = nl.net_of(shunt, 2) or GND
        for i, s in enumerate(mtr[:3]):
            m[5 + i] = s
            consumed_sigs.add(s)
        nl.tie_many(meter, m)
        used.add(meter)

    # ---------------- MCU ---------------------------------------------
    esp = next((r for r in by_ref if key_of(r) == "esp32"), None)
    if esp:
        for pad, fn in ESP32_PADS.items():
            if pad in ESP32_FLASH_PADS or fn == "NC":
                nl.tie(esp, pad, "N$%s.%d" % (esp, pad))
            elif fn in (GND, V3):
                nl.tie(esp, pad, fn)
            elif fn == "EN":
                nl.tie(esp, pad, "EN")
            elif fn.startswith("IO"):
                g = int(fn[2:])
                nl.tie(esp, pad, sig_of_gpio.get(g, "N$%s.%d" % (esp, pad)))
        used.add(esp)
        # EN pull-up and its RC cap come out of the remaining passive pool.
        if r_pool:
            r = r_pool.pop(0)
            nl.tie_many(r, {1: V3, 2: "EN"})
            used.add(r)

    # ---------------- UART / programming header ------------------------
    for r in of("JP"):
        if r in used:
            continue
        n = npads(r)
        order = ["UART_TX", "UART_RX", GND, V3][:n]
        nl.tie_many(r, {i + 1: v for i, v in enumerate(order)})
        used.add(r)
    if esp:
        # IO1/IO3 are the boot UART; bind them to the header nets.
        for pad, fn in ESP32_PADS.items():
            cur = nl.net_of(esp, pad) or ""
            if fn == "IO1" and cur.startswith("N$"):
                nl.tie(esp, pad, "UART_TX")
            elif fn == "IO3" and cur.startswith("N$"):
                nl.tie(esp, pad, "UART_RX")

    # ---------------- signals not consumed by an explicit chain --------
    # Switched outputs come first: a relay pole or FET drain has to reach a
    # connector or the board cannot actually drive anything.
    spare = out_nets + [s for _, s, _ in rows if s not in consumed_sigs]
    note_of = {s: n for _, s, n in rows}

    def wire_connector(ref, sigs):
        n = npads(ref)
        order = []
        if n > len(sigs) + 1:
            order.append(V5)
        order += list(sigs)
        order.append(AC_N if (mains and any(s in out_nets for s in sigs)) else GND)
        while len(order) < n:
            order.append(GND)
        nl.tie_many(ref, {i + 1: v for i, v in enumerate(order[:n])})
        used.add(ref)

    # Connectors and plug-in modules soak up the remaining documented signals.
    # A signal whose note names this connector wins it; otherwise take in order.
    for ref in of("J", "M", "MOD", "BT", "CN"):
        if ref in used:
            continue
        want = max(npads(ref) - 2, 0)
        named = [s for s in spare
                 if re.search(r"\b%s\b" % re.escape(ref), note_of.get(s, ""))]
        picks = (named or spare)[:want]
        for s in picks:
            spare.remove(s)
        wire_connector(ref, picks)

    # On integrated plug/socket bodies the inlet also carries the outlet, so
    # its third pole brings the switched live back out to the load.
    if mains and inlet and key_of(inlet) == "term3":
        have = set(nl.pads.values())
        load = AC_LOAD if AC_LOAD in have else (spare[0] if spare else PE)
        nl.tie(inlet, 3, load)
        if load in spare:
            spare.remove(load)

    # ---------------- antennas, pull-ups, everything else --------------
    for r in of("ANT"):
        if r not in used:
            nl.tie_many(r, {1: "ANT", 2: GND})
            used.add(r)

    # Remaining resistors become pull-ups on documented inputs (notes with a
    # '<-' arrow or an explicit INPUT_PULLUP), which is what the BOM calls them.
    for _, s, n in rows:
        if not r_pool:
            break
        if "<-" not in n and "PULLUP" not in n.upper():
            continue
        if s not in set(nl.pads.values()):
            continue
        r = r_pool.pop(0)
        nl.tie_many(r, {1: V3, 2: s})
        used.add(r)
    nl.spares = list(r_pool)
    for r in r_pool:
        nl.tie_many(r, {1: "N$%s.1" % r, 2: "N$%s.2" % r})
        used.add(r)

    # Anything still untouched gets per-pad nets - never a silent rail tie.
    for ref, p in by_ref.items():
        for pad in range(1, PAD_COUNT.get(p["key"], 2) + 1):
            if (ref, str(pad)) not in nl.pads:
                nl.tie(ref, pad, "N$%s.%d" % (ref, pad))
    return nl


def build_nets(board, names):
    nets = {}
    for n in names:
        ni = pcbnew.NETINFO_ITEM(board, n)
        board.Add(ni)
        nets[n] = ni
    return nets


# --------------------------------------------------------------------------
# Netclasses and design rules
# --------------------------------------------------------------------------
# Track widths are for 35 um (1 oz) outer copper, 20 K rise, IPC-2221 external.
#   0.25 mm -> ~1.1 A   0.80 mm -> ~2.6 A   1.50 mm -> ~4.0 A
# MAINS clearance is basic insulation, 250 VAC, pollution degree 2,
# overvoltage category II. Reinforced mains-to-SELV separation is NOT set
# here - it is enforced geometrically by the island split and the milled slot,
# and by the custom rule in the generated .kicad_dru.
NETCLASS_DEFS = [
    # name       track  clear  via_d  via_dr  description
    ("MAINS",     1.50,  2.00,  2.00,  1.00,
     "230 VAC line/neutral/PE and switched load, basic insulation"),
    ("POWER",     0.80,  0.30,  0.80,  0.40,
     "+5V / +3V3 / GND SELV rails"),
    ("Default",   0.25,  0.20,  0.60,  0.30,
     "Logic, sensor and low-current control signals"),
]
POWER_NETS = {GND, V5, V3}


def netclass_of(name, mains_nets):
    if name in mains_nets:
        return "MAINS"
    if name in POWER_NETS:
        return "POWER"
    return "Default"


def apply_netclasses(board, net_names, mains_nets):
    """Create the netclasses and bind every real net to one by exact name."""
    ds = board.GetDesignSettings()
    ns = ds.m_NetSettings
    tightest = None
    for name, trk, clr, vd, vdr, desc in NETCLASS_DEFS:
        nc = (ns.GetDefaultNetclass() if name == "Default"
              else pcbnew.NETCLASS(name))
        nc.SetTrackWidth(MM(trk))
        nc.SetClearance(MM(clr))
        nc.SetViaDiameter(MM(vd))
        nc.SetViaDrill(MM(vdr))
        nc.SetDescription(desc)
        if name != "Default":
            ns.SetNetclass(name, nc)
        tightest = (trk, clr, vd, vdr) if tightest is None else (
            min(tightest[0], trk), min(tightest[1], clr),
            min(tightest[2], vd), min(tightest[3], vdr))

    assigned = collections.Counter()
    for n in net_names:
        if n.startswith("N$"):      # unrouted single-pad stubs
            continue
        cls = netclass_of(n, mains_nets)
        assigned[cls] += 1
        if cls != "Default":
            # exact-name patterns: no globbing surprises
            ns.SetNetclassPatternAssignment(n, cls)
    ns.RecomputeEffectiveNetclasses()

    # Board-wide floors must be <= the tightest netclass or DRC self-conflicts.
    trk, clr, vd, vdr = tightest
    ds.SetCopperLayerCount(2)
    for attr, val in (("m_TrackMinWidth", trk), ("m_MinClearance", clr),
                      ("m_ViasMinSize", vd), ("m_ViasMinAnnularWidth", 0.13),
                      ("m_MinThroughDrill", 0.2), ("m_HoleToHoleMin", 0.25),
                      ("m_HoleClearance", 0.2), ("m_SilkClearance", 0.0)):
        try:
            setattr(ds, attr, MM(val))
        except Exception:
            pass
    # A ground pad at the edge of a pour can only ever take one thermal spoke.
    # Two is the DFM ideal; insisting on it here would force solid connections,
    # which make rework of through-hole ground pads much harder.
    try:
        ds.m_MinResolvedSpokes = 1
    except Exception:
        pass
    return assigned


DRU_HEADER = """(version 1)

# Generated by gen-pcb.py - do not hand edit, regenerate instead.
#
# Basic insulation (mains net to mains net) comes from the MAINS netclass
# clearance. This file adds the rules that a netclass cannot express.
"""

DRU_MAINS = """
# Inside a package that bridges the barrier, pin-to-pin spacing is fixed by the
# package (a 1.27 mm pitch SOIC cannot give 2 mm pin to pin). Isolation there is
# the IC's own datasheet rating, not a PCB creepage distance. This override must
# come first so it wins over the MAINS netclass clearance.
(rule "bridge_package_internal"
    (constraint clearance (min 0.2mm))
    (condition "A.insideArea('ISO_BRIDGE') && B.insideArea('ISO_BRIDGE')"))

# Reinforced insulation, 250 VAC, pollution degree 2, material group IIIa.
# IEC 62368-1 table 11 gives 5.5 mm creepage for basic and 2x that for
# reinforced; {creep} mm is used here with margin.
#
# ISO_BRIDGE rule areas cover the parts that physically span the barrier
# (isolated PSU, optocouplers, and any non-isolated front end). The rule is
# suppressed inside them because a clearance rule cannot describe what happens
# *inside* a package - every ISO_BRIDGE part is listed in LAYOUT.md and needs
# an explicit isolation review.
(rule "reinforced_mains_to_selv"
    (constraint clearance (min {creep}mm))
    (condition "A.NetClass == 'MAINS' && B.NetClass != 'MAINS' && !A.insideArea('ISO_BRIDGE') && !B.insideArea('ISO_BRIDGE')"))

# Line to neutral and line to switched load is basic insulation and is carried
# by the MAINS netclass clearance (2.0 mm); no extra rule needed here.

# Mains copper must not be undercut by the board edge routing tolerance.
(rule "mains_to_edge"
    (constraint edge_clearance (min 1.0mm))
    (condition "A.NetClass == 'MAINS'"))

# Mains tracks carry the full load current; do not let the router neck down.
(rule "mains_min_width"
    (constraint track_width (min 1.5mm))
    (condition "A.NetClass == 'MAINS'"))
"""

DRU_COMMON = """
# JLCPCB / PCBWay 2-layer economy process limits.
(rule "min_annular_ring"
    (constraint annular_width (min 0.13mm)))

(rule "min_via"
    (constraint hole_size (min 0.2mm) (max 6.3mm)))

(rule "text_height"
    (layer "?.Silkscreen")
    (constraint text_height (min 0.8mm))
    (constraint text_thickness (min 0.15mm)))
"""


def write_dru(path, dev, pkg_refs=()):
    """Emit the board-specific custom design rules KiCad DRC will honour."""
    body = DRU_HEADER
    if dev["mains"]:
        # Pad-to-pad spacing inside one component is fixed by the package, not
        # by PCB copper, so no clearance rule can be satisfied there. A SOP-8
        # metering front end has 0.67 mm pin pitch whether or not one of those
        # pins carries line voltage. Every such package is listed in the
        # LAYOUT.md isolation table and needs an explicit part-level review -
        # this rule only stops DRC from drowning in unactionable noise.
        for ref in pkg_refs:
            body += (
                '(rule "pkg_internal_%s"\n'
                '    (constraint clearance (min 0.2mm))\n'
                '    (condition "A.insideArea(\'PKG_%s\') && B.insideArea(\'PKG_%s\')"))\n\n'
                % (ref, ref, ref))
        body += DRU_MAINS.format(creep=dev["creepage"])
    body += DRU_COMMON
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(body)


# --------------------------------------------------------------------------
# Placement planning
# --------------------------------------------------------------------------
# Small SMD parts go on the back so the front stays free for THT/mechanical.
BACK_SIDE_KEYS = {"r0805", "c0805", "r1206", "r2512", "sot23", "soic8",
                  "sma", "smb", "fuse1206"}

FILL = 0.62          # realistic shelf-packing efficiency (both board sides used)
GROW = 1.05          # board growth step when the BOM does not fit
MAX_GROW = 4.0       # never inflate a board beyond this multiple of target
MIN_MAINS_W = 18.0   # a mains island narrower than this is not practical


def plan_parts(dev, mains_refs=None, bridge_refs=()):
    """Resolve every BOM line into concrete placeable parts.

    ``mains_refs`` overrides the name/description heuristic on the second pass,
    once the netlist is known and can say authoritatively which parts sit on
    line voltage. ``bridge_refs`` are the parts with pads on both sides of the
    barrier - the relay, the isolated PSU, the optocouplers.
    """
    parts, skipped = [], []
    seen_inlet = False
    creep = float(dev["creepage"])
    for row in read_bom(dev["folder"]):
        key = resolve(row["ref"], row["value"], row["package"], row["desc"])
        if key is None or key not in FP:
            skipped.append((row["ref"], row["value"], row["package"] or "unmapped"))
            continue
        # A mains inlet has to carry live, neutral AND the switched live back
        # out to the load, so give the first one three poles.
        if (dev["mains"] and not seen_inlet and key == "term2"
                and ref_prefix(row["ref"]) == "J"):
            key, seen_inlet = "term3", True
        _, _, w, h, tht = FP[key]
        w, h = fp_size(key, w, h)
        bw, bh = fp_pad_size(key, w, h) if tht else (w, h)
        for ref in expand_refs(row["ref"], row["qty"]):
            if mains_refs is None:
                mains = dev["mains"] and is_mains_part(
                    ref, row.get("desc_full") or row["desc"], row["value"])
            else:
                mains = ref in mains_refs
            grow = 0.0
            if mains:
                # Reserve the MAINS netclass clearance around every line-voltage
                # part so two of them can never pack closer than basic insulation.
                grow = MAINS_PART_GROW
            parts.append(dict(ref=ref, key=key, w=w + grow, h=h + grow,
                              bw=bw + grow, bh=bh + grow,
                              value=row["value"], mains=mains, tht=tht,
                              bridge=ref in bridge_refs,
                              back=key in BACK_SIDE_KEYS))
    return parts, skipped


def bucket_area(parts):
    return sum((p["w"] + 1.6) * (p["h"] + 1.6) for p in parts)


def split_islands(dev, parts, W):
    """Width of the mains island, sized by how much copper area it actually needs."""
    if not dev["mains"]:
        return 0.0
    MARGIN, creep = 3.0, float(dev["creepage"])
    avail = W - 2 * MARGIN - creep
    m_area = bucket_area([p for p in parts if p["mains"]])
    l_area = bucket_area([p for p in parts if not p["mains"]])
    if m_area + l_area <= 0:
        return max(MIN_MAINS_W, avail * 0.4)
    share = m_area / (m_area + l_area)
    w = avail * min(0.72, max(0.28, share))
    # the widest mains part (rotated if that helps) still has to fit
    m_parts = [p for p in parts if p["mains"]]
    if m_parts:
        w = max(w, max(min(p["w"], p["h"]) for p in m_parts))
    return max(MIN_MAINS_W, w)


def regions_for(dev, parts, W, H):
    MARGIN, creep = 3.0, float(dev["creepage"])
    GAP = 1.5          # keeps courtyards clear of the isolation keepout edges
    # Top and bottom bands are reserved for mounting holes, fiducials,
    # test points and silkscreen legends, so the packer must stay clear of them.
    BAND = 8.0
    top = 80.0 + BAND
    usable_h = H - 2 * BAND
    ox = 100.0
    if dev["mains"]:
        mw = split_islands(dev, parts, W)
        bar_x = ox + MARGIN + mw
        # Parts that carry mains on some pins and SELV on others - the isolated
        # PSU, the optocouplers, the metering front end - straddle the barrier
        # rather than living on one island. Putting them on either island would
        # force every mains net to cross the isolation keepout, which no router
        # can do, so the barrier is widened into a band that holds them.
        bridge = [p for p in parts if p.get("bridge")]
        band = creep
        if bridge:
            band = max(creep, max(min(p["w"], p["h"]) for p in bridge) + 2.0)
        lv_x = bar_x + band + GAP
        regions = {
            "mains": (ox + MARGIN, top, mw - GAP, usable_h),
            "lv": (lv_x, top, (ox + W - MARGIN) - lv_x, usable_h),
        }
        if bridge:
            regions["bridge"] = (bar_x, top, band, usable_h)
        return regions, bar_x, usable_h
    return {"lv": (ox + MARGIN, top, W - 2 * MARGIN, usable_h)}, None, usable_h


def _pack_order(parts):
    """Through-hole first (they claim both layers), then largest first."""
    return sorted(parts, key=lambda q: (not q["tht"], -(q["w"] * q["h"]),
                                        -min(q["w"], q["h"])))


def _side_options(p, regions):
    """Candidate (island, side) slots for a part, best first.

    A through-hole part always stays on the front: flipping it would not free
    any copper, since its pads pierce both layers regardless.

    A mains part is never offered the low-voltage island. Letting it spill
    there when the mains island is full silently destroys the isolation
    barrier - the board must grow instead. Bridge parts belong in the barrier
    band and nowhere else.
    """
    if p.get("bridge") and "bridge" in regions:
        return [("bridge", False)]
    island = "mains" if (p["mains"] and "mains" in regions) else "lv"
    if p["tht"]:
        return [(island, False)]
    return [(island, p["back"]), (island, not p["back"])]


def _new_packers(regions):
    packers, blockers = {}, {}
    for island, r in regions.items():
        blockers[island] = []
        for back in (False, True):
            packers[(island, back)] = Packer(*r, blockers=blockers[island])
    return packers


def try_pack(dev, parts, W, H):
    """Run the real packer at this board size.

    Returns a list of (part, x_centre, y_centre, rotated, back) when
    everything lands, otherwise None. Using the actual packer as the fit test
    keeps sizing and placement from ever disagreeing.
    """
    regions, _, usable_h = regions_for(dev, parts, W, H)
    if usable_h <= 0 or any(r[2] <= 0 for r in regions.values()):
        return None

    packers = _new_packers(regions)
    plan = []
    for p in _pack_order(parts):
        done = False
        for key in _side_options(p, regions):
            if key not in packers:
                continue
            pos = packers[key].place(p["w"], p["h"], blocking=p["tht"],
                                     bw=p["bw"], bh=p["bh"])
            if pos is not None:
                plan.append((p, pos[0], pos[1], pos[2], key[1]))
                done = True
                break
        if not done:
            return None
    return plan


def try_pack_partial(dev, parts, W, H):
    """Best-effort pack that keeps going instead of bailing on the first miss."""
    regions, _, usable_h = regions_for(dev, parts, W, H)
    if usable_h <= 0:
        return []
    packers = _new_packers(regions)
    plan = []
    for p in _pack_order(parts):
        for key in _side_options(p, regions):
            if key not in packers:
                continue
            pos = packers[key].place(p["w"], p["h"], blocking=p["tht"],
                                     bw=p["bw"], bh=p["bh"])
            if pos is not None:
                plan.append((p, pos[0], pos[1], pos[2], key[1]))
                break
    return plan


def size_board(dev, parts):
    """Grow the target board until every part actually packs, then tighten.

    Growth is uniform, which usually overshoots one dimension; the refinement
    pass shrinks height and width independently back to the smallest size that
    still packs.
    """
    W, H = float(dev["w"]), float(dev["h"])
    tw, th = W, H
    plan = try_pack(dev, parts, W, H)
    for _ in range(80):
        if plan is not None:
            break
        W, H = W * GROW, H * GROW
        if W / tw > MAX_GROW:
            W, H = tw * MAX_GROW, th * MAX_GROW
            return round(W, 1), round(H, 1), None, True
        plan = try_pack(dev, parts, W, H)
    if plan is None:
        W, H = tw * MAX_GROW, th * MAX_GROW
        return round(W, 1), round(H, 1), None, True

    # binary-search each dimension down to its minimum feasible value
    for axis in (1, 0):
        lo, hi = 0.0, (H if axis else W)
        best = hi
        for _ in range(12):
            mid = (lo + hi) / 2.0
            if hi - lo < 0.4:
                break
            trial = try_pack(dev, parts, W if axis else mid, mid if axis else H)
            if trial is None:
                lo = mid
            else:
                best, hi, plan = mid, mid, trial
        if axis:
            H = best
        else:
            W = best

    W, H = round(W + 0.05, 1), round(H + 0.05, 1)
    final = try_pack(dev, parts, W, H) or plan
    return W, H, final, (round(W / tw, 2) > 1.0 or round(H / th, 2) > 1.0)


# --------------------------------------------------------------------------
# Main board builder
# --------------------------------------------------------------------------
def build_board(dev):
    ORG_X, ORG_Y = 100.0, 80.0          # keep the board in KiCad's positive page area
    MARGIN = 3.0
    if not device_is_mains(dev["folder"]):
        dev = dict(dev, mains=False, creepage=0.0)
    creep = float(dev["creepage"])

    parts, skipped = plan_parts(dev)
    if dev["mains"]:
        # Second pass: the netlist knows exactly which parts touch line
        # voltage, so redo the plan with authoritative flags. Bridge parts
        # (PSU, opto, metering) stay on the low-voltage island - putting them
        # on the mains island would drag their SELV pins across the barrier.
        probe = build_netlist(dev, parts)
        doms = {p["ref"]: probe.part_domain(p["ref"]) for p in parts}
        mains_refs = {r for r, d in doms.items() if d == "mains"}
        bridge_refs = {r for r, d in doms.items() if d == "bridge"}
        parts, skipped = plan_parts(dev, mains_refs, bridge_refs)
    W, H, plan, grew = size_board(dev, parts)
    if plan is None:
        plan = try_pack_partial(dev, parts, W, H)

    board = pcbnew.BOARD()
    rounded_outline(board, ORG_X, ORG_Y, W, H, r=3.0)

    pins = parse_pinmap(dev["folder"])
    netlist = build_netlist(dev, parts)
    net_names = netlist.names()
    nets = build_nets(board, net_names)
    ncls = apply_netclasses(board, net_names, netlist.mains)
    routable = netlist.multi()

    # ---- regions: mains island (left) | isolation gap | LV island (right) ----
    regions, bar_x, usable_h = regions_for(dev, parts, W, H)
    band = regions["bridge"][2] if "bridge" in regions else creep

    placed, esp_fp = [], None
    planned_refs = set()
    fp_by_ref = {}
    bridges = []
    bridge_spans = []
    rf_keepout = None
    by_key = {p["ref"]: p["key"] for p in parts}

    for p, cx, cy, rotated, back in plan:
        planned_refs.add(p["ref"])
        fp, _, _ = load_fp(board, p["key"], p["ref"], p["value"])
        if fp is None:
            skipped.append((p["ref"], p["value"], "footprint load failed"))
            continue
        place_fp(fp, p["key"], cx, cy, rotated, back)
        if p["key"] == "esp32":
            esp_fp = fp
            rf_keepout = tame_esp32(board, fp)
        fp_by_ref[p["ref"]] = fp
        placed.append(p["ref"])

    for p in parts:
        if p["ref"] not in planned_refs:
            skipped.append((p["ref"], p["value"], "no room"))

    # ---- apply the derived netlist to every placed pad ----
    nets_attached, pads_total, pads_netted = 0, 0, 0
    for ref, fp in fp_by_ref.items():
        for pad in fp.Pads():
            pads_total += 1
            name = netlist.net_of(ref, pad.GetNumber())
            if name and name in nets:
                pad.SetNet(nets[name])
                pads_netted += 1
                if not name.startswith("N$"):
                    nets_attached += 1

    # ---- mounting holes ----
    mh_key = "mount_m2" if dev["mounts"] == 1 else "mount_m3"
    inset = 4.0
    spots = {
        1: [(ORG_X + W / 2, ORG_Y + H - inset)],
        2: [(ORG_X + inset, ORG_Y + inset), (ORG_X + W - inset, ORG_Y + H - inset)],
        4: [(ORG_X + inset, ORG_Y + inset), (ORG_X + W - inset, ORG_Y + inset),
            (ORG_X + inset, ORG_Y + H - inset), (ORG_X + W - inset, ORG_Y + H - inset)],
    }[dev["mounts"]]
    for i, (mx, my) in enumerate(spots, 1):
        fp, _, _ = load_fp(board, mh_key, "MH%d" % i, "MountingHole")
        if fp:
            place_fp(fp, mh_key, mx, my)

    def clear_of_barrier(x):
        """Nudge x out of the mains isolation band onto the low-voltage side."""
        if not dev["mains"] or bar_x is None:
            return x
        if bar_x - 2.0 < x < bar_x + band + 2.0:
            return bar_x + band + 3.0
        return x

    def clear_of_mounts(x, y, span=6.0):
        """Slide x sideways until it no longer sits on a mounting hole."""
        for _ in range(40):
            hit = next((m for m in spots
                        if abs(m[0] - x) < span and abs(m[1] - y) < span), None)
            if hit is None:
                return x
            x = hit[0] + span + 0.5
            if x > ORG_X + W - 4.0:
                return None
        return x

    # ---- fiducials (PnP) - opposite corners, clear of mounts and the barrier ----
    for i, (fx, fy) in enumerate([(ORG_X + W * 0.12, ORG_Y + 3.2),
                                  (ORG_X + W * 0.88, ORG_Y + H - 3.2)], 1):
        fx = clear_of_mounts(clear_of_barrier(fx), fy)
        if fx is None:
            continue
        fp, _, _ = load_fp(board, "fiducial", "FID%d" % i, "Fiducial")
        if fp:
            place_fp(fp, "fiducial", fx, fy)
            spots.append((fx, fy))      # keep test points off the fiducials

    # ---- test points (per pcb/README DFM checklist) ----
    # Bottom band of the low-voltage island only, and never inside the
    # reinforced-isolation distance of any mains pad.
    mains_pads = []
    if dev["mains"]:
        for ref, fp in fp_by_ref.items():
            for p in fp.Pads():
                if netlist.net_of(ref, p.GetNumber()) in netlist.mains:
                    c = p.GetPosition()
                    mains_pads.append((pcbnew.ToMM(c.x), pcbnew.ToMM(c.y)))

    def clear_of_mains(x, y, need):
        return all((x - mx) ** 2 + (y - my) ** 2 >= need ** 2
                   for mx, my in mains_pads)

    def clear_of_rf(x, y, need):
        if not rf_keepout:
            return True
        xs = [p[0] for p in rf_keepout]
        ys = [p[1] for p in rf_keepout]
        return not (min(xs) - need <= x <= max(xs) + need
                    and min(ys) - need <= y <= max(ys) + need)

    tp_nets = ["+5V", "+3V3", "GND"]
    tp_y = ORG_Y + H - 4.6
    lv_x0 = max(regions["lv"][0] + 2.0, clear_of_barrier(ORG_X + W * 0.42))
    tp_x = lv_x0
    tps = []
    # Some BOMs already list their own TP positions. Reusing those designators
    # gives two footprints the same reference, which breaks the netlist and
    # crashes the Specctra exporter, so take the next free numbers instead.
    used_tp = {f.GetReference() for f in board.GetFootprints()}
    tp_no = 1
    for tn in tp_nets:
        if tn not in nets:
            continue
        tx = clear_of_mounts(tp_x, tp_y)
        while tx is not None and tx <= ORG_X + W - 6.0 and not (
                clear_of_mains(tx, tp_y, creep + 1.5)
                and clear_of_rf(tx, tp_y, 1.0)):
            tx = clear_of_mounts(tx + 2.0, tp_y)
        if tx is None or tx > ORG_X + W - 6.0:
            continue
        while ("TP%d" % tp_no) in used_tp:
            tp_no += 1
        ref = "TP%d" % tp_no
        fp, _, _ = load_fp(board, "testpoint", ref, tn)
        if not fp:
            continue
        place_fp(fp, "testpoint", tx, tp_y)
        set_pad_net(fp, "1", nets[tn])
        tps.append(tn)
        used_tp.add(ref)
        tp_x = tx + 4.0

    # ---- isolation barrier: keepout + milled slot + silk hatch ----
    pad_boxes = []
    for f in board.GetFootprints():
        for p in f.Pads():
            b = p.GetBoundingBox()
            pad_boxes.append((pcbnew.ToMM(b.GetLeft()), pcbnew.ToMM(b.GetTop()),
                              pcbnew.ToMM(b.GetRight()), pcbnew.ToMM(b.GetBottom())))

    def free_text_spot(tw, th, x_lo, x_hi):
        """Silkscreen over an exposed pad is a real solderability defect, so
        scan for somewhere the label actually fits rather than assuming."""
        for dy in (0, -3, 3, -6, 6, -9, 9, -12, 12, -15, 15):
            cy = ORG_Y + H / 2.0 + dy
            if cy - th / 2.0 < ORG_Y + 1.0 or cy + th / 2.0 > ORG_Y + H - 1.0:
                continue
            cx = x_lo
            while cx <= x_hi:
                x0, y0 = cx - tw / 2.0, cy - th / 2.0
                x1, y1 = cx + tw / 2.0, cy + th / 2.0
                if all(x1 < a or x0 > c or y1 < b or y0 > d
                       for a, b, c, d in pad_boxes):
                    return cx, cy
                cx += 1.0
        return None

    def silk_text(layer, cx, cy, txt, size, thick):
        """Nudge a label off any pad it lands on; drop it if there is no room."""
        tw, th = len(txt) * size * 1.1 + 0.6, size + 0.6
        for dy in (0, 1.2, -1.2, 2.4, -2.4, 3.6, -3.6):
            y = cy + dy
            if y - th / 2.0 < ORG_Y + 0.6 or y + th / 2.0 > ORG_Y + H - 0.6:
                continue
            x0, y0, x1, y1 = cx - tw / 2.0, y - th / 2.0, cx + tw / 2.0, y + th / 2.0
            if all(x1 < a or x0 > c or y1 < b or y0 > d
                   for a, b, c, d in pad_boxes):
                add_text(board, layer, cx, y, txt, size=size, thick=thick)
                return True
        return False

    pkg_refs = []
    if dev["mains"] and bar_x is not None:
        # Any footprint with pads on both a MAINS net and a SELV net physically
        # bridges the barrier. Derive that list from the netlist instead of
        # hardcoding it: mark each as an ISO_BRIDGE rule area so the reinforced
        # clearance rule does not fire inside the part, and report every bridge
        # so each one gets an explicit isolation review.
        for ref, fp in sorted(fp_by_ref.items()):
            pn = {netlist.net_of(ref, p.GetNumber()) for p in fp.Pads()
                  if p.GetNumber()}
            pn.discard(None)
            hot = pn & netlist.mains
            if hot:
                # Per-package area: pad-to-pad spacing inside one component is
                # set by the package, not by the copper clearance rules.
                pb = _pads_bbox(fp)
                if pb is not None:
                    m, iu = MM(0.3), pcbnew.ToMM
                    add_rule_area(board, [
                        (iu(pb.GetLeft() - m), iu(pb.GetTop() - m)),
                        (iu(pb.GetRight() + m), iu(pb.GetTop() - m)),
                        (iu(pb.GetRight() + m), iu(pb.GetBottom() + m)),
                        (iu(pb.GetLeft() - m), iu(pb.GetBottom() + m))],
                        "PKG_" + ref)
                    pkg_refs.append(ref)
            if not hot or not (pn - netlist.mains):
                continue
            bridges.append((ref, by_key.get(ref, "?"),
                            sorted(hot), sorted(pn - netlist.mains)))
            bb = fp.GetBoundingBox(False, False)
            m, iu = MM(0.6), pcbnew.ToMM
            bridge_spans.append((iu(bb.GetTop() - m), iu(bb.GetBottom() + m)))
            add_rule_area(board, [
                (iu(bb.GetLeft() - m), iu(bb.GetTop() - m)),
                (iu(bb.GetRight() + m), iu(bb.GetTop() - m)),
                (iu(bb.GetRight() + m), iu(bb.GetBottom() + m)),
                (iu(bb.GetLeft() - m), iu(bb.GetBottom() + m))], "ISO_BRIDGE")

        # The barrier keepout runs the full height of the board except where a
        # straddling part sits: there the isolation is provided by the part's
        # own package, which is why every one of them is listed for review.
        # A continuous strip would make every mains net unroutable.
        y_top, y_bot = ORG_Y + 1.0, ORG_Y + H - 1.0
        cuts = sorted(bridge_spans)
        y = y_top
        segs = []
        for a, b in cuts:
            if a - y > 1.0:
                segs.append((y, min(a, y_bot)))
            y = max(y, b)
        if y_bot - y > 1.0:
            segs.append((y, y_bot))
        bx0 = bar_x + (band - creep) / 2.0
        for a, b in segs:
            add_keepout(board, [(bx0, a), (bx0 + creep, a),
                                (bx0 + creep, b), (bx0, b)],
                        name="MAINS_BARRIER", both_layers=True)
        # Milled isolation slots. One per barrier segment, inset from the board
        # edge and from each straddling part so the mill never touches a pad and
        # the board stays in one piece.
        sx, sw = bx0 + creep / 2.0 - 0.8, 1.6
        slots = []
        for a, b in segs:
            sy0, sy1 = max(a + 1.5, ORG_Y + 7.0), min(b - 1.5, ORG_Y + H - 7.0)
            if sy1 - sy0 < 3.0:
                continue
            slots.append((sy0, sy1))
            add_seg(board, pcbnew.Edge_Cuts, sx, sy0, sx + sw, sy0, 0.1)
            add_seg(board, pcbnew.Edge_Cuts, sx + sw, sy0, sx + sw, sy1, 0.1)
            add_seg(board, pcbnew.Edge_Cuts, sx + sw, sy1, sx, sy1, 0.1)
            add_seg(board, pcbnew.Edge_Cuts, sx, sy1, sx, sy0, 0.1)
        ty = ORG_Y + H / 2.0
        if slots:
            a, b = max(slots, key=lambda s: s[1] - s[0])
            ty = (a + b) / 2.0
        # The label sits in the barrier band, so it has to clear the straddling
        # parts' own silkscreen as well as every pad. Prefer the roomiest slot.
        obst = list(pad_boxes)
        for f in board.GetFootprints():
            for g in f.GraphicalItems():
                if g.GetLayer() not in (pcbnew.F_SilkS, pcbnew.B_SilkS):
                    continue
                gb = g.GetBoundingBox()
                obst.append((pcbnew.ToMM(gb.GetLeft()), pcbnew.ToMM(gb.GetTop()),
                             pcbnew.ToMM(gb.GetRight()), pcbnew.ToMM(gb.GetBottom())))
        label, lsz = "!! MAINS !!", 1.1
        lh, lw = len(label) * lsz * 1.1 + 0.6, lsz + 0.8
        tx = bx0 + creep / 2.0
        spot = None
        for a, b in sorted(slots or [(ORG_Y + 1.0, ORG_Y + H - 1.0)],
                           key=lambda s: s[1] - s[0], reverse=True):
            cy = a + lh / 2.0
            while cy + lh / 2.0 <= b and spot is None:
                x0, y0 = tx - lw / 2.0, cy - lh / 2.0
                x1, y1 = tx + lw / 2.0, cy + lh / 2.0
                if all(x1 < ox or x0 > oc or y1 < oy or y0 > od
                       for ox, oy, oc, od in obst):
                    spot = cy
                cy += 1.0
            if spot is not None:
                break
        if spot is not None:
            add_text(board, pcbnew.F_SilkS, tx, spot, label,
                     size=lsz, thick=0.2, angle=90)
        silk_text(pcbnew.F_SilkS, ORG_X + 9.0, ORG_Y + H - 4.0,
                  "RISK OF SHOCK", 1.0, 0.18)

    # ---- GND pour on the LV island (both layers) ----
    px0, py0 = regions["lv"][0] - 1.0, ORG_Y + 1.0
    px1, py1 = ORG_X + W - 1.0, ORG_Y + H - 1.0
    pts = [(px0, py0), (px1, py0), (px1, py1), (px0, py1)]
    add_zone(board, pcbnew.B_Cu, pts, nets["GND"])
    add_zone(board, pcbnew.F_Cu, pts, nets["GND"])

    # ---- silkscreen identity ----
    silk_text(pcbnew.F_SilkS, ORG_X + W / 2.0, ORG_Y + 2.5,
              dev["title"], 1.2, 0.2)
    silk_text(pcbnew.F_SilkS, ORG_X + W / 2.0, ORG_Y + H - 2.5,
              "%s  REV A  circuvent.com" % dev["model"].upper(), 0.9, 0.15)
    sn = free_text_spot(7.0, 2.0, max(regions["lv"][0] + 4.5, ORG_X + 4.5),
                        ORG_X + W - 4.5)
    if sn:
        add_text(board, pcbnew.B_SilkS, sn[0], sn[1], "SN/QR", size=1.0, thick=0.15)

    out = os.path.join(HW_ROOT, dev["folder"], "pcb", dev["model"] + ".kicad_pcb")
    bond_duplicate_pads(board, netlist.mains)
    # Stitch before routing, not after. Once the router has laid tracks the
    # pour erodes around them, and a GND pad stranded on a fragment then has
    # nowhere legal to put a via. Placing them first also means the router
    # treats them as obstacles and keeps clear.
    try:
        pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    except Exception:
        pass
    gnd_pours = [z for z in [_dc(z, pcbnew.ZONE) for z in board.Zones()]
                 if not z.GetIsRuleArea() and z.GetNetname() == GND]
    stitch_ground(board, gnd_pours)
    pcbnew.SaveBoard(out, board)
    write_dru(out[:-len(".kicad_pcb")] + ".kicad_dru", dev, pkg_refs)

    # Sanity net: nothing may sit outside the board outline. Placement bugs are
    # invisible to DRC, which has no "footprint off board" rule.
    eb = board.GetBoardEdgesBoundingBox()
    offboard = []
    for ref, fp in fp_by_ref.items():
        bb = _extent_box(fp, by_key.get(ref, ""))
        if bb is not None and not eb.Contains(bb):
            offboard.append(ref)

    # Two footprints sharing a reference silently merge in the netlist and take
    # the Specctra exporter down with an access violation, so fail loudly.
    seen = collections.Counter(f.GetReference() for f in board.GetFootprints())
    dupes = sorted(r for r, n in seen.items() if n > 1)

    return dict(out=out, placed=placed, skipped=skipped, attached=nets_attached,
                nets=len(net_names), W=W, H=H, grew=grew, tps=", ".join(tps),
                routable=len(routable), pads=pads_total, netted=pads_netted,
                ncls=ncls, mains_nets=sorted(netlist.mains), bridges=bridges,
                offboard=offboard, dupes=dupes,
                spares=sorted(getattr(netlist, "spares", [])))


LAYOUT_DOC = """# {title} - generated PCB layout

**Auto-generated by `hardware/gen-pcb.py` - do not hand-edit; rerun the generator.**
Source of truth is `SCHEMATIC.md` (pin map + drive chains) + `BOM.csv` (parts).

## What was generated
| | |
| --- | --- |
| Board file | `{model}.kicad_pcb` |
| Custom design rules | `{model}.kicad_dru` |
| Board size | **{W} x {H} mm** (doc target {tw} x {th} mm) |
| Layers | 2 (F.Cu / B.Cu), FR4 1.6 mm, 1 oz Cu |
| Footprints placed | {parts} of {total} BOM positions |
| Nets | {nets} total, {routable} multi-pad (routable) |
| Pads bound to nets | {netted} of {pads} |
| Net classes | {ncls} |
| Routing | {routing} |
| DRC errors / unconnected | **{drc}** |
| Fab output | `gerbers/` (Gerber X2, Excellon + map, IPC-D-356, ODB++, IPC-2581), `fab/` (pick-and-place, STEP, fab + assembly PDFs) |

## Net classes and design rules
| Class | Track | Clearance | Via | Applies to |
| --- | --- | --- | --- | --- |
| MAINS | 1.50 mm | 2.00 mm | 2.00 / 1.00 mm | line, neutral, PE, switched load |
| POWER | 0.80 mm | 0.30 mm | 0.80 / 0.40 mm | +5V, +3V3, GND |
| Default | 0.25 mm | 0.20 mm | 0.60 / 0.30 mm | logic and sensor signals |

Track widths assume 35 um outer copper and a 20 K rise (IPC-2221 external):
0.25 mm ~ 1.1 A, 0.80 mm ~ 2.6 A, 1.50 mm ~ 4.0 A. **Anything switching more
than ~4 A needs the mains traces widened or plated to 2 oz.**

`{model}.kicad_dru` adds the rules a net class cannot express: reinforced
mains-to-SELV separation, mains-to-edge clearance, a minimum mains track width
the router may not neck below, and the fab's annular-ring / drill limits.

## Layout rules applied
- Footprints come from the stock KiCad libraries and are placed by measured
  courtyard, so no two courtyards collide on a layer.
- Through-hole pads are treated as occupying **both** layers, so SMD parts are
  never placed underneath a through-hole pad field.
- Small passives are flipped to B.Cu; through-hole and mechanical parts stay on F.Cu.
- Reference designators live on F.Fab / B.Fab, not the silkscreen: at this
  density silk refs collide with pads. Assembly reads them from the assembly
  PDF and the position files.
- The ESP32 module's library footprint carries a 48 x 21 mm keep-out, which is
  Espressif's "clear the whole antenna half-space" recommendation rather than a
  copper rule. Enforcing it verbatim makes these boards impossible to lay out,
  so it is replaced with an enforced 7 mm keep-out off the antenna end, applied
  on both layers. **This is a deliberate deviation and needs radiated
  performance validation on real hardware.**
{mains_notes}- Top and bottom edge bands are reserved for mounting holes, fiducials,
  test points ({tps}) and silkscreen legends.
- GND pour on both layers over the low-voltage area, tied together with GND vias
  on a 3.5 mm grid plus a rescue via beside any ground pad the grid misses. The
  stitching is placed **before** routing so the router keeps clear of it, and
  topped up again afterwards; board outline is rounded with {mounts} mounting hole(s).
- After routing the copper is cleaned up automatically: dangling router stubs
  are pruned layer by layer, ground pads the pour could not reach with a relief
  spoke are switched to a solid connection where that actually helps, and any
  pour fragment left floating gets its own stitching via.

## Netlist provenance - read this before trusting the board
The netlist is **derived by the generator** from the drive chains written in
`SCHEMATIC.md` (for example `-> PC1 -> Q1 -> K1 coil`), not captured from a
drawn schematic. It is complete in the sense that every pad of every placed
part is on a net, but it has not been reviewed against a real schematic.
Pin functions are taken from datasheets and are listed in the generator source;
the relay contact assignment (COM/NO/NC on pads 1/2/5) is inferred from the
footprint pad geometry because the library footprint carries no pin names.

Nets named `N$<ref>.<pad>` are deliberate single-pad stubs: unused pins,
the ESP32's internal SPI-flash pads, and unused relay contacts. The generator
never invents a rail connection it cannot justify from the documentation.
{spares}{unrouted}{bridges}
## Status
- [x] Board outline, stack-up, mounting holes, fiducials, test points
- [x] Component placement, DRC-clean against the custom fab + safety rules
- [x] Complete netlist: every pad on a net, net classes bound by net name
- [{rt}] Copper routing ({routing})
- [ ] Hand-finish any residual unconnected items listed above. On the mains
      boards these concentrate on the line side, where the metering front end
      and the relay/PSU bridge parts leave the router nowhere legal to go; they
      are a consequence of the open safety items below, not of the layout
      engine. Nothing here is a substitute for a designer reviewing the board.
- [ ] Schematic review of the generated netlist by an engineer
- [ ] Radiated performance validation of the reduced ESP32 antenna keep-out
- [ ] Impedance/thermal review, EMC pre-scan, and DFM review with the chosen fab
{safety}
## Regenerating
```
cd hardware
"<KiCad>/bin/python.exe" gen-pcb.py {folder} --fab
```
Omit the folder name to rebuild every device, `--no-route` to skip the
autorouter, and `--fab` to also write the production package.
"""


MAINS_DOC = """- Mains and low-voltage parts are split onto separate islands separated by an
  isolation band at least {creep} mm wide, backed by a copper keepout rule area
  and a milled isolation slot.
- Parts that genuinely have to touch both domains (the AC-DC module, the
  optocoupler, any metering front end) straddle the band. The keepout and the
  milled slot are cut into segments around them, because a continuous barrier
  would leave every mains net unroutable. Isolation across those parts is
  therefore the component's job, not the board's - they are each listed as an
  open safety item below.
- Every line-voltage part additionally reserves {grow} mm of extra room, enough
  for a mains clearance, a mains-width track and another clearance to pass
  between any two of them.
"""

SAFETY_DOC = """- [ ] **Mains creepage/clearance and fusing sign-off by a qualified engineer**
      before any board is fabricated or powered from the mains.
"""

BRIDGE_DOC = """
## OPEN SAFETY ITEM - parts that bridge the mains barrier
These footprints have pads on both a MAINS net and a SELV net, so the isolation
across them is provided by the component, not by the PCB. Each one needs an
explicit isolation review (creepage inside the package, isolation voltage
rating, and safety agency approval):

| Ref | Footprint | Mains-side nets | SELV-side nets |
| --- | --- | --- | --- |
{rows}

An optocoupler or an isolated PSU is fine here. A metering front-end such as
the BL0937 is **not** - it is galvanically connected to both sides, so either
its pulse outputs must cross through isolators or the whole low-voltage domain
must be treated as live.
"""


UNROUTED_DOC = """
## Residual unconnected items - hand-finish list
The autorouter left {n} connection(s) open. Each one is a real missing copper
connection and has to be drawn by hand (or designed out) before fabrication:

| # | Net | Class | From | To |
| --- | --- | --- | --- | --- |
{rows}
{note}"""

MAINS_UNROUTED_NOTE = """
The `MAINS` entries above are **not** an autorouter shortcoming. Every legal
path between them is blocked by the {creep} mm mains clearance and the isolation
band, because the parts involved sit on the barrier itself. They resolve when
the open safety items below are resolved - typically by isolating the metering
front end - not by re-running the router.
"""


def _unrouted_rows(dev, r):
    """Read this board's DRC report back and describe what is still open."""
    rep = os.path.join(HW_ROOT, dev["folder"], "pcb", "gerbers", "drc.json")
    try:
        with open(rep, encoding="utf-8") as f:
            items = json.load(f).get("unconnected_items", [])
    except Exception:
        return []
    mains = set(r.get("mains_nets") or ())
    out = []
    for it in items:
        ends = it.get("items", [])[:2]
        if len(ends) < 2:
            continue
        txt = [e.get("description", "?") for e in ends]
        m = re.search(r"\[([^\]]+)\]", txt[0])
        net = m.group(1) if m else "?"
        out.append((net, netclass_of(net, mains),
                    re.sub(r"\s*\[[^\]]*\]", "", txt[0]),
                    re.sub(r"\s*\[[^\]]*\]", "", txt[1])))
    return out


def write_layout_doc(dev, r, drc=None):
    """Document the generated layout next to the board file."""
    mains_notes = (MAINS_DOC.format(creep=dev["creepage"], grow=MAINS_PART_GROW)
                   if dev["mains"] else "")
    safety = SAFETY_DOC if dev["mains"] else ""
    bridges = ""
    if r.get("bridges"):
        rows = "\n".join("| `%s` | %s | %s | %s |"
                         % (ref, key, ", ".join(m) or "-", ", ".join(s) or "-")
                         for ref, key, m, s in r["bridges"])
        bridges = BRIDGE_DOC.format(rows=rows)
    spares = ""
    if r.get("spares"):
        spares = ("\nUnused BOM positions with no documented connection (fit as "
                  "DNP or delete from the BOM): %s\n"
                  % ", ".join("`%s`" % s for s in r["spares"]))
    routing = r.get("route_msg") or "not run"
    if r.get("routed"):
        routing = "autorouted, " + routing
    ncls = ", ".join("%s=%d" % (k, v) for k, v in
                     sorted((r.get("ncls") or {}).items())) or "n/a"
    if drc is None:
        drc_txt = "not run"
    elif isinstance(drc, tuple):
        drc_txt = "%s / %s" % drc
    else:
        drc_txt = str(drc)
    unrouted = ""
    rows = _unrouted_rows(dev, r)
    if rows:
        note = (MAINS_UNROUTED_NOTE.format(creep=dev["creepage"])
                if any(c == "MAINS" for _, c, _, _ in rows) else "")
        unrouted = UNROUTED_DOC.format(
            n=len(rows), note=note,
            rows="\n".join("| %d | `%s` | %s | %s | %s |" % (i, n, c, a, b)
                           for i, (n, c, a, b) in enumerate(rows, 1)))
    txt = LAYOUT_DOC.format(
        title=dev["title"], model=dev["model"], W=r["W"], H=r["H"],
        tw=dev["w"], th=dev["h"], parts=len(r["placed"]),
        total=len(r["placed"]) + len(r["skipped"]), nets=r["nets"],
        routable=r["routable"], netted=r["netted"], pads=r["pads"],
        ncls=ncls, routing=routing, rt="x" if r.get("routed") else " ",
        drc=drc_txt, spares=spares, bridges=bridges, unrouted=unrouted,
        mains_notes=mains_notes, tps=r["tps"] or "none", mounts=dev["mounts"],
        safety=safety, folder=dev["folder"])
    path = os.path.join(HW_ROOT, dev["folder"], "pcb", "LAYOUT.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(txt)
    return path


GERBER_LAYERS = ("F.Cu,B.Cu,F.Paste,B.Paste,F.Silkscreen,B.Silkscreen,"
                 "F.Mask,B.Mask,Edge.Cuts")


# --------------------------------------------------------------------------
# Autorouting (Specctra DSN -> freerouting -> SES)
# --------------------------------------------------------------------------
# freerouting 2.2.x needs a Java 25 runtime and 1.9.x cannot run headless, so
# 2.1.0 is the version this pipeline targets. Point FREEROUTING_JAR elsewhere
# to override.
FREEROUTING_JAR = os.environ.get(
    "FREEROUTING_JAR",
    os.path.join(os.path.expanduser("~"), "freerouting", "fr-2.1.0.jar"))

# The router pass limit only bounds the routing phase; the optimizer runs
# unbounded unless its own limit is set, and will happily churn for hours
# shaving fractions off the score. Both are capped here, plus a wall clock.
# Keys are the Gson @SerializedName values, which are snake_case - camelCase
# spellings are silently ignored.
FR_CONFIG = {
    "gui": {"enabled": False},
    "usage_and_diagnostic_data": {"disable_analytics": True,
                                  "segment_write_key": ""},
    "router": {
        "max_passes": 24,
        "max_threads": 4,
        "vias_allowed": True,
        "automatic_neckdown": True,
        "optimizer": {"max_passes": 4, "improvement_threshold": 0.01},
    },
}


def _hhmmss(seconds):
    """freerouting expects its job_timeout as an HH:MM:SS string."""
    s = int(seconds)
    return "%02d:%02d:%02d" % (s // 3600, (s % 3600) // 60, s % 60)


def _java():
    """Pick a JRE new enough for freerouting 2.1 (needs Java 21+)."""
    cands = [os.environ.get("FREEROUTING_JAVA")]
    for root in (r"C:\Program Files\Microsoft", r"C:\Program Files\Java",
                 r"C:\Program Files\Eclipse Adoptium"):
        if os.path.isdir(root):
            cands += [os.path.join(root, d, "bin", "java.exe")
                      for d in sorted(os.listdir(root), reverse=True)]
    if os.environ.get("JAVA_HOME"):
        cands.append(os.path.join(os.environ["JAVA_HOME"], "bin", "java.exe"))
    cands.append("java")
    for c in cands:
        if not c or (c != "java" and not os.path.exists(c)):
            continue
        try:
            v = subprocess.run([c, "-version"], capture_output=True, text=True,
                               timeout=20)
            m = re.search(r'"(\d+)', (v.stderr or "") + (v.stdout or ""))
            if m and int(m.group(1)) >= 21:
                return c
        except Exception:
            continue
    return None


def route_board(pcb_path, timeout=1800):
    """Autoroute a saved board in place. Returns (ok, message)."""
    if not os.path.exists(FREEROUTING_JAR):
        return False, "freerouting jar not found at %s" % FREEROUTING_JAR
    java = _java()
    if java is None:
        return False, "no Java 21+ runtime found (set FREEROUTING_JAVA)"
    base = pcb_path[:-len(".kicad_pcb")]
    dsn, ses = base + ".dsn", base + ".ses"
    work = os.path.join(os.path.dirname(pcb_path), ".route")
    os.makedirs(work, exist_ok=True)

    # Rule areas that forbid nothing are DRC handles (ISO_BRIDGE, PKG_*), but
    # the Specctra exporter turns every rule area into a keepout - which would
    # wall the router off from the PSU, opto and metering pads. Export from a
    # copy with those stripped, keeping the real keepouts (mains barrier, RF).
    src = pcbnew.LoadBoard(pcb_path)
    for z in [_dc(z, pcbnew.ZONE) for z in src.Zones()]:
        if z.GetIsRuleArea() and not z.GetDoNotAllowTracks():
            src.Remove(z)
    if not pcbnew.ExportSpecctraDSN(src, dsn):
        return False, "Specctra DSN export failed"

    with open(os.path.join(work, "freerouting.json"), "w", encoding="utf-8") as f:
        json.dump(FR_CONFIG, f, indent=2)
    # freerouting reads its config from the user data path, not the CWD, and
    # only writes the SES when the job ends. Killing it on the wall clock
    # therefore throws away every route it found, so give it its own
    # job_timeout below our hard limit and let it finish gracefully.
    env = dict(os.environ)
    env["FREEROUTING__USER_DATA_PATH"] = work
    env["FREEROUTING__ROUTER__JOB_TIMEOUT"] = _hhmmss(max(60, timeout - 180))
    env["FREEROUTING__ROUTER__MAX_PASSES"] = "24"
    env["FREEROUTING__ROUTER__MAX_THREADS"] = "4"
    cmd = [java, "-Djava.awt.headless=true", "-jar", FREEROUTING_JAR,
           "-de", dsn, "-do", ses, "-mp", "24", "-mt", "4", "-da",
           "-dl", "-oit", "4"]
    try:
        p = subprocess.run(cmd, cwd=work, capture_output=True, text=True,
                           timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return False, "router timed out after %ds" % timeout
    if not os.path.exists(ses) or os.path.getsize(ses) < 200:
        tail = (p.stderr or p.stdout or "").strip().splitlines()[-1:]
        return False, "no SES produced %s" % (tail or "")

    board = pcbnew.LoadBoard(pcb_path)
    if not pcbnew.ImportSpecctraSES(board, ses):
        return False, "SES import failed"
    finish_copper(board)
    pcbnew.SaveBoard(pcb_path, board)
    n = len([t for t in board.GetTracks()])
    return True, "%d track/via segments" % n


def finish_copper(board):
    """Post-route copper finishing: prune router stubs, stitch, refill.

    Order matters. Island removal deletes any pour fragment that has no
    connection, so filling with removal enabled *before* the stitching vias
    exist throws away the very islands the vias are meant to tie down. Fill
    once with islands preserved, stitch onto them, then fill for real.
    """
    zones = [_dc(z, pcbnew.ZONE) for z in board.Zones()]
    gnd = [z for z in zones if not z.GetIsRuleArea() and z.GetNetname() == "GND"]
    # Grab the keep-out outlines while the bindings are still healthy - the
    # via placer needs them and cannot read them back after the pours refill.
    blocked = keepout_shapes(board)
    modes = [(z, z.GetIslandRemovalMode()) for z in gnd]
    for z, _ in modes:
        z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_NEVER)
    try:
        pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    except Exception:
        pass
    _try_prune(board)
    stitch_ground(board, gnd, blocked=blocked)
    for z, m in modes:
        z.SetIslandRemovalMode(m)
    try:
        pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    except Exception:
        pass
    # Second sweep against the final pour: a stub can look supported while the
    # islands are still in place and be left hanging once they are dropped.
    if _try_prune(board):
        try:
            pcbnew.ZONE_FILLER(board).Fill(board.Zones())
        except Exception:
            pass
    try:
        rescue_gnd_pads(board)
    except Exception as exc:
        print("        gnd rescue skipped: %s" % exc)
    # The router's tracks carve the plane up after the grid stitching has run,
    # so the leftover fragments only become visible now.
    try:
        if stitch_islands(board, gnd, blocked=blocked):
            pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    except Exception as exc:
        print("        island stitch skipped: %s" % exc)


def rescue_gnd_pads(board, rounds=3):
    """Give solid zone contact to any GND pad the pour could not reach.

    A pad hemmed in by routed tracks can be left with nowhere for a thermal
    relief spoke to run, and KiCad then strands it in the middle of its own
    ground plane. Switching only those pads to a solid connection is a far
    smaller change than dropping thermals board-wide, which would make every
    ground pad miserable to hand-solder.
    """
    fixed = 0
    for _ in range(rounds):
        try:
            board.BuildConnectivity()
            conn = board.GetConnectivity()
        except Exception:
            break
        counts = []
        for f in board_footprints(board):
            for p in f.Pads():
                if p.GetNetname() != GND or p.GetNetCode() <= 0:
                    continue
                try:
                    counts.append((len(conn.GetConnectedItems(p)), p))
                except Exception:
                    pass
        if not counts:
            break
        # Everything sitting on the real plane lands in one big cluster. A pad
        # tied to nothing but a lone via is still off the plane, so compare
        # against the main cluster rather than just asking for a non-zero count.
        main = max(n for n, _ in counts)
        stranded = [p for n, p in counts
                    if n < max(2, main // 4) and
                    p.GetLocalZoneConnection() != pcbnew.ZONE_CONNECTION_FULL]
        if not stranded:
            break
        for p in stranded:
            p.SetLocalZoneConnection(pcbnew.ZONE_CONNECTION_FULL)
        try:
            pcbnew.ZONE_FILLER(board).Fill(board.Zones())
            board.BuildConnectivity()
            conn = board.GetConnectivity()
        except Exception:
            break
        # Only keep the override where it actually bought a connection. Losing
        # thermal relief makes a pad harder to hand-solder, so there is no
        # point paying that price on a pad the pour was never going to reach.
        kept = 0
        for p in stranded:
            try:
                helped = len(conn.GetConnectedItems(p)) >= max(2, main // 4)
            except Exception:
                helped = False
            if helped:
                kept += 1
            else:
                p.SetLocalZoneConnection(pcbnew.ZONE_CONNECTION_INHERITED)
        fixed += kept
        if kept < len(stranded):
            try:
                pcbnew.ZONE_FILLER(board).Fill(board.Zones())
            except Exception:
                pass
        if not kept:
            break
    return fixed


def _try_prune(board):
    """Pruning is cleanup, never worth losing a finished route over.

    Removing tracks and then refilling occasionally leaves SWIG handing back an
    undowncast BOARD, and an exception here would throw away a routing run that
    took a quarter of an hour.
    """
    try:
        return prune_dangling(board)
    except Exception as exc:
        print("        prune skipped: %s" % exc)
        return 0


def board_tracks(board):
    """board.Tracks() intermittently comes back undowncast from SWIG.

    Retrying usually clears it; the caller should hold on to the list it gets
    rather than asking again in a loop.
    """
    last = None
    for _ in range(5):
        try:
            return list(board.GetTracks())
        except TypeError as exc:
            last = exc
    raise last


def _duplicate_traces(items):
    """Redundant trace segments in a list of copper items.

    Two kinds show up after autorouting, and both make a dead spur look
    supported - each copy is the neighbour propping up the free end of the
    other - so they have to go before anything is pruned:

    * exact duplicates, where the same segment was emitted twice (once in each
      direction);
    * collinear overlaps, where a short segment lies entirely on top of a
      longer one. KiCad does not treat landing in the middle of a collinear
      track as a connection, so the short one reads as dangling even though
      the copper underneath it is live.
    """
    seen, dead, keep = set(), [], []
    for t in items:
        if t.Type() != pcbnew.PCB_TRACE_T:
            continue
        a = (t.GetStartX(), t.GetStartY())
        b = (t.GetEndX(), t.GetEndY())
        key = (t.GetNetCode(), t.GetLayer(), t.GetWidth(), min(a, b), max(a, b))
        if key in seen:
            dead.append(t)
        else:
            seen.add(key)
            keep.append((t, a, b))

    tol = MM(0.02)
    by_layer = {}
    for t, a, b in keep:
        by_layer.setdefault((t.GetNetCode(), t.GetLayer()), []).append((t, a, b))
    for group in by_layer.values():
        group.sort(key=lambda g: -((g[2][0] - g[1][0]) ** 2 +
                                   (g[2][1] - g[1][1]) ** 2))
        swallowed = set()
        for i, (ti, ai, bi) in enumerate(group):
            if id(ti) in swallowed:
                continue
            vx, vy = bi[0] - ai[0], bi[1] - ai[1]
            span = float(vx * vx + vy * vy)
            if span <= 0:
                continue
            for tj, aj, bj in group[i + 1:]:
                if id(tj) in swallowed or tj.GetWidth() > ti.GetWidth():
                    continue
                inside = True
                for px, py in (aj, bj):
                    dx, dy = px - ai[0], py - ai[1]
                    s = (dx * vx + dy * vy) / span
                    if not -0.001 <= s <= 1.001:
                        inside = False
                        break
                    # Perpendicular distance from the long segment's axis.
                    if abs(dx * vy - dy * vx) > tol * (span ** 0.5):
                        inside = False
                        break
                if inside:
                    swallowed.add(id(tj))
                    dead.append(tj)
    return dead


def board_footprints(board):
    """board.GetFootprints() after track surgery can hand back raw pointers.

    Same story as board_tracks(): normalise every entry through the caster and
    return a plain list the caller can keep.
    """
    last = None
    for _ in range(5):
        try:
            out = [_dc(f, pcbnew.Cast_to_FOOTPRINT) for f in board.GetFootprints()]
            if all(f is not None for f in out):
                return out
        except TypeError as exc:
            last = exc
    if last:
        raise last
    return [f for f in out if f is not None]


def prune_dangling(board, rounds=12):
    """Drop router leftovers that connect to nothing.

    Support is decided per endpoint and *per layer*. That matters: an F.Cu
    segment whose end sits exactly on top of a B.Cu track or a bottom-side pad
    is not connected to it, and a layer-blind test happily keeps a whole dead
    spur alive. Leaf segments are shaved off one round at a time so a chain of
    stubs - where each end looks propped up by the next - unravels from its
    free ends inwards. A via has to be supported on two different layers,
    otherwise it is a hole that joins nothing. Whatever survives that is then
    grouped into connected components and any group that never touches a pad
    or a pour is deleted whole - that catches the self-supporting knots
    (F.Cu stub - via - B.Cu stub) which leaf pruning alone cannot unravel.
    """
    tol = MM(0.06)
    zones = [_dc(z, pcbnew.ZONE) for z in board.Zones()]
    pours = [z for z in zones if not z.GetIsRuleArea()]

    def on_pour(net, pt, layer):
        return any(z.GetNetCode() == net and z.IsOnLayer(layer) and
                   z.HitTestFilledArea(layer, pt) for z in pours)

    removed = 0
    alive = [t for t in board_tracks(board)
             if t.Type() in (pcbnew.PCB_TRACE_T, pcbnew.PCB_VIA_T)]
    dup = _duplicate_traces(alive)
    if dup:
        gone = set(id(t) for t in dup)
        for t in dup:
            board.Remove(t)
        alive = [t for t in alive if id(t) not in gone]
        removed += len(dup)
    pads = {}
    for f in board_footprints(board):
        for p in f.Pads():
            pads.setdefault(p.GetNetCode(), []).append(p)
    for _ in range(rounds):
        items = alive
        if not items:
            break
        cu = sorted({t.GetLayer() for t in items} | {pcbnew.F_Cu, pcbnew.B_Cu})

        spans, ends = [], []
        for t in items:
            if t.Type() == pcbnew.PCB_VIA_T:
                v = _dc(t, pcbnew.Cast_to_PCB_VIA) or t
                try:
                    lay = [l for l in cu if v.IsOnLayer(l)]
                except Exception:
                    lay = []
                spans.append(lay or [pcbnew.F_Cu, pcbnew.B_Cu])
                ends.append([(t.GetStartX(), t.GetStartY())])
            else:
                spans.append([t.GetLayer()])
                ends.append([(t.GetStartX(), t.GetStartY()),
                             (t.GetEndX(), t.GetEndY())])

        # Endpoints bucketed on a tol-sized grid, keyed by net *and* layer, so
        # the neighbour lookup stays cheap and never crosses layers.
        cells = {}
        for i, t in enumerate(items):
            for layer in spans[i]:
                for x, y in ends[i]:
                    cells.setdefault((t.GetNetCode(), layer,
                                      x // tol, y // tol), []).append(i)

        def touching(i, layer, pt):
            """Indices of other copper items meeting this point on this layer."""
            net = items[i].GetNetCode()
            x, y = pt
            hit = set()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for j in cells.get((net, layer, x // tol + dx,
                                        y // tol + dy), ()):
                        if j == i:
                            continue
                        if any(abs(qx - x) <= tol and abs(qy - y) <= tol
                               for qx, qy in ends[j]):
                            hit.add(j)
            # Fall back to a real hit test for the T-junction case, where one
            # track lands part-way along another instead of on its end.
            v = pcbnew.VECTOR2I(x, y)
            for j, o in enumerate(items):
                if j == i or o.GetNetCode() != net or layer not in spans[j]:
                    continue
                try:
                    if o.HitTest(v):
                        hit.add(j)
                except Exception:
                    pass
            return hit

        def joined(i, layer, pt):
            return bool(touching(i, layer, pt))

        def anchored(i, layer, pt):
            """Fixed copper - a pad or a pour - holding this point down."""
            net = items[i].GetNetCode()
            v = pcbnew.VECTOR2I(pt[0], pt[1])
            if any(p.IsOnLayer(layer) and p.HitTest(v)
                   for p in pads.get(net, [])):
                return True
            return on_pour(net, v, layer)

        def held(i, layer, pt):
            return anchored(i, layer, pt) or joined(i, layer, pt)

        drop = []
        for i, t in enumerate(items):
            if t.Type() == pcbnew.PCB_VIA_T:
                if sum(1 for l in spans[i] if held(i, l, ends[i][0])) < 2:
                    drop.append(t)
            elif not all(held(i, spans[i][0], pt) for pt in ends[i]):
                drop.append(t)

        if not drop:
            # Leaf pruning has converged. What can survive it is a knot of
            # copper that props itself up - typically an F.Cu stub, a via and
            # a B.Cu stub, where each item is "held" only by the other two.
            # Union the survivors into connected groups and delete any group
            # that never reaches a pad or a pour.
            parent = list(range(len(items)))

            def find(a):
                while parent[a] != a:
                    parent[a] = parent[parent[a]]
                    a = parent[a]
                return a

            live = set()
            for i in range(len(items)):
                for layer in spans[i]:
                    for pt in ends[i]:
                        if anchored(i, layer, pt):
                            live.add(find(i))
                        for j in touching(i, layer, pt):
                            ra, rb = find(i), find(j)
                            if ra != rb:
                                parent[ra] = rb
            live = {find(i) for i in live}
            drop = [t for i, t in enumerate(items) if find(i) not in live]
            if not drop:
                break
        gone = set(id(t) for t in drop)
        for t in drop:
            board.Remove(t)
        alive = [t for t in alive if id(t) not in gone]
        removed += len(drop)
    return removed


def bond_duplicate_pads(board, mains_nets):
    """Tie together same-numbered pads within one footprint.

    Clip-style holders (the 5x20 mm fuse, for one) expose each terminal as two
    pads carrying the same number. The board copper is what joins them, but the
    router sees the pads as already on one net and never draws it. Laying the
    link down before export makes it pre-routed wiring the router works around.
    """
    widths = {n: t for n, t, _c, _v, _d, _s in NETCLASS_DEFS}
    made = 0
    for fp in board_footprints(board):
        groups = {}
        for p in fp.Pads():
            if p.GetNumber():
                groups.setdefault((p.GetNumber(), p.GetNetCode()), []).append(p)
        for (_, netcode), pads in groups.items():
            if len(pads) < 2 or netcode <= 0:
                continue
            # Big same-number fields are thermal/ground pad arrays (the ESP32
            # has 21 of them). Those are tied by the pour, and lacing them
            # together by hand just litters the board with redundant copper.
            if len(pads) > 4 or pads[0].GetNetname() == GND:
                continue
            w = widths[netclass_of(pads[0].GetNetname(), mains_nets)]
            pads.sort(key=lambda p: (p.GetX(), p.GetY()))
            for a, b in zip(pads, pads[1:]):
                if a.GetPosition() == b.GetPosition():
                    continue
                layer = pcbnew.F_Cu
                if a.GetAttribute() == pcbnew.PAD_ATTRIB_SMD:
                    layer = a.GetLayer()
                t = pcbnew.PCB_TRACK(board)
                t.SetStart(a.GetPosition())
                t.SetEnd(b.GetPosition())
                t.SetWidth(MM(w))
                t.SetLayer(layer)
                t.SetNet(a.GetNet())
                board.Add(t)
                made += 1
    return made


def _chain_bbox_mm(chain):
    """Bounding box of a SHAPE_LINE_CHAIN in mm, walking its points.

    Same reason as _zone_bbox_mm: BBox() returns a BOX2I, and BOX2I is one of
    the types SWIG stops downcasting once the board has been edited.
    """
    xs, ys = [], []
    for j in range(chain.PointCount()):
        p = chain.CPoint(j)
        try:
            x, y = p.x, p.y
        except (AttributeError, TypeError):
            return None
        xs.append(pcbnew.ToMM(x))
        ys.append(pcbnew.ToMM(y))
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


def _zone_bbox_mm(z):
    """Bounding box of a zone outline, in mm, without touching BOX2I.

    GetBoundingBox() hands back an undowncast pointer once tracks have been
    removed and the pours refilled, so walk the outline corners instead - those
    come back as plain coordinates and always survive.
    """
    xs, ys = [], []
    for i in range(z.GetNumCorners()):
        c = z.GetCornerPosition(i)
        try:
            x, y = c.x, c.y
        except (AttributeError, TypeError):
            xs = []
            break
        xs.append(pcbnew.ToMM(x))
        ys.append(pcbnew.ToMM(y))
    if not xs:
        try:
            b = z.GetBoundingBox()
            return (pcbnew.ToMM(b.GetLeft()), pcbnew.ToMM(b.GetTop()),
                    pcbnew.ToMM(b.GetRight()), pcbnew.ToMM(b.GetBottom()))
        except Exception:
            return None
    return (min(xs), min(ys), max(xs), max(ys))


def keepout_shapes(board):
    """Outlines of every rule area that bars tracks or vias.

    Read these *before* any track surgery: once tracks have been removed and
    the pours refilled, KiCad 10's SWIG layer starts handing back undowncast
    pointers for ZONE.Outline(), BOX2I and VECTOR2I, and a keep-out we cannot
    read is a keep-out we would drill straight through.
    """
    out = []
    for z in [_dc(z, pcbnew.ZONE) for z in board.Zones()]:
        if z is None or not z.GetIsRuleArea():
            continue
        if not (z.GetDoNotAllowTracks() or z.GetDoNotAllowVias()):
            continue
        try:
            o = z.Outline()
            o.Contains(V(0, 0))
        except Exception:
            continue
        out.append(o)
    return out


def _via_placer(board, front, back, net, blocked=None):
    """Shared legality test and via drop for the ground stitching passes.

    Returns a place(x, y) that only succeeds where a 0.8 mm via plus its
    clearance genuinely fits: outside every keep-out, clear of every drilled
    hole, and sitting on filled copper on both layers.
    """
    # Pours fill straight through a keep-out that only bars tracks and vias, so
    # "there is copper here" is not on its own a licence to drop a via. The
    # caller may hand the outlines in, captured before any track surgery; if
    # not, read them now and refuse to place anything blind.
    if blocked is None:
        blocked = keepout_shapes(board)
        if len(blocked) != sum(1 for z in [_dc(z, pcbnew.ZONE)
                                           for z in board.Zones()]
                               if z is not None and z.GetIsRuleArea() and
                               (z.GetDoNotAllowTracks() or
                                z.GetDoNotAllowVias())):
            raise RuntimeError("keep-out outline unreadable - refusing to "
                               "place vias blind")

    # Every drilled feature already on the board, for the hole-to-hole rule.
    holes = []
    for f in board_footprints(board):
        for p in f.Pads():
            if p.GetDrillSizeX() > 0:
                holes.append((pcbnew.ToMM(p.GetX()),
                              pcbnew.ToMM(p.GetY()),
                              pcbnew.ToMM(max(p.GetDrillSizeX(),
                                              p.GetDrillSizeY())) / 2.0))
    for t in board_tracks(board):
        if t.Type() == pcbnew.PCB_VIA_T:
            v = _dc(t, pcbnew.Cast_to_PCB_VIA) or t
            holes.append((pcbnew.ToMM(t.GetStartX()),
                          pcbnew.ToMM(t.GetStartY()),
                          pcbnew.ToMM(v.GetDrill()) / 2.0))

    r, drill_r, h2h = 0.4 + 0.34, 0.2, 0.3

    def place(x, y):
        # Probe the via ring, not just its centre, against every keep-out.
        edge = [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1),
                (.7, .7), (-.7, .7), (.7, -.7), (-.7, -.7)]
        if any(o.Contains(V(x + r * dx, y + r * dy))
               for o in blocked for dx, dy in edge):
            return False
        for hx, hy, hr in holes:
            if (x - hx) ** 2 + (y - hy) ** 2 < (drill_r + hr + h2h) ** 2:
                return False
        # A via is 0.8 mm wide, so testing only the centre can drop one into a
        # clearance gap at the edge of the pour. Require the whole via plus its
        # clearance to sit on filled copper on both layers.
        probes = [V(x, y)] + [V(x + r * dx, y + r * dy)
                              for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                                             (.7, .7), (-.7, .7), (.7, -.7),
                                             (-.7, -.7))]
        if not all(front.HitTestFilledArea(pcbnew.F_Cu, q) and
                   back.HitTestFilledArea(pcbnew.B_Cu, q) for q in probes):
            return False
        via = pcbnew.PCB_VIA(board)
        via.SetPosition(V(x, y))
        via.SetWidth(MM(0.8))
        via.SetDrill(MM(0.4))
        via.SetViaType(pcbnew.VIATYPE_THROUGH)
        via.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
        via.SetNet(net)
        board.Add(via)
        holes.append((x, y, drill_r))
        return True

    return place, holes, drill_r


def _gnd_pair(gnd_zones):
    front = next((z for z in gnd_zones if z.GetLayer() == pcbnew.F_Cu), None)
    back = next((z for z in gnd_zones if z.GetLayer() == pcbnew.B_Cu), None)
    return front, back


def stitch_ground(board, gnd_zones, pitch=3.5, blocked=None):
    """Tie the two GND pours together with vias.

    A grid pass gives the return path its low-impedance stitching; a second
    targeted pass rescues any GND pad the router left sitting on a pour island
    that has no path to the other layer.
    """
    if len(gnd_zones) < 2:
        return 0
    front, back = _gnd_pair(gnd_zones)
    if front is None or back is None:
        return 0
    net = gnd_zones[0].GetNet()
    place, holes, drill_r = _via_placer(board, front, back, net, blocked)

    bb = _zone_bbox_mm(front)
    if not bb:
        return 0
    x0, y0, x1, y1 = bb
    made = 0
    y = y0 + pitch / 2.0
    while y < y1:
        x = x0 + pitch / 2.0
        while x < x1:
            made += 1 if place(x, y) else 0
            x += pitch
        y += pitch

    # Second pass: any GND pad with no via close by gets one of its own.
    for f in board_footprints(board):
        for p in f.Pads():
            if p.GetNet().GetNetCode() != net.GetNetCode():
                continue
            px = pcbnew.ToMM(p.GetX())
            py = pcbnew.ToMM(p.GetY())
            if any((px - hx) ** 2 + (py - hy) ** 2 < 2.6 ** 2
                   for hx, hy, hr in holes if hr <= drill_r):
                continue
            pw = pcbnew.ToMM(max(p.GetSize().x, p.GetSize().y)) / 2.0
            done = False
            for d in (pw + 0.9, pw + 1.4, pw + 2.0):
                for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1),
                               (.7, .7), (-.7, .7), (.7, -.7), (-.7, -.7)):
                    if place(px + d * dx, py + d * dy):
                        made, done = made + 1, True
                        break
                if done:
                    break
    return made


def stitch_islands(board, gnd_zones, step=0.75, max_tries=600, blocked=None):
    """Tie down ground pour fragments the final fill left floating.

    Routed tracks slice the plane into pieces after the main stitching pass has
    already run, and a fragment with no via of its own turns up in DRC as one
    ground zone unconnected from another. Give every fragment that can take one
    its own link to the opposite layer.
    """
    if len(gnd_zones) < 2:
        return 0
    front, back = _gnd_pair(gnd_zones)
    if front is None or back is None:
        return 0
    place, holes, drill_r = _via_placer(board, front, back,
                                        gnd_zones[0].GetNet(), blocked)
    made = 0
    for z, layer in ((front, pcbnew.F_Cu), (back, pcbnew.B_Cu)):
        try:
            polys = z.GetFilledPolysList(layer)
            count = polys.OutlineCount()
        except Exception:
            continue
        for i in range(count):
            try:
                if any(polys.Contains(V(hx, hy), i) for hx, hy, hr in holes
                       if hr <= drill_r):
                    continue
                bb = _chain_bbox_mm(polys.Outline(i))
            except Exception:
                continue
            if not bb:
                continue
            x0, y0, x1, y1 = bb
            tries, done = 0, False
            y = y0
            while y <= y1 and not done and tries < max_tries:
                x = x0
                while x <= x1 and tries < max_tries:
                    tries += 1
                    try:
                        inside = polys.Contains(V(x, y), i)
                    except Exception:
                        inside = False
                    if inside and place(x, y):
                        made, done = made + 1, True
                        break
                    x += step
                y += step
    return made


def kicad_cli():
    exe = os.path.join(os.path.dirname(sys.executable), "kicad-cli.exe")
    return exe if os.path.exists(exe) else "kicad-cli"


def export_fab(pcb_path):
    """Emit the full production package next to the board.

    Gerber X2 + Excellon are what a fab needs; IPC-D-356 lets them run a
    netlist test; ODB++ and IPC-2581 are the modern single-file handoffs;
    the position file and STEP model drive assembly; the PDFs are the
    fab/assembly drawings.
    """
    out = os.path.join(os.path.dirname(pcb_path), "gerbers")
    docs = os.path.join(os.path.dirname(pcb_path), "fab")
    os.makedirs(out, exist_ok=True)
    os.makedirs(docs, exist_ok=True)
    base = os.path.splitext(os.path.basename(pcb_path))[0]
    cli = kicad_cli()
    jobs = [
        ["pcb", "export", "gerbers", "--output", out,
         "--layers", GERBER_LAYERS, "--no-protel-ext", pcb_path],
        ["pcb", "export", "drill", "--output", out, "--format", "excellon",
         "--excellon-separate-th", "--generate-map", "--map-format", "gerberx2",
         pcb_path],
        ["pcb", "export", "ipcd356", "--output",
         os.path.join(out, base + ".d356"), pcb_path],
        ["pcb", "export", "pos", "--output", os.path.join(docs, base + "-top.pos"),
         "--side", "front", "--format", "csv", "--units", "mm", pcb_path],
        ["pcb", "export", "pos", "--output", os.path.join(docs, base + "-bottom.pos"),
         "--side", "back", "--format", "csv", "--units", "mm", pcb_path],
        ["pcb", "export", "pdf", "--output", os.path.join(docs, base + "-fab.pdf"),
         "--layers", "F.Cu,B.Cu,Edge.Cuts", "--include-border-title", pcb_path],
        ["pcb", "export", "pdf", "--output", os.path.join(docs, base + "-assy.pdf"),
         "--layers", "F.Fab,B.Fab,F.Silkscreen,B.Silkscreen,Edge.Cuts",
         "--include-border-title", pcb_path],
    ]
    # Nice-to-have formats: skip quietly if this KiCad build lacks them.
    optional = [
        ["pcb", "export", "odb", "--output", os.path.join(out, base + "-odb.zip"),
         "--compression", "zip", pcb_path],
        ["pcb", "export", "ipc2581", "--output",
         os.path.join(out, base + ".xml"), pcb_path],
        ["pcb", "export", "step", "--output", os.path.join(docs, base + ".step"),
         "--no-dnp", "--subst-models", pcb_path],
    ]
    for job in jobs:
        r = subprocess.run([cli] + job, capture_output=True, text=True)
        if r.returncode != 0:
            msg = (r.stderr or r.stdout or "").strip().splitlines()[-1:]
            return None, ["%s: %s" % (job[2], (msg or [""])[0])]
    for job in optional:
        subprocess.run([cli] + job, capture_output=True, text=True)

    # DRC last, with unconnected items promoted to errors - a production board
    # is not done until the ratsnest is empty.
    rep = os.path.join(out, "drc.json")
    subprocess.run([cli, "pcb", "drc", "--format", "json", "--severity-error",
                    "--severity-warning", "--output", rep, pcb_path],
                   capture_output=True, text=True)
    violations = unconnected = None
    try:
        with open(rep, encoding="utf-8") as f:
            j = json.load(f)
        violations = len(j.get("violations", []))
        unconnected = len(j.get("unconnected_items", []))
    except Exception:
        pass
    files = sum(len(os.listdir(d)) for d in (out, docs))
    return files, (violations, unconnected)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    do_fab = "--fab" in sys.argv
    do_route = "--no-route" not in sys.argv
    only = args or None
    total_ok = 0
    print("KiCad %s - generating Circuvent PCBs\n" % pcbnew.GetBuildVersion())
    for dev in DEVICES:
        if only and dev["folder"] not in only:
            continue
        try:
            r = build_board(dev)
        except Exception as e:
            print("[FAIL] %-24s %s: %s" % (dev["folder"], type(e).__name__, e))
            continue
        total_ok += 1
        size_kb = os.path.getsize(r["out"]) / 1024.0
        note = ""
        if r["grew"]:
            note = "  (grown from %gx%g target)" % (dev["w"], dev["h"])
        print("[ OK ] %-22s %5.1fx%-5.1f mm  parts=%-3d nets=%-3d routable=%-3d %6.1f kB%s"
              % (dev["folder"], r["W"], r["H"], len(r["placed"]), r["nets"],
                 r["routable"], size_kb, note))
        for ref, val, why in r["skipped"][:5]:
            print("        skip %-8s %-26s (%s)" % (ref, val[:26], why))
        if r["offboard"]:
            print("        WARNING off-board footprints: %s"
                  % ", ".join(r["offboard"]))
        if r.get("dupes"):
            print("        WARNING duplicate references: %s"
                  % ", ".join(r["dupes"]))
        if do_route:
            ok, msg = route_board(r["out"])
            print("        route: %s %s" % ("OK  " if ok else "FAIL", msg))
            r["routed"] = ok
            r["route_msg"] = msg
        drc = None
        if do_fab:
            n, v = export_fab(r["out"])
            if n is None:
                print("        fab export FAILED: %s" % (v or ["unknown"])[0])
            else:
                drc = v
                print("        fab: %d files in pcb/gerbers + pcb/fab, "
                      "DRC errors=%s unconnected=%s"
                      % (n, v[0] if v else "?", v[1] if v else "?"))
        write_layout_doc(dev, r, drc)
    print("\n%d/%d boards generated." % (total_ok, len(only or DEVICES)))


if __name__ == "__main__":
    main()
