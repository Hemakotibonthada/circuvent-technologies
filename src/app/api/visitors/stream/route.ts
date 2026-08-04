import { NextRequest } from "next/server";
import { visitorTracker } from "@/lib/visitor-tracker";
import { guard } from "@/lib/admin-auth";

/**
 * Server-Sent Events stream of the live visitor snapshot.
 *
 * THE LEAK THIS FIXES
 *
 * A ReadableStream's `cancel(reason)` callback receives the cancellation
 * reason — not the controller. The previous version passed that reason to
 * removeSSEClient, which therefore never matched anything in the set, so every
 * disconnected dashboard stayed registered forever and each broadcast wrote to
 * a growing list of dead controllers. Capturing the controller from `start` is
 * the only way to have the right object to release.
 */

export const runtime = "nodejs";

/** Proxies and load balancers drop an idle stream; this keeps it warm. */
const KEEPALIVE_MS = 25_000;

/**
 * Resolves the operator for an SSE request.
 *
 * EventSource cannot set request headers, so the browser has no way to send
 * `x-admin-token` on this one endpoint. The token is therefore accepted from
 * the query string — but only here, by building a synthetic request and
 * handing it to the normal guard rather than teaching `tokenFromRequest` to
 * read query strings for every admin route.
 *
 * That distinction matters: query strings end up in access logs, browser
 * history and Referer headers, so widening the shared helper would put every
 * admin token in those places. Confining it to a read-only stream, on a
 * short-lived session token over TLS to our own origin, is a much smaller
 * exposure than the alternative of leaving the stream unauthenticated — which
 * is what it was before.
 */
function authorize(request: NextRequest): boolean {
  if (guard(request, "analytics")) return true;
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return false;
  const synthetic = new Request(request.url, { headers: { "x-admin-token": token } });
  return !!guard(synthetic, "analytics");
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let controllerRef: ReadableStreamDefaultController | null = null;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const release = () => {
    if (keepalive) clearInterval(keepalive);
    keepalive = undefined;
    if (controllerRef) {
      visitorTracker.removeSSEClient(controllerRef);
      controllerRef = null;
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller;
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(visitorTracker.liveSnapshot())}\n\n`)
      );
      visitorTracker.addSSEClient(controller);

      keepalive = setInterval(() => {
        try {
          // A comment frame: valid SSE, ignored by EventSource, enough to stop
          // an idle connection being reaped.
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
        } catch {
          release();
        }
      }, KEEPALIVE_MS);
      keepalive.unref?.();

      // A client that navigates away aborts the request; without this the
      // stream is only released when the next broadcast happens to throw.
      request.signal.addEventListener("abort", release);
    },
    cancel() {
      // Note the empty parameter list: what arrives here is the reason, and
      // using it as the controller is precisely the bug described above.
      release();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
