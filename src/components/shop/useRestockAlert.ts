"use client";

import { useCallback, useState } from "react";
import { useAccount } from "./AccountProvider";

/**
 * Subscribing to a restock, in one place.
 *
 * WHY THIS IS A HOOK RATHER THAN COPIED INTO THE CARD
 *
 * The detail page asks this question in a full-width form and a product card
 * has room for a button, so the two look nothing alike — which is exactly the
 * situation that produces two implementations of one request. They then drift:
 * one learns that a signed-in shopper needs no email field, or that a duplicate
 * subscription is a success rather than an error, and the other does not.
 *
 * The request, the validation and the three states it can end in live here. The
 * components decide only what it looks like.
 */
export type RestockState = "idle" | "busy" | "done" | "error";

export interface RestockAlert {
  state: RestockState;
  error: string;
  /** True when the shopper must type an address because we do not have one. */
  needsEmail: boolean;
  /** The address we already know, when there is one. */
  knownEmail: string | null;
  subscribe: (email?: string) => Promise<void>;
}

export function useRestockAlert(productId: string): RestockAlert {
  const { account } = useAccount();
  const [state, setState] = useState<RestockState>("idle");
  const [error, setError] = useState("");

  const subscribe = useCallback(
    async (typed?: string) => {
      setError("");
      const email = (account?.email || typed || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setState("error");
        setError("Enter a valid email.");
        return;
      }
      setState("busy");
      try {
        const res = await fetch("/api/notify-restock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, email }),
        });
        const data = await res.json().catch(() => ({}));
        if (data?.success) {
          setState("done");
          return;
        }
        setState("error");
        setError(data?.message || "Could not subscribe.");
      } catch {
        /*
         * A network failure and a refusal are told apart on purpose. "Could not
         * subscribe" on a dropped connection reads as the shop rejecting the
         * request, and somebody who believes they were refused does not try
         * again — which is the whole value of asking.
         */
        setState("error");
        setError("Could not reach the shop. Check the connection and try again.");
      }
    },
    [account?.email, productId]
  );

  return {
    state,
    error,
    needsEmail: !account?.email,
    knownEmail: account?.email ?? null,
    subscribe,
  };
}
