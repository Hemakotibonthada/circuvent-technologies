"use client";

import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";

export interface AccountSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /**
   * Short status under the label — a count, a balance, "Nothing saved".
   *
   * The careers portal puts a tick on a step that is finished, which works
   * because those steps get completed once. An account has no such end state,
   * so the equivalent signal is what is actually in each section: somebody
   * deciding whether to open Orders wants to know there are ten.
   */
  badge?: string;
}

/**
 * Section navigation for the account screen.
 *
 * WHAT CHANGED AND WHY
 *
 * This used to be a scroll-spy: every section was rendered at once down a
 * single column and these were anchor links that jumped between them. The
 * account page has nine of them — overview, orders, wallet, profile, business,
 * addresses, rewards, wishlist, support — so the page ran to several thousand
 * pixels, and "Wallet" meant "scroll past every order you have ever placed".
 * Finding anything meant remembering roughly how far down it lived.
 *
 * Now it selects. One section is mounted at a time, the way the careers portal
 * presents an application, so the rail is the whole map of the page and what is
 * below it is only ever one thing.
 *
 * The rail is a real tablist rather than a row of links: arrow keys move
 * between sections, Home and End jump to the ends, and only the active tab is
 * in the tab order, so a keyboard user tabs *past* the rail in one press
 * instead of nine.
 */
export default function AccountSectionNav({
  sections,
  value,
  onChange,
}: {
  sections: AccountSection[];
  value: string;
  onChange: (id: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(
    0,
    sections.findIndex((s) => s.id === value),
  );

  /*
   * Keep the selected step visible. On a phone the rail scrolls sideways, and a
   * section chosen from somewhere else — the "Edit profile" link in the hero, or
   * a stat card — would otherwise become active while sitting off-screen,
   * leaving the rail looking unchanged.
   */
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const el = rail.querySelector<HTMLElement>(`[data-section="${CSS.escape(value)}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [value]);

  const move = (delta: number) => {
    const next = (activeIndex + delta + sections.length) % sections.length;
    onChange(sections[next].id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(sections[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(sections[sections.length - 1].id);
    }
  };

  return (
    <nav
      aria-label="Account sections"
      className="sticky top-12 z-30 -mx-6 mt-8 border-b px-6 py-4 backdrop-blur-xl lg:-mx-8 lg:px-8"
      style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)" }}
    >
      <div
        ref={railRef}
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex items-start overflow-x-auto no-scrollbar"
      >
        {sections.map((s, i) => {
          const isActive = s.id === value;
          const isPast = i < activeIndex;
          return (
            /*
              shrink-0 by default, flexible only from `sm` up.
              The wrapper used to be `min-w-0 flex-1` at every width, and
              min-w-0 is explicit permission to shrink below the content — so on
              a phone the eight steps squeezed into 390px instead of scrolling,
              and the labels ran into each other. Now they hold their width and
              the rail scrolls, while on a wide screen the connectors still
              stretch to spread the steps evenly.
            */
            <div key={s.id} className="flex shrink-0 items-start sm:min-w-0 sm:flex-1">
              {/*
                The connector is drawn by each step except the first, rather than
                as one line behind the whole rail. A single background line has
                to be inset by half a badge at each end to avoid poking out past
                the first and last circles, and that inset stops being correct
                the moment the rail scrolls.
              */}
              {i > 0 && (
                <span
                  aria-hidden
                  className="mt-5 h-px w-4 sm:w-auto sm:flex-1"
                  style={{
                    background: isPast || isActive ? "var(--accent-cyan)" : "var(--border-primary)",
                  }}
                />
              )}
              <button
                type="button"
                role="tab"
                data-section={s.id}
                id={`tab-${s.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${s.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onChange(s.id)}
                className="flex w-24 shrink-0 flex-col items-center gap-1.5 px-1 text-center"
              >
                <span
                  className="grid h-10 w-10 place-items-center rounded-full border-2 transition-colors"
                  style={{
                    background: isActive ? "var(--accent-cyan)" : "var(--bg-surface)",
                    borderColor: isActive || isPast ? "var(--accent-cyan)" : "var(--border-primary)",
                    color: isActive ? "var(--bg-surface)" : isPast ? "var(--accent-cyan)" : "var(--text-muted)",
                  }}
                >
                  <s.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span
                  className="text-[11px] font-medium leading-tight"
                  style={{ color: isActive ? "var(--accent-cyan)" : "var(--text-tertiary)" }}
                >
                  {s.label}
                </span>
                {/*
                  Reserved whether or not there is a badge, so labels of steps
                  that have one stay on the same baseline as those that do not —
                  otherwise the rail visibly jiggles as the counts load in.
                */}
                <span className="min-h-[14px] text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>
                  {s.badge ?? ""}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
