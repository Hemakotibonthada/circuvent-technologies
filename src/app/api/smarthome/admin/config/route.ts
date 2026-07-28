import { NextResponse } from "next/server";
import {
  isCollection, listRecords, listAudit, createRecord, updateRecord, deleteRecord,
  isDurable, verifyOperator, type Collection,
} from "@/lib/admin-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Operator authorisation required." }, { status: 401 });
}

function badCollection() {
  return NextResponse.json({ ok: false, error: "Unknown collection." }, { status: 400 });
}

function collectionOf(request: Request): Collection | null {
  const c = new URL(request.url).searchParams.get("collection") || "";
  return isCollection(c) ? c : null;
}

export async function GET(request: Request) {
  const op = await verifyOperator(request);
  if (!op) return unauthorized();

  const url = new URL(request.url);
  if (url.searchParams.get("collection") === "audit") {
    const limit = Number(url.searchParams.get("limit")) || 100;
    return NextResponse.json({ ok: true, audit: listAudit(limit), durable: isDurable() });
  }

  const collection = collectionOf(request);
  if (!collection) return badCollection();
  return NextResponse.json({ ok: true, records: listRecords(collection), durable: isDurable() });
}

export async function POST(request: Request) {
  const op = await verifyOperator(request);
  if (!op) return unauthorized();
  const collection = collectionOf(request);
  if (!collection) return badCollection();
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "A JSON body is required." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, record: createRecord(collection, op.email, body) });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not create the record." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const op = await verifyOperator(request);
  if (!op) return unauthorized();
  const collection = collectionOf(request);
  if (!collection) return badCollection();
  try {
    const { id, ...patch } = await request.json();
    if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
    const record = updateRecord(collection, op.email, String(id), patch);
    if (!record) return NextResponse.json({ ok: false, error: "Record not found." }, { status: 404 });
    return NextResponse.json({ ok: true, record });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not update the record." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const op = await verifyOperator(request);
  if (!op) return unauthorized();
  const collection = collectionOf(request);
  if (!collection) return badCollection();
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  const removed = deleteRecord(collection, op.email, id);
  if (!removed) return NextResponse.json({ ok: false, error: "Record not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
