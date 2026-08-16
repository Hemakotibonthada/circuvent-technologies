import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit } from "@/lib/store";
import {
  listRegistrations,
  registerWarranty,
  warrantyStatus,
  listRmas,
  createRma,
  updateRmaStatus,
  warrantyStats,
  revalidateWarranty,
  flushWarranty,
} from "@/lib/admin-warranty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "warranty")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateWarranty();
  const registrations = listRegistrations().map((r) => ({ ...r, status: warrantyStatus(r) }));
  return NextResponse.json({ success: true, registrations, rmas: listRmas(), stats: warrantyStats() });
}

export async function POST(request: Request) {
  const me = guard(request, "warranty");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await revalidateWarranty();
    const b = await request.json();
    if (b.kind === "rma") {
      if (!b.registrationId || !b.issueDescription) return NextResponse.json({ success: false, message: "registrationId and issueDescription required." }, { status: 400 });
      const rma = createRma(b.registrationId, b.issueDescription);
      logAudit("warranty.rma.create", rma.id);
      await flushWarranty();
      return NextResponse.json({ success: true, rma });
    }
    if (!b.productName || !b.deviceOrSerial || !b.customerEmail || !b.purchaseDate) {
      return NextResponse.json({ success: false, message: "productName, deviceOrSerial, customerEmail and purchaseDate required." }, { status: 400 });
    }
    const registration = registerWarranty({
      orderNo: b.orderNo,
      productName: b.productName,
      deviceOrSerial: b.deviceOrSerial,
      customerEmail: b.customerEmail,
      purchaseDate: b.purchaseDate,
      warrantyMonths: Number(b.warrantyMonths) || 12,
    });
    logAudit("warranty.register", registration.deviceOrSerial);
    await flushWarranty();
    return NextResponse.json({ success: true, registration });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const me = guard(request, "warranty");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await revalidateWarranty();
    const b = await request.json();
    const rma = updateRmaStatus(b.id, b.status, b.resolutionNote);
    if (!rma) return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
    logAudit("warranty.rma.status", `${b.id} -> ${b.status}`);
    await flushWarranty();
    return NextResponse.json({ success: true, rma });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}
