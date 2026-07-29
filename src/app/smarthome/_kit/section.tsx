"use client";

/**
 * Circuvent Console — section scaffolding.
 *
 * Each console section is one route with several tabs. The active tab lives in
 * the `?tab=` query string so it is linkable, restorable on reload and
 * addressable from the command palette.
 *
 * The tab is read from `window.location` and written with `history.replaceState`
 * rather than `useSearchParams()` on purpose: `useSearchParams` forces every
 * consuming page into a Suspense boundary during static generation, and a tab
 * switch does not need a router transition.
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { PageHeader, Tabs, type TabDef } from "./primitives";

export function useTabParam(tabs: TabDef[], fallback?: string): [string, (id: string) => void] {
  const initial = fallback ?? tabs[0]?.id ?? "";
  const [tab, setTab] = useState(initial);

  useEffect(() => {
    const read = () => {
      const q = new URLSearchParams(window.location.search).get("tab");
      setTab(q && tabs.some((t) => t.id === q) ? q : initial);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
    // Tab ids are static per section; re-running on every render would fight
    // the user's own selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, tabs.map((t) => t.id).join(",")]);

  const select = useCallback((id: string) => {
    setTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url.toString());
  }, []);

  return [tab, select];
}

/**
 * Standard section frame: header, tab strip, and the active panel.
 * `panels` is keyed by tab id so a section only renders the visible view.
 */
export function SectionShell({
  title,
  subtitle,
  eyebrow,
  actions,
  tabs,
  panels,
  aside,
}: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  tabs: TabDef[];
  panels: Record<string, () => ReactNode>;
  /** Rendered between the header and the tab strip (health strips, banners). */
  aside?: ReactNode;
}) {
  const [tab, setTab] = useTabParam(tabs);
  const render = panels[tab] ?? panels[tabs[0]?.id];
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} eyebrow={eyebrow} actions={actions} />
      {aside}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {render ? render() : null}
    </div>
  );
}
