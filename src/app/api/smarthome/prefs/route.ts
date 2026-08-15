import { NextResponse } from "next/server";
import { isScope, readScope, readAll, writeScope, clearScope, isDurable, verifyCaller, type Scope } from "@/lib/user-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Sign in to load your preferences." }, { status: 401 });
}

function scopeOf(request: Request): Scope | null {
  const s = new URL(request.url).searchParams.get("scope") || "";
  return isScope(s) ? s : null;
}

export async function GET(request: Request) {
  const caller = await verifyCaller(request);
  if (!caller) return unauthorized();

  const url = new URL(request.url);
  if (!url.searchParams.get("scope")) {
    return NextResponse.json({ ok: true, prefs: await readAll(caller.key), durable: isDurable() });
  }
  const scope = scopeOf(request);
  if (!scope) return NextResponse.json({ ok: false, error: "Unknown scope." }, { status: 400 });
  return NextResponse.json({ ok: true, value: await readScope(caller.key, scope), durable: isDurable() });
}

export async function PUT(request: Request) {
  const caller = await verifyCaller(request);
  if (!caller) return unauthorized();
  const scope = scopeOf(request);
  if (!scope) return NextResponse.json({ ok: false, error: "Unknown scope." }, { status: 400 });
  try {
    const { value } = await request.json();
    if (value === undefined) {
      return NextResponse.json({ ok: false, error: "A `value` is required." }, { status: 400 });
    }
    const saved = await writeScope(caller.key, scope, value);
    return NextResponse.json({ ok: true, value: saved, durable: isDurable() });
  } catch (e) {
    /*
     * A failed write is reported rather than swallowed. This endpoint used to
     * be unable to fail: it wrote to an in-memory object, returned ok, and the
     * rename was gone by the next cold start — the client had no way to know,
     * so it told the user the name was saved. A 500 here is what makes the
     * console's "saved on this device only" warning true when it appears.
     */
    console.error("[prefs] save failed:", e);
    return NextResponse.json({ ok: false, error: "Could not save the preference." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const caller = await verifyCaller(request);
  if (!caller) return unauthorized();
  const scope = scopeOf(request);
  if (!scope) return NextResponse.json({ ok: false, error: "Unknown scope." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, removed: await clearScope(caller.key, scope) });
  } catch (e) {
    console.error("[prefs] clear failed:", e);
    return NextResponse.json({ ok: false, error: "Could not clear the preference." }, { status: 500 });
  }
}
