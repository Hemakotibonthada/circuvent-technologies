import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Animated,
  Easing,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
  Platform,
  BackHandler,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Svg, { Path, Circle } from "react-native-svg";
import {
  buildPalette,
  ACCENTS,
  type Palette,
  type ThemeMode,
  type Scheme,
  type Grad,
} from "./theme";

// --------------------------------------------------------------- provider ---

interface ThemeCtx {
  c: Palette;
  mode: ThemeMode;
  scheme: Scheme;
  accentKey: string;
  setMode: (m: ThemeMode) => void;
  setScheme: (s: Scheme) => void;
  setAccentKey: (k: string) => void;
  toggleScheme: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const KEY = "cv-theme-v2";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeS] = useState<ThemeMode>("aurora");
  const [scheme, setSchemeS] = useState<Scheme>("light");
  const [accentKey, setAccentKeyS] = useState<string>("coral");

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (!raw) return;
      try {
        const v = JSON.parse(raw) as { mode?: ThemeMode; scheme?: Scheme; accentKey?: string };
        if (v.mode) setModeS(v.mode);
        if (v.scheme) setSchemeS(v.scheme);
        if (v.accentKey) setAccentKeyS(v.accentKey);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const persist = useCallback((next: { mode?: ThemeMode; scheme?: Scheme; accentKey?: string }) => {
    AsyncStorage.setItem(KEY, JSON.stringify({ mode, scheme, accentKey, ...next })).catch(() => {});
  }, [mode, scheme, accentKey]);

  const setMode = useCallback((m: ThemeMode) => { setModeS(m); persist({ mode: m }); }, [persist]);
  const setScheme = useCallback((s: Scheme) => { setSchemeS(s); persist({ scheme: s }); }, [persist]);
  const setAccentKey = useCallback((k: string) => { setAccentKeyS(k); persist({ accentKey: k }); }, [persist]);
  const toggleScheme = useCallback(() => setScheme(scheme === "dark" ? "light" : "dark"), [scheme, setScheme]);

  const c = useMemo(() => buildPalette(mode, scheme, accentKey), [mode, scheme, accentKey]);
  const value = useMemo<ThemeCtx>(
    () => ({ c, mode, scheme, accentKey, setMode, setScheme, setAccentKey, toggleScheme }),
    [c, mode, scheme, accentKey, setMode, setScheme, setAccentKey, toggleScheme]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used within ThemeProvider");
  return v;
}

// ------------------------------------------------------------- primitives ---

/** Full-screen themed background. Glass mode adds soft color blobs behind content. */
/**
 * Handles the Android hardware / gesture "back" press. `handler` returns true
 * when it consumed the event (stay in the app) or false to let the OS handle it
 * (exit). No-op on iOS. Always uses the latest handler without re-subscribing.
 */
export function useBackHandler(handler: () => boolean) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => ref.current());
    return () => sub.remove();
  }, []);
}

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <LinearGradient colors={c.screenGrad} style={[{ flex: 1 }, style]}>
      {c.isGlass && (
        <>
          <View style={[blob.base, { backgroundColor: c.accentHi, top: -60, left: -40 }]} />
          <View style={[blob.base, { backgroundColor: c.violet, bottom: 40, right: -50, opacity: 0.35 }]} />
        </>
      )}
      {children}
    </LinearGradient>
  );
}

const blob = StyleSheet.create({
  base: { position: "absolute", width: 220, height: 220, borderRadius: 130, opacity: 0.4 },
});

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  hi?: boolean; // slightly elevated variant
  padded?: boolean;
}

/** Adaptive surface: frosted glass / neumorphic extrusion / solid aurora card. */
export function Card({ children, style, onPress, hi, padded = true }: CardProps) {
  const { c, scheme } = useTheme();
  const radius = 18;
  const pad = padded ? 16 : 0;
  const Wrapper: React.ComponentType<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = onPress
    ? ({ children: ch, style: st }) => (
        <Pressable onPress={onPress} style={({ pressed }) => [st, pressed && { opacity: 0.88 }]}>
          {ch}
        </Pressable>
      )
    : ({ children: ch, style: st }) => <View style={st}>{ch}</View>;

  if (c.isGlass) {
    return (
      <Wrapper style={[{ borderRadius: radius, overflow: "hidden", borderWidth: 1, borderColor: c.glassBorder }, style]}>
        <BlurView intensity={scheme === "dark" ? 40 : 55} tint={c.glassTint} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: hi ? c.surfaceHi : c.glassFill }]} />
        <View style={{ padding: pad }}>{children}</View>
      </Wrapper>
    );
  }

  if (c.isNeo) {
    return (
      <Wrapper style={style}>
        <View
          style={{
            borderRadius: radius,
            backgroundColor: c.surface,
            shadowColor: c.neoDark,
            shadowOffset: { width: 5, height: 5 },
            shadowOpacity: 1,
            shadowRadius: 8,
            elevation: 5,
          }}
        >
          <View
            style={{
              borderRadius: radius,
              backgroundColor: c.surface,
              padding: pad,
              ...(Platform.OS === "ios"
                ? { shadowColor: c.neoLight, shadowOffset: { width: -5, height: -5 }, shadowOpacity: 1, shadowRadius: 8 }
                : { borderWidth: 1, borderColor: c.borderHi }),
            }}
          >
            {children}
          </View>
        </View>
      </Wrapper>
    );
  }

  // aurora
  return (
    <Wrapper
      style={[
        { borderRadius: radius, backgroundColor: hi ? c.cardHi : c.card, borderWidth: 1, borderColor: c.border, padding: pad },
        style,
      ]}
    >
      {children}
    </Wrapper>
  );
}

/** Primary action button: accent gradient (aurora/glass) or extruded (neo). */
export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  style,
  icon,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: string;
}) {
  const { c } = useTheme();
  const content = busy ? (
    <ActivityIndicator color={c.onAccent} />
  ) : (
    <Text style={{ color: c.onAccent, fontWeight: "800", fontSize: 16 }}>
      {icon ? `${icon}  ` : ""}
      {label}
    </Text>
  );
  if (c.isNeo) {
    return (
      <Pressable onPress={disabled || busy ? undefined : onPress} style={({ pressed }) => [{ opacity: disabled ? 0.5 : 1 }, style]}>
        <View style={{ borderRadius: 14, backgroundColor: c.accent, paddingVertical: 15, alignItems: "center", shadowColor: c.neoDark, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.6, shadowRadius: 7, elevation: 4 }}>
          {content}
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={disabled || busy ? undefined : onPress} style={({ pressed }) => [{ opacity: disabled ? 0.5 : pressed ? 0.9 : 1 }, style]}>
      <LinearGradient colors={c.accentGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: "center" }}>
        {content}
      </LinearGradient>
    </Pressable>
  );
}

/** Subtle bordered button. */
export function GhostButton({ label, onPress, style }: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ borderRadius: 12, borderWidth: 1, borderColor: c.borderHi, paddingVertical: 13, alignItems: "center", opacity: pressed ? 0.85 : 1 }, style]}>
      <Text style={{ color: c.textDim, fontWeight: "700", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ glyph, onPress, style }: { glyph: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 }, style]}>
      <Text style={{ color: c.textDim, fontSize: 17 }}>{glyph}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? c.accent : c.card, borderWidth: 1, borderColor: active ? c.accent : c.border }}>
      <Text style={{ color: active ? c.onAccent : c.textDim, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[{ color: c.faint, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginBottom: 12 }, style]}>{children}</Text>;
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[{ color: c.text, fontSize: 26, fontWeight: "800" }, style]}>{children}</Text>;
}

/** Small labelled stat tile with a gradient glyph pill. */
export function StatTile({ label, value, grad, glyph }: { label: string; value: string; grad: Grad; glyph: string }) {
  const { c } = useTheme();
  return (
    <Card style={{ flex: 1 }} padded>
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        <Text style={{ fontSize: 13 }}>{glyph}</Text>
      </LinearGradient>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: c.faint, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{label}</Text>
    </Card>
  );
}


// --------------------------------------------------------- extended widgets ---

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: 1, backgroundColor: c.border, marginVertical: 12 }, style]} />;
}

export function Skeleton({ width = "100%", height = 18, radius = 12, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const shimmer = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, 180] });
  return (
    <View style={[{ width, height, borderRadius: radius, overflow: "hidden", backgroundColor: c.cardHi }, style]}>
      <Animated.View style={{ width: 90, height: "100%", transform: [{ translateX }], opacity: 0.45, backgroundColor: c.surfaceHi }} />
    </View>
  );
}

export function Badge({ label, color }: { label: string; color?: string }) {
  const { c } = useTheme(); const bg = color ?? c.accent;
  return <View style={{ alignSelf: "flex-start", borderRadius: 999, backgroundColor: bg, paddingHorizontal: 9, paddingVertical: 4 }}><Text style={{ color: c.onAccent, fontSize: 11, fontWeight: "900" }}>{label}</Text></View>;
}

export function ProgressBar({ value, max = 100, color }: { value: number; max?: number; color?: string }) {
  const { c } = useTheme(); const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return <View style={{ height: 10, borderRadius: 999, backgroundColor: c.cardHi, overflow: "hidden", borderWidth: 1, borderColor: c.border }}><View style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 999, backgroundColor: color ?? c.accent }} /></View>;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return <View style={{ flexDirection: "row", padding: 4, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, gap: 4 }}>{options.map((o) => <Pressable key={o} onPress={() => onChange(o)} style={{ flex: 1, borderRadius: 11, paddingVertical: 9, alignItems: "center", backgroundColor: value === o ? c.accent : "transparent" }}><Text style={{ color: value === o ? c.onAccent : c.textDim, fontWeight: "800", textTransform: "capitalize" }}>{o}</Text></Pressable>)}</View>;
}

export function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useTheme(); const [open, setOpen] = useState(false);
  return <Card style={{ marginBottom: 10 }}><Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={{ color: c.text, fontWeight: "900", flex: 1 }}>{title}</Text><Text style={{ color: c.faint, fontSize: 18 }}>{open ? "−" : "+"}</Text></Pressable>{open ? <View style={{ marginTop: 12 }}>{children}</View> : null}</Card>;
}

export function Banner({ kind, text }: { kind: "info" | "success" | "warning" | "error"; text: string }) {
  const { c } = useTheme();
  const color = kind === "success" ? c.green : kind === "warning" ? c.amber : kind === "error" ? c.red : c.cyan;
  return <View style={{ borderRadius: 14, padding: 12, backgroundColor: `${color}22`, borderWidth: 1, borderColor: `${color}66`, marginBottom: 12 }}><Text style={{ color: c.textDim, fontWeight: "700" }}>{text}</Text></View>;
}

export function Avatar({ name, size = 48 }: { name?: string | null; size?: number }) {
  const { c } = useTheme(); const initials = (name || "Circuvent User").split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "CU";
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}><Text style={{ color: c.onAccent, fontWeight: "900", fontSize: Math.max(13, size * 0.36) }}>{initials}</Text></View>;
}

export function ListRow({ icon, title, subtitle, right, onPress }: { icon?: string; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void }) {
  const { c } = useTheme();
  const content = <><Text style={{ fontSize: 22, width: 28 }}>{icon ?? "•"}</Text><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "800" }}>{title}</Text>{subtitle ? <Text style={{ color: c.faint, marginTop: 2 }}>{subtitle}</Text> : null}</View>{right ?? <Text style={{ color: c.faint }}>›</Text>}</>;
  const row = { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, paddingVertical: 12 };
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [row, { opacity: pressed ? 0.8 : 1 }]}>{content}</Pressable> : <View style={row}>{content}</View>;
}

export function FadeInView({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const v = React.useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [delay, v]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>{children}</Animated.View>;
}

export function EmptyState({ glyph = "∅", title, subtitle, actionLabel, onAction }: { glyph?: string; title: string; subtitle?: string; actionLabel?: string; onAction?: () => void }) {
  const { c } = useTheme();
  return <Card style={{ alignItems: "center" }}><Text style={{ fontSize: 34, marginBottom: 8 }}>{glyph}</Text><Text style={{ color: c.text, fontWeight: "900", fontSize: 17 }}>{title}</Text>{subtitle ? <Text style={{ color: c.faint, textAlign: "center", marginTop: 6 }}>{subtitle}</Text> : null}{actionLabel && onAction ? <GhostButton label={actionLabel} onPress={onAction} style={{ marginTop: 14, alignSelf: "stretch" }} /> : null}</Card>;
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return <EmptyState glyph="⚠️" title="Something went wrong" subtitle={text} actionLabel={onRetry ? "Try again" : undefined} onAction={onRetry} />;
}

export function HelpTip({ text }: { text: string }) {
  const { c } = useTheme(); const [open, setOpen] = useState(false);
  return <View style={{ alignSelf: "flex-start" }}><Pressable onPress={() => setOpen((v) => !v)} style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.cardHi, borderWidth: 1, borderColor: c.borderHi }}><Text style={{ color: c.textDim, fontWeight: "900" }}>?</Text></Pressable>{open ? <View style={{ position: "absolute", top: 28, left: 0, width: 220, zIndex: 20, borderRadius: 12, padding: 10, backgroundColor: c.surfaceHi, borderWidth: 1, borderColor: c.borderHi }}><Text style={{ color: c.textDim, fontSize: 12 }}>{text}</Text></View> : null}</View>;
}

export interface ToastMsg { text: string; kind?: "info" | "success" | "warning" | "error" }
export function useToast() {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const show = useCallback((text: string, kind: ToastMsg["kind"] = "info") => setToast({ text, kind }), []);
  const hide = useCallback(() => setToast(null), []);
  return { toast, show, hide };
}
export function ToastHost({ toast, onHide }: { toast: ToastMsg | null; onHide: () => void }) {
  const { c } = useTheme();
  useEffect(() => { if (!toast) return; const t = setTimeout(onHide, 2200); return () => clearTimeout(t); }, [toast, onHide]);
  if (!toast) return null;
  const color = toast.kind === "success" ? c.green : toast.kind === "warning" ? c.amber : toast.kind === "error" ? c.red : c.accent;
  return <Pressable onPress={onHide} style={{ position: "absolute", left: 18, right: 18, bottom: 28, borderRadius: 16, backgroundColor: c.surfaceHi, borderWidth: 1, borderColor: color, padding: 14 }}><Text style={{ color: c.text, fontWeight: "800" }}>{toast.text}</Text></Pressable>;
}


export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number | boolean | null | undefined)[][] }) {
  const { c } = useTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={{ minWidth: 300, borderWidth: 1, borderColor: c.border, borderRadius: 14, overflow: "hidden" }}><View style={{ flexDirection: "row", backgroundColor: c.cardHi }}>{columns.map((col) => <Text key={col} style={{ color: c.text, fontWeight: "900", padding: 10, minWidth: 110 }}>{col}</Text>)}</View>{rows.map((row, i) => <View key={i} style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: c.border }}>{row.map((cell, j) => <Text key={`${i}-${j}`} style={{ color: c.textDim, padding: 10, minWidth: 110 }}>{String(cell ?? "—")}</Text>)}</View>)}</View></ScrollView>;
}

export function Timeline({ items }: { items: { title: string; subtitle?: string; time?: string; color?: string }[] }) {
  const { c } = useTheme();
  return <View>{items.map((it, i) => <View key={`${it.title}-${i}`} style={{ flexDirection: "row", gap: 10 }}><View style={{ alignItems: "center" }}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: it.color ?? c.accent, marginTop: 3 }} />{i < items.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: c.borderHi, minHeight: 34 }} /> : null}</View><View style={{ flex: 1, paddingBottom: 14 }}><Text style={{ color: c.text, fontWeight: "800" }}>{it.title}</Text>{it.subtitle ? <Text style={{ color: c.textDim, marginTop: 2 }}>{it.subtitle}</Text> : null}{it.time ? <Text style={{ color: c.faint, fontSize: 12, marginTop: 3 }}>{it.time}</Text> : null}</View></View>)}</View>;
}

export function Carousel({ children }: { children: React.ReactNode }) {
  return <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{React.Children.map(children, (child, i) => <View key={i} style={{ width: 280 }}>{child}</View>)}</ScrollView>;
}

// --------------------------------------------------------------------------
// Smart-home "coral mockup" signature components: pill power toggle, segmented
// mode selector, room filter chips, scene chip, and an SVG semicircular arc
// gauge for climate/AC target temperature. All consume the active Palette.
// --------------------------------------------------------------------------

/** Rounded capsule power toggle with a white power-glyph thumb (mockup switch). */
export function PillToggle({ value, onChange, size = "md", disabled, style }: { value: boolean; onChange: (v: boolean) => void; size?: "sm" | "md"; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const W = size === "sm" ? 50 : 60;
  const H = size === "sm" ? 28 : 34;
  const knob = H - 6;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[{ width: W, height: H, borderRadius: H, padding: 3, opacity: disabled ? 0.5 : 1, backgroundColor: value ? c.accent : c.cardHi, borderWidth: value ? 0 : 1, borderColor: c.border, flexDirection: "row", justifyContent: value ? "flex-end" : "flex-start", alignItems: "center" }, style]}
    >
      <View style={{ width: knob, height: knob, borderRadius: knob / 2, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: value ? c.accent : c.faint, fontSize: knob * 0.5, fontWeight: "900", marginTop: -1 }}>⏻</Text>
      </View>
    </Pressable>
  );
}

/** Segmented capsule selector (e.g. Cool · Dry · Fan) — coral fill on the active option. */
export function PillSelector<T extends string>({ options, value, onChange, style }: { options: readonly T[]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ flexDirection: "row", gap: 10 }, style]}>
      {options.map((o) => {
        const sel = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} style={{ flex: 1, borderRadius: 20, paddingVertical: 13, alignItems: "center", backgroundColor: sel ? c.accent : c.card, borderWidth: sel ? 0 : 1, borderColor: c.border }}>
            <Text style={{ color: sel ? c.onAccent : c.textDim, fontWeight: sel ? "800" : "600", textTransform: "capitalize" }}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontal room / category filter chips. */
export function RoomChips({ options, value, onChange, style }: { options: string[]; value: number; onChange: (i: number) => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
      {options.map((o, i) => {
        const sel = i === value;
        return (
          <Pressable key={`${o}-${i}`} onPress={() => onChange(i)} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: sel ? c.accent : c.card, borderWidth: sel ? 0 : 1, borderColor: c.border }}>
            <Text style={{ color: sel ? c.onAccent : c.textDim, fontWeight: sel ? "800" : "600" }}>{o}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Round scene / quick-action chip with a glyph bubble + label. */
export function SceneChip({ glyph, label, active, onPress }: { glyph: string; label: string; active?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", width: 68 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: active ? c.accent : c.cardHi, borderWidth: active ? 0 : 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 22 }}>{glyph}</Text>
      </View>
      <Text numberOfLines={1} style={{ color: active ? c.text : c.textDim, fontSize: 11, fontWeight: active ? "800" : "600", marginTop: 6 }}>{label}</Text>
    </Pressable>
  );
}

/** Semicircular SVG arc gauge (climate target dial) with tap-to-set knob. */
export function ArcGauge({ value, min = 16, max = 30, unit = "°", caption = "Temperature", onChange, size = 240 }: { value: number; min?: number; max?: number; unit?: string; caption?: string; onChange?: (v: number) => void; size?: number }) {
  const { c } = useTheme();
  const stroke = 18;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const start = Math.PI;
  const end = Math.PI + Math.PI * frac;
  const pt = (a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const arc = (a0: number, a1: number) => `M ${pt(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(a1)}`;
  const kx = cx + r * Math.cos(end);
  const ky = cy + r * Math.sin(end);
  const svgH = size / 2 + stroke;
  const step = (delta: number) => onChange?.(Math.max(min, Math.min(max, Math.round(value + delta))));
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ height: svgH, width: size }}>
        <Svg width={size} height={svgH}>
          <Path d={arc(Math.PI, 2 * Math.PI)} stroke={c.cardHi} strokeWidth={stroke} strokeLinecap="round" fill="none" />
          <Path d={arc(start, end)} stroke={c.accent} strokeWidth={stroke} strokeLinecap="round" fill="none" />
          <Circle cx={kx} cy={ky} r={stroke * 0.9} fill="#ffffff" />
          <Circle cx={kx} cy={ky} r={stroke * 0.5} fill={c.accent} />
        </Svg>
        <View style={{ position: "absolute", top: svgH - size / 2 + 8, left: 0, right: 0, alignItems: "center" }}>
          <Text style={{ color: c.text, fontSize: 46, fontWeight: "900" }}>{Math.round(value)}<Text style={{ fontSize: 22, color: c.textDim }}>{unit}</Text></Text>
          <Text style={{ color: c.faint, fontSize: 13, fontWeight: "600" }}>{caption}</Text>
        </View>
      </View>
      {onChange && (
        <View style={{ flexDirection: "row", gap: 18, marginTop: 4 }}>
          <Pressable onPress={() => step(-1)} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: c.text, fontSize: 22, fontWeight: "900" }}>−</Text></Pressable>
          <View style={{ minWidth: 60, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: c.faint, fontSize: 11 }}>{min}{unit} – {max}{unit}</Text>
          </View>
          <Pressable onPress={() => step(1)} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}><Text style={{ color: c.onAccent, fontSize: 22, fontWeight: "900" }}>+</Text></Pressable>
        </View>
      )}
    </View>
  );
}
