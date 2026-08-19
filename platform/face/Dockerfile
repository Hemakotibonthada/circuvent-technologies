# The face embedder image.
#
# Kept deliberately small and boring: a slim Python base, the headless OpenCV
# wheel (no GUI/GTK dependencies — this never draws a window), and the two ONNX
# models baked in at build time.
#
# The models are downloaded during the build rather than committed to git: they
# are 37 MB of binary that would bloat every clone of the repo forever, and
# they are versioned by filename so a build is still reproducible. They come
# from GitHub's LFS media endpoint because the plain `raw.githubusercontent.com`
# URLs serve LFS *pointer files* — 130 bytes of text that OpenCV will happily
# accept and then fail on at runtime. The size check below exists precisely to
# catch that: a "successful" download of a pointer file must fail the build,
# not ship a broken image.
FROM python:3.11-slim

# libgl / libglib are what even the headless wheel links against for image
# decoding. Without them `import cv2` fails at load time with a bare
# "libGL.so.1: cannot open shared object file".
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "opencv-python-headless==4.10.0.84" "numpy<2"

ARG ZOO=https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models
RUN mkdir -p /models \
 && curl -fsSL -o /models/face_detection_yunet_2023mar.onnx \
      "$ZOO/face_detection_yunet/face_detection_yunet_2023mar.onnx" \
 && curl -fsSL -o /models/face_recognition_sface_2021dec.onnx \
      "$ZOO/face_recognition_sface/face_recognition_sface_2021dec.onnx" \
 && test "$(stat -c%s /models/face_detection_yunet_2023mar.onnx)" -gt 100000 \
 && test "$(stat -c%s /models/face_recognition_sface_2021dec.onnx)" -gt 20000000

COPY embed.py /app/embed.py
WORKDIR /app

# Nothing here needs root once the models are in place.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin face
USER face

ENV PORT=8000 FACE_MODEL_DIR=/models PYTHONUNBUFFERED=1
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=4).status==200 else 1)"

CMD ["python", "-u", "embed.py"]
