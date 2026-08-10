/**
 * The document page has to authenticate the way the app actually does.
 *
 * This shipped broken: the page sent `credentials: "include"`, which sends
 * cookies, and the shop authenticates with a bearer token held in
 * localStorage. Nothing was sent, the API returned 401, and a signed-in
 * customer was told to sign in — with their own name in the header at the
 * time. Type checking cannot catch this and neither can the API's own tests;
 * only asking what the page actually put on the wire does.
 *
 * The second failure is subtler and was in the same fix: the token is restored
 * after mount, so a request fired on the first render is unauthenticated even
 * for a signed-in user. Concluding "not signed in" from that is a race that
 * shows up as an intermittent sign-in prompt.
 */
import { render, screen, waitFor } from "@testing-library/react";
import InvoicePage from "./page";

const mockAccount = {
  account: { name: "Vema", email: "the.vema@icloud.com" } as { name: string; email: string } | null,
  ready: true,
  authHeaders: () => ({ Authorization: "Bearer test-token" }),
};

jest.mock("@/components/shop/AccountProvider", () => ({
  useAccount: () => mockAccount,
}));

let searchParams = new URLSearchParams("");

jest.mock("next/navigation", () => ({
  useParams: () => ({ orderNo: "CV-20260809-YTZJ4" }),
  useSearchParams: () => searchParams,
}));

const documentResponse = {
  success: true,
  document: {
    kind: "invoice",
    title: "TAX INVOICE",
    number: "INV-CV-20260809-YTZJ4",
    orderNo: "CV-20260809-YTZJ4",
    placedAt: "2026-08-09T10:00:00.000Z",
    issuedAt: "2026-08-10T10:00:00.000Z",
    status: "delivered",
    billTo: { name: "Vema", address: "12 MG Road", city: "Bengaluru" },
    shipTo: { name: "Vema", address: "12 MG Road", city: "Bengaluru" },
    shipToSameAsBillTo: true,
    lines: [],
    totals: { subtotal: 198, shipping: 0, discount: 0, total: 198 },
    warranty: { months: 6, start: null, basis: null, expiry: null, state: "not-started", daysRemaining: null, summary: "" },
    shows: { prices: true, totals: true, payment: true, warrantyDetail: true, tracking: true },
  },
  units: [],
  available: ["invoice"],
};

beforeEach(() => {
  mockAccount.account = { name: "Vema", email: "the.vema@icloud.com" };
  mockAccount.ready = true;
  searchParams = new URLSearchParams("");
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("invoice page authentication", () => {
  it("sends the account bearer token, not cookies", async () => {
    const fetchSpy = jest.fn(async () => ({ ok: true, status: 200, json: async () => documentResponse }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<InvoicePage />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    // credentials:"include" was the bug — it sends cookies, and there are none.
    expect(init?.credentials).toBeUndefined();
  });

  it("renders the document for a signed-in customer instead of a sign-in prompt", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => documentResponse })) as unknown as typeof fetch;

    render(<InvoicePage />);
    await waitFor(() => expect(screen.getByText("TAX INVOICE")).toBeInTheDocument());
    expect(screen.queryByText(/please sign in/i)).not.toBeInTheDocument();
  });

  it("does not ask for anything before the account has loaded", async () => {
    // The token is restored after mount. Firing early sends no credentials and
    // gets a 401 that means nothing.
    mockAccount.ready = false;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<InvoicePage />);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks the customer to sign in only once it knows they are not", async () => {
    mockAccount.ready = true;
    mockAccount.account = null;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<InvoicePage />);
    await waitFor(() => expect(screen.getByText(/sign in/i)).toBeInTheDocument());
    // And it does not waste a request it knows will fail.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("guest access", () => {
  it("still fetches for a guest who arrived with the email in the link", async () => {
    // Checkout does not require an account. Requiring one here would mean a
    // guest could never get the invoice for something they actually bought.
    mockAccount.account = null;
    searchParams = new URLSearchParams("email=the.vema%40icloud.com");
    const fetchSpy = jest.fn(async () => ({ ok: true, status: 200, json: async () => documentResponse }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<InvoicePage />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url] = fetchSpy.mock.calls[0] as unknown as [string];
    expect(url).toContain("email=the.vema%40icloud.com");
  });

  it("renders the document for that guest", async () => {
    mockAccount.account = null;
    searchParams = new URLSearchParams("email=the.vema%40icloud.com");
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => documentResponse })) as unknown as typeof fetch;

    render(<InvoicePage />);
    await waitFor(() => expect(screen.getByText("TAX INVOICE")).toBeInTheDocument());
  });

  it("does not leak the email into the request when the customer is signed in", async () => {
    // The session already identifies them; repeating it in the query string
    // would put it in browser history and referrers for no benefit.
    searchParams = new URLSearchParams("email=the.vema%40icloud.com");
    const fetchSpy = jest.fn(async () => ({ ok: true, status: 200, json: async () => documentResponse }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<InvoicePage />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url] = fetchSpy.mock.calls[0] as unknown as [string];
    expect(url).not.toContain("email=");
  });
});
