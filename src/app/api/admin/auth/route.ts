import { NextRequest, NextResponse } from "next/server";

// POST — Verify admin password
export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return NextResponse.json(
        { error: "Admin password not configured on server" },
        { status: 503 }
      );
    }

    if (password === adminPassword) {
      // Return a simple token (hash of password + date for session)
      const token = Buffer.from(`${adminPassword}:${new Date().toDateString()}`).toString("base64");
      return NextResponse.json({ ok: true, token });
    }

    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// GET — Verify existing token
export async function GET(request: NextRequest) {
  const token = request.headers.get("x-admin-token");
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || !token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const expected = Buffer.from(`${adminPassword}:${new Date().toDateString()}`).toString("base64");
  if (token === expected) {
    return NextResponse.json({ authenticated: true });
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
