import { useCallback, useEffect, useState } from "react";
import { api } from "../../../api";

export interface AdminIdentity {
  admin: boolean;
  uid: number;
  email: string;
}

type ApiResponse<T> = { ok: boolean; status: number; data: T };

export class AdminAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function unwrap<T>(promise: Promise<ApiResponse<T>>, fallback = "Request failed"): Promise<T> {
  const res = await promise;
  if (!res.ok) {
    const data = res.data as { error?: string } | undefined;
    throw new AdminAccessError(data?.error || (res.status === 403 ? "Administrator access required." : fallback), res.status);
  }
  return res.data;
}

export type AdminLoadState<T> =
  | { status: "loading"; refreshing: boolean; me: null; data: null; error: null }
  | { status: "denied"; refreshing: boolean; me: AdminIdentity | null; data: null; error: string }
  | { status: "error"; refreshing: boolean; me: AdminIdentity | null; data: null; error: string }
  | { status: "ready"; refreshing: boolean; me: AdminIdentity; data: T; error: null };

export function useAdminResource<T>(loader: (me: AdminIdentity) => Promise<T>) {
  const [state, setState] = useState<AdminLoadState<T>>({ status: "loading", refreshing: false, me: null, data: null, error: null });

  const load = useCallback(async (refreshing = false) => {
    setState((s) => ({ ...s, refreshing, status: refreshing && s.status === "ready" ? "ready" : "loading" } as AdminLoadState<T>));
    try {
      const me = await unwrap(api.adminMe(), "Unable to verify administrator access.");
      if (!me.admin) {
        setState({ status: "denied", refreshing: false, me, data: null, error: "This area is available only to administrators." });
        return;
      }
      const data = await loader(me);
      setState({ status: "ready", refreshing: false, me, data, error: null });
    } catch (e) {
      const err = e as AdminAccessError;
      if (err.status === 403) {
        setState({ status: "denied", refreshing: false, me: null, data: null, error: "Administrator access is required for this screen." });
      } else {
        setState({ status: "error", refreshing: false, me: null, data: null, error: err.message || "Unable to load administration data." });
      }
    }
  }, [loader]);

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);
  return { state, refresh };
}
