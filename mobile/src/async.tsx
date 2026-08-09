import React from "react";
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { EmptyState, ErrorState, useTheme } from "./ui";
import { LoadingState } from "./enterprise-ui";

/*
 * Loading, failing and empty are three different things, and this app was
 * showing all three as a blank page.
 *
 * Nearly every screen here fetched with `api.thing().then(r => r.ok && setX(r.data))`.
 * When the hub is unreachable -- which for a house full of Wi-Fi hardware is a
 * normal Tuesday, not an edge case -- `r.ok` is false, the callback does
 * nothing, and the screen keeps rendering its initial empty state forever.
 *
 * The security dashboard was the one that made this worth fixing properly: on
 * a failed request it showed "no security events", which is not the same
 * sentence as "we cannot reach your house right now" and is the more
 * reassuring of the two. An audit found 36 screens doing some version of this.
 *
 * The zones module already had the right shape in useZones. This is that,
 * generalised, so a screen gets it in three lines instead of thirty.
 */

export interface AsyncState<T> {
  data: T | null;
  /** First load, with nothing on screen yet. */
  loading: boolean;
  /** A pull-to-refresh over content that is already there. */
  refreshing: boolean;
  error: string | null;
  /** Retry after a failure: shows the spinner again. */
  reload: () => Promise<void>;
  /** Pull-to-refresh: keeps the current content visible. */
  refresh: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Run an async loader and keep track of which of the three states it is in.
 *
 * The loader should throw on failure. Helpers like `unwrap` below turn this
 * codebase's `{ ok, data }` responses into that shape.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: React.DependencyList = []): AsyncState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Held in a ref so a slow request that finishes after the screen has moved
  // on cannot write to state, and so the effect does not re-run when the
  // caller passes a new inline function on every render.
  const loaderRef = React.useRef(loader);
  loaderRef.current = loader;
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = React.useCallback(async (spin: boolean) => {
    if (spin) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const next = await loaderRef.current();
      if (alive.current) setData(next);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      if (alive.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const reload = React.useCallback(() => run(true), [run]);
  const refresh = React.useCallback(() => run(false), [run]);

  React.useEffect(() => {
    run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, refreshing, error, reload, refresh, setData };
}

/**
 * Turn this codebase's `{ ok, status, data }` response into a value or a throw.
 *
 * The message matters: "Request failed (0)" is what a phone with no route to
 * the hub produces, and saying so is more use than a blank screen.
 */
export async function unwrap<T>(p: Promise<{ ok: boolean; status?: number; data?: unknown }>, what: string): Promise<T> {
  const res = await p;
  if (!res || res.ok === false) {
    const detail = (res?.data as { error?: string } | undefined)?.error;
    const status = res?.status ?? 0;
    throw new Error(detail || (status === 0 ? `Can't reach the hub to load ${what}` : `Couldn't load ${what} (${status})`));
  }
  return res.data as T;
}

/**
 * Render the right thing for the state the screen is actually in.
 *
 * `isEmpty` is deliberately a caller-supplied predicate rather than something
 * inferred: only the screen knows whether an empty array means "no devices
 * yet" or "no devices matched this filter".
 */
export function AsyncView<T>({
  state,
  isEmpty,
  emptyTitle = "Nothing here yet",
  emptySubtitle,
  emptyIcon,
  loadingText,
  children,
}: {
  state: AsyncState<T>;
  isEmpty?: (data: T) => boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyIcon?: React.ComponentProps<typeof EmptyState>["icon"];
  loadingText?: string;
  children: (data: T) => React.ReactNode;
}) {
  if (state.loading) return <LoadingState text={loadingText} />;
  if (state.error) return <ErrorState text={state.error} onRetry={state.reload} />;
  if (state.data == null) return <ErrorState text="No data was returned." onRetry={state.reload} />;
  if (isEmpty?.(state.data)) return <EmptyState icon={emptyIcon} title={emptyTitle} subtitle={emptySubtitle ?? ""} />;
  return <>{children(state.data)}</>;
}

/**
 * A scroll view wired for pull-to-refresh, which is the gesture people try
 * first when a screen looks stale.
 */
export function RefreshScroll({
  state,
  contentContainerStyle,
  children,
}: {
  state: Pick<AsyncState<unknown>, "refreshing" | "refresh">;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <ScrollView
      contentContainerStyle={contentContainerStyle ?? { padding: 16, paddingTop: 56, paddingBottom: 90 }}
      refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} tintColor={c.accentHi} colors={[c.accentHi]} />}
    >
      {children}
    </ScrollView>
  );
}

/** A thin wrapper so a screen can show a stale-data notice above its content. */
export function StaleNotice({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (!error) return null;
  return (
    <View style={{ marginBottom: 12 }}>
      <ErrorState text={`${error} Showing the last data received.`} onRetry={onRetry} />
    </View>
  );
}
