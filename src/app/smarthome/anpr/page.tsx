"use client";

import { Camera, Car, Gauge, ListChecks, ScanSearch, TrendingUp } from "lucide-react";
import Link from "next/link";
import { SectionShell } from "../_kit/section";
import { ToastHost } from "../_kit/overlays";
import { Callout, LoadingState } from "../_kit/primitives";
import { useAnprPresence } from "../_data/hooks";
import { VehiclesPanel } from "../security/VehiclesPanel";

/**
 * ANPR Camera — its own console section.
 *
 * WHY IT IS NOT A SECURITY TAB ANY MORE
 *
 * It began as one, on the reasoning that "which vehicles came to my property"
 * is the same question the Access tab answers for people. That held while it
 * was a plate log. It stopped holding once the feature grew a vehicle register,
 * a site-occupancy policy, a traffic dashboard, a rules list and per-camera lane
 * configuration — six views behind a segmented control nested inside a tab,
 * which is one level of hiding too many for something somebody administers
 * daily.
 *
 * WHY IT IS CONDITIONAL
 *
 * A section is not free. Most accounts are a few lamps and a hub, and a
 * gate-management section they cannot use is clutter at best — at worst an
 * empty plate log reads as a broken feature rather than an unbought one. So it
 * appears only for an account that actually has a number-plate camera: an
 * `anpr-cam`, or an ordinary camera enrolled as a lane. `useAnprPresence`
 * answers that once for the whole console, and `ConsoleChrome` hides Security's
 * Vehicles tab whenever this section is showing, so there is exactly one home
 * for it at any moment.
 *
 * The route itself stays reachable either way. A bookmark, a link in a report
 * or a command-palette entry that dead-ends because a lane was switched off is
 * worse than a page that explains itself — which is what the guard below
 * renders.
 */

const TABS = [
  { id: "log", label: "Plate log", icon: ScanSearch },
  { id: "vehicles", label: "Vehicles", icon: Car },
  { id: "site", label: "Site", icon: Gauge },
  { id: "insights", label: "Insights", icon: TrendingUp },
  { id: "lists", label: "Allow & block", icon: ListChecks },
  { id: "cameras", label: "Cameras", icon: Camera },
] as const;

export default function AnprPage() {
  const { hasAnpr, ready } = useAnprPresence();

  return (
    <ToastHost>
      {!ready ? (
        <LoadingState label="Loading number-plate cameras" />
      ) : !hasAnpr ? (
        <NotSetUp />
      ) : (
        <SectionShell
          eyebrow="Smarthome"
          title="ANPR Camera"
          subtitle="Number plates · vehicles · site occupancy · allow & block lists"
          tabs={[...TABS]}
          panels={{
            log: () => <VehiclesPanel key="log" view="log" />,
            vehicles: () => <VehiclesPanel key="vehicles" view="vehicles" />,
            site: () => <VehiclesPanel key="site" view="site" />,
            insights: () => <VehiclesPanel key="insights" view="insights" />,
            lists: () => <VehiclesPanel key="lists" view="lists" />,
            cameras: () => <VehiclesPanel key="cameras" view="cameras" />,
          }}
        />
      )}
    </ToastHost>
  );
}

/**
 * Reached by a link or a bookmark on an account with no ANPR camera.
 *
 * It says where to go rather than only what is missing. "Nothing here" with no
 * next step is the state somebody screenshots and sends to support.
 */
function NotSetUp() {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <Callout tone="info" title="No number-plate camera on this account yet">
        This section appears once a camera is reading number plates. Any camera can do it — the
        control plane drives it, so no new hardware is needed. Turn it on under{" "}
        <Link href="/smarthome/security?tab=vehicles" className="underline">
          Security → Vehicles → Cameras
        </Link>
        , and this section will appear on its own.
      </Callout>
    </div>
  );
}
