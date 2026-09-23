# Face ONNX models (not committed)

Platform Option D1 builds the face image with `COPY models /models` because
in-build GitHub LFS curl stalls on the Platform VM.

Required files (fetch once onto the build host before `docker compose build`):

- `face_detection_yunet_2023mar.onnx` (>100 KB)
- `face_recognition_sface_2021dec.onnx` (>20 MB)

Upstream (OpenCV zoo via GitHub LFS media endpoint):

```text
https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx
```

Do not commit the `.onnx` binaries. Live Platform path: `/opt/circuvent/iot-api/face/models/`.
