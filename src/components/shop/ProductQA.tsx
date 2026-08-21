"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, MessageCircleQuestion, RotateCcw, ThumbsUp, Send, CheckCircle2, ShieldCheck } from "lucide-react";
import { useAccount } from "./AccountProvider";

interface QA {
  id: string;
  name: string;
  question: string;
  answer: string | null;
  answeredBy: string | null;
  at: string;
  answeredAt: string | null;
  helpful: number;
}

export default function ProductQA({ productId }: { productId: string }) {
  const { account, authHeaders } = useAccount();
  const [items, setItems] = useState<QA[]>([]);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  // Distinct from `error` above (the ask-form's validation message): this one
  // means the list itself failed to load, and must never render as "nobody
  // has asked yet" — that reads as a fact about the product, not the network.
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/shop/questions?productId=${encodeURIComponent(productId)}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const d = await res.json();
      setItems(d.questions || []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (account) {
      setName(account.name);
      setEmail(account.email);
    }
  }, [account]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (question.trim().length < 5) {
      setError("Please enter a longer question.");
      return;
    }
    if (!account && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email so we can notify you of the answer.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/shop/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(account ? authHeaders() : {}) },
        body: JSON.stringify({ productId, question, name, email }),
      });
      const d = await res.json();
      if (d.success) {
        setSent(true);
        setQuestion("");
        load();
        setTimeout(() => setSent(false), 4000);
      } else {
        setError(d.message || "Could not submit your question.");
      }
    } finally {
      setSending(false);
    }
  };

  const markHelpful = async (id: string) => {
    setItems((prev) => prev.map((q) => (q.id === id ? { ...q, helpful: q.helpful + 1 } : q)));
    await fetch("/api/shop/questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  return (
    <div className="mt-16">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} />
        <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Questions &amp; Answers
        </h2>
        {items.length > 0 && (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            ({items.length})
          </span>
        )}
      </div>

      {/* Ask form */}
      <form
        onSubmit={ask}
        className="mt-5 rounded-2xl border p-5"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Have a question about this product? Ask here — our team answers within 1–2 business days."
          rows={2}
          className="w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none"
          style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
        />
        {!account && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email (for the answer)"
              className="rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
            />
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <div className="mt-3 flex items-center justify-between">
          {sent ? (
            <span className="flex items-center gap-1.5 text-sm text-emerald-500">
              <CheckCircle2 className="h-4 w-4" /> Thanks! We&rsquo;ll answer soon.
            </span>
          ) : (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {account ? `Asking as ${account.name}` : "Ask anonymously"}
            </span>
          )}
          <button
            type="submit"
            disabled={sending}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Send className="h-4 w-4" /> {sending ? "Sending…" : "Ask question"}
          </button>
        </div>
      </form>

      {/* List */}
      <div className="mt-6 space-y-4">
        {loading ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Loading questions…
          </p>
        ) : loadError ? (
          <div
            className="rounded-2xl border p-6 text-center"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
          >
            <AlertCircle className="mx-auto h-6 w-6" aria-hidden="true" style={{ color: "var(--status-warning-text)" }} />
            <p className="mt-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              We couldn&apos;t load questions for this product
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Check your connection and try again — nothing has been lost.
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold transition-colors"
              style={{ borderColor: "var(--border-accent)", color: "var(--accent-cyan-text)" }}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No questions yet — be the first to ask!
          </p>
        ) : (
          items.map((q) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border p-4"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
            >
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                Q: {q.question}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {q.name} · {new Date(q.at).toLocaleDateString()}
              </p>
              {q.answer ? (
                <div
                  className="mt-3 rounded-xl border-l-2 py-1.5 pl-3"
                  style={{ borderColor: "var(--accent-cyan)" }}
                >
                  <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--accent-cyan)" }}>
                    <ShieldCheck className="h-3.5 w-3.5" /> {q.answeredBy || "Circuvent"}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                    {q.answer}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs italic" style={{ color: "var(--text-muted)" }}>
                  Awaiting an answer from our team.
                </p>
              )}
              <button
                onClick={() => markHelpful(q.id)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
                style={{ color: "var(--text-muted)" }}
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Helpful{q.helpful ? ` (${q.helpful})` : ""}
              </button>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
