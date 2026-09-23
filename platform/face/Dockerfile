# Face embedder — models pre-fetched into ./models (in-build GitHub LFS curl stalls on this VM).
FROM python:3.11-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "opencv-python-headless==4.10.0.84" "numpy<2"
COPY models /models
RUN test "$(stat -c%s /models/face_detection_yunet_2023mar.onnx)" -gt 100000 \
 && test "$(stat -c%s /models/face_recognition_sface_2021dec.onnx)" -gt 20000000
COPY embed.py /app/embed.py
WORKDIR /app
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin face \
 && chown -R face:face /models /app
USER face
ENV PORT=8000 FACE_MODEL_DIR=/models PYTHONUNBUFFERED=1
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=4).status==200 else 1)"
CMD ["python", "-u", "embed.py"]
