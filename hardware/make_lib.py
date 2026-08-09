"""Generate the footprints KiCad does not ship for the Circuvent offline SMPS.

Run:  python make_lib.py       (writes hardware/lib/Circuvent.pretty/*.kicad_mod)

Every dimension below is stated as a named constant rather than a magic number,
because these are the parts whose geometry nobody can eyeball on a rendering:
a flyback bobbin that is 0.4 mm off does not fit, and a safety capacitor whose
lead pitch is wrong cannot be made to fit at all.

THE TRANSFORMER FOOTPRINT MUST BE CONFIRMED BEFORE FABRICATION.
It is drawn to the common EE13 10-pin (5+5) vertical bobbin, which is a de
facto standard rather than a controlled one - individual winding houses differ.
Check it against the bobbin drawing from whoever winds T1 and regenerate if
they differ. The numbers are here, in one place, so that check is a five-minute
job instead of an archaeology exercise.
"""
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib", "Circuvent.pretty")

# --- EE13 vertical bobbin, 10 pin (5 + 5) ---------------------------------
EE13_PITCH = 2.54      # pin-to-pin along a row
EE13_ROWS = 10.16      # centre-to-centre between the two rows
EE13_BODY_W = 13.4     # core width  (X, along the pin rows)
EE13_BODY_D = 12.6     # core depth  (Y, across the rows)
EE13_DRILL = 1.0
EE13_PAD = 1.8

# --- X2 film capacitor, 10 x 4 mm box, 7.5 mm lead pitch -------------------
X2_PITCH = 7.5
X2_W, X2_D = 10.5, 5.0
X2_DRILL, X2_PAD = 1.0, 1.8

# --- Y1 safety disc capacitor, 10 mm lead pitch ----------------------------
Y1_PITCH = 10.0
Y1_W, Y1_D = 12.0, 5.0
Y1_DRILL, Y1_PAD = 1.0, 1.8


def _hdr(name, descr, tags):
    return [
        '(footprint "%s"' % name,
        '  (version 20240108) (generator "circuvent-make-lib")',
        '  (layer "F.Cu")',
        '  (descr "%s")' % descr,
        '  (tags "%s")' % tags,
        '  (attr through_hole)',
        '  (property "Reference" "REF**" (at 0 -%.2f 0) (layer "F.SilkS")'
        % 1.0,
        '    (effects (font (size 1 1) (thickness 0.15))))',
        '  (property "Value" "VAL**" (at 0 %.2f 0) (layer "F.Fab")' % 1.0,
        '    (effects (font (size 1 1) (thickness 0.15))))',
    ]


def _rect(layer, w, d, width=0.12):
    x, y = w / 2.0, d / 2.0
    return ['  (fp_rect (start %.3f %.3f) (end %.3f %.3f) (stroke (width %.2f) '
            '(type solid)) (fill none) (layer "%s"))' % (-x, -y, x, y, width, layer)]


def _pad(num, x, y, drill, size, shape="circle"):
    return ['  (pad "%d" thru_hole %s (at %.3f %.3f) (size %.2f %.2f) '
            '(drill %.2f) (layers "*.Cu" "*.Mask"))' % (num, shape, x, y, size, size, drill)]


def transformer():
    """EE13 flyback bobbin. Pins 1-5 primary side, 6-10 secondary side.

    Pin 1 is bottom-left looking at the top of the board; numbering runs along
    the primary row and then back along the secondary row, which is how bobbin
    drawings label them.
    """
    L = _hdr("Transformer_EE13_10pin",
             "EE13 vertical flyback bobbin, 10 pin (5+5), 2.54mm pitch, "
             "10.16mm row spacing - CONFIRM AGAINST YOUR BOBBIN DRAWING",
             "transformer flyback ee13 smps isolated")
    span = 4 * EE13_PITCH
    x0 = -span / 2.0
    y = EE13_ROWS / 2.0
    for i in range(5):                       # pins 1..5  primary row
        L += _pad(i + 1, x0 + i * EE13_PITCH, -y, EE13_DRILL, EE13_PAD,
                  "rect" if i == 0 else "circle")
    for i in range(5):                       # pins 6..10 secondary row
        L += _pad(i + 6, x0 + (4 - i) * EE13_PITCH, y, EE13_DRILL, EE13_PAD)
    L += _rect("F.SilkS", EE13_BODY_W, EE13_BODY_D)
    L += _rect("F.Fab", EE13_BODY_W, EE13_BODY_D, 0.1)
    L += _rect("F.CrtYd", EE13_BODY_W + 0.5, EE13_BODY_D + 0.5, 0.05)
    L.append(")")
    return "Transformer_EE13_10pin", L


def x2cap():
    L = _hdr("C_Film_X2_L10.5_W5.0_P7.50mm",
             "X2 interference-suppression film capacitor, 7.5mm lead pitch",
             "capacitor film X2 safety mains")
    L += _pad(1, -X2_PITCH / 2.0, 0, X2_DRILL, X2_PAD, "rect")
    L += _pad(2, X2_PITCH / 2.0, 0, X2_DRILL, X2_PAD)
    L += _rect("F.SilkS", X2_W, X2_D)
    L += _rect("F.Fab", X2_W, X2_D, 0.1)
    L += _rect("F.CrtYd", X2_W + 0.5, X2_D + 0.5, 0.05)
    L.append(")")
    return "C_Film_X2_L10.5_W5.0_P7.50mm", L


def y1cap():
    L = _hdr("C_Disc_Y1_D12_P10.00mm",
             "Y1 safety disc capacitor spanning the isolation barrier, "
             "10mm lead pitch",
             "capacitor disc Y1 safety isolation")
    L += _pad(1, -Y1_PITCH / 2.0, 0, Y1_DRILL, Y1_PAD, "rect")
    L += _pad(2, Y1_PITCH / 2.0, 0, Y1_DRILL, Y1_PAD)
    L += _rect("F.SilkS", Y1_W, Y1_D)
    L += _rect("F.Fab", Y1_W, Y1_D, 0.1)
    L += _rect("F.CrtYd", Y1_W + 0.5, Y1_D + 0.5, 0.05)
    L.append(")")
    return "C_Disc_Y1_D12_P10.00mm", L


def main():
    os.makedirs(OUT, exist_ok=True)
    for fn in (transformer, x2cap, y1cap):
        name, lines = fn()
        path = os.path.join(OUT, name + ".kicad_mod")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        print("wrote", os.path.relpath(path))


if __name__ == "__main__":
    main()
