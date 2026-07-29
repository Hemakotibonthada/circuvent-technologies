/**
 * Shared UI primitives for the Gate access module.
 *
 * These live in a single file so screens read as short compositions of named
 * pieces rather than a hundred inline `<View>`s each. Nothing here decides
 * which endpoint to call — that is the screens' job — but everything here
 * renders data pulled from real endpoints, with no synthetic fallbacks.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Rect } from "react-native-svg";
import type { AppEvent, Device, GatePass } from "../../../api";
import { formatDateTime, formatRelative, severityOf } from "../../../enterprise";
import { Card, EmptyState, ErrorState, Screen, useReduceMotion, useTheme } from "../../../ui";
import {
  ActionButton,
  Callout,
  LoadingState,
  MetricRow,
  Pill,
  ScreenHeader,
  SeverityBadge,
  StatusDot,
  severityColor,
  severityIcon,
  type HeaderAction,
} from "../../../enterprise-ui";
import { Icon, type IconName } from "../../../icons";
import { qrMatrix } from "../../../qrcode";
import {
  fullValidityLabel,
  gateOpenState,
  humanShortDuration,
  isDeviceStale,
  PASS_STATUS_LABEL,
  secondsUntilActive,
  secondsUntilExpiry,
  usesRemaining,
  validityLabel,
  type PassStatus,
} from "./types";

/* --------------------------------------------------------------- scaffold -- */

/**
 * Screen frame used by every module screen. The tinted background,
 * gradient-aware header and safe-area padding are the same across screens; only
 * the middle changes. Rendering loading/error/empty here keeps every screen
 * from re-implementing the same three branches.
 */
export function GateScaffold({
  title,
  subtitle,
  onBack,
  onRefresh,
  refreshing,
  loading,
  error,
  onRetry,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  actions?: HeaderAction[];
  children: React.ReactNode;
}) {
  const headerActions: HeaderAction[] = [];
  if (onRefresh) headerActions.push({ icon: "refresh", label: refreshing ? "Refreshing" : "Refresh", onPress: onRefresh });
  if (actions) headerActions.push(...actions);

  return (
    <Screen>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} actions={headerActions} sticky />
      {loading ? (
        <LoadingState text="Loading gate data…" />
      ) : error ? (
        <View style={{ padding: 16 }}>
          <ErrorState text={error} onRetry={onRetry} />
        </View>
      ) : (
        children
      )}
    </Screen>
  );
}

/**
 * Section header with a leading icon. Reduces the mental cost of scanning a
 * dense screen by giving each block a stable landmark.
 */
export function Section({
  icon,
  title,
  subtitle,
  right,
  style,
  children,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View style={[{ marginBottom: 18 }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10 }}>
        {icon ? <Icon name={icon} size={18} color={c.accentHi} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: "900" }} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={{ color: c.faint, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** A small explanatory line — used to caption things like the local-only log. */
export function DeviceOnlyNote({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
      <Icon name="info" size={12} color={c.faint} />
      <Text style={{ color: c.faint, fontSize: 11, flex: 1 }} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

/** Empty-state for when a real API returned zero rows. */
export function HonestEmpty({
  title,
  subtitle,
  icon = "pass",
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return <EmptyState icon={icon} title={title} subtitle={subtitle} actionLabel={actionLabel} onAction={onAction} />;
}

/* --------------------------------------------------------------- pill --- */

/**
 * A colour-coded status pill. The map lives here so every screen renders the
 * same colour for the same server-side status — a "scheduled" pass showing as
 * grey on one screen and cyan on another is a bug waiting to happen.
 */
export function PassStatusPill({ status }: { status: PassStatus }) {
  const { c } = useTheme();
  const map: Record<PassStatus, { color: string; icon: IconName }> = {
    active: { color: c.green, icon: "check" },
    scheduled: { color: c.cyan, icon: "clock" },
    expired: { color: c.faint, icon: "history" },
    used: { color: c.violet, icon: "success" },
    revoked: { color: c.red, icon: "cancel" },
  };
  const m = map[status];
  return <Pill label={PASS_STATUS_LABEL[status]} icon={m.icon} color={m.color} filled={status === "active"} />;
}

/**
 * Gate open/closed pill. "Unknown" is a real state — a device whose telemetry
 * hasn't reported a position is not "closed by default".
 */
export function GateStatePill({ state }: { state: "open" | "closed" | "unknown" }) {
  const { c } = useTheme();
  if (state === "open") return <Pill label="Open" icon="gateOpen" color={c.amber} filled />;
  if (state === "closed") return <Pill label="Closed" icon="gate" color={c.green} />;
  return <Pill label="Unknown" icon="info" color={c.faint} />;
}

/* ----------------------------------------------------------- pass rows --- */

/**
 * Card-style row for the passes list. Shows enough to skim the list quickly;
 * the detail screen is where operators go for the QR and full validity.
 */
export function PassRow({
  pass,
  device,
  onPress,
}: {
  pass: GatePass;
  device?: Device | null;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const remaining = usesRemaining(pass);
  const deviceLabel = device ? device.name || device.id : pass.device_id;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open pass ${pass.label}, ${PASS_STATUS_LABEL[pass.status]}`}
      style={({ pressed }) => [
        styles.passRow,
        { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={[styles.passIcon, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Icon name={pass.status === "active" ? "pass" : "keyVariant"} size={20} color={c.accentHi} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: "800", fontSize: 15, flex: 1 }} numberOfLines={1}>
              {pass.label || "Guest"}
            </Text>
            <PassStatusPill status={pass.status} />
          </View>
          <Text style={{ color: c.faint, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {deviceLabel} · {validityLabel(pass)}
          </Text>
          <Text style={{ color: c.textDim, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {remaining} of {pass.max_uses} uses left · Created {formatRelative(pass.created_at)}
          </Text>
        </View>
        <Icon name="chevron" size={16} color={c.faint} />
      </View>
    </Pressable>
  );
}

/**
 * Row inside the gate overview showing one physical gate device with its
 * current position, last-seen, and quick command actions.
 */
export function GateDeviceRow({
  device,
  onOpen,
  onClose,
  onLock,
  onUnlock,
  onCommand,
  disabled,
  busy,
}: {
  device: Device;
  onOpen?: () => void;
  onClose?: () => void;
  onLock?: () => void;
  onUnlock?: () => void;
  onCommand?: (command: string) => void;
  disabled?: boolean;
  busy?: string | null;
}) {
  const { c } = useTheme();
  const state = gateOpenState(device);
  const stale = isDeviceStale(device);
  const locked = typeof device.state?.locked === "boolean" ? Boolean(device.state.locked) : null;

  return (
    <Card padded style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <StatusDot ok={device.online} pulse={device.online} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.text, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>
            {device.name || device.id}
          </Text>
          <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>
            {device.type} · {device.room || "Unassigned"} ·{" "}
            {device.last_seen ? formatRelative(device.last_seen) : "never reported"}
          </Text>
        </View>
        <GateStatePill state={state} />
      </View>

      {stale ? (
        <View style={{ marginBottom: 8 }}>
          <Callout
            kind="warning"
            icon="warning"
            text="This device is marked online but has not reported in the last five minutes. Commands may not take effect until it reconnects."
          />
        </View>
      ) : null}

      {locked != null ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Icon name={locked ? "lock" : "unlock"} size={14} color={locked ? c.amber : c.green} />
          <Text style={{ color: c.textDim, fontSize: 12.5 }}>
            {locked ? "Locked" : "Unlocked"} — last observed lock state from telemetry
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {onOpen && (
          <View style={{ flexGrow: 1, minWidth: 120 }}>
            <ActionButton
              label="Open"
              icon="gateOpen"
              onPress={onOpen}
              busy={busy === "open"}
              disabled={disabled || !device.online}
            />
          </View>
        )}
        {onClose && (
          <View style={{ flexGrow: 1, minWidth: 120 }}>
            <ActionButton
              label="Close"
              icon="gate"
              tone={c.textDim}
              onPress={onClose}
              busy={busy === "close"}
              disabled={disabled || !device.online}
              outline
            />
          </View>
        )}
        {onLock && (
          <View style={{ flexGrow: 1, minWidth: 120 }}>
            <ActionButton
              label="Lock"
              icon="lock"
              tone={c.amber}
              onPress={onLock}
              busy={busy === "lock"}
              disabled={disabled || !device.online || locked === true}
              outline
            />
          </View>
        )}
        {onUnlock && (
          <View style={{ flexGrow: 1, minWidth: 120 }}>
            <ActionButton
              label="Unlock"
              icon="unlock"
              tone={c.green}
              onPress={onUnlock}
              busy={busy === "unlock"}
              disabled={disabled || !device.online || locked === false}
              outline
            />
          </View>
        )}
        {onCommand && (
          <View style={{ flexGrow: 1, minWidth: 120 }}>
            <ActionButton
              label="Grant open"
              icon="check"
              tone={c.cyan}
              onPress={() => onCommand("grantOpen")}
              busy={busy === "grantOpen"}
              disabled={disabled || !device.online}
              outline
            />
          </View>
        )}
      </View>
    </Card>
  );
}

/* --------------------------------------------------------------- QR ---- */

/**
 * QR renderer.
 *
 * The encoder in `src/qrcode.ts` returns a boolean grid; scanners need a bright
 * white background regardless of the app theme, and a 4-module quiet zone
 * around the symbol. Rendering each dark module as a `<Rect>` is fine at the
 * sizes we ship (versions 1-10 fit inside 57 modules; a 300pt symbol is under
 * 200 rects per row for the largest case).
 *
 * The `text` prop MUST be the server-supplied `pass.qr` value. Never synthesise
 * the payload client-side — if the backend changes the URL scheme we want the
 * QR to change with it.
 */
export function GateQr({ text, size = 240, quietZone = 4 }: { text: string; size?: number; quietZone?: number }) {
  const matrix = useMemo(() => {
    try {
      return qrMatrix(text, "M");
    } catch (err) {
      // A payload that exceeds version 10 is a bug we want to see in Sentry,
      // not a blank frame in the wild. Log and surface a null so the caller
      // can render an explanation.
      // eslint-disable-next-line no-console
      console.warn("QR generation failed", err);
      return null;
    }
  }, [text]);

  const { c } = useTheme();

  if (!matrix) {
    return (
      <View style={[styles.qrFallback, { width: size, height: size, backgroundColor: c.card, borderColor: c.border }]}>
        <Icon name="warning" size={22} color={c.red} />
        <Text style={{ color: c.textDim, fontSize: 12, marginTop: 6, textAlign: "center" }}>
          Could not render QR — code will still redeem via manual entry.
        </Text>
      </View>
    );
  }

  const count = matrix.length;
  const totalModules = count + quietZone * 2;
  const module = Math.max(1, Math.floor(size / totalModules));
  const rendered = module * totalModules;

  // Merging runs of consecutive dark modules on each row cuts the SVG node
  // count by roughly 3-5x. On lower-end Android phones the paint pass on a
  // 200-node QR was visibly janky; this brings it under 60fps.
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (let r = 0; r < count; r++) {
    let c0 = -1;
    for (let cc = 0; cc <= count; cc++) {
      const dark = cc < count && matrix[r][cc];
      if (dark && c0 < 0) c0 = cc;
      if (!dark && c0 >= 0) {
        rects.push({ x: (quietZone + c0) * module, y: (quietZone + r) * module, w: (cc - c0) * module, h: module });
        c0 = -1;
      }
    }
  }

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Guest pass QR code"
      style={{
        width: rendered,
        height: rendered,
        alignSelf: "center",
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#ffffff",
      }}
    >
      <Svg width={rendered} height={rendered}>
        {rects.map((r, i) => (
          <Rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#000000" />
        ))}
      </Svg>
    </View>
  );
}

/* --------------------------------------------------------- countdown ---- */

/**
 * Live countdown text. Ticks once a second while the pass is not in a
 * terminal state. Once expired it stops ticking so the string does not keep
 * counting negative seconds.
 */
export function CountdownText({
  pass,
  style,
}: {
  pass: GatePass;
  style?: StyleProp<{ color?: string; fontSize?: number; fontWeight?: "700" | "800" | "900" }>;
}) {
  const { c } = useTheme();
  const [now, setNow] = useState(Date.now());
  const reduce = useReduceMotion();
  useEffect(() => {
    if (pass.status !== "active" && pass.status !== "scheduled") return;
    // Even under reduce-motion a value-only tick is fine; the user asked to
    // suppress motion, not information. We still throttle to once a second.
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pass.status, reduce]);

  const secs = pass.status === "scheduled" ? secondsUntilActive(pass, now) : secondsUntilExpiry(pass, now);
  const isCountdownActive = pass.status === "scheduled" ? secs > 0 : secs > 0;
  const isAlmostOver = pass.status === "active" && secs > 0 && secs < 300;
  const color = pass.status === "revoked" ? c.red : isAlmostOver ? c.amber : c.text;

  return (
    <Text style={[{ color, fontSize: 18, fontWeight: "900" }, style as never]} numberOfLines={1}>
      {pass.status === "scheduled" && isCountdownActive
        ? `Starts in ${humanShortDuration(secs)}`
        : pass.status === "active" && isCountdownActive
        ? `${humanShortDuration(secs)} remaining`
        : validityLabel(pass, now)}
    </Text>
  );
}

/* ------------------------------------------------------------ device pick */

/**
 * Compact list of gate devices used as an inline picker on the create form.
 * A `SelectField` from the enterprise kit works for short lists but doesn't
 * show online status, and knowing whether the chosen gate is reachable at
 * pass-creation time really does help.
 */
export function GateDevicePicker({
  devices,
  value,
  onChange,
  disabled,
}: {
  devices: Device[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  if (!devices.length) {
    return (
      <Callout
        kind="warning"
        icon="warning"
        title="No gate devices"
        text="You have no gate, barrier or smart-lock devices in your account. Provision or claim one before issuing passes."
      />
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
      {devices.map((d) => {
        const active = d.id === value;
        return (
          <TouchableOpacity
            key={d.id}
            onPress={() => !disabled && onChange(d.id)}
            accessibilityRole="radio"
            accessibilityLabel={`Select ${d.name || d.id}`}
            accessibilityState={{ selected: active, disabled: !!disabled }}
            style={[
              styles.devPick,
              {
                backgroundColor: active ? c.accent : c.card,
                borderColor: active ? c.accent : c.border,
                opacity: disabled ? 0.6 : 1,
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name={d.type === "rfid-gate" ? "vehicle" : d.type === "facedoor" ? "faceId" : "lock"} size={14} color={active ? c.onAccent : c.textDim} />
              <Text style={{ color: active ? c.onAccent : c.text, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>
                {d.name || d.id}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <StatusDot ok={d.online} size={7} />
              <Text style={{ color: active ? c.onAccent : c.faint, fontSize: 11 }}>
                {d.online ? "Online" : "Offline"}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------ event row -- */

/**
 * Timeline row for the gate access log. Uses `severityOf` from the shared
 * layer so a "security" event is red across every module screen.
 */
export function GateEventRow({ event, device }: { event: AppEvent; device?: Device | null }) {
  const { c } = useTheme();
  const severity = severityOf(event.kind);
  const tone = severityColor(c, severity);
  const deviceLabel = device ? device.name || device.id : event.device_id || "";

  return (
    <View style={[styles.event, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={[styles.eventIcon, { borderColor: tone, backgroundColor: tone + "22" }]}>
          <Icon name={severityIcon(severity)} size={14} color={tone} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: "800", fontSize: 14, flex: 1 }} numberOfLines={2}>
              {event.title}
            </Text>
            <SeverityBadge severity={severity} />
          </View>
          {!!event.body && (
            <Text style={{ color: c.textDim, fontSize: 12.5, marginTop: 4, lineHeight: 18 }} numberOfLines={3}>
              {event.body}
            </Text>
          )}
          <Text style={{ color: c.faint, fontSize: 11.5, marginTop: 5 }} numberOfLines={1}>
            {deviceLabel ? `${deviceLabel} · ` : ""}
            {formatRelative(event.ts)} · {formatDateTime(event.ts)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ misc ---- */

/**
 * Property list wrapper. Groups `MetricRow`s inside a card and handles the
 * `last` flag so the final border doesn't double up.
 */
export function DetailList({ rows }: { rows: { label: string; value: React.ReactNode; icon?: IconName; tint?: string; mono?: boolean }[] }) {
  return (
    <Card padded>
      {rows.map((row, i) => (
        <MetricRow
          key={row.label}
          label={row.label}
          value={row.value}
          icon={row.icon}
          tint={row.tint}
          mono={row.mono}
          last={i === rows.length - 1}
        />
      ))}
    </Card>
  );
}

/**
 * Small pass description used as a compact secondary display next to a QR —
 * built from real server fields, never from client-side inference.
 */
export function PassSummary({ pass, device }: { pass: GatePass; device?: Device | null }) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: 12, gap: 4 }}>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: "800", textAlign: "center" }} numberOfLines={1}>
        {pass.label}
      </Text>
      <Text style={{ color: c.textDim, fontSize: 12.5, textAlign: "center" }} numberOfLines={1}>
        For {device ? device.name || device.id : pass.device_id}
      </Text>
      <Text style={{ color: c.faint, fontSize: 12, textAlign: "center" }} numberOfLines={1}>
        {fullValidityLabel(pass)} · {usesRemaining(pass)} of {pass.max_uses} uses left
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------- styles -- */

const styles = StyleSheet.create({
  passRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  passIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  event: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  eventIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  qrFallback: {
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    alignSelf: "center",
  },
  devPick: {
    minWidth: 160,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});

/* --------------------------------------------------------- monospace ---- */

/**
 * A big, monospaced, easy-to-read guest-code display. Used on the pass detail
 * screen and the successful-redeem confirmation so the guard/guest can read it
 * back if the QR is scuffed.
 */
export function BigCode({ code }: { code: string }) {
  const { c } = useTheme();
  const groups = useMemo(() => splitCode(code, 4), [code]);
  return (
    <View style={{ alignItems: "center", marginTop: 8 }}>
      <Text
        selectable
        style={{
          color: c.text,
          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
          fontSize: 26,
          letterSpacing: 4,
          fontWeight: "800",
        }}
      >
        {groups.join("  ")}
      </Text>
    </View>
  );
}

function splitCode(code: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < code.length; i += size) out.push(code.slice(i, i + size));
  return out.length ? out : [code];
}
