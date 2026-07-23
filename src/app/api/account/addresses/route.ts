import { NextResponse } from "next/server";
import { listAddresses, addAddress, updateAddress, deleteAddress } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  return NextResponse.json({ success: true, addresses: listAddresses(email) });
}

export async function POST(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  try {
    const body = await request.json();
    if (!body?.line1 || !body?.pincode) {
      return NextResponse.json({ success: false, message: "Address line and PIN code are required." }, { status: 400 });
    }
    return NextResponse.json({ success: true, address: addAddress(email, body) });
  } catch {
    return NextResponse.json({ success: false, message: "Could not save the address." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  try {
    const { id, ...patch } = await request.json();
    if (!id) return NextResponse.json({ success: false, message: "id is required." }, { status: 400 });
    const address = updateAddress(email, id, patch);
    if (!address) return NextResponse.json({ success: false, message: "Address not found." }, { status: 404 });
    return NextResponse.json({ success: true, address });
  } catch {
    return NextResponse.json({ success: false, message: "Could not update the address." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  return NextResponse.json({ success: deleteAddress(email, id) });
}
