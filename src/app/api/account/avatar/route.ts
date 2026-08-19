import { NextResponse } from "next/server";
import { tokenFromRequest, verifyToken } from "@/lib/account";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { accountAvatarKey, clearAccountAvatar, getAccount, setAccountAvatar, revalidate } from "@/lib/store";
import { deleteObject, getObject, isObjectStoreConfigured, putObject } from "@/lib/object-store";
import { AVATAR_MAX_BYTES, avatarKeyFor, checkAvatar } from "@/lib/avatar";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The customer's profile picture.
 *
 * There was a pencil badge on the account avatar that looked exactly like
 * "change photo" — it is the universal affordance for it — and did nothing of
 * the sort. It jumped to the profile form, which holds a name and a phone
 * number and no picture anywhere, because there was no way to have one. Every
 * avatar in the storefront was generated initials.
 *
 * Bytes go to the object store, never into the `accounts` row: that row is a
 * JSONB blob read on every sign-in and every profile fetch.
 */

/** GET — the signed-in customer's own picture. */
export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return new NextResponse(null, { status: 401 });

  await revalidate(["accounts"]);
  const key = accountAvatarKey(email);
  if (!key) return new NextResponse(null, { status: 404 });

  const obj = await getObject(key);
  if (!obj) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(obj.body), {
    status: 200,
    headers: {
      "content-type": obj.contentType,
      /*
       * Private, because this is a photograph of a person and a shared cache
       * has no business holding it. Immutable is still safe: the key carries a
       * random suffix, so a replacement is a different object, and the URL the
       * page requests carries avatarUpdatedAt to match.
       */
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

/** POST — replace it. The body is the raw image; Content-Type is not trusted. */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const { ok, retryAfter } = rateLimit("account", ip);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });

  if (!isObjectStoreConfigured()) {
    /*
     * 501 rather than 500: nothing is broken, the deployment simply has no
     * bucket. Saying so plainly is what stops somebody debugging an upload
     * path that was never going to work there.
     */
    return NextResponse.json(
      { success: false, message: "Picture uploads aren't available on this deployment." },
      { status: 501 },
    );
  }

  await revalidate(["accounts"]);
  const account = getAccount(email);
  if (!account || account.blocked || account.deletedAt) {
    return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  }

  /*
   * Checked before reading, so an oversized upload is refused on its header
   * rather than after it has all been pulled into memory. The length can lie,
   * which is why the real check happens again on the bytes below.
   */
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared && declared > AVATAR_MAX_BYTES) {
    return NextResponse.json(
      { success: false, message: `Please choose an image under ${Math.round(AVATAR_MAX_BYTES / 1024)} KB.` },
      { status: 413 },
    );
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(await request.arrayBuffer());
  } catch {
    return NextResponse.json({ success: false, message: "Could not read that file." }, { status: 400 });
  }

  const check = checkAvatar(buf);
  if (!check.ok || !check.type) {
    return NextResponse.json({ success: false, message: check.message }, { status: 400 });
  }

  const key = avatarKeyFor(email, check.type);
  const stored = await putObject(key, buf, check.type);
  if (!stored) {
    logger.error("avatar.put_failed", { key });
    return NextResponse.json(
      { success: false, message: "Could not save that picture. Please try again." },
      { status: 502 },
    );
  }

  const result = setAccountAvatar(email, key);
  if (!result) {
    // The row could not be pointed at the object, so the object is litter.
    await deleteObject(key);
    return NextResponse.json({ success: false, message: "Could not save that picture." }, { status: 500 });
  }

  // Only once the row points at the new object. Failing here leaves one
  // orphaned object, which costs a few kilobytes; doing it first would leave
  // the row pointing at nothing, which shows a broken image instead.
  if (result.previousKey) await deleteObject(result.previousKey);

  return NextResponse.json({ success: true, avatarUpdatedAt: getAccount(email)?.avatarUpdatedAt });
}

/** DELETE — go back to initials. */
export async function DELETE(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });

  await revalidate(["accounts"]);
  const result = clearAccountAvatar(email);
  if (!result) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  if (result.previousKey) await deleteObject(result.previousKey);

  return NextResponse.json({ success: true });
}
