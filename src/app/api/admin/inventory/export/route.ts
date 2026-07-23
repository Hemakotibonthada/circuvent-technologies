import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { exportCsv } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const csv = exportCsv();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="circuvent-inventory-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
