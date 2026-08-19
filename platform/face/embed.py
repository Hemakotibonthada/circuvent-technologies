#!/usr/bin/env python3
"""
The face embedder — turns a photograph into a descriptor the door can compare.

Speaks exactly the contract `platform/api/src/face/embedder.ts` already
defines for `FACE_EMBEDDER=http`:

    POST /embed        body: raw image bytes, content-type: image/*
      -> 200 {"descriptor": [128 floats], "faces": 1}
      -> 200 {"faces": 0}      no face found
      -> 200 {"faces": 3}      more than one face
    GET  /health       -> 200 {"ok": true, ...}

WHY THIS IS A SEPARATE CONTAINER

The control plane runs on `node:20-alpine`. A face model needs OpenCV, which
needs glibc — and rebasing the API image to bring in ~150 MB of native
libraries would also put a CPU-bound model in the same process as the MQTT
bridge and every HTTP request, on a VM with 2 shared cores. The `http` embedder
boundary was built for exactly this ("typically the hub's own AI node"), so
this slots into it with no change to the API at all, and its memory is capped
where it cannot starve Postgres.

WHY THESE MODELS

YuNet (227 KB) detects and returns five landmarks; SFace (37 MB) turns an
aligned crop into an embedding. Both ship in OpenCV's own zoo and run on CPU in
tens of milliseconds. The alternative, dlib/face_recognition, wants a compiler,
~200 MB and considerably more RAM for the same job.

THE CALIBRATION IS THE SUBTLE PART — READ THIS BEFORE CHANGING THE MODEL

`match.ts` compares descriptors with Euclidean distance against a threshold of
0.6, and caps configuration at 0.6 (`MAX_THRESHOLD`) so nobody can loosen a
door by editing an env var. That 0.6 is the dlib convention.

SFace is not dlib. Its features are unit-norm and its own documented boundary
for "same person" is a cosine similarity of 0.363 — a Euclidean distance of
sqrt(2 * (1 - 0.363)) = 1.128. Feeding raw SFace vectors into a 0.6 threshold
would reject almost everybody: the door fails *safe*, but it never opens for
the people it is meant to.

So the vectors are scaled here, once, by 0.6 / 1.128. Distances then land on
the scale `match.ts` was written and tested against, and its threshold, its
margin rule and its refusal to be loosened all keep meaning what they say.
Calibrating at the model rather than moving the door's threshold is deliberate:
the model is the thing that changed, and a door's safety rules should not have
to be renegotiated every time it does.

Swapping in another model means recomputing SAME_PERSON_L2 for that model. It
does not mean touching the door.
"""

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np

MODEL_DIR = os.environ.get("FACE_MODEL_DIR", "/models")
DETECTOR_PATH = os.path.join(MODEL_DIR, "face_detection_yunet_2023mar.onnx")
RECOGNISER_PATH = os.path.join(MODEL_DIR, "face_recognition_sface_2021dec.onnx")

PORT = int(os.environ.get("PORT", "8000"))
API_KEY = os.environ.get("FACE_API_KEY", "")

# Largest image accepted. A door camera sends VGA/SVGA; anything far larger is
# a misconfigured client, and decoding it would cost more than the embedding.
MAX_BYTES = int(os.environ.get("FACE_MAX_BYTES", str(8 * 1024 * 1024)))

# Detector confidence. Below this it is texture, not a face — and a false
# detection enrolled as somebody's face is a key cut for a pattern on a wall.
#
# 0.7 rather than the 0.9 the model's own demo uses. A door that fails to see a
# face is a door that does not open for the person who lives there, and the
# detector is not the thing keeping strangers out: a spurious detection still
# has to produce a descriptor within 0.6 of an enrolled one, which noise does
# not. The threshold that matters for security is in match.ts. This one only
# decides how much the embedder bothers looking at. Raising it back up is
# reasonable if a site sees junk enrolments; a big, clearly-lit portrait
# measured 0.77 during calibration, so 0.85 was already rejecting real faces.
SCORE_THRESHOLD = float(os.environ.get("FACE_SCORE_THRESHOLD", "0.7"))
NMS_THRESHOLD = 0.3
TOP_K = 50

# Minimum face *height* in pixels, measured on the original image.
#
# Height, not width, and not both. YuNet's boxes are roughly 3 wide to 4 tall,
# so requiring 60 in each direction quietly demanded an 80-pixel-tall face —
# and during calibration that rejected a perfectly good 53x70 detection the
# model itself scored at 0.92. Height is also the dimension that tracks how far
# away somebody is standing, which is what this limit is really about.
#
# 120 because that is where the model stops guessing. Measured with
# calibrate.py over 13 identities (two real photographs of one person, three
# portraits, and ten faces cropped out of a group selfie), comparing the worst
# same-person distance against the best different-people distance:
#
#     min height   identities   same person   different people   at 0.6
#     ----------   ----------   -----------   ----------------   ------
#         60           13          0.549            0.561        overlap
#         90            9          0.403            0.589        overlap
#        120            5          0.254            0.665        clean
#
# Below about 100 pixels the two distributions touch, which means no threshold
# anywhere can tell those faces apart and a door using one is guessing. Above
# 120 the gap is 0.41 wide. So this is not tuning for convenience — it is the
# line under which this model has nothing trustworthy to say, and a lock should
# decline to answer rather than answer badly.
#
# The cost is that somebody standing too far back is not recognised, and the
# door stays shut until they step closer or use the keypad. On a VGA camera 120
# pixels is a quarter of the frame height, which is roughly where a face lands
# when a person is close enough to press a doorbell.
MIN_FACE_PX = int(os.environ.get("FACE_MIN_PX", "120"))

# Longest side the detector is allowed to see.
#
# YuNet is a fixed-scale detector and it does not simply get better with more
# pixels — it gets worse. A 1618x1522 portrait with a face filling a third of
# the frame was detected not at all at full size, and at 0.92 confidence once
# the image was reduced to 1024. That is not a rounding difference; it is the
# whole feature failing, and it fails on precisely the images this service will
# be given most often, because enrolment from the app sends whatever the phone
# camera produced — routinely 3000 pixels wide or more.
#
# Detection therefore runs on a reduced copy. The landmarks are scaled back up
# and the crop handed to SFace is taken from the *original* image, so nothing
# is lost from the embedding itself; only the search for the face is done at a
# sensible size. It is also several times faster, which matters on a VM that
# shares two cores with a database and a broker.
MAX_DETECT_PX = int(os.environ.get("FACE_MAX_DETECT_PX", "1024"))

# See the module docstring. SFace's own same-person boundary in L2 terms.
SAME_PERSON_L2 = 1.128
TARGET_L2 = 0.6
SCALE = TARGET_L2 / SAME_PERSON_L2

_lock = threading.Lock()
_detector = None
_recogniser = None

# How long a request will wait for the model before giving up.
#
# OpenCV's nets are not thread-safe, so exactly one request uses them at a
# time. Without a bound, a queue forms silently and a caller eventually hits
# its own timeout — which is a much worse failure than being told: the model
# finds the face, writes the answer, and discovers the client has gone. The
# log then shows a successful embed and no corresponding decision, and there
# is nothing in it to explain the gap.
LOCK_WAIT_S = float(os.environ.get("FACE_LOCK_WAIT_S", "6"))


class Busy(Exception):
    """The model was in use for too long. An honest 503, not a silent stall."""


def models():
    """
    Loaded once, lazily, under a lock.

    OpenCV's Net objects are not thread-safe, and this server is threaded so a
    slow request cannot block a health check. One lock around both the detector
    and the recogniser is simpler than two and costs nothing: an embed is a few
    tens of milliseconds and a door does not enrol concurrently.
    """
    global _detector, _recogniser
    if _detector is None or _recogniser is None:
        _detector = cv2.FaceDetectorYN.create(
            DETECTOR_PATH, "", (320, 320), SCORE_THRESHOLD, NMS_THRESHOLD, TOP_K
        )
        _recogniser = cv2.FaceRecognizerSF.create(RECOGNISER_PATH, "")
    return _detector, _recogniser


def detect(img):
    """
    Faces in `img`, as rows in the ORIGINAL image's coordinates.

    Detection happens on a reduced copy when the image is large (see
    MAX_DETECT_PX) and the results are scaled back, so callers never have to
    think about which image a landmark belongs to.
    """
    h, w = img.shape[:2]
    scale = 1.0
    small = img
    if MAX_DETECT_PX > 0 and max(h, w) > MAX_DETECT_PX:
        scale = MAX_DETECT_PX / float(max(h, w))
        small = cv2.resize(img, (max(1, int(w * scale)), max(1, int(h * scale))),
                           interpolation=cv2.INTER_AREA)

    detector, _ = models()
    detector.setInputSize((small.shape[1], small.shape[0]))
    _, faces = detector.detect(small)
    if faces is None or len(faces) == 0:
        return []

    out = []
    for f in faces:
        row = np.array(f, dtype=np.float32)
        # Columns 0..13 are the box and the five landmarks; 14 is the score,
        # which is not a coordinate and must not be scaled.
        row[:14] /= scale
        out.append(row)
    return out


def embed_image(raw):
    """
    Returns (descriptor|None, faces_found).

    `faces_found` is what lets the caller tell "no face" from "several faces" —
    two problems with opposite advice for the person holding the phone.
    """
    buf = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        return None, -1

    h, w = img.shape[:2]
    if h < 40 or w < 40:
        return None, 0

    _, recogniser = models()
    if not _lock.acquire(timeout=LOCK_WAIT_S):
        raise Busy()
    try:
        faces = detect(img)
        if not faces:
            return None, 0

        # Detections too small to embed honestly are ignored rather than
        # counted: a face 20 px tall in the corner should not turn a good
        # portrait into "more than one person".
        usable = [f for f in faces if f[3] >= MIN_FACE_PX]
        if not usable:
            return None, 0
        if len(usable) > 1:
            return None, len(usable)

        # alignCrop uses the five landmarks YuNet returns, so the crop handed to
        # SFace is pose-normalised. Skipping it and passing a bounding box costs
        # a great deal of accuracy on anything but a dead-straight face. It runs
        # on the full-resolution image, not the reduced copy used for detection.
        aligned = recogniser.alignCrop(img, usable[0])
        feature = recogniser.feature(aligned)
    finally:
        _lock.release()

    vec = np.asarray(feature, dtype=np.float64).flatten()
    norm = float(np.linalg.norm(vec))
    if not np.isfinite(norm) or norm == 0.0:
        return None, 1

    # Unit-norm, then onto the door's scale. See the module docstring.
    calibrated = (vec / norm) * SCALE
    return [round(float(x), 6) for x in calibrated], 1


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        # One line per request on stdout, which docker captures and the log
        # archiver ships. The default writes a different format to stderr and
        # includes a client address that is always the API container.
        sys.stdout.write("[face] " + (fmt % args) + "\n")
        sys.stdout.flush()

    def _send(self, code, body):
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path.startswith("/health"):
            ok = os.path.exists(DETECTOR_PATH) and os.path.exists(RECOGNISER_PATH)
            self._send(
                200 if ok else 503,
                {
                    "ok": ok,
                    "detector": os.path.basename(DETECTOR_PATH),
                    "recogniser": os.path.basename(RECOGNISER_PATH),
                    "descriptorLength": 128,
                    "maxDetectPx": MAX_DETECT_PX,
                    "minFacePx": MIN_FACE_PX,
                    "scoreThreshold": SCORE_THRESHOLD,
                    "calibration": {"samePersonL2": SAME_PERSON_L2, "targetL2": TARGET_L2},
                },
            )
            return
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/embed"):
            self._send(404, {"error": "not found"})
            return

        # Optional shared secret. The service listens only on the internal
        # compose network, so this is defence in depth rather than the only
        # thing between a stranger and the model.
        if API_KEY:
            if self.headers.get("authorization", "") != "Bearer " + API_KEY:
                self._send(401, {"error": "unauthorised"})
                return

        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            self._send(400, {"error": "empty body"})
            return
        if length > MAX_BYTES:
            self._send(413, {"error": "image too large"})
            return

        raw = self.rfile.read(length)
        started = time.time()
        try:
            descriptor, faces = embed_image(raw)
        except Busy:
            self.log_message("busy — model still in use after %.0fs", LOCK_WAIT_S)
            self._send(503, {"error": "busy"})
            return
        except Exception as err:  # a bad frame must not take the service down
            self.log_message("embed failed: %s", err)
            self._send(500, {"error": "embed failed"})
            return

        # The outcome, not just the status line. "200" on its own says the
        # service answered; it does not say whether a face was found, which is
        # the only thing the caller actually wanted and the first question
        # asked when a door does not open.
        self.log_message(
            "embed %d bytes -> %s in %.0fms",
            len(raw),
            "descriptor" if descriptor else ("no face" if faces == 0 else
                                             "not an image" if faces < 0 else "%d faces" % faces),
            (time.time() - started) * 1000,
        )

        if descriptor is None:
            # -1 means the bytes were not a decodable image at all, which is a
            # different fault from "no face in this photo".
            if faces < 0:
                self._send(400, {"error": "not an image"})
            else:
                self._send(200, {"faces": faces})
            return

        self._send(200, {"descriptor": descriptor, "faces": 1})


def warmup():
    """
    Run one real inference at boot.

    Loading the models is not enough. The first *inference* is where OpenCV
    allocates its layer buffers and picks its kernels, and on this hardware
    that first call measured 9.1 seconds against 0.3-0.4 seconds warm — with
    the API's embed timeout set to 10. So without this, the first person to use
    the door after any restart waits nine seconds or is refused outright, and
    the log says "timeout" rather than "the service had not finished starting".

    A restart is exactly when that matters: it happens after a deploy, at the
    moment somebody is most likely to be standing there testing it.

    Both models are exercised. The detector is given a plausible frame and the
    recogniser a blank 112x112 crop directly, because a synthetic image has no
    face in it and would otherwise leave SFace cold.
    """
    started = time.time()
    detector, recogniser = models()
    frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
    try:
        detector.setInputSize((640, 480))
        detector.detect(frame)
        recogniser.feature(np.zeros((112, 112, 3), dtype=np.uint8))
    except Exception as err:
        sys.stderr.write("[face] warmup failed: %s\n" % err)
        return
    sys.stdout.write("[face] warm in %.2fs\n" % (time.time() - started))


def main():
    for path in (DETECTOR_PATH, RECOGNISER_PATH):
        if not os.path.exists(path):
            sys.stderr.write("missing model: %s\n" % path)
            return 1
    warmup()
    sys.stdout.write("[face] listening on :%d\n" % PORT)
    sys.stdout.flush()
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
