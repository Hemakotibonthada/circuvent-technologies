"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageCircle, Smile } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface SurveyResponse { id: string; email?: string; score: number; comment?: string; at: string }
interface NpsBreakdown { total: number; promoters: number; passives: number; detractors: number; score: number }

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

export default function SurveysPanel() {
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [nps, setNps] = useState<NpsBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/surveys", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setResponses(d.responses || []);
        setNps(d.nps || null);
      } else {
        setError("Could not load survey responses. This is a loading failure, not an empty list.");
      }
    } catch {
      setError("Could not load survey responses. This is a loading failure, not an empty list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><Smile className="w-5 h-5" /> Customer Feedback (NPS)</h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Net Promoter Score computed from 0-10 satisfaction responses.</p>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <>
          {nps && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold" style={{ color: nps.score >= 0 ? "#22c55e" : "#ef4444" }}>{nps.score}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>NPS score</div></div>
              <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold text-emerald-400">{nps.promoters}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Promoters</div></div>
              <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold text-amber-400">{nps.passives}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Passives</div></div>
              <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold text-red-400">{nps.detractors}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Detractors</div></div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}><MessageCircle className="w-4 h-4" /> Recent responses</h3>
            <div className="space-y-2">
              {responses.map((r) => (
                <div key={r.id} className="rounded-xl p-3" style={card}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold" style={{ color: r.score >= 9 ? "#22c55e" : r.score <= 6 ? "#ef4444" : "#f59e0b" }}>{r.score}/10</span>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{new Date(r.at).toLocaleDateString()}</span>
                  </div>
                  {r.comment && <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{r.comment}</p>}
                </div>
              ))}
              {responses.length === 0 && !error && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No responses yet.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
