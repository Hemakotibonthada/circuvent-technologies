"""
Calibration check for the face embedder. Not part of any automated suite —
run it by hand after changing the model, the scale factor or the thresholds.

    docker compose exec face python /tmp/calibrate.py \
        david=/tmp/david1.jpg david=/tmp/david2.jpg \
        a=/tmp/personA.jpg b=/tmp/personB.jpg crowd=/tmp/selfie.jpg

Arguments are `label=path`. Photographs sharing a label are the same person;
different labels are different people. A photo with several faces in it (a
group shot) is expanded so each face becomes its own identity, which is a cheap
way to get a lot of genuinely different people.

It answers the only question that matters about the calibration in embed.py:
after scaling, does "same person" land under the 0.6 that match.ts enforces,
and does "different person" land clearly above it? If those two ranges ever
overlap, no threshold can separate them and the door is guessing.
"""

import itertools
import sys

import cv2
import numpy as np

sys.path.insert(0, "/app")
import embed  # noqa: E402

THRESHOLD = embed.TARGET_L2


def descriptor(img):
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        return None
    d, _ = embed.embed_image(buf.tobytes())
    return None if d is None else np.array(d)


def variants(img):
    """The things that differ between two captures of one face at a door."""
    h, w = img.shape[:2]
    for angle in (-8, 8):
        m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
        yield "rot%+d" % angle, cv2.warpAffine(img, m, (w, h))
    yield "small", cv2.resize(img, (max(90, w // 3), max(90, h // 3)))
    yield "dark", np.clip(img.astype(np.int16) - 45, 0, 255).astype(np.uint8)
    yield "bright", np.clip(img.astype(np.int16) + 45, 0, 255).astype(np.uint8)
    yield "blur", cv2.GaussianBlur(img, (5, 5), 0)
    ok, low = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 30])
    if ok:
        yield "jpeg30", cv2.imdecode(low, cv2.IMREAD_COLOR)


def crops(path):
    """Every usable face in a photo, generously padded, as its own image."""
    with open(path, "rb") as fh:
        img = cv2.imdecode(np.frombuffer(fh.read(), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return []
    h, w = img.shape[:2]
    out = []
    for f in embed.detect(img):
        x, y, fw, fh_ = (int(v) for v in f[:4])
        if fh_ < embed.MIN_FACE_PX:
            continue
        pad = int(fw * 0.6)
        crop = img[max(0, y - pad):min(h, y + fh_ + pad),
                   max(0, x - pad):min(w, x + fw + pad)].copy()
        if crop.size:
            out.append(crop)
    return out


def main(args):
    print("scale %.5f  (target L2 %.2f = SFace's own %.3f)"
          % (embed.SCALE, embed.TARGET_L2, embed.SAME_PERSON_L2))

    # label -> list of (source, descriptor)
    people = {}
    for arg in args:
        label, _, path = arg.partition("=")
        if not path:
            label, path = path or arg, arg
        faces = crops(path)
        if not faces:
            print("  ! no usable face in %s" % path)
            continue
        for i, face in enumerate(faces):
            d = descriptor(face)
            if d is None:
                continue
            # A group photo is many people, so each face gets its own label.
            key = label if len(faces) == 1 else "%s%d" % (label, i + 1)
            people.setdefault(key, []).append((path.rsplit("/", 1)[-1], face, d))

    if len(people) < 2:
        print("need at least two identities; got %d" % len(people))
        return 1

    same, diff = [], []

    print("\n-- same person, separate photographs --")
    real_pairs = 0
    for label, shots in people.items():
        for (na, _, da), (nb, _, db) in itertools.combinations(shots, 2):
            dist = float(np.linalg.norm(da - db))
            same.append(dist)
            real_pairs += 1
            print("  %-10s %-14s vs %-14s %.4f%s"
                  % (label, na, nb, dist, "" if dist < THRESHOLD else "   <-- OVER"))
    if not real_pairs:
        print("  (none supplied — pass the same label twice to test this)")

    print("\n-- same person, one photograph re-captured --")
    for label, shots in people.items():
        base = shots[0][2]
        worst, got = 0.0, 0
        for vlabel, v in variants(shots[0][1]):
            d = descriptor(v)
            if d is None:
                print("  %-10s %-8s no face" % (label, vlabel))
                continue
            dist = float(np.linalg.norm(base - d))
            same.append(dist)
            worst, got = max(worst, dist), got + 1
            print("  %-10s %-8s %.4f%s"
                  % (label, vlabel, dist, "" if dist < THRESHOLD else "   <-- OVER"))
        print("  %-10s %-8s %.4f over %d variants" % (label, "WORST", worst, got))

    print("\n-- different people --")
    for (la, sa), (lb, sb) in itertools.combinations(people.items(), 2):
        dist = float(np.linalg.norm(sa[0][2] - sb[0][2]))
        diff.append(dist)
        print("  %-10s vs %-10s %.4f%s"
              % (la, lb, dist, "   <-- UNDER" if dist < THRESHOLD else ""))

    first = next(iter(people.values()))[0][2]
    print("\n-- verdict --")
    print("  identities        : %d" % len(people))
    print("  descriptor length : %d" % len(first))
    print("  vector norm       : %.4f (expect %.4f)" % (float(np.linalg.norm(first)), embed.SCALE))
    if same:
        print("  same person       : max %.4f  mean %.4f  (n=%d)"
              % (max(same), sum(same) / len(same), len(same)))
    if diff:
        print("  different people  : min %.4f  mean %.4f  (n=%d)"
              % (min(diff), sum(diff) / len(diff), len(diff)))
    ok = (not same or max(same) < THRESHOLD) and (not diff or min(diff) > THRESHOLD)
    if same and diff:
        print("  margin            : %.4f" % (min(diff) - max(same)))
    print("  separation at %.2f : %s" % (THRESHOLD, "CLEAN" if ok else "OVERLAPS"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
