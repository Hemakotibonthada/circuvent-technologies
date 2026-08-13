"use client";

/**
 * What the signed-in person may do in the home the console is currently
 * showing.
 *
 * The capability list comes from the server rather than being worked out here.
 * A copy of the role table in the browser would drift from the one the API
 * enforces, and the two failure modes are both bad: a button that refuses when
 * pressed, or a control hidden from somebody entitled to it, who then reports
 * the feature as broken.
 *
 * Everything defaults to allowed while loading and if the call fails. That is
 * deliberate — this decides what to *show*, never what to permit, and the
 * server refuses regardless. Defaulting to denied would blank the console for
 * every owner during the first paint and turn a failed request into a home
 * that appears to have lost its devices.
 */

import { useEffect, useState } from "react";
import { controlPlane, getActiveHome, type HomeCapability, type HomeRole } from "@/lib/control-plane";

export type { HomeCapability };

export interface HomeAccess {
  /** Null until known. */
  role: HomeRole | null;
  /** True while the answer is still unknown — controls should stay enabled. */
  loading: boolean;
  /** Whether the console is showing a home belonging to somebody else. */
  visiting: boolean;
  /** Whose home it is, for the banner. Empty when it is your own. */
  ownerName: string;
  can: (c: HomeCapability) => boolean;
}

const ALLOW_ALL = (): boolean => true;

export function useHomeAccess(): HomeAccess {
  const [state, setState] = useState<{
    role: HomeRole | null;
    caps: HomeCapability[] | null;
    ownerName: string;
  }>({ role: null, caps: null, ownerName: "" });
  const [loading, setLoading] = useState(true);

  const activeHome = typeof window === "undefined" ? null : getActiveHome();

  useEffect(() => {
    let cancelled = false;

    /* Your own home is the overwhelmingly common case and needs no request at
       all: you can do everything in it by definition. */
    if (!activeHome) {
      setState({ role: "owner", caps: null, ownerName: "" });
      setLoading(false);
      return;
    }

    void (async () => {
      const [m, h] = await Promise.all([controlPlane.homeMembers(), controlPlane.homes()]);
      if (cancelled) return;
      const you = m.ok ? m.data.you : null;
      const home = h.ok ? h.data.homes.find((x) => x.homeId === activeHome) : undefined;
      setState({
        role: you?.role ?? null,
        caps: you?.capabilities ?? null,
        ownerName: home?.ownerName ?? "",
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeHome]);

  return {
    role: state.role,
    loading,
    visiting: activeHome !== null,
    ownerName: state.ownerName,
    /* No list yet — either still loading, your own home, or the call failed.
       Show everything and let the server be the authority. */
    can: state.caps ? (c: HomeCapability) => state.caps!.includes(c) : ALLOW_ALL,
  };
}
