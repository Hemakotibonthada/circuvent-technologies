"use client";

/**
 * The Logs blade — an editor over the query language in app-insights-query.ts.
 *
 * Azure's Logs blade is the one that answers questions nobody anticipated;
 * every other blade answers a question somebody did. What it needs to be
 * usable is not syntax highlighting, it is three things: the schema visible
 * without leaving the page, examples that run, and an error that says which
 * character was wrong. Those are what this provides.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Database, Download, Play, Table2 } from "lucide-react";
import { toCsv, downloadCsv } from "../../smarthome/_kit/primitives";
import { Card, Empty, ErrorNote, Spinner, num, tok } from "./kit";
import type { QueryResult } from "@/lib/app-insights-query";

interface Schema {
  tables: { name: string; label: string }[];
  columns: { name: string; type: string }[];
  samples: { name: string; description: string; query: string }[];
  maxRows: number;
}

const DEFAULT_QUERY = `requests
| summarize hits = count(), p95 = percentile(durationMs, 95), failures = countif(ok == false) by path
| order by p95 desc
| take 20`;

export default function LogsBlade() {
  const [text, setText] = useState(DEFAULT_QUERY);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<{ message: string; offset: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [showSchema, setShowSchema] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/admin/insights-query", { headers: { "x-admin-token": tok() } });
        const b = await r.json();
        if (r.ok && b.success) setSchema(b as Schema);
      } catch {
        /* The editor still works without the reference; only the help is lost. */
      }
    })();
  }, []);

  const run = useCallback(async (query: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/insights-query", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({ query }),
      });
      const b = await r.json();
      if (!r.ok || !b.success) {
        setError({ message: b.message || "That query could not be run.", offset: b.offset ?? -1 });
        setResult(null);
      } else {
        setResult(b as QueryResult);
      }
    } catch {
      setError({ message: "Could not reach the telemetry service.", offset: -1 });
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    void run(DEFAULT_QUERY);
    // Deliberately once: re-running on every keystroke would put the console's
    // own load into the buffer it is querying.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Ctrl/Cmd+Enter runs, as it does in every query editor anybody has used. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void run(text);
    }
  };

  /** Puts the caret on the character the parser objected to. */
  const focusError = () => {
    if (!error || error.offset < 0 || !editor.current) return;
    editor.current.focus();
    editor.current.setSelectionRange(error.offset, error.offset + 1);
  };

  const exportCsv = () => {
    if (!result) return;
    const headers = result.columns.map((c) => c.name);
    // Booleans are stringified here rather than passed through: a CSV cell of
    // `false` and one of `FALSE` are the same to a reader and different to a
    // spreadsheet, so the conversion is made once, explicitly.
    const rows = result.rows.map((r) =>
      result.columns.map((c) => {
        const v = r[c.name];
        return v === null ? "" : typeof v === "boolean" ? String(v) : v;
      }),
    );
    downloadCsv("insights-query.csv", toCsv(headers, rows));
  };

  /** Where in the text the error sits, so the message can name a line. */
  const errorLine = (() => {
    if (!error || error.offset < 0) return null;
    return text.slice(0, error.offset).split("\n").length;
  })();

  return (
    <div className="space-y-4">
      <Card
        title="Logs"
        subtitle="Query the telemetry buffer directly. Ctrl/⌘+Enter runs."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowSchema((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border cv-border px-3 text-[13px] font-semibold cv-text-secondary"
              aria-expanded={showSchema}
            >
              <Database className="h-3.5 w-3.5" /> Schema
            </button>
            <button
              onClick={() => void run(text)}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
            >
              <Play className="h-3.5 w-3.5" /> {busy ? "Running…" : "Run"}
            </button>
          </div>
        }
      >
        <textarea
          ref={editor}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          rows={8}
          aria-label="Query"
          className="w-full resize-y rounded-lg border p-3 font-mono text-[12.5px] leading-relaxed outline-none"
          style={{
            background: "var(--bg-glass)",
            borderColor: error ? "rgba(239,68,68,0.5)" : "var(--border-primary)",
            color: "var(--text-primary)",
          }}
        />

        {error && (
          <div className="mt-2">
            <ErrorNote>
              <span className="font-semibold">{error.message}</span>
              {errorLine !== null && (
                <>
                  {" "}
                  <button onClick={focusError} className="underline underline-offset-2">
                    Go to line {errorLine}
                  </button>
                </>
              )}
            </ErrorNote>
          </div>
        )}

        {schema && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {schema.samples.map((s) => (
              <button
                key={s.name}
                title={s.description}
                onClick={() => {
                  setText(s.query);
                  void run(s.query);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border cv-border px-2.5 py-1 text-[12px] font-medium cv-text-secondary"
              >
                <BookOpen className="h-3 w-3" /> {s.name}
              </button>
            ))}
          </div>
        )}

        {showSchema && schema && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border cv-border p-3">
              <div className="mb-2 text-[12px] font-bold cv-text-primary">Tables</div>
              <ul className="space-y-1">
                {schema.tables.map((t) => (
                  <li key={t.name} className="text-[12px]">
                    <button
                      onClick={() => setText(`${t.name}\n| take 50`)}
                      className="font-mono font-semibold"
                      style={{ color: "var(--accent-cyan-text)" }}
                    >
                      {t.name}
                    </button>
                    <span className="cv-text-muted"> — {t.label}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border cv-border p-3">
              <div className="mb-2 text-[12px] font-bold cv-text-primary">Columns</div>
              <div className="flex flex-wrap gap-1">
                {schema.columns.map((c) => (
                  <span
                    key={c.name}
                    title={c.type}
                    className="rounded border cv-border px-1.5 py-0.5 font-mono text-[11px] cv-text-secondary"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] cv-text-muted">
                Operators: where · summarize … by · project · extend · order by · top · take ·
                distinct · count. Functions: count, dcount, sum, avg, min, max, percentile,
                countif, bin, ago.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            <Table2 className="h-4 w-4" /> Results
          </span>
        }
        subtitle={
          result
            ? `${num(result.totalRows)} row${result.totalRows === 1 ? "" : "s"} from ${num(result.scanned)} scanned · ${result.tookMs} ms` +
              (result.totalRows > result.rows.length ? ` · showing the first ${num(result.rows.length)}` : "")
            : undefined
        }
        right={
          result && result.rows.length > 0 ? (
            <button
              onClick={exportCsv}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border cv-border px-3 text-[13px] font-semibold cv-text-secondary"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          ) : undefined
        }
      >
        {busy && !result ? (
          <Spinner label="Running the query…" />
        ) : !result ? (
          <Empty>Run a query to see results.</Empty>
        ) : result.rows.length === 0 ? (
          <Empty>
            No rows matched. The buffer holds {num(result.scanned)} event
            {result.scanned === 1 ? "" : "s"} for that table.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b cv-border">
                  {result.columns.map((c) => (
                    <th key={c.name} className="px-2 py-2 font-semibold cv-text-secondary">
                      {c.name}
                      <span className="ml-1 font-normal cv-text-muted">{c.type}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="border-b cv-border last:border-0">
                    {result.columns.map((c) => {
                      const v = row[c.name];
                      return (
                        <td
                          key={c.name}
                          className={`px-2 py-1.5 align-top ${c.type === "number" ? "tabular-nums" : ""}`}
                          style={{ color: v === null ? "var(--text-muted)" : "var(--text-primary)" }}
                        >
                          {v === null ? "—" : typeof v === "number" ? v.toLocaleString() : String(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
