"use client";

import { useState } from "react";

/**
 * The signed-in operator's face in the admin topbar.
 *
 * Staff set their photo at auth.circuvent.com, so the picture shown here is a
 * URL owned by the identity service rather than anything this app stores. That
 * is the whole reason this is more than an `<img>`:
 *
 *  - the URL can 404, expire, or be blocked by the network the operator is on,
 *    and a broken-image glyph is a worse identity badge than initials;
 *  - plenty of accounts have no photo at all (anyone added to the staff list by
 *    hand rather than provisioned over SSO), so initials are the normal case,
 *    not the error case.
 *
 * The failed URL is remembered rather than a boolean so that a later sign-in
 * with a different photo is tried on its own merits instead of inheriting the
 * previous one's failure.
 */
export function initialsFor(name: string, email: string): string {
  /*
   * The domain is dropped before deriving anything. Splitting the whole address
   * lets the mail host supply a letter — "ada@circuvent.com" reads as "AC",
   * pairing her first initial with Circuvent's — which is not this person's
   * monogram at all.
   */
  const source = name.trim() || email.trim().split("@")[0];
  if (!source) return "?";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function StaffAvatar({
  name,
  email,
  photo,
  size = 44,
  className = "",
}: {
  name: string;
  email?: string;
  photo?: string;
  size?: number;
  className?: string;
}) {
  const [failedPhoto, setFailedPhoto] = useState("");
  const showPhoto = Boolean(photo) && failedPhoto !== photo;
  const initials = initialsFor(name, email ?? "");

  return (
    <span
      data-testid="staff-avatar"
      className={`grid shrink-0 place-items-center overflow-hidden rounded-lg text-sm font-bold text-white ${className}`}
      style={{
        height: size,
        width: size,
        background: showPhoto ? "transparent" : "var(--cv-gradient)",
      }}
    >
      {showPhoto ? (
        /*
         * Not next/image: the source is an arbitrary host chosen by the
         * identity service, and the optimiser would need every one of them
         * allow-listed in advance. `no-referrer` because directory photos are
         * commonly served from storage that rejects hotlinks by referrer.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedPhoto(photo ?? "")}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}
