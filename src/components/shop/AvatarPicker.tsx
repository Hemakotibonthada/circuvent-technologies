"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";

/**
 * The avatar, and the control that changes it.
 *
 * WHY THE BROWSER DOES THE RESIZING
 *
 * A phone camera produces a 4–12 MB image several thousand pixels wide, to be
 * displayed at 112. Uploading that would mean a slow upload on a phone
 * connection, a server-side image pipeline (sharp is a native dependency that
 * has to be built for the deployment target), and a stored object hundreds of
 * times larger than anything that is ever shown.
 *
 * A canvas does it in the page for free. What leaves the browser is a 256×256
 * JPEG of roughly 15–30 KB, so the upload is instant, the server only has to
 * check the bytes are an image, and the bucket holds what is actually used.
 *
 * The server still validates. This is a convenience, not a control: the
 * endpoint is reachable without going through this component.
 */

const OUTPUT_PX = 256;
const JPEG_QUALITY = 0.85;

/**
 * Reads a file into a square, downscaled JPEG.
 *
 * Centre-cropped rather than squashed — an avatar frame is a circle, and
 * stretching a portrait to fit it makes a face look wrong in a way people
 * notice without being able to say why.
 */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_PX;
    canvas.height = OUTPUT_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-canvas");
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_PX, OUTPUT_PX);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("encode-failed"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}

export default function AvatarPicker({
  initials,
  background,
  avatarUpdatedAt,
  authHeaders,
  onChanged,
}: {
  initials: string;
  background: string;
  /** Set when the account has a picture; also the cache key. */
  avatarUpdatedAt?: string;
  authHeaders: () => Record<string, string>;
  onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /*
   * Shown immediately from the chosen file so the new picture appears while it
   * is still uploading. Without it the avatar sits unchanged for the length of
   * the request and the click reads as having done nothing.
   */
  const [preview, setPreview] = useState<string>("");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  /*
   * The timestamp is what makes a replacement visible. The response is cached
   * immutably — deliberately, since these are served on every page — so
   * without it the browser would keep showing the previous picture and the
   * upload would look like it failed.
   */
  const remoteSrc = avatarUpdatedAt
    ? `/api/account/avatar?v=${encodeURIComponent(avatarUpdatedAt)}`
    : "";
  const shown = preview || remoteSrc;

  const upload = useCallback(
    async (file: File) => {
      setError("");
      setBusy(true);
      try {
        const squared = await toSquareJpeg(file).catch(() => null);
        if (!squared) {
          setError("That image couldn't be read. Try a JPEG or PNG.");
          return;
        }

        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(squared);
        });

        const res = await fetch("/api/account/avatar", {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "image/jpeg" },
          body: squared,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          setError(data.message || "Could not save that picture.");
          setPreview((old) => {
            if (old) URL.revokeObjectURL(old);
            return "";
          });
          return;
        }
        onChanged();
      } finally {
        setBusy(false);
      }
    },
    [authHeaders, onChanged],
  );

  const remove = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/account/avatar", { method: "DELETE", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || "Could not remove that picture.");
        return;
      }
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return "";
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }, [authHeaders, onChanged]);

  return (
    <div className="relative shrink-0">
      <div className="relative h-28 w-28">
        {shown ? (
          /*
            The source is an authenticated API route or a blob: URL. next/image
            can optimise neither, and there is nothing to optimise in a 256px
            JPEG that was resized in this browser a moment ago.
          */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt="Your profile picture"
            width={112}
            height={112}
            className="h-28 w-28 rounded-full object-cover"
            onError={() => setPreview("")}
          />
        ) : (
          <div
            className="grid h-28 w-28 place-items-center rounded-full text-3xl font-semibold text-white"
            style={{ background }}
            aria-hidden
          >
            {initials}
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 grid place-items-center rounded-full" style={{ background: "rgba(0,0,0,0.45)" }}>
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title={shown ? "Change your profile picture" : "Add a profile picture"}
          aria-label={shown ? "Change your profile picture" : "Add a profile picture"}
          className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border disabled:opacity-50"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
        >
          <Camera className="h-4 w-4" />
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so choosing the same file twice still fires a change —
            // which is exactly what somebody does after a failed upload.
            e.target.value = "";
            if (file) upload(file);
          }}
        />
      </div>

      {shown && !busy && (
        <button
          type="button"
          onClick={remove}
          className="mt-2 inline-flex w-28 items-center justify-center gap-1 text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          <Trash2 className="h-3 w-3" /> Remove
        </button>
      )}

      {!!error && (
        <p role="alert" className="mt-2 w-28 text-[11px] leading-tight" style={{ color: "var(--status-danger-text)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
