"use client";

/**
 * "You are looking at somebody else's home."
 *
 * The single most dangerous thing this feature can do is let somebody act on
 * the wrong house without noticing — turning off what they think is their own
 * heating, or reading a meter and concluding their mother's boiler is fine.
 *
 * So it is a persistent bar rather than a toast, it names the household rather
 * than saying "shared home", and switching back is one click from wherever
 * they are. A notice that has to be dismissed is a notice that stops being
 * read by the second day.
 */

import { Home, X } from "lucide-react";
import { setActiveHome } from "@/lib/control-plane";
import { useHomeAccess } from "@/lib/useHomeAccess";

export default function VisitingBanner() {
  const access = useHomeAccess();

  if (!access.visiting) return null;

  const leave = () => {
    setActiveHome(null);
    /* Reloaded rather than re-rendered: every panel holds its own fetched
       state and the home is a request header, so a soft switch would leave
       one household's devices on screen under another's name. */
    window.location.reload();
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-[13px] md:px-8"
      style={{
        background: "var(--cv-warning-dim, rgba(234,179,8,0.12))",
        borderBottom: "1px solid var(--cv-border)",
      }}
      role="status"
    >
      <Home className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        You are viewing{" "}
        <strong>{access.ownerName ? `${access.ownerName}’s home` : "a shared home"}</strong>
        {access.role && access.role !== "owner" && (
          <span style={{ color: "var(--cv-muted)" }}> · your access here is {access.role}</span>
        )}
      </span>
      <button
        onClick={leave}
        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium"
        style={{ background: "var(--cv-input-bg)" }}
      >
        <X className="h-3.5 w-3.5" />
        Back to my home
      </button>
    </div>
  );
}
