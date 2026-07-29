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
  StatusBar,
  useWindowDimensions,
  AppState,
  AccessibilityInfo,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Svg, { Path, Circle } from "react-native-svg";
import { Icon, ICONS, type IconName } from "./icons";

const ICON_KEYS: Record<string, true> = Object.fromEntries(Object.keys(ICONS).map((k) => [k, true]));
import {
  buildPalette,
  ACCENTS,
  RADIUS,
  SPACE,
  TYPE,
  ELEV,
  MOTION,
  type Palette,
  type ThemeMode,
  type Scheme,
  type Grad,
} from "./theme";
import { tapLight, toggleFeedback } from "./haptics";

/**
 * Spring press-scale shared by every tappable surface.
 *
 * A flat 0.88-opacity fade was the old feedback and it reads as "disabled" for
 * the ~100ms it lasts. A slight scale-down that springs back reads as physical
 * depression instead, which is what makes a control feel responsive even when
 * the device it commands is a network hop away.
 */
export function usePressScale(active = true) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = useCallback(
    (v: number, bouncy: boolean) => {
      if (!active) return;
      Animated.spring(scale, {
        toValue: v,
        useNativeDriver: true,
        speed: bouncy ? 20 : 40,
        bounciness: bouncy ? 8 : 0,
      }).start();
    },
    [scale, active]
  );
  return {
    scale,
    onPressIn: useCallback(() => to(MOTION.pressScale, false), [to]),
    onPressOut: useCallback(() => to(1, true), [to]),
  };
}

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

/* App default. Glass-on-dark matches the web console and the product artwork.
   The provider only writes to storage on an explicit change, so anything found
   under KEY is a deliberate user choice and always wins over these. */
export const DEFAULT_MODE: ThemeMode = "glass";
export const DEFAULT_SCHEME: Scheme = "dark";
export const DEFAULT_ACCENT = "coral";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeS] = useState<ThemeMode>(DEFAULT_MODE);
  const [scheme, setSchemeS] = useState<Scheme>(DEFAULT_SCHEME);
  const [accentKey, setAccentKeyS] = useState<string>(DEFAULT_ACCENT);

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

/**
 * Safe-area insets.
 *
 * Screens previously hardcoded `paddingTop: 56` and `bottom: Platform.OS ===
 * "ios" ? 30 : 16`, which is right on exactly one device: too little clearance
 * under a tall Android status bar, too much on a compact phone, and it lets the
 * floating nav collide with the iOS home indicator.
 *
 * `react-native-safe-area-context` would report exact insets, but adding a
 * native module to this bare workflow (there is a checked-in android/ project)
 * forces a full rebuild of the app binary. These values come from the platform
 * where it can tell us — Android reports the real status-bar height — and fall
 * back to Apple's published notch/home-indicator metrics keyed off screen
 * height, which is the standard heuristic and is correct on every shipping
 * iPhone.
 */
export function useSafeArea(): { top: number; bottom: number } {
  const { height, width } = useWindowDimensions();
  return useMemo(() => {
    if (Platform.OS === "android") {
      return { top: StatusBar.currentHeight ?? 24, bottom: 0 };
    }
    // iPhone X and later are >= 812pt tall in portrait (or wide in landscape).
    const notched = Math.max(height, width) >= 812;
    return notched ? { top: 44, bottom: 34 } : { top: 20, bottom: 0 };
  }, [height, width]);
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
  const radius = RADIUS.card;
  const pad = padded ? SPACE.lg : 0;
  const press = usePressScale(!!onPress);
  const Wrapper: React.ComponentType<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = onPress
    ? ({ children: ch, style: st }) => (
        <Pressable
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
        >
          {/* The visual style lives on the animated node so the whole surface
              depresses, not just its contents. */}
          <Animated.View style={[st, { transform: [{ scale: press.scale }] }]}>{ch}</Animated.View>
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
  const press = usePressScale(!disabled && !busy);
  const content = busy ? (
    <ActivityIndicator color={c.onAccent} />
  ) : (
    <Text style={{ color: c.onAccent, fontWeight: "800", fontSize: 16, letterSpacing: -0.2 }}>
      {icon ? `${icon}  ` : ""}
      {label}
    </Text>
  );
  const fire = () => { tapLight(); onPress(); };
  if (c.isNeo) {
    return (
      <Pressable onPress={disabled || busy ? undefined : fire} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityState={{ disabled: !!disabled, busy: !!busy }} style={({ pressed }) => [{ opacity: disabled ? 0.5 : 1 }, style]}>
        <Animated.View style={{ transform: [{ scale: press.scale }], borderRadius: RADIUS.control, backgroundColor: c.accent, paddingVertical: 16, alignItems: "center", justifyContent: "center", minHeight: 52, shadowColor: c.neoDark, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.6, shadowRadius: 7, elevation: 4 }}>
          {content}
        </Animated.View>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={disabled || busy ? undefined : fire} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityState={{ disabled: !!disabled, busy: !!busy }} style={[{ opacity: disabled ? 0.5 : 1 }, style]}>
      <Animated.View style={{ transform: [{ scale: press.scale }], borderRadius: RADIUS.control, overflow: "hidden" }}>
        <LinearGradient colors={c.accentGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center", minHeight: 52 }}>
          {content}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

/** Subtle bordered button. */
export function GhostButton({ label, onPress, style }: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { tapLight(); onPress(); }} accessibilityRole="button" style={({ pressed }) => [{ borderRadius: RADIUS.control, borderWidth: 1, borderColor: c.borderHi, paddingVertical: 14, minHeight: 48, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 }, style]}>
      <Text style={{ color: c.text, fontWeight: "700", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Legacy glyph → semantic icon.
 *
 * Roughly thirty screens were written with `<IconButton glyph="‹" />` and
 * friends. Mapping the handful of glyphs actually in use lets every one of
 * those call sites render a real vector icon — correctly sized, tinted with the
 * palette and identical across platforms — without touching the screens.
 */
const LEGACY_GLYPH: Record<string, IconName> = {
  "‹": "back",
  "<": "back",
  "›": "chevron",
  "🔍": "search",
  "＋": "add",
  "+": "add",
  "🔔": "bell",
  "✕": "close",
  "×": "close",
  "⚙️": "settings",
  "🔄": "refresh",
};

export function IconButton({
  icon,
  glyph,
  onPress,
  label,
  style,
}: {
  icon?: IconName;
  /** @deprecated pass `icon` — kept so existing screens keep working. */
  glyph?: string;
  onPress: () => void;
  /** Announced by screen readers. Icon-only controls are meaningless without it. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const resolved = icon ?? (glyph ? LEGACY_GLYPH[glyph] : undefined);
  return (
    <Pressable
      onPress={() => { tapLight(); onPress(); }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label ?? (resolved ? resolved.replace(/-/g, " ") : undefined)}
      android_ripple={{ color: c.borderHi, borderless: true, radius: 24 }}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: RADIUS.pill,
          backgroundColor: c.card,
          borderColor: c.border,
          borderWidth: 1,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.75 : 1,
          transform: [{ scale: pressed ? MOTION.pressScale : 1 }],
        },
        style,
      ]}
    >
      {resolved ? (
        <Icon name={resolved} size={20} color={c.textDim} />
      ) : (
        <Text style={{ color: c.textDim, fontSize: 17 }}>{glyph}</Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress ? () => { tapLight(); onPress(); } : undefined}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      hitSlop={6}
      style={{ minHeight: 38, justifyContent: "center", paddingHorizontal: SPACE.lg, paddingVertical: 9, borderRadius: RADIUS.pill, backgroundColor: active ? c.accent : c.card, borderWidth: 1, borderColor: active ? c.accent : c.border }}
    >
      <Text style={{ color: active ? c.onAccent : c.textDim, fontWeight: "700", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  // Was 12px uppercase with 1.5 letter-spacing. Micro-caps read as an admin
  // panel; sentence case at a legible size reads as a home screen.
  return <Text style={[{ color: c.text, ...TYPE.section, marginBottom: SPACE.md }, style]}>{children}</Text>;
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[{ color: c.text, ...TYPE.title }, style]}>{children}</Text>;
}

/** Small labelled stat tile with a gradient icon pill. */
export function StatTile({ label, value, grad, glyph, icon }: { label: string; value: string; grad: Grad; glyph?: string; icon?: IconName }) {
  const { c } = useTheme();
  const resolved = icon ?? (glyph && glyph in ICON_KEYS ? (glyph as IconName) : undefined);
  return (
    <Card style={{ flex: 1 }} padded>
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 32, height: 32, borderRadius: RADIUS.chip, alignItems: "center", justifyContent: "center", marginBottom: SPACE.md }}>
        {resolved ? <Icon name={resolved} size={17} color="#fff" /> : <Text style={{ fontSize: 13 }}>{glyph}</Text>}
      </LinearGradient>
      <Text style={{ color: c.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 }} adjustsFontSizeToFit numberOfLines={1}>{value}</Text>
      <Text style={{ color: c.textDim, ...TYPE.label, marginTop: 3 }}>{label}</Text>
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
  return (
    <View style={{ flexDirection: "row", padding: 3, borderRadius: RADIUS.pill, backgroundColor: c.cardHi, borderWidth: 1, borderColor: c.border, gap: 2 }}>
      {options.map((o) => {
        const on = value === o;
        return (
          <Pressable
            key={o}
            onPress={() => { if (!on) { tapLight(); onChange(o); } }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, borderRadius: RADIUS.pill, paddingVertical: 10, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.accent : "transparent" }}
          >
            <Text numberOfLines={1} style={{ color: on ? c.onAccent : c.textDim, fontSize: 14, fontWeight: "700", textTransform: "capitalize" }}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
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

export function ListRow({ icon, title, subtitle, right, onPress }: { icon?: IconName | string; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void }) {
  const { c } = useTheme();
  const resolved = icon && icon in ICON_KEYS ? (icon as IconName) : undefined;
  const content = (
    <>
      <View style={{ width: 28, alignItems: "center" }}>
        {resolved ? <Icon name={resolved} size={20} color={c.textDim} /> : <Text style={{ fontSize: 22 }}>{icon ?? "•"}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: "800" }}>{title}</Text>
        {subtitle ? <Text style={{ color: c.faint, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {right ?? <Icon name="chevron" size={16} color={c.faint} />}
    </>
  );
  const row = { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, paddingVertical: 12, minHeight: 44 };
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} android_ripple={{ color: c.border }} style={({ pressed }) => [row, { opacity: pressed ? 0.8 : 1 }]}>{content}</Pressable>
  ) : (
    <View style={row}>{content}</View>
  );
}

export function FadeInView({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const v = React.useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();
  useEffect(() => {
    if (reduce) { v.setValue(1); return; }
    Animated.timing(v, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [delay, v, reduce]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>{children}</Animated.View>;
}

/**
 * Whether the user has asked the OS to reduce motion. Entrance animations and
 * count-ups jump straight to their final state when this is on — vestibular
 * disorders make sliding/scaling content genuinely unpleasant, and it is a
 * WCAG 2.1 requirement rather than a nicety.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduce(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}

/**
 * Staggered entrance for a grid or list.
 *
 * The delay is capped so a long list does not leave the last card fading in a
 * second and a half after the first — past ~8 items the wave reads as lag
 * rather than polish.
 */
export function Stagger({ index, children, step = 45, max = 8 }: { index: number; children: React.ReactNode; step?: number; max?: number }) {
  return <FadeInView delay={Math.min(index, max) * step}>{children}</FadeInView>;
}

/**
 * A number that animates to its new value.
 *
 * Live telemetry that snaps between readings is hard to follow — the eye can't
 * tell a re-render from a real change. Interpolating makes the direction of
 * travel legible.
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 650,
  style,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  style?: StyleProp<TextStyle>;
}) {
  const reduce = useReduceMotion();
  const anim = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (reduce) {
      anim.setValue(value);
      setShown(value);
      return;
    }
    const id = anim.addListener(({ value: v }) => setShown(v));
    const a = Animated.timing(anim, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      // Text content lives on the JS thread; there is no native equivalent.
      useNativeDriver: false,
    });
    a.start();
    return () => {
      a.stop();
      anim.removeListener(id);
    };
  }, [value, duration, reduce, anim]);

  return <Text style={style}>{shown.toFixed(decimals)}</Text>;
}

/**
 * True while the app is in the foreground.
 *
 * Dashboard polling used to keep firing on a bare `setInterval` after the user
 * switched away, burning battery and mobile data to refresh a screen nobody was
 * looking at — and then showed stale numbers on return anyway.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);
  return active;
}

export function EmptyState({ glyph, icon = "empty", title, subtitle, actionLabel, onAction }: { glyph?: string; icon?: IconName; title: string; subtitle?: string; actionLabel?: string; onAction?: () => void }) {
  const { c } = useTheme();
  return (
    <Card style={{ alignItems: "center" }}>
      {glyph ? <Text style={{ fontSize: 34, marginBottom: 8 }}>{glyph}</Text> : <Icon name={icon} size={34} color={c.faint} style={{ marginBottom: 8 }} />}
      <Text style={{ color: c.text, fontWeight: "900", fontSize: 17 }}>{title}</Text>
      {subtitle ? <Text style={{ color: c.faint, textAlign: "center", marginTop: 6 }}>{subtitle}</Text> : null}
      {actionLabel && onAction ? <GhostButton label={actionLabel} onPress={onAction} style={{ marginTop: 14, alignSelf: "stretch" }} /> : null}
    </Card>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return <EmptyState icon="alert" title="Something went wrong" subtitle={text} actionLabel={onRetry ? "Try again" : undefined} onAction={onRetry} />;
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
  const travel = W - knob - 6;
  // Sliding the thumb instead of snapping it between flex alignments is what
  // makes the control read as a physical switch rather than a redrawn image.
  const pos = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(pos, { toValue: value ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  }, [value, pos]);
  const translateX = pos.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        // Fires before the parent's state update so the tick lands with the
        // tap, not after the command round-trips.
        toggleFeedback(!value);
        onChange(!value);
      }}
      style={[{ width: W, height: H, borderRadius: H, padding: 3, opacity: disabled ? 0.5 : 1, backgroundColor: value ? c.accent : c.cardHi, borderWidth: value ? 0 : 1, borderColor: c.border, justifyContent: "center" }, style]}
    >
      <Animated.View style={{ width: knob, height: knob, borderRadius: knob / 2, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", transform: [{ translateX }] }}>
        <Icon name="power" size={knob * 0.55} color={value ? c.accent : c.faint} />
      </Animated.View>
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
          <Pressable key={o} onPress={() => { if (o !== value) { tapLight(); onChange(o); } }} accessibilityRole="button" accessibilityState={{ selected: sel }} style={{ flex: 1, borderRadius: RADIUS.pill, paddingVertical: 13, minHeight: 46, alignItems: "center", justifyContent: "center", backgroundColor: sel ? c.accent : c.card, borderWidth: sel ? 0 : 1, borderColor: c.border }}>
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
          <Pressable key={`${o}-${i}`} onPress={() => { if (i !== value) { tapLight(); onChange(i); } }} accessibilityRole="button" accessibilityState={{ selected: sel }} style={{ paddingHorizontal: 18, paddingVertical: 11, minHeight: 42, justifyContent: "center", borderRadius: RADIUS.pill, backgroundColor: sel ? c.accent : c.card, borderWidth: sel ? 0 : 1, borderColor: c.border }}>
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
