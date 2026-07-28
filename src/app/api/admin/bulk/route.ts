import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit, listCustomers, upsertProduct } from "@/lib/store";
import { parseCsv, validateRows, recordImport, listImports, recordExport, listExports, toCsv, type ImportKind } from "@/lib/admin-bulk";
import { setTags } from "@/lib/admin-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "bulk")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const exportKind = searchParams.get("export");
  if (exportKind === "customers") {
    const csv = toCsv(listCustomers().map((c) => ({ email: c.email, name: c.name, orders: c.orders, spend: c.spend, wallet: c.wallet })));
    recordExport("customers", listCustomers().length);
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=customers.csv" } });
  }
  return NextResponse.json({ success: true, imports: listImports(), exports: listExports() });
}

/** POST /api/admin/bulk — { kind: "products"|"customers", fileName, csvText, commit } */
export async function POST(request: Request) {
  const me = guard(request, "bulk");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    const kind = b.kind as ImportKind;
    if (kind !== "products" && kind !== "customers") return NextResponse.json({ success: false, message: "kind must be products or customers." }, { status: 400 });
    if (typeof b.csvText !== "string") return NextResponse.json({ success: false, message: "csvText required." }, { status: 400 });

    const rows = parseCsv(b.csvText);
    const results = validateRows(kind, rows);
    let committedCount = 0;

    if (b.commit) {
      if (kind === "products") {
        for (const r of results.filter((x) => x.errors.length === 0)) {
          upsertProduct({
            id: r.data.slug,
            slug: r.data.slug,
            name: r.data.name,
            price: Number(r.data.price),
            stock: Number(r.data.stock),
            available: true,
            category: r.data.category,
            custom: true,
          });
          committedCount++;
        }
      } else {
        const knownEmails = new Set(listCustomers().map((c) => c.email.toLowerCase()));
        for (const r of results.filter((x) => x.errors.length === 0)) {
          const email = r.data.email.toLowerCase();
          if (!knownEmails.has(email)) continue; // never create accounts from a CSV — tag existing customers only
          const tags = (r.data.tags || "").split(";").map((t) => t.trim()).filter(Boolean);
          if (tags.length) setTags(email, tags);
          committedCount++;
        }
      }
    }

    const job = recordImport(kind, b.fileName || "upload.csv", results, !!b.commit);
    if (b.commit) logAudit("bulk.import.commit", `${kind}: ${committedCount} rows`);
    return NextResponse.json({ success: true, job, results: results.slice(0, 200), committedCount });
  } catch {
    return NextResponse.json({ success: false, message: "Could not process file." }, { status: 500 });
  }
}
