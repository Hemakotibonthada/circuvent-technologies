/**
 * The privacy queue's one job it must not get wrong.
 *
 * Marking a "delete my account" request completed asserts the customer's data
 * is gone. Nothing in this product erases it — there is no anonymise routine,
 * only setAccountBlocked — so the queue was recording a completion date
 * against data that was still entirely there. An auditor reading that queue
 * would reasonably conclude the erasure happened. That is a false attestation,
 * not a UI nit, so these assertions are about refusing to make it.
 */

/*
 * store.ts is mocked because it has a top-level `await bootstrap()`, which
 * Jest's CommonJS transform rejects. Nothing under test here touches it: the
 * status guard is pure queue logic, and store is only used by the separate
 * export-bundle path.
 */
jest.mock("@/lib/store", () => ({ listOrders: () => [], listCustomers: () => [] }));

import { createRequest, updateRequestStatus, listRequests } from "@/lib/admin-privacy";

const mk = (type: "export" | "delete") => createRequest(`p${Math.random().toString(36).slice(2)}@x.test`, type);

describe("completing a deletion request", () => {
  it("is refused when nothing records how the data was erased", () => {
    const r = mk("delete");
    const res = updateRequestStatus(r.id, "completed");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/not automated/i);
  });

  it("leaves the request untouched when refused", () => {
    const r = mk("delete");
    updateRequestStatus(r.id, "completed");
    const after = listRequests().find((x) => x.id === r.id)!;
    expect(after.status).toBe("pending");
    expect(after.completedAt).toBeUndefined();
  });

  it("is allowed once the erasure is recorded, and keeps the evidence", () => {
    const r = mk("delete");
    const res = updateRequestStatus(r.id, "completed", undefined, "OPS-4471 purged 2026-08-20");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.request.status).toBe("completed");
      expect(res.request.erasureRef).toBe("OPS-4471 purged 2026-08-20");
      expect(res.request.completedAt).toBeTruthy();
    }
  });

  it("does not accept whitespace as evidence", () => {
    const r = mk("delete");
    expect(updateRequestStatus(r.id, "completed", undefined, "   ").ok).toBe(false);
  });

  /*
   * Reopening and re-closing must not become the way around the guard: once a
   * reference is on the record it stands, so this is allowed deliberately.
   */
  it("remembers a reference recorded earlier", () => {
    const r = mk("delete");
    updateRequestStatus(r.id, "completed", undefined, "OPS-1");
    updateRequestStatus(r.id, "processing");
    expect(updateRequestStatus(r.id, "completed").ok).toBe(true);
  });

  it("still allows a deletion request to be rejected without evidence", () => {
    const r = mk("delete");
    expect(updateRequestStatus(r.id, "rejected", "Could not verify identity").ok).toBe(true);
  });
});

describe("export requests are unaffected", () => {
  it("completes without an erasure reference, because nothing was erased", () => {
    const r = mk("export");
    const res = updateRequestStatus(r.id, "completed");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.request.status).toBe("completed");
  });
});

describe("a request that is gone", () => {
  it("reports it rather than pretending to succeed", () => {
    const res = updateRequestStatus("priv-does-not-exist", "completed");
    expect(res.ok).toBe(false);
  });
});
