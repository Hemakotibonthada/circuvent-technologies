"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";

export interface AccountSection {
  id: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Sticky in-page navigation for the account screen, which is long enough that
 * plain anchor jumps left people with no sense of where they were. Highlights
 * whichever section is currently in view.
 *
 * `sections` must be a stable reference (a module-level constant) — a fresh
 * array each render would tear down and rebuild the observer every time.
 */
export default function AccountSectionNav({ sections }: { sections: AccountSection[] }) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Bias the "current" band to just below the sticky chrome so the active
      // pill flips at roughly the moment a heading reaches the top.
      { rootMargin: "-120px 0px -55% 0px", threshold: 0 }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Account sections"
      className="sticky top-12 z-30 -mx-6 mt-8 border-b px-6 py-2 backdrop-blur-xl lg:-mx-8 lg:px-8"
      style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)" }}
    >
      <ul className="flex gap-1 overflow-x-auto no-scrollbar">
        {sections.map((s) => {
          const isActive = active === s.id;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={isActive ? "true" : undefined}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors"
                style={{
                  background: isActive ? "var(--accent-cyan-muted)" : "transparent",
                  color: isActive ? "var(--accent-cyan)" : "var(--text-tertiary)",
                }}
              >
                <s.icon className="h-4 w-4" aria-hidden="true" />
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
