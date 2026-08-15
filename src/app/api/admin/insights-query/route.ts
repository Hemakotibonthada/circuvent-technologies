import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { queryView } from "@/lib/telemetry-store";
import { QueryError, MAX_ROWS, SAMPLE_QUERIES, TABLES, COLUMNS, completions } from "@/lib/app-insights-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Logs blade.
 *
 * POST rather than GET, even though a query only reads: a query is long,
 * frequently contains quotes and user-chosen strings, and a URL is the one
 * place in the stack that reliably ends up in an access log. Putting somebody's
 * ad-hoc filter over customer routes into the proxy log of the system it is
 * querying is a poor trade for a bookmarkable URL.
 */
export async function POST(request: Request) {
  if (!guard(request, "insights")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query : "";
  const rawMax = Number(body.maxRows);
  const maxRows = Number.isFinite(rawMax) ? Math.min(MAX_ROWS, Math.max(1, Math.round(rawMax))) : undefined;

  try {
    return NextResponse.json({ success: true, ...queryView(query, maxRows) });
  } catch (err) {
    /*
     * A rejected query is the caller's mistake, not the server's: 400 with the
     * offset so the editor can point at the character. Returning 500 would put
     * every typo into the error monitoring of the system being queried.
     */
    if (err instanceof QueryError) {
      return NextResponse.json({ success: false, message: err.message, offset: err.offset }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: "That query could not be run." }, { status: 500 });
  }
}

/** GET — the schema and starting points the editor needs to be usable. */
export async function GET(request: Request) {
  if (!guard(request, "insights")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    success: true,
    tables: Object.entries(TABLES).map(([name, t]) => ({ name, label: t.label })),
    columns: Object.entries(COLUMNS).map(([name, type]) => ({ name, type })),
    samples: SAMPLE_QUERIES,
    completions: completions(),
    maxRows: MAX_ROWS,
  });
}
