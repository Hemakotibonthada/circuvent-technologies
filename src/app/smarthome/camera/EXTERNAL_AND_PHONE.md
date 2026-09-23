# Other-brand & phone cameras

## Other brand
From **Cameras → Add camera → Other brand**, register an RTSP / HLS / MJPEG / snapshot URL.
- HLS / MJPEG / snapshot play in the browser directly.
- RTSP is stored always. Live preview needs `CAMERA_RELAY_BASE_URL` pointing at go2rtc or MediaMTX (HLS at `/stream.m3u8?src=<cameraId>`), or a snapshot URL.

## Phone as CCTV
1. **Add camera → Use a phone** generates a pairing link.
2. Open the link on the spare phone, allow the camera, keep the tab foreground.
3. The feed appears on the Camera wall and Security → Cameras until Stop / revoke.

APIs: `/api/smarthome/cameras`, `/api/smarthome/cameras/phone/{pair,claim,frame}`.
