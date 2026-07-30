"use client";

// The Circuvent assistant, as a floating panel available across the app.
//
// Two deliberate choices about trust:
//
//   • When a reply came from the deterministic analysis rather than the model,
//     the panel says so. A user should be able to tell "I computed this" from
//     "I phrased this", because the confidence they should place in each is
//     different.
//   • The tools that ran are named. If the assistant claims something about a
//     device, you can see that it actually looked it up.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X, Send, Loader2, ShieldCheck, Cpu } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  usedTools?: string[];
  degraded?: boolean;
}

type Surface = "shop" | "smarthome" | "admin" | "site";

const SUGGESTIONS: Record<Surface, string[]> = {
  smarthome: ["Is everything OK at home?", "What's using the most power?", "Is anything offline?"],
  shop: ["Which device stops my pump running dry?", "What do you sell for security?", "Where is my order?"],
  admin: ["How is the fleet doing?", "Which devices are failing?"],
  site: ["What does Circuvent make?", "How does the water tank controller work?"],
};

/** Where the user is, which decides the opening suggestions and the prompt tone. */
function surfaceFromPath(path: string | null): Surface {
  if (!path) return "site";
  if (path.startsWith("/smarthome/admin")) return "admin";
  if (path.startsWith("/smarthome")) return "smarthome";
  if (path.startsWith("/shop")) return "shop";
  return "site";
}

/**
 * Mounted once in the root layout. The surface is derived from the pathname
 * rather than passed per-layout, because nested layouts would each mount their
 * own copy and the user would get two assistants on /shop.
 */
export default function Assistant({ surface: surfaceProp }: { surface?: Surface } = {}) {
  const pathname = usePathname();
  const surface = useMemo(() => surfaceProp ?? surfaceFromPath(pathname), [surfaceProp, pathname]);

  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes the panel, which is the behaviour every dialog should have.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || busy) return;

      const next: Msg[] = [...msgs, { role: "user", content: clean }];
      setMsgs(next);
      setInput("");
      setBusy(true);
      setError(null);

      try {
        // The console token is the user's own control-plane credential. Sending
        // it lets the assistant read their devices with their permissions; the
        // server never substitutes a service account.
        const consoleToken =
          typeof window === "undefined" ? null : window.localStorage.getItem("cv-console-token");

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: next.map((m) => ({ role: m.role, content: m.content })),
            surface,
            consoleToken: consoleToken ?? undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data?.success) {
          setError(data?.message || "The assistant could not answer that.");
          return;
        }

        setMsgs((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.message,
            usedTools: data.usedTools ?? [],
            degraded: !!data.degraded,
          },
        ]);
      } catch {
        setError("Could not reach the assistant.");
      } finally {
        setBusy(false);
      }
    },
    [msgs, busy, surface],
  );

  const suggestions = SUGGESTIONS[surface] ?? SUGGESTIONS.site;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open the Circuvent assistant"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition hover:scale-105 active:scale-95"
        style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" }}
      >
        <Sparkles className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Circuvent assistant"
      className="fixed bottom-5 right-5 z-50 flex w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl shadow-2xl"
      style={{
        height: "min(34rem, calc(100vh - 5rem))",
        background: "var(--bg-glass, #0b1020)",
        border: "1px solid var(--border-primary, rgba(255,255,255,0.12))",
      }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-primary, rgba(255,255,255,0.12))" }}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
        >
          <Sparkles className="h-4 w-4 text-white" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-bold" style={{ color: "var(--text-primary,#e7ecff)" }}>
            Circuvent Assistant
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-tertiary,#8b93b0)" }}>
            Answers from your real devices and orders
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close the assistant"
          className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/10"
          style={{ color: "var(--text-tertiary,#8b93b0)" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {msgs.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "var(--text-secondary,#b6bfd8)" }}>
              Ask me about your home, your orders, or which device fits what you need.
            </p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="min-h-11 rounded-xl px-3 py-2 text-left text-[13px] transition hover:bg-white/10"
                  style={{
                    background: "var(--bg-elevated,rgba(255,255,255,0.05))",
                    border: "1px solid var(--border-primary,rgba(255,255,255,0.1))",
                    color: "var(--text-secondary,#b6bfd8)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed"
              style={
                m.role === "user"
                  ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" }
                  : {
                      background: "var(--bg-elevated,rgba(255,255,255,0.06))",
                      color: "var(--text-primary,#e7ecff)",
                      border: "1px solid var(--border-primary,rgba(255,255,255,0.08))",
                    }
              }
            >
              {m.content}
              {m.role === "assistant" && (m.degraded || (m.usedTools && m.usedTools.length > 0)) && (
                <div
                  className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2 text-[10.5px]"
                  style={{ borderColor: "rgba(255,255,255,0.1)", color: "var(--text-tertiary,#8b93b0)" }}
                >
                  {m.degraded ? (
                    <span className="inline-flex items-center gap-1">
                      <Cpu className="h-3 w-3" /> computed directly from your data
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> checked: {m.usedTools?.join(", ")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-tertiary,#8b93b0)" }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking that up…
          </div>
        )}

        {error && (
          <div
            className="rounded-xl px-3 py-2 text-[13px]"
            style={{ background: "rgba(220,38,38,0.12)", color: "#f87171" }}
          >
            {error}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 px-3 py-3"
        style={{ borderTop: "1px solid var(--border-primary,rgba(255,255,255,0.12))" }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything…"
          aria-label="Message the assistant"
          disabled={busy}
          className="min-h-11 flex-1 rounded-xl px-3 text-sm outline-none"
          style={{
            background: "var(--bg-elevated,rgba(255,255,255,0.05))",
            border: "1px solid var(--border-primary,rgba(255,255,255,0.1))",
            color: "var(--text-primary,#e7ecff)",
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send message"
          className="flex h-11 w-11 items-center justify-center rounded-xl transition disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" }}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
