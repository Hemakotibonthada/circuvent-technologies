import { visitorTracker } from "@/lib/visitor-tracker";

// GET — Server-Sent Events stream for real-time visitor updates
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      // Send initial snapshot
      const initial = JSON.stringify(visitorTracker.getSnapshot());
      controller.enqueue(new TextEncoder().encode(`data: ${initial}\n\n`));

      // Register for live updates
      visitorTracker.addSSEClient(controller);
    },
    cancel(controller) {
      visitorTracker.removeSSEClient(controller as ReadableStreamDefaultController);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
