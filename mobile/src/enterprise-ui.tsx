/**
 * Enterprise UI kit.
 *
 * The base kit in `ui.tsx` covers the consumer surfaces. Operations screens
 * need denser, more explicit controls: sortable grids, severity encoding,
 * filter bars, sheets and forms. Those live here so `ui.tsx` stays focused and
 * the feature modules share one visual language.
 *
 * Every control is theme-driven (no hardcoded colours), has a minimum 44pt
 * touch target, carries an accessible name, and honours reduce-motion.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  Animated,
  Easing,
  StyleSheet,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  type KeyboardTypeOptions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, type IconName } from "./icons";
import { useTheme, Card, useSafeArea, useReduceMotion } from "./ui";
import type { Palette } from "./theme";
import type { Severity } from "./enterprise";

type C = Palette;

/** Severity → palette colour. Kept in one place so bands never drift apart. */
export function severityColor(c: C, s: Severity): string {
  switch (s) {
    case "critical":
      return c.red;
    case "warning":
      return c.amber;
    case "success":
      return c.green;
    default:
      return c.cyan;
  }
}

export function severityIcon(s: Severity): IconName {
  switch (s) {
    case "critical":
      return "alert";
    case "warning":
      return "warning";
    case "success":
      return "success";
    default:
      return "info";
  }
}

/* ------------------------------------------------------------- chrome ----- */

export interface HeaderAction {
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: number;
  tint?: string;
}

/**
 * Standard screen header for every module: back affordance, title, optional
 * subtitle and up to a few icon actions.
 *
 * Modules previously each rolled their own header, which is why back buttons
 * drifted between "‹ Back", "←" and a chevron. One component, one behaviour.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  actions = [],
  sticky,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: HeaderAction[];
  sticky?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeArea();
  return (
    <View
      style={[
        hs.wrap,
        { paddingTop: insets.top + 10, borderBottomColor: c.border },
        sticky && { backgroundColor: c.bg, borderBottomWidth: 1 },
      ]}
    >
      {onBack && (
        <Pressable
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          android_ripple={{ color: c.borderHi, borderless: true, radius: 22 }}
          style={({ pressed }) => [hs.iconBtn, { borderColor: c.border, backgroundColor: c.card }, pressed && { opacity: 0.7 }]}
        >
          <Icon name="back" size={20} color={c.text} />
        </Pressable>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.text, fontSize: 20, fontWeight: "900" }} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={{ color: c.faint, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={a.onPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={a.badge ? `${a.label}, ${a.badge}` : a.label}
          android_ripple={{ color: c.borderHi, borderless: true, radius: 22 }}
          style={({ pressed }) => [hs.iconBtn, { borderColor: c.border, backgroundColor: c.card }, pressed && { opacity: 0.7 }]}
        >
          <Icon name={a.icon} size={19} color={a.tint || c.text} />
          {a.badge != null && a.badge > 0 && (
            <View style={[hs.badge, { backgroundColor: c.red, borderColor: c.bg }]}>
              <Text style={hs.badgeT}>{a.badge > 9 ? "9+" : a.badge}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const hs = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeT: { color: "#fff", fontSize: 10, fontWeight: "800" },
});

/* ---------------------------------------------------------------- KPIs ---- */

export interface KpiProps {
  icon?: IconName;
  label: string;
  value: string | number;
  unit?: string;
  /** Signed change; rendered with direction and colour. */
  delta?: number;
  /** Set when a rising number is bad (latency, faults, cost). */
  invertDelta?: boolean;
  tint?: string;
  onPress?: () => void;
  footnote?: string;
}

export function Kpi({ icon, label, value, unit, delta, invertDelta, tint, onPress, footnote }: KpiProps) {
  const { c } = useTheme();
  const good = delta == null ? null : invertDelta ? delta <= 0 : delta >= 0;
  const deltaColor = good == null ? c.faint : good ? c.green : c.red;
  return (
    <Card padded onPress={onPress} style={{ flex: 1, minWidth: 140 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {icon && <Icon name={icon} size={16} color={tint || c.textDim} />}
        <Text style={{ color: c.faint, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, flex: 1 }} numberOfLines={1}>
          {label.toUpperCase()}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 6 }}>
        <Text style={{ color: tint || c.text, fontSize: 24, fontWeight: "900" }} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {!!unit && <Text style={{ color: c.textDim, fontSize: 12, fontWeight: "700", marginLeft: 3 }}>{unit}</Text>}
      </View>
      {delta != null && Number.isFinite(delta) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 }}>
          <Icon name={delta >= 0 ? "trendUp" : "trendDown"} size={12} color={deltaColor} />
          <Text style={{ color: deltaColor, fontSize: 12, fontWeight: "700" }}>
            {Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </Text>
        </View>
      )}
      {!!footnote && (
        <Text style={{ color: c.faint, fontSize: 11, marginTop: 4 }} numberOfLines={1}>
          {footnote}
        </Text>
      )}
    </Card>
  );
}

/** Wrapping row of KPI tiles. Wraps rather than scrolls so nothing hides offscreen. */
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>{children}</View>;
}

/* -------------------------------------------------------------- status ---- */

export function StatusDot({ ok, size = 9, pulse }: { ok: boolean; size?: number; pulse?: boolean }) {
  const { c } = useTheme();
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!pulse || !ok || reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(a, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, ok, reduce, a]);
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: ok ? c.green : c.faint,
        opacity: pulse && !reduce ? a : 1,
      }}
    />
  );
}

export function Pill({
  label,
  color,
  icon,
  filled,
  onPress,
}: {
  label: string;
  color?: string;
  icon?: IconName;
  filled?: boolean;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const tone = color || c.accentHi;
  const body = (
    <View
      style={[
        ps.pill,
        filled ? { backgroundColor: tone } : { backgroundColor: tone + "1F", borderColor: tone + "55", borderWidth: 1 },
      ]}
    >
      {icon && <Icon name={icon} size={12} color={filled ? c.onAccent : tone} />}
      <Text style={{ color: filled ? c.onAccent : tone, fontSize: 11, fontWeight: "800" }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </Pressable>
  );
}

const ps = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
});

export function SeverityBadge({ severity, label }: { severity: Severity; label?: string }) {
  const { c } = useTheme();
  return <Pill label={label ?? severity} color={severityColor(c, severity)} icon={severityIcon(severity)} />;
}

/**
 * Health strip: a labelled row of up/down indicators.
 *
 * Used for control-plane liveness, where the useful reading is "which leg is
 * down", not an aggregate percentage.
 */
export function HealthStrip({ items }: { items: { label: string; ok: boolean; detail?: string }[] }) {
  const { c } = useTheme();
  return (
    <Card padded style={{ marginBottom: 12 }}>
      {items.map((it, i) => (
        <View
          key={it.label}
          style={[
            { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
            i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
          ]}
        >
          <StatusDot ok={it.ok} pulse={it.ok} />
          <Text style={{ color: c.text, fontWeight: "700", fontSize: 14, flex: 1 }}>{it.label}</Text>
          {!!it.detail && <Text style={{ color: c.faint, fontSize: 12 }}>{it.detail}</Text>}
          <Pill label={it.ok ? "UP" : "DOWN"} color={it.ok ? c.green : c.red} />
        </View>
      ))}
    </Card>
  );
}

/* -------------------------------------------------------------- inputs ---- */

export function SearchField({
  value,
  onChange,
  placeholder = "Search",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={[fs.search, { backgroundColor: c.card, borderColor: c.border }]}>
      <Icon name="search" size={17} color={c.faint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel={placeholder}
        style={{ flex: 1, color: c.text, fontSize: 15, paddingVertical: Platform.OS === "ios" ? 10 : 6 }}
      />
      {!!value && (
        <Pressable onPress={() => onChange("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
          <Icon name="cancel" size={17} color={c.faint} />
        </Pressable>
      )}
    </View>
  );
}

const fs = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 12,
    minHeight: 44,
    marginBottom: 12,
  },
});

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  secure,
  multiline,
  help,
  error,
  autoCapitalize = "none",
  editable = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secure?: boolean;
  multiline?: boolean;
  help?: string;
  error?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? c.red : focused ? c.accent : c.border;
  return (
    <View style={{ marginBottom: 14 }}>
      {/* A visible label, not a placeholder: placeholders vanish on focus and
          leave the user with no reminder of what the field was. */}
      <Text style={{ color: c.textDim, fontSize: 12, fontWeight: "700", marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        keyboardType={keyboardType}
        secureTextEntry={secure}
        multiline={multiline}
        editable={editable}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        style={{
          backgroundColor: editable ? c.card : c.surface,
          borderColor: border,
          borderWidth: 1.5,
          borderRadius: 12,
          color: editable ? c.text : c.faint,
          fontSize: 15,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : Platform.OS === "ios" ? 12 : 9,
          minHeight: multiline ? 88 : 44,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
      {/* Errors sit against the field they describe — a summary at the top of a
          long form makes the user hunt for the offending input. */}
      {!!error && <Text style={{ color: c.red, fontSize: 12, marginTop: 5 }}>{error}</Text>}
      {!error && !!help && <Text style={{ color: c.faint, fontSize: 12, marginTop: 5 }}>{help}</Text>}
    </View>
  );
}

export function ToggleField({
  label,
  help,
  value,
  onChange,
  icon,
  disabled,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: IconName;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={help}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 44, opacity: disabled ? 0.5 : 1 },
        pressed && { opacity: 0.7 },
      ]}
    >
      {icon && <Icon name={icon} size={19} color={value ? c.accentHi : c.faint} />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: "700", fontSize: 14 }}>{label}</Text>
        {!!help && <Text style={{ color: c.faint, fontSize: 12, marginTop: 1 }}>{help}</Text>}
      </View>
      <View style={[ts.track, { backgroundColor: value ? c.accent : c.border }]}>
        <View style={[ts.knob, { backgroundColor: value ? c.onAccent : c.faint, alignSelf: value ? "flex-end" : "flex-start" }]} />
      </View>
    </Pressable>
  );
}

const ts = StyleSheet.create({
  track: { width: 46, height: 27, borderRadius: 14, padding: 3, justifyContent: "center" },
  knob: { width: 21, height: 21, borderRadius: 11 },
});

/** Numeric stepper with explicit +/- targets, for values a slider can't hit precisely. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  help?: string;
}) {
  const { c } = useTheme();
  const clamp = (v: number) => Math.max(min, Math.min(max, Number(v.toFixed(4))));
  const btn = (icon: IconName, delta: number, name: string) => (
    <Pressable
      onPress={() => onChange(clamp(value + delta))}
      hitSlop={6}
      disabled={delta < 0 ? value <= min : value >= max}
      accessibilityRole="button"
      accessibilityLabel={`${name} ${label}`}
      android_ripple={{ color: c.borderHi, borderless: true, radius: 22 }}
      style={({ pressed }) => [
        ss.btn,
        { borderColor: c.border, backgroundColor: c.card, opacity: (delta < 0 ? value <= min : value >= max) ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={icon} size={18} color={c.text} />
    </Pressable>
  );
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: c.textDim, fontSize: 12, fontWeight: "700", marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {btn("collapse", -step, "Decrease")}
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: "900" }}>
            {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {unit ? <Text style={{ fontSize: 13, color: c.textDim }}> {unit}</Text> : null}
          </Text>
        </View>
        {btn("expand", step, "Increase")}
      </View>
      {!!help && <Text style={{ color: c.faint, fontSize: 12, marginTop: 5 }}>{help}</Text>}
    </View>
  );
}

const ss = StyleSheet.create({
  btn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
  help?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: c.textDim, fontSize: 12, fontWeight: "700", marginBottom: 6 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                sf.opt,
                {
                  backgroundColor: active ? c.accent : c.card,
                  borderColor: active ? c.accent : c.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {o.icon && <Icon name={o.icon} size={15} color={active ? c.onAccent : c.textDim} />}
              <Text style={{ color: active ? c.onAccent : c.text, fontWeight: "700", fontSize: 13 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {!!help && <Text style={{ color: c.faint, fontSize: 12, marginTop: 5 }}>{help}</Text>}
    </View>
  );
}

const sf = StyleSheet.create({
  opt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
  },
});

/* -------------------------------------------------------------- filters --- */

/** Horizontal filter chips with an optional count suffix. */
export function FilterBar<T extends string>({
  options,
  value,
  onChange,
  counts,
}: {
  options: { value: T; label: string; icon?: IconName; color?: string }[];
  value: T;
  onChange: (v: T) => void;
  counts?: Partial<Record<T, number>>;
}) {
  const { c } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      style={{ marginBottom: 12, flexGrow: 0 }}
    >
      {options.map((o) => {
        const active = o.value === value;
        const tone = o.color || c.accent;
        const n = counts?.[o.value];
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityLabel={n != null ? `${o.label}, ${n}` : o.label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              fb.chip,
              { backgroundColor: active ? tone : c.card, borderColor: active ? tone : c.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            {o.icon && <Icon name={o.icon} size={14} color={active ? c.onAccent : c.textDim} />}
            <Text style={{ color: active ? c.onAccent : c.text, fontWeight: "700", fontSize: 13 }}>{o.label}</Text>
            {n != null && (
              <View style={[fb.count, { backgroundColor: active ? "rgba(255,255,255,0.25)" : c.surfaceHi }]}>
                <Text style={{ color: active ? c.onAccent : c.textDim, fontSize: 11, fontWeight: "800" }}>{n}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const fb = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
  },
  count: { minWidth: 20, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8, alignItems: "center" },
});

/* ------------------------------------------------------------ data grid --- */

export interface GridColumn<T> {
  key: string;
  header: string;
  /** Fixed column width in pt. Grid scrolls horizontally, so widths must be explicit. */
  width: number;
  render: (row: T) => React.ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
}

/**
 * Horizontally scrollable, sortable data grid.
 *
 * Phones cannot show a wide operations table without either truncating columns
 * into uselessness or wrapping them into mush. Scrolling the body while keeping
 * a sticky header row preserves the tabular reading that makes fleets legible.
 */
export function DataGrid<T>({
  columns,
  rows,
  keyOf,
  onRowPress,
  emptyText = "Nothing to show.",
  maxHeight,
}: {
  columns: GridColumn<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  onRowPress?: (row: T) => void;
  emptyText?: string;
  maxHeight?: number;
}) {
  const { c } = useTheme();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    const col = columns.find((x) => x.key === sortKey);
    if (!col?.sortValue) return rows;
    const fn = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      if (typeof va === "number" && typeof vb === "number") return asc ? va - vb : vb - va;
      return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [rows, columns, sortKey, asc]);

  const total = columns.reduce((n, x) => n + x.width, 0);

  const toggle = useCallback(
    (key: string) => {
      if (sortKey === key) setAsc((v) => !v);
      else {
        setSortKey(key);
        setAsc(true);
      }
    },
    [sortKey]
  );

  if (!rows.length) {
    return (
      <Card padded>
        <Text style={{ color: c.faint, fontSize: 13, textAlign: "center", paddingVertical: 12 }}>{emptyText}</Text>
      </Card>
    );
  }

  return (
    <Card padded={false} style={{ overflow: "hidden" }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: total }}>
          <View style={[dg.head, { borderBottomColor: c.border, backgroundColor: c.surfaceHi }]}>
            {columns.map((col) => {
              const active = sortKey === col.key;
              const content = (
                <View style={[dg.headCell, { width: col.width, justifyContent: alignToFlex(col.align) }]}>
                  <Text style={{ color: active ? c.accentHi : c.faint, fontSize: 11, fontWeight: "800", letterSpacing: 0.3 }} numberOfLines={1}>
                    {col.header.toUpperCase()}
                  </Text>
                  {col.sortValue && active && <Icon name={asc ? "collapse" : "expand"} size={12} color={c.accentHi} />}
                </View>
              );
              if (!col.sortValue) return <View key={col.key}>{content}</View>;
              return (
                <Pressable
                  key={col.key}
                  onPress={() => toggle(col.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort by ${col.header}`}
                >
                  {content}
                </Pressable>
              );
            })}
          </View>
          <ScrollView style={maxHeight ? { maxHeight } : undefined} nestedScrollEnabled>
            {sorted.map((row, i) => (
              <Pressable
                key={keyOf(row)}
                onPress={onRowPress ? () => onRowPress(row) : undefined}
                accessibilityRole={onRowPress ? "button" : undefined}
                style={({ pressed }) => [
                  dg.row,
                  i < sorted.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                  pressed && onRowPress ? { backgroundColor: c.surfaceHi } : null,
                ]}
              >
                {columns.map((col) => (
                  <View key={col.key} style={[dg.cell, { width: col.width, justifyContent: alignToFlex(col.align) }]}>
                    {col.render(row)}
                  </View>
                ))}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </Card>
  );
}

function alignToFlex(a?: "left" | "right" | "center"): "flex-start" | "flex-end" | "center" {
  return a === "right" ? "flex-end" : a === "center" ? "center" : "flex-start";
}

const dg = StyleSheet.create({
  head: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 10 },
  headCell: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 11, minHeight: 44 },
  cell: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
});

/** Label/value row for detail panes. */
export function MetricRow({
  label,
  value,
  icon,
  tint,
  mono,
  last,
}: {
  label: string;
  value: React.ReactNode;
  icon?: IconName;
  tint?: string;
  mono?: boolean;
  last?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, minHeight: 42 },
        !last && { borderBottomWidth: 1, borderBottomColor: c.border },
      ]}
    >
      {icon && <Icon name={icon} size={16} color={c.faint} />}
      <Text style={{ color: c.textDim, fontSize: 13, flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text
          style={{
            color: tint || c.text,
            fontSize: 13,
            fontWeight: "700",
            fontFamily: mono ? (Platform.OS === "ios" ? "Menlo" : "monospace") : undefined,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

/* --------------------------------------------------------- bottom sheet --- */

/**
 * Modal bottom sheet.
 *
 * Preferred over a full-screen push for short, focused tasks (create a pass,
 * pick a cohort) because it keeps the originating context visible, so the user
 * does not lose their place in a long list.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeArea();
  const { height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const y = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduce) {
      y.setValue(visible ? 0 : 1);
      return;
    }
    Animated.timing(y, {
      toValue: visible ? 0 : 1,
      duration: visible ? 260 : 180,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, y, reduce]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <Animated.View
        style={[
          bsS.sheet,
          {
            backgroundColor: c.bg,
            borderColor: c.border,
            maxHeight: height * 0.88,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) }],
          },
        ]}
      >
        <View style={[bsS.grabber, { backgroundColor: c.border }]} />
        <View style={bsS.head}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: "900", flex: 1 }} numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [bsS.close, { backgroundColor: c.card, borderColor: c.border }, pressed && { opacity: 0.7 }]}
          >
            <Icon name="close" size={18} color={c.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {!!footer && <View style={[bsS.footer, { borderTopColor: c.border }]}>{footer}</View>}
      </Animated.View>
    </Modal>
  );
}

const bsS = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  close: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  footer: { padding: 16, borderTopWidth: 1 },
});

/** Destructive-action confirmation. Never wire a destructive call straight to a tap. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  destructive,
  onConfirm,
  onCancel,
  busy,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, cd.backdrop]}>
        <View style={[cd.box, { backgroundColor: c.bg, borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: "900", marginBottom: 6 }}>{title}</Text>
          <Text style={{ color: c.textDim, fontSize: 14, lineHeight: 20, marginBottom: 18 }}>{message}</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [cd.btn, { borderColor: c.border, backgroundColor: c.card, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={{ color: c.text, fontWeight: "800" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              style={({ pressed }) => [
                cd.btn,
                { backgroundColor: destructive ? c.red : c.accent, borderColor: "transparent", opacity: busy ? 0.6 : pressed ? 0.85 : 1 },
              ]}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>{confirmLabel}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const cd = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 28 },
  box: { width: "100%", maxWidth: 380, borderRadius: 20, borderWidth: 1, padding: 20 },
  btn: { flex: 1, minHeight: 46, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});

/* ------------------------------------------------------------- feedback --- */

export function Callout({
  kind = "info",
  title,
  text,
  icon,
  action,
}: {
  kind?: Severity;
  title?: string;
  text: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
}) {
  const { c } = useTheme();
  const tone = severityColor(c, kind);
  return (
    <View style={[co.wrap, { backgroundColor: tone + "14", borderColor: tone + "44" }]}>
      <Icon name={icon ?? severityIcon(kind)} size={18} color={tone} />
      <View style={{ flex: 1 }}>
        {!!title && <Text style={{ color: c.text, fontWeight: "800", fontSize: 14, marginBottom: 2 }}>{title}</Text>}
        <Text style={{ color: c.textDim, fontSize: 13, lineHeight: 19 }}>{text}</Text>
        {action && (
          <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={action.label} style={{ marginTop: 8 }}>
            <Text style={{ color: tone, fontWeight: "800", fontSize: 13 }}>{action.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const co = StyleSheet.create({
  wrap: { flexDirection: "row", gap: 10, alignItems: "flex-start", borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
});

export function LoadingState({ text = "Loading…" }: { text?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
      <ActivityIndicator color={c.accentHi} />
      <Text style={{ color: c.faint, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

/** Monospace payload viewer for MQTT frames, JSON state and logs. */
export function CodeBlock({ text, label, maxHeight = 220 }: { text: string; label?: string; maxHeight?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      {!!label && <Text style={{ color: c.faint, fontSize: 11, fontWeight: "800", marginBottom: 5 }}>{label.toUpperCase()}</Text>}
      <View style={{ backgroundColor: c.surfaceHi, borderColor: c.border, borderWidth: 1, borderRadius: 12, maxHeight }}>
        <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text
              selectable
              style={{ color: c.text, fontSize: 12, lineHeight: 18, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
            >
              {text}
            </Text>
          </ScrollView>
        </ScrollView>
      </View>
    </View>
  );
}

/** Read-only value with a copy affordance — for device keys, codes and IDs. */
export function CopyField({ label, value, onCopy, secret }: { label: string; value: string; onCopy?: () => void; secret?: boolean }) {
  const { c } = useTheme();
  const [revealed, setRevealed] = useState(!secret);
  const shown = revealed ? value : "•".repeat(Math.min(24, value.length));
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: c.textDim, fontSize: 12, fontWeight: "700", marginBottom: 6 }}>{label}</Text>
      <View style={[cf.row, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text
          selectable={revealed}
          style={{ flex: 1, color: c.text, fontSize: 13, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
          numberOfLines={1}
        >
          {shown}
        </Text>
        {secret && (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={revealed ? `Hide ${label}` : `Reveal ${label}`}
          >
            <Icon name={revealed ? "eyeOff" : "eye"} size={18} color={c.faint} />
          </Pressable>
        )}
        {onCopy && (
          <Pressable onPress={onCopy} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Copy ${label}`}>
            <Icon name="copy" size={18} color={c.accentHi} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const cf = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46 },
});

/* ---------------------------------------------------------------- misc ---- */

/** Full-width primary action, e.g. the confirm button in a sheet footer. */
export function ActionButton({
  label,
  onPress,
  icon,
  tone,
  busy,
  disabled,
  outline,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  tone?: string;
  busy?: boolean;
  disabled?: boolean;
  outline?: boolean;
}) {
  const { c } = useTheme();
  const bg = tone || c.accent;
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [
        ab.btn,
        outline
          ? { backgroundColor: "transparent", borderWidth: 1.5, borderColor: bg }
          : { backgroundColor: bg, borderWidth: 0 },
        { opacity: off ? 0.5 : pressed ? 0.88 : 1, transform: [{ scale: pressed && !off ? 0.98 : 1 }] },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={outline ? bg : c.onAccent} size="small" />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color={outline ? bg : c.onAccent} />}
          <Text style={{ color: outline ? bg : c.onAccent, fontWeight: "800", fontSize: 15 }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const ab = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 50, borderRadius: 14, paddingHorizontal: 18 },
});

/** Gradient hero band used at the top of module dashboards. */
export function HeroBand({
  label,
  value,
  unit,
  caption,
  right,
  onPress,
}: {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const body = (
    <LinearGradient colors={c.accentGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={hb.band}>
      <View style={{ flex: 1 }}>
        <Text style={hb.label}>{label.toUpperCase()}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 4 }}>
          <Text style={hb.value} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          {!!unit && <Text style={hb.unit}> {unit}</Text>}
        </View>
        {!!caption && (
          <Text style={hb.caption} numberOfLines={1}>
            {caption}
          </Text>
        )}
      </View>
      {right}
    </LinearGradient>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}. ${value} ${unit ?? ""}`}>
      {body}
    </Pressable>
  );
}

const hb = StyleSheet.create({
  band: { borderRadius: 20, padding: 20, flexDirection: "row", alignItems: "center", marginBottom: 16 },
  label: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  value: { color: "#fff", fontSize: 34, fontWeight: "900" },
  unit: { color: "#fff", fontSize: 16, fontWeight: "700" },
  caption: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 2 },
});

/** Top tab strip for module sub-sections. */
export function TabStrip<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={[tb.wrap, { backgroundColor: c.surfaceHi, borderColor: c.border }]}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: active }}
            style={[tb.tab, active && { backgroundColor: c.accent }]}
          >
            {t.icon && <Icon name={t.icon} size={14} color={active ? c.onAccent : c.textDim} />}
            <Text style={{ color: active ? c.onAccent : c.textDim, fontWeight: "800", fontSize: 12.5 }} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const tb = StyleSheet.create({
  wrap: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 4, gap: 4, marginBottom: 14 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 38, borderRadius: 10 },
});

/** Vertical event timeline with severity encoding. */
export function EventTimeline({
  items,
}: {
  items: { id: string; title: string; body?: string; time: string; severity: Severity; icon?: IconName }[];
}) {
  const { c } = useTheme();
  if (!items.length) {
    return (
      <Card padded>
        <Text style={{ color: c.faint, fontSize: 13, textAlign: "center", paddingVertical: 10 }}>No events recorded.</Text>
      </Card>
    );
  }
  return (
    <Card padded>
      {items.map((it, i) => {
        const tone = severityColor(c, it.severity);
        const last = i === items.length - 1;
        return (
          <View key={it.id} style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ alignItems: "center", width: 24 }}>
              <View style={[et.node, { backgroundColor: tone + "22", borderColor: tone }]}>
                <Icon name={it.icon ?? severityIcon(it.severity)} size={11} color={tone} />
              </View>
              {/* The rail is what makes a list read as a sequence rather than
                  as unrelated rows; it must stop at the final node. */}
              {!last && <View style={[et.rail, { backgroundColor: c.border }]} />}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 2 : 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: c.text, fontWeight: "700", fontSize: 14, flex: 1 }} numberOfLines={2}>
                  {it.title}
                </Text>
                <Text style={{ color: c.faint, fontSize: 11 }}>{it.time}</Text>
              </View>
              {!!it.body && (
                <Text style={{ color: c.faint, fontSize: 12.5, marginTop: 2, lineHeight: 17 }} numberOfLines={3}>
                  {it.body}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const et = StyleSheet.create({
  node: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  rail: { width: 2, flex: 1, marginTop: 2 },
});

/** Horizontal capacity/utilisation bar with an optional threshold marker. */
export function CapacityBar({
  value,
  max,
  label,
  unit,
  threshold,
  tint,
}: {
  value: number;
  max: number;
  label?: string;
  unit?: string;
  threshold?: number;
  tint?: string;
}) {
  const { c } = useTheme();
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const over = threshold != null && value >= threshold;
  const tone = tint || (over ? c.red : c.accent);
  return (
    <View style={{ marginBottom: 12 }}>
      {(!!label || !!unit) && (
        <View style={{ flexDirection: "row", marginBottom: 6 }}>
          <Text style={{ color: c.textDim, fontSize: 12, fontWeight: "700", flex: 1 }} numberOfLines={1}>
            {label}
          </Text>
          <Text style={{ color: tone, fontSize: 12, fontWeight: "800" }}>
            {value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            {unit ? ` ${unit}` : ""}
          </Text>
        </View>
      )}
      <View style={{ height: 10, borderRadius: 5, backgroundColor: c.surfaceHi, overflow: "hidden" }}>
        <View style={{ width: `${ratio * 100}%`, height: "100%", backgroundColor: tone, borderRadius: 5 }} />
      </View>
      {threshold != null && max > 0 && (
        <View style={{ height: 0 }}>
          <View
            style={{
              position: "absolute",
              left: `${Math.max(0, Math.min(1, threshold / max)) * 100}%`,
              top: -14,
              width: 2,
              height: 18,
              backgroundColor: c.amber,
            }}
          />
        </View>
      )}
    </View>
  );
}
