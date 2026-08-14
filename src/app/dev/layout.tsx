import type { Metadata } from "next";

/**
 * Internal reference pages.
 *
 * Kept out of search results and out of any navigation. This is a place to
 * look at components, not a page a customer should land on — a component
 * gallery indexed by Google is a support call waiting to happen.
 *
 * WHY THE VARIABLES ARE REPEATED HERE
 * -----------------------------------
 * Everything in `smarthome/_kit` styles itself from `--cv-*` custom properties
 * that `smarthome/theme.tsx` sets on the console shell. Outside that shell they
 * are simply undefined, and CSS does not complain — an SVG stroked with an
 * unset variable renders as nothing at all.
 *
 * That is exactly what happened when this page was first written: the gauge
 * drew no arc and no track, which read as a broken component rather than a
 * missing theme. `theme.tsx` already carries a note about the same thing
 * catching modals rendered through a portal, so this is the second time it has
 * bitten.
 *
 * A representative dark set is declared here so the gallery shows what the
 * console shows. It is not a second theme: nothing outside this folder reads
 * it, and the console remains the only place these are authored.
 */
export const metadata: Metadata = {
  title: "Internal reference",
  robots: { index: false, follow: false },
};

const KIT_VARS = {
  "--cv-accent": "#06b6d4",
  "--cv-accent-2": "#7c3aed",
  "--cv-accent-hi": "#22d3ee",
  "--cv-card": "rgba(255,255,255,.045)",
  "--cv-card-hi": "rgba(255,255,255,.075)",
  "--cv-input-bg": "rgba(255,255,255,.10)",
  "--cv-border": "rgba(255,255,255,.10)",
  "--cv-text": "#f8fafc",
  "--cv-text-dim": "#94a3b8",
} as React.CSSProperties;

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0f1a]" style={KIT_VARS}>
      {children}
    </div>
  );
}
