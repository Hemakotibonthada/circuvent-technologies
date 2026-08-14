"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Renders a stream of JPEG frames as object URLs, releasing each one as the
 * next replaces it.
 *
 * WHY THIS IS A HOOK AND NOT FOUR COPIES
 *
 * A blob URL is a document-lifetime reference: the browser keeps the bytes
 * until the URL is revoked or the page is gone. Video is the one place in this
 * app that produces them in bulk — at thirty frames a second an un-revoked URL
 * leaks thirty JPEGs a second, tens of megabytes a minute, and the tab dies
 * during exactly the incident somebody opened the camera to watch.
 *
 * Three separate surfaces render camera frames (the device panel, the camera
 * console and the security panel). Getting the revoke right in one of them and
 * not the others is the shape of bug this codebase keeps finding, so the rule
 * lives in one place and they all call it.
 *
 * Frames are bytes rather than base64 because that is what the socket now
 * delivers — see `encodeFrame` in platform/api/src/ws.ts. A `data:` URL would
 * mean base64 on the wire, a decode here, and a fresh multi-kilobyte string per
 * frame, all to hand the browser back the bytes it was already sent.
 */
export function useFrameUrl(): (jpeg: Uint8Array) => string {
  const current = useRef<string | null>(null);

  // The last frame's URL outlives the component unless it is released here.
  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current);
      current.current = null;
    },
    []
  );

  return useCallback((jpeg: Uint8Array) => {
    /*
     * The cast is TypeScript's, not the runtime's. Modern lib.dom types a
     * Uint8Array as possibly backed by a SharedArrayBuffer, which Blob will not
     * accept — but every frame here comes from `slice()` or `new Uint8Array`,
     * both of which are plain-ArrayBuffer backed. Copying the buffer to satisfy
     * the checker would add a memcpy per frame to silence a case that cannot
     * occur.
     */
    const url = URL.createObjectURL(new Blob([jpeg as BlobPart], { type: "image/jpeg" }));
    const prev = current.current;
    current.current = url;
    // Revoked *after* the replacement exists: revoking first leaves a window
    // where the <img> is pointing at a URL the browser has already dropped,
    // which paints a broken-image icon between frames.
    if (prev) URL.revokeObjectURL(prev);
    return url;
  }, []);
}
