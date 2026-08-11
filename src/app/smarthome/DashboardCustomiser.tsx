"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LayoutGrid, RotateCcw, X } from "lucide-react";
import { useUserPrefs } from "@/lib/smarthome-prefs";
import {
  CONSOLE_SECTION_META,
  DEFAULT_CONSOLE_LAYOUT,
  isDefaultConsoleLayout,
  mergeConsoleLayout,
  moveConsole,
  readConsoleLayout,
  setConsoleHidden,
  visibleConsoleSections,
  type ConsoleLayout,
  type ConsoleSection,
} from "@/lib/console-layout";

/**
 * The console dashboard's layout, and the editor for it.
 *
 * The document under the `dashboard` scope is shared with the phone app, which
 * keeps its own layout under a different key. Everything here goes through
 * `mergeConsoleLayout` so saving the console's arrangement cannot delete the
 * app's — the two are edited months apart on different devices, and the loss
 * would be blamed on whichever one noticed it.
 */
export function useConsoleLayout() {
  /* The whole shared document, not just our half. */
  const prefs = useUserPrefs<Record<string, unknown>>("dashboard", {});
  const layout = useMemo(() => readConsoleLayout(prefs.value), [prefs.value]);

  const save = useCallback(
    (next: ConsoleLayout) => {
      prefs.update((prev) => mergeConsoleLayout(prev, next));
    },
    [prefs]
  );

  return { layout, save, loading: prefs.loading };
}

export function useVisibleConsoleSections(): ConsoleSection[] {
  return visibleConsoleSections(useConsoleLayout().layout);
}

/**
 * Opens the editor.
 *
 * Placed on the dashboard rather than in Settings: arranging a page from
 * another page means leaving the thing you are arranging, then walking back to
 * see what happened.
 */
export function CustomiseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[44px] items-center gap-2 rounded-xl px-3 text-[13px] font-semibold transition-colors"
      style={{ border: "1px solid var(--cv-border)", color: "var(--cv-muted)" }}
      aria-label="Customise this dashboard"
    >
      <LayoutGrid className="h-4 w-4" aria-hidden />
      Customise
    </button>
  );
}

export function ConsoleLayoutEditor({
  layout,
  onSave,
  onClose,
}: {
  layout: ConsoleLayout;
  onSave: (next: ConsoleLayout) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Customise dashboard"
    >
      <button
        type="button"
        className="absolute inset-0 h-full w-full"
        style={{ background: "rgba(0,0,0,.55)" }}
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className="relative m-0 max-h-[86vh] w-full overflow-y-auto rounded-t-2xl p-5 sm:m-4 sm:max-w-lg sm:rounded-2xl"
        style={{ background: "var(--cv-card)", border: "1px solid var(--cv-border)", backdropFilter: "blur(24px)" }}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: "var(--cv-text)" }}>
            Customise dashboard
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-[44px] w-[44px] place-items-center rounded-full"
            style={{ color: "var(--cv-muted)" }}
            aria-label="Done"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mb-4 text-[13px]" style={{ color: "var(--cv-muted)" }}>
          Reorder the panels, or hide the ones you never read. Applies to every theme.
        </p>

        <ul className="flex flex-col">
          {layout.order.map((key, i) => {
            const meta = CONSOLE_SECTION_META[key];
            const hidden = layout.hidden.includes(key);
            const first = i === 0;
            const last = i === layout.order.length - 1;
            return (
              <li
                key={key}
                className="flex items-center gap-3 py-2.5"
                style={{ borderTop: i === 0 ? undefined : "1px solid var(--cv-border)" }}
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={first}
                    onClick={() => onSave(moveConsole(layout, key, -1))}
                    className="grid h-6 w-6 place-items-center rounded disabled:opacity-30"
                    style={{ color: "var(--cv-accent-hi)" }}
                    aria-label={`Move ${meta.label} up`}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={last}
                    onClick={() => onSave(moveConsole(layout, key, 1))}
                    className="grid h-6 w-6 place-items-center rounded disabled:opacity-30"
                    style={{ color: "var(--cv-accent-hi)" }}
                    aria-label={`Move ${meta.label} down`}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-bold"
                    style={{ color: hidden ? "var(--cv-muted)" : "var(--cv-text)" }}
                  >
                    {meta.label}
                  </div>
                  <div className="truncate text-[12px]" style={{ color: "var(--cv-muted)" }}>
                    {meta.required ? "Always shown" : meta.hint}
                  </div>
                </div>

                {/*
                  A required panel gets no switch at all rather than a disabled
                  one: a control that is present and refuses to move invites you
                  to keep trying, where "Always shown" answers the question.
                */}
                {!meta.required && (
                  <label className="inline-flex h-[44px] cursor-pointer items-center gap-2">
                    <span className="sr-only">Show {meta.label}</span>
                    <input
                      type="checkbox"
                      checked={!hidden}
                      onChange={(e) => onSave(setConsoleHidden(layout, key, !e.target.checked))}
                      className="h-5 w-5 cursor-pointer accent-[var(--cv-accent)]"
                    />
                  </label>
                )}
              </li>
            );
          })}
        </ul>

        {!isDefaultConsoleLayout(layout) && (
          <button
            type="button"
            onClick={() => onSave({ ...DEFAULT_CONSOLE_LAYOUT, order: [...DEFAULT_CONSOLE_LAYOUT.order] })}
            className="mt-4 inline-flex h-[44px] w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold"
            style={{ border: "1px solid var(--cv-border)", color: "var(--cv-muted)" }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Reset to default
          </button>
        )}
      </div>
    </div>
  );
}

/** Convenience wrapper: the button plus the dialog it opens. */
export function DashboardCustomiser() {
  const { layout, save } = useConsoleLayout();
  const [open, setOpen] = useState(false);
  return (
    <>
      <CustomiseButton onClick={() => setOpen(true)} />
      {open && <ConsoleLayoutEditor layout={layout} onSave={save} onClose={() => setOpen(false)} />}
    </>
  );
}

