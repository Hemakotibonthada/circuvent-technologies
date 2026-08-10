"use client";

/**
 * What your electricity is doing, and what to do about it.
 *
 * The console has measured energy well for a long time and never told anybody
 * what to do with the measurement. This is where the advisor and the load
 * breakdown become visible, and the layout follows what a reader actually
 * wants in order: how much is at stake, what to change, and where the power is
 * going.
 *
 * The empty states matter more than the populated ones. "Nothing is wrong",
 * "nothing is metered" and "not enough history yet" all render as an absence
 * if you are careless, and they mean completely different things — a healthy
 * home, a home the system cannot see, and a system that has not been watching
 * long enough to say.
 */
import { useMemo } from "react";
import { AlertTriangle, IndianRupee, Info, PlugZap, TrendingDown, Zap } from "lucide-react";
import { useConsoleTheme } from "../theme";
import { SectionLabel } from "../ui";
import { energyAdvice, type EnergyDevice, type Saving } from "@/lib/energy-advisor";
import { currentBreakdown, type LoadProfile } from "@/lib/load-attribution";
import type { Tariff } from "./tariff";

function money(amount: number, tariff: Tariff): string {
  return `${tariff.symbol}${Math.round(amount).toLocaleString("en-IN")}`;
}

function SavingRow({ s, tariff }: { s: Saving; tariff: Tariff }) {
  const { cardClass } = useConsoleTheme();
  const isWarning = s.kind === "slab-warning";
  return (
    <li className={`${cardClass} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isWarning ? (
              <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--cv-warning, #f59e0b)" }} />
            ) : (
              <TrendingDown className="h-4 w-4 shrink-0" style={{ color: "var(--cv-accent)" }} />
            )}
            <p className="text-[15px] font-semibold" style={{ color: "var(--cv-text)" }}>
              {s.title}
            </p>
          </div>
          <p className="mt-1 text-[13px]" style={{ color: "var(--cv-muted)" }}>
            {s.action}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="cv-num text-[17px] font-bold" style={{ color: isWarning ? "var(--cv-warning, #f59e0b)" : "var(--cv-accent)" }}>
            {money(s.monthlySaving, tariff)}
          </p>
          <p className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
            {isWarning ? "at stake" : "per month"}
          </p>
        </div>
      </div>
    </li>
  );
}

function LoadRow({ p, tariff }: { p: LoadProfile; tariff: Tariff }) {
  const perMonth = ((p.watts * 730) / 1000) * tariff.flatRate;
  return (
    <li className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0" style={{ borderColor: "var(--cv-separator)" }}>
      <div className="min-w-0">
        <p className="truncate text-[14px]" style={{ color: "var(--cv-text)" }}>
          {p.key}
        </p>
        <p className="text-[12px]" style={{ color: "var(--cv-muted)" }}>
          {p.confidence === "measured"
            ? "measured on its own channel"
            : p.confidence === "unknown"
              ? "never observed switching on its own"
              : `estimated from ${p.observations} observation${p.observations === 1 ? "" : "s"}${p.spreadWatts > p.watts * 0.25 ? " · varies a lot" : ""}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="cv-num text-[14px] font-semibold" style={{ color: "var(--cv-text)" }}>
          {p.confidence === "unknown" ? "—" : `${Math.round(p.watts)} W`}
        </p>
        {p.confidence !== "unknown" && (
          <p className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
            ≈{money(perMonth, tariff)}/mo if left on
          </p>
        )}
      </div>
    </li>
  );
}

export function AdvisorPanel({
  devices,
  tariff,
  profiles,
  totalWatts,
  monthToDateKwh,
  projectedMonthKwh,
  slabs,
}: {
  devices: EnergyDevice[];
  tariff: Tariff;
  profiles?: Record<string, LoadProfile>;
  totalWatts?: number;
  monthToDateKwh?: number;
  projectedMonthKwh?: number;
  slabs?: { uptoKwh: number; ratePerKwh: number }[];
}) {
  const { cardClass } = useConsoleTheme();

  const advice = useMemo(
    () =>
      energyAdvice({
        devices,
        tariff,
        hour: new Date().getHours(),
        monthToDateKwh,
        projectedMonthKwh,
        slabs,
      }),
    [devices, tariff, monthToDateKwh, projectedMonthKwh, slabs]
  );

  const on = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const d of devices) map[d.id] = Boolean(d.on);
    return map;
  }, [devices]);

  const breakdown = useMemo(
    () => currentBreakdown(profiles ?? {}, on, totalWatts ?? 0),
    [profiles, on, totalWatts]
  );

  return (
    <section aria-label="Energy advice">
      {advice.savings.length > 0 && (
        <div className={`${cardClass} mb-4 flex items-center justify-between p-5`}>
          <div>
            <p className="text-[13px]" style={{ color: "var(--cv-muted)" }}>
              Worth acting on
            </p>
            <p className="cv-num text-[28px] font-bold" style={{ color: "var(--cv-text)" }}>
              {money(advice.totalMonthlySaving, tariff)}
              <span className="ml-1 text-[14px] font-normal" style={{ color: "var(--cv-muted)" }}>
                a month
              </span>
            </p>
          </div>
          <IndianRupee className="h-8 w-8" style={{ color: "var(--cv-accent)", opacity: 0.5 }} />
        </div>
      )}

      <SectionLabel>Recommendations</SectionLabel>
      {advice.savings.length === 0 ? (
        <div className={`${cardClass} flex items-start gap-3 p-5`}>
          <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--cv-muted)" }} />
          {/* The note distinguishes a healthy home from one this cannot see. */}
          <p className="text-[14px]" style={{ color: "var(--cv-muted)" }}>
            {advice.note}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {advice.savings.map((s) => (
            <SavingRow key={`${s.kind}-${s.deviceIds.join(",")}`} s={s} tariff={tariff} />
          ))}
        </ul>
      )}

      <div className="mt-6">
        <SectionLabel>Where the power goes</SectionLabel>
        <div className={`${cardClass} p-4`}>
          {breakdown.loads.length === 0 ? (
            <div className="flex items-start gap-3">
              <PlugZap className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--cv-muted)" }} />
              <p className="text-[14px]" style={{ color: "var(--cv-muted)" }}>
                Nothing is switched on that the system knows the draw of. A load has to be seen
                switching on its own — or have its own metering channel — before its consumption
                can be attributed to it.
              </p>
            </div>
          ) : (
            <>
              <ul>
                {breakdown.loads.map((p) => (
                  <LoadRow key={p.key} p={p} tariff={tariff} />
                ))}
              </ul>

              {/*
                The unexplained remainder is reported rather than distributed.
                The fridge and the router are in the incoming total and not in
                this system; spreading them across the known loads would
                inflate every one of them.
              */}
              {breakdown.hasGap && (
                <div className="mt-3 flex items-start gap-2 rounded-lg p-3" style={{ background: "var(--cv-input-bg)" }}>
                  <Zap className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--cv-muted)" }} />
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--cv-text)" }}>
                      {Math.round(breakdown.unaccountedWatts)} W unaccounted for
                    </p>
                    <p className="text-[12px]" style={{ color: "var(--cv-muted)" }}>
                      Not switched through Circuvent — most likely something plugged straight into a socket.
                    </p>
                  </div>
                </div>
              )}

              {breakdown.note && !breakdown.hasGap && (
                <p className="mt-3 text-[12px]" style={{ color: "var(--cv-muted)" }}>
                  {breakdown.note}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default AdvisorPanel;
