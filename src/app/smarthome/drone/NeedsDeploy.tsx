"use client";

/**
 * Shown when the control plane is older than this console.
 *
 * Deliberately not an error state. Nothing is broken, nothing failed, and
 * "Retry" is the wrong affordance — retrying cannot help until somebody
 * deploys, and a red banner with a button that never works teaches people to
 * ignore red banners.
 *
 * The console (Vercel) and the control plane (a VM) are deployed separately, so
 * a console ahead of its API is a normal recurring state. It gets an
 * explanation and the command, not an alarm.
 */

import { CloudDownload } from "lucide-react";
import { Surface } from "../_kit/primitives";

export function NeedsDeploy({ feature = "the drone API" }: { feature?: string }) {
  return (
    <Surface>
      <div className="flex items-start gap-3">
        <CloudDownload className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--cv-accent-hi)" }} />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">Your control plane needs updating</div>
          <p className="mt-1 text-sm opacity-75">
            This console has {feature}, but the control plane it talks to is running an older
            build that does not. Nothing is broken — the server just has not been deployed yet.
          </p>
          <p className="mt-3 text-xs opacity-60">On the VM that runs the control plane:</p>
          <pre
            className="mt-1 overflow-x-auto rounded-lg px-3 py-2 text-xs"
            style={{ background: "var(--cv-surface-2)" }}
          >
{`cd ~/<repo> && git pull
cd platform && docker compose up -d --build`}
          </pre>
          <p className="mt-2 text-xs opacity-60">
            Then reload this page. See Docs/12-vm-runbook.md.
          </p>
        </div>
      </div>
    </Surface>
  );
}
