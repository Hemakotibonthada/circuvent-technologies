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
  PanResponder,
  StatusBar,
  useWindowDimensions,
  Dimensions,
  AppState,
  AccessibilityInfo,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { NEO, NEO_SMALL, shadowLayers, withAlpha, type NeoSpec } from "./neo";
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

/* App defaults.
 *
 * Android opens on neumorphism, everything else on glass.
 *
 * That split is deliberate rather than a preference. Glass depends on a real
 * backdrop blur: on iOS that is BlurView over live content, and it is what
 * makes the frosted panels read as glass at all. Android's blur support is
 * uneven across versions and GPUs, and where it degrades the same design
 * flattens into translucent grey rectangles — the style loses the one effect
 * it is built on.
 *
 * Neo does not need a backdrop. Its depth comes from a light shadow up-left and
 * a dark one down-right, which NeoShadows paints as stacked layers rather than
 * relying on `elevation` (Android casts only one downward shadow, at a colour
 * the platform picks, so the highlight that reads as "raised" is unavailable
 * to it). Painted layers render identically on every Android version.
 *
 * The provider only writes to storage on an explicit change, so anything found
 * under KEY is a deliberate user choice and always wins over these. */
export const DEFAULT_MODE: ThemeMode = Platform.OS === "android" ? "neo" : "glass";
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
  return useSafeAreaImpl();
}

/**
 * Android: the answer does not depend on the window at all.
 *
 * This matters more than it looks. `useSafeArea` is called by Shell, which
 * wraps the whole app — and on Android the soft keyboard resizes the window.
 * Subscribing to window dimensions here therefore re-rendered every screen on
 * every keyboard open, close, and height change (the suggestion strip alone
 * changes it twice per word), which made typing visibly unsmooth in every text
 * field in the app.
 *
 * Splitting the implementation at module load rather than branching inside one
 * hook keeps the hook order consistent while letting Android subscribe to
 * nothing.
 */
function useSafeAreaAndroid(): { top: number; bottom: number } {
  return useMemo(() => ({ top: StatusBar.currentHeight ?? 24, bottom: 0 }), []);
}

/**
 * iOS: depends only on whether the device has a notch, which the keyboard
 * cannot change — iOS overlays the keyboard instead of resizing the window.
 * Memoised on that boolean rather than on the raw dimensions so the returned
 * object keeps its identity across rotation-free re-renders.
 */
function useSafeAreaIOS(): { top: number; bottom: number } {
  const { height, width } = useWindowDimensions();
  // iPhone X and later are >= 812pt tall in portrait (or wide in landscape).
  const notched = Math.max(height, width) >= 812;
  return useMemo(
    () => (notched ? { top: 44, bottom: 34 } : { top: 20, bottom: 0 }),
    [notched]
  );
}

const useSafeAreaImpl = Platform.OS === "android" ? useSafeAreaAndroid : useSafeAreaIOS;

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

/**
 * Placeholder rows for a list that has not loaded yet.
 *
 * Screens that only had an empty state showed "No devices yet" for the whole
 * first fetch, so a working app looked like an empty one every cold start and a
 * slow network made it look broken. Showing the shape of the content instead
 * says "this is arriving" without claiming anything about what will be there.
 *
 * Marked as a busy element for assistive tech, so a screen reader announces
 * that the list is loading rather than reading out a row of blank boxes.
 */
export function ListSkeleton({
  rows = 4,
  height = 76,
  columns = 1,
}: {
  rows?: number;
  height?: number;
  columns?: number;
}) {
  const items = Array.from({ length: rows * columns });
  return (
    <View
      accessible
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}
    >
      {items.map((_, i) => (
        <Skeleton
          key={i}
          height={height}
          width={columns > 1 ? `${Math.floor(100 / columns) - 2}%` : "100%"}
          radius={18}
          style={{ marginBottom: 12, opacity: 0.5 }}
        />
      ))}
    </View>
  );
}

/* ------------------------------------------------------- neumorphism --- */

/**
 * Blends two hex colours. `t` of 0 returns `a`, 1 returns `b`.
 *
 * Used to derive neumorphic surface gradients from the palette's existing
 * shadow pair, so a new accent or scheme needs no extra colours defined.
 */
function mixHex(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const s = h.replace("#", "");
    const full = s.length === 3 ? s.split("").map((ch) => ch + ch).join("") : s;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const k = Math.max(0, Math.min(1, t));
  const to2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${to2(r1 + (r2 - r1) * k)}${to2(g1 + (g2 - g1) * k)}${to2(b1 + (b2 - b1) * k)}`;
}


/**
 * The two soft shadows that make a neumorphic surface look extruded.
 *
 * Android has no blur to lend us. `elevation` is one grey drop shadow whose
 * colour and direction belong to the platform; the installed react-native-svg
 * ships no filter elements, so there is no feGaussianBlur either; expo-blur
 * blurs what is behind a view, which is a different thing. So the falloff is
 * built: the same rounded rectangle drawn several times, each slightly larger
 * and more transparent, so the accumulated alpha is a gradient of light rather
 * than a band of colour. See ./neo, where the geometry is tested.
 *
 * These are plain Views. They cannot silently fail to render, which two
 * previous attempts here both managed to do.
 */
function NeoShadows({ radius, c, spec }: { radius: number; c: Palette; spec: NeoSpec }) {
  /*
   * The light half is drawn second so it wins where the two overlap — which is
   * what a single lamp above and to the left actually produces.
   */
  const halves: { dir: 1 | -1; hex: string }[] = [
    { dir: 1, hex: c.neoDark },
    { dir: -1, hex: c.neoLight },
  ];

  return (
    <>
      {halves.map(({ dir, hex }) =>
        shadowLayers(dir, radius, spec).map((l, i) => (
          <View
            key={`${dir}-${i}`}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: l.left,
              top: l.top,
              right: l.right,
              bottom: l.bottom,
              borderRadius: l.borderRadius,
              backgroundColor: withAlpha(hex, l.opacity),
            }}
          />
        ))
      )}
    </>
  );
}

/**
 * A surface that looks extruded, on whichever platform is asking.
 *
 * Card and PrimaryButton each grew their own copy of the iOS/Android split, and
 * everything else — chips, tabs, toggles, the KPI tiles — simply had none, so
 * in neo they were flat rectangles sitting in the middle of a style whose whole
 * premise is that surfaces are raised out of the background. This is that split
 * written once.
 *
 * Layout-neutral by construction: the shadow halves are absolutely positioned,
 * so wrapping an existing control in this adds no size and shifts nothing.
 */
function NeoRaised({
  radius,
  c,
  spec = NEO,
  style,
  children,
}: {
  radius: number;
  c: Palette;
  spec?: NeoSpec;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (Platform.OS === "ios") {
    // Real shadows, in any colour, for free. Nothing here needs imitating.
    return (
      <View
        style={[
          {
            borderRadius: radius,
            backgroundColor: c.surface,
            shadowColor: c.neoDark,
            shadowOffset: { width: spec.depth, height: spec.depth },
            shadowOpacity: 1,
            shadowRadius: spec.blur,
          },
          style,
        ]}
      >
        <View
          style={{
            borderRadius: radius,
            backgroundColor: c.surface,
            shadowColor: c.neoLight,
            shadowOffset: { width: -spec.depth, height: -spec.depth },
            shadowOpacity: 1,
            shadowRadius: spec.blur,
          }}
        >
          {children}
        </View>
      </View>
    );
  }

  /*
   * The shadows sit behind the children and reach outside this View's box.
   * Nothing on the way up may set `overflow: "hidden"`, or the soft edge is
   * cut back to a straight line and the surface looks bevelled again.
   */
  return (
    <View style={style}>
      <NeoShadows radius={radius} c={c} spec={spec} />
      {children}
    </View>
  );
}



/**
 * A circular, glowing icon button.
 *
 * The shape the reference designs lean on: a ring of these, one per light or
 * per device, where the lit one is unmistakable from across a room. It reads
 * faster than a list because state is carried by the whole shape — fill, ring,
 * halo — rather than by a small switch at the edge.
 */
export function GlowTile({
  icon,
  label,
  sub,
  on,
  accent,
  onPress,
  size = 62,
  disabled,
}: {
  icon: IconName;
  label?: string;
  sub?: string;
  on: boolean;
  accent: string;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", width: size + 18 }}>
      <Pressable
        onPress={() => { if (!disabled) { toggleFeedback(!on); onPress(); } }}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityState={{ checked: on, disabled: !!disabled }}
        accessibilityLabel={`${label ?? "Device"}, ${on ? "on" : "off"}`}
        style={({ pressed }) => [
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: on ? accent : c.border,
            backgroundColor: on ? accent + "26" : c.card,
            // The halo is what makes a lit tile read as lit rather than merely
            // selected. Android needs elevation for any shadow at all.
            shadowColor: accent,
            shadowOpacity: on ? 0.6 : 0,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 0 },
            elevation: on ? 8 : 0,
            opacity: pressed ? 0.75 : disabled ? 0.45 : 1,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
        ]}
      >
        <Icon name={icon} size={size * 0.42} color={on ? accent : c.faint} />
      </Pressable>
      {!!label && (
        <Text numberOfLines={1} style={{ color: on ? c.text : c.textDim, fontSize: 12, fontWeight: "700", marginTop: 7 }}>
          {label}
        </Text>
      )}
      {!!sub && (
        <Text numberOfLines={1} style={{ color: c.faint, fontSize: 10, marginTop: 1 }}>{sub}</Text>
      )}
    </View>
  );
}

/**
 * Preset percentages for a dimmable output.
 *
 * A slider is precise and slow. Almost every real adjustment is one of a
 * handful of levels, so those get one tap each and the slider stays underneath
 * for the times it genuinely matters.
 */
export function PresetRow({
  values,
  current,
  onPick,
  accent,
  suffix = "%",
}: {
  values: number[];
  current: number;
  onPick: (v: number) => void;
  accent: string;
  suffix?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {values.map((v) => {
        // Nearest-preset highlighting: an exact match almost never happens once
        // the slider has been touched, and highlighting nothing looks broken.
        const sel = values.reduce((best, x) => (Math.abs(x - current) < Math.abs(best - current) ? x : best), values[0]) === v;
        return (
          <Pressable
            key={v}
            onPress={() => { tapLight(); onPick(v); }}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={`Set to ${v}${suffix}`}
            style={({ pressed }) => [
              {
                flex: 1,
                minHeight: 46,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: sel ? accent : c.border,
                backgroundColor: sel ? accent + "22" : c.card,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={{ color: sel ? accent : c.textDim, fontWeight: sel ? "800" : "600", fontSize: 14 }}>
              {v}{suffix}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Room filter chips already exist further down as `RoomChips` (index-based). */

/* ------------------------------------------------------- device motion --- */

/**
 * How a device type should animate while it is on.
 *
 * Tied to what the thing physically does, not to decoration: a fan spins
 * because the real fan spins, and a light glows because the real light glows.
 * Motion that means something is worth the battery; motion that is only
 * pretty is not.
 */
export type DeviceMotion = "spin" | "glow" | "none";

export function deviceMotion(type: string): DeviceMotion {
  switch (type) {
    case "smart-fan":
    case "fan":
    case "ceiling-fan":
      return "spin";
    case "smart-light":
    case "light":
    case "smart-plug":
    case "smart-switch":
    case "touchboard":
    case "home-hub":
    case "sentinel":
      return "glow";
    default:
      return "none";
  }
}

/**
 * A continuous rotation, running only while `active`.
 *
 * Stopped and reset when inactive rather than left looping behind an opacity
 * of zero: an animation nobody can see still wakes the UI thread, and a grid of
 * device tiles would keep a phone busy for nothing.
 *
 * Honours the OS "reduce motion" setting, which people enable because spinning
 * things make them ill — a spinning fan icon is exactly what that setting is
 * for.
 */
export function useSpin(active: boolean, durationMs = 2600) {
  const spin = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (!active || reduceMotion) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, durationMs, spin]);

  return spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
}

/**
 * A slow breathing opacity for lights that are on.
 *
 * Deliberately shallow (0.55 to 1) and slow. A hard blink reads as an alert;
 * this should read as "lit".
 */
export function useGlowPulse(active: boolean) {
  const v = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (!active || reduceMotion) {
      v.stopAnimation();
      v.setValue(active ? 1 : 0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.55, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, v]);

  return v;
}

/* ------------------------------------------------------------ time picker --- */

/** "07:05" → 425. Returns null for anything that is not HH:MM. */
function parseHm(v: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const toHm = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
/** 425 → "7:05 AM". The 24-hour string stays the stored value. */
export function friendlyTime(v: string): string {
  const mins = parseHm(v);
  if (mins == null) return v;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * A time field you can use with a thumb.
 *
 * It replaced a bare TextInput that wanted "HH:MM" in 24-hour. That asks the
 * user to know the format, to do the 24-hour conversion in their head, and to
 * type accurately on a numeric keyboard — for setting a lamp to come on in the
 * evening. It also failed validation silently often enough to be irritating.
 *
 * Steps rather than free text, so an invalid time cannot be entered at all.
 * Minutes move in fives because nobody schedules a porch light for 18:37, and
 * five-minute steps make crossing an hour two taps instead of twelve.
 *
 * The value stays a 24-hour "HH:MM" string, because that is what the automation
 * API and the firmware already speak; only the display is 12-hour.
 */
export function TimePicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const { c } = useTheme();
  const mins = parseHm(value) ?? 7 * 60;
  const bump = (delta: number) => { tapLight(); onChange(toHm(mins + delta)); };

  const Step = ({ dir, amount, a11y }: { dir: "up" | "down"; amount: number; a11y: string }) => (
    <Pressable
      onPress={() => bump(dir === "up" ? amount : -amount)}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={6}
      style={({ pressed }) => [tp.step, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name={dir === "up" ? "collapse" : "expand"} size={18} color={c.textDim} />
    </Pressable>
  );

  return (
    <View>
      {!!label && <Text style={{ color: c.textDim, fontSize: 13, marginBottom: 8 }}>{label}</Text>}
      <View style={[tp.row, { backgroundColor: c.cardHi, borderColor: c.border }]}>
        <View style={tp.col}>
          <Step dir="up" amount={60} a11y="Later by one hour" />
          <Text style={[tp.num, { color: c.text }]}>{String(Math.floor(mins / 60) % 12 || 12).padStart(2, "0")}</Text>
          <Step dir="down" amount={60} a11y="Earlier by one hour" />
        </View>
        <Text style={[tp.num, { color: c.faint, marginHorizontal: 2 }]}>:</Text>
        <View style={tp.col}>
          <Step dir="up" amount={5} a11y="Later by five minutes" />
          <Text style={[tp.num, { color: c.text }]}>{String(mins % 60).padStart(2, "0")}</Text>
          <Step dir="down" amount={5} a11y="Earlier by five minutes" />
        </View>
        <Pressable
          onPress={() => bump(720)}
          accessibilityRole="button"
          accessibilityLabel={`Switch to ${Math.floor(mins / 60) < 12 ? "PM" : "AM"}`}
          style={({ pressed }) => [tp.ampm, { backgroundColor: c.accent, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={{ color: c.onAccent, fontWeight: "800", fontSize: 15 }}>
            {Math.floor(mins / 60) < 12 ? "AM" : "PM"}
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {[
          ["Morning", 7 * 60],
          ["Evening", 18 * 60 + 30],
          ["Night", 22 * 60],
        ].map(([name, m]) => (
          <Pressable
            key={String(name)}
            onPress={() => { tapLight(); onChange(toHm(Number(m))); }}
            accessibilityRole="button"
            accessibilityLabel={`Set to ${friendlyTime(toHm(Number(m)))}`}
            style={({ pressed }) => [
              tp.preset,
              { borderColor: mins === m ? c.accent : c.border, backgroundColor: mins === m ? c.accent + "22" : c.card, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={{ color: mins === m ? c.accentHi : c.textDim, fontWeight: "700", fontSize: 13 }}>{name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const tp = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 16, paddingVertical: 12 },
  col: { alignItems: "center", gap: 4 },
  // 44pt targets: these get tapped repeatedly, often one-handed.
  step: { width: 52, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  num: { fontSize: 34, fontWeight: "800", fontVariant: ["tabular-nums"], minWidth: 52, textAlign: "center" },
  ampm: { marginLeft: 10, minHeight: 44, minWidth: 56, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  preset: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 20, borderWidth: 1 },
});

/* ------------------------------------------------------- screen headers --- */

/**
 * Whether screens draw their own back control.
 *
 * Turned off: navigation is by gesture. Android sends its system back to
 * `useBackHandler`, and iOS gets the left-edge swipe from `SwipeBack`, which is
 * wired at every level that keeps a stack — Shell for tabs and overlays, More
 * for its own sub-screens. A drawn back arrow on top of that is redundant
 * chrome in the hardest corner of a tall phone to reach.
 *
 * The components still exist and still take their props, so this is one line to
 * reverse. Nothing was deleted from thirty screens to make it happen.
 *
 * The cost, stated plainly: gesture-only navigation is weaker for assistive
 * tech. Android's system back is exposed to accessibility services, and iOS
 * VoiceOver has the two-finger scrub, so there is a route on both — but a
 * labelled button is easier than either. If that becomes a complaint, flip
 * this back on.
 */
export const SHOW_BACK_BUTTONS = false;

/**
 * The standard "go back" control.
 *
 * Screens each rolled their own — a bare `‹` glyph in a Text with `hitSlop={8}`,
 * or the string "‹ Devices". Two problems came with that. The tap target was
 * roughly 20pt where the platform guidance is 44, which is genuinely hard to
 * hit one-handed at the top of a tall phone; and a screen reader announced the
 * glyph itself, so the control was read out as "left single angle quotation
 * mark" instead of "Back".
 *
 * The label is optional and shown next to the chevron when present, which keeps
 * the useful "‹ Devices" affordance without it being the only thing that makes
 * the button findable.
 */
export function BackButton({
  onPress,
  label,
  accessibilityLabel,
}: {
  onPress: () => void;
  label?: string;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  if (!SHOW_BACK_BUTTONS) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (label ? `Back to ${label}` : "Back")}
      hitSlop={8}
      style={({ pressed }) => [
        hdr.back,
        { opacity: pressed ? 0.55 : 1, paddingRight: label ? 12 : 0 },
      ]}
    >
      <Icon name="back" size={24} color={c.textDim} />
      {!!label && (
        <Text style={{ color: c.textDim, fontSize: 16, marginLeft: 2 }} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * A round icon button for a screen header.
 *
 * `accessibilityLabel` is required rather than optional: an icon-only control
 * with no label is invisible to a screen reader, and making it easy to omit is
 * how every one of them ended up unlabelled.
 */
export function HeaderAction({
  icon,
  onPress,
  accessibilityLabel,
  tint,
  selected,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  tint?: string;
  selected?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected == null ? undefined : { selected }}
      hitSlop={6}
      style={({ pressed }) => [hdr.action, { opacity: pressed ? 0.55 : 1 }]}
    >
      <Icon name={icon} size={22} color={tint ?? c.textDim} />
    </Pressable>
  );
}

const hdr = StyleSheet.create({
  // 44pt is the documented minimum comfortable target on both platforms, and
  // these sit in the top corners where reach is worst.
  back: { minHeight: 44, minWidth: 44, flexDirection: "row", alignItems: "center" },
  action: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
});

/* ------------------------------------------------------------ swipe back --- */

/** How far in from the left edge a drag has to start to count as "go back". */
const EDGE_WIDTH = 28;
/** Fraction of the screen to cross before the release completes the dismissal. */
const COMMIT_FRACTION = 0.32;
/** A fast flick counts even if it never crossed that distance. */
const COMMIT_VELOCITY = 0.4;

/**
 * Edge-swipe to go back, for iOS.
 *
 * Navigation in this app is hand-rolled state in Shell.tsx rather than a
 * navigator, so nothing provided this for free. Android was fine because
 * `useBackHandler` catches the hardware and gesture back the OS already sends;
 * iOS has no such button and no system-wide equivalent, so every sub-screen was
 * a dead end unless the user found the on-screen back arrow. That is the
 * feature gap between the two platforms.
 *
 * Built on the core PanResponder rather than react-native-gesture-handler: this
 * project has neither gesture-handler nor reanimated installed, and adding
 * native modules to a bare workflow means another prebuild and another round of
 * signing — a poor trade when the phone build has only just started working.
 *
 * Only armed for drags that BEGIN within EDGE_WIDTH of the left edge and are
 * clearly horizontal. Anything looser would fight the horizontal ScrollViews on
 * Home, the brightness and speed sliders on Control, and the camera viewport.
 *
 * Android is deliberately excluded: its own back gesture already reaches
 * `useBackHandler`, and reacting to both would go back twice from one swipe.
 */
export function SwipeBack({
  onBack,
  enabled = true,
  children,
  style,
}: {
  onBack: () => void;
  enabled?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const tx = useRef(new Animated.Value(0)).current;
  const active = Platform.OS === "ios" && enabled;

  // Deliberately NOT useWindowDimensions().
  //
  // This component wraps every screen in the app, and on Android the soft
  // keyboard resizes the window — so subscribing here re-rendered the entire
  // screen each time the keyboard opened, closed, or changed height for a
  // suggestion strip. Typing became visibly unsmooth everywhere there was a
  // text field, which is exactly the regression that followed adding this.
  //
  // The width is only needed once, when a drag is released, so it is read then.
  const widthAt = () => Dimensions.get("window").width;

  // Held in a ref so the responder callbacks, which are created once, always
  // call the current handler rather than the one captured on first render.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const activeRef = useRef(active);
  activeRef.current = active;

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Never claim the touch on start: that would swallow taps on anything
        // sitting near the left edge.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => {
          if (!activeRef.current) return false;
          return (
            g.x0 <= EDGE_WIDTH &&
            g.dx > 6 &&
            Math.abs(g.dx) > Math.abs(g.dy) * 1.5
          );
        },
        // Once the gesture is ours, keep it. Otherwise a ScrollView underneath
        // can take it back part-way through and the screen sticks half-open.
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          // Clamped at 0: dragging left must not lift the screen off the right
          // edge and reveal whatever is behind it.
          tx.setValue(Math.max(0, g.dx));
        },
        onPanResponderRelease: (_e, g) => {
          const w = widthAt();
          const commit = g.dx > w * COMMIT_FRACTION || g.vx > COMMIT_VELOCITY;
          if (commit) {
            Animated.timing(tx, {
              toValue: w,
              duration: 180,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start(() => {
              tx.setValue(0);        // reset before unmount so a reused instance starts clean
              onBackRef.current();
            });
          } else {
            Animated.spring(tx, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 0,
              speed: 18,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
        },
      }),
    [tx]
  );

  if (!active) return <View style={[{ flex: 1 }, style]}>{children}</View>;

  return (
    <Animated.View
      style={[{ flex: 1, transform: [{ translateX: tx }] }, style]}
      {...responder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}


interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  hi?: boolean; // slightly elevated variant
  padded?: boolean;
  /** A pressable card is a button, and a screen reader has to be told so. */
  accessibilityRole?: "button" | "link";
  accessibilityLabel?: string;
}

/** Adaptive surface: frosted glass / neumorphic extrusion / solid aurora card. */
export function Card({ children, style, onPress, hi, padded = true, accessibilityRole, accessibilityLabel }: CardProps) {
  const { c, scheme } = useTheme();
  const radius = RADIUS.card;
  const pad = padded ? SPACE.lg : 0;
  const press = usePressScale(!!onPress);

  /**
   * Wraps the card body, as a plain function rather than a component.
   *
   * This was `const Wrapper = onPress ? (props) => ... : (props) => ...` used as
   * `<Wrapper>`. Defining a component inside a render creates a new function
   * identity on every pass, so React treats it as a different component type
   * and unmounts and remounts the entire subtree — every render, for every card
   * in the app.
   *
   * The visible symptom was a keyboard that closed after each keystroke while
   * renaming a channel: the TextInput was inside a Card, so it was destroyed
   * and rebuilt the moment its own onChange caused a render. It was also
   * throwing away and rebuilding the view tree of every card on screen for
   * nothing, which is its own reason to fix it.
   *
   * A function that returns JSX is fine — it produces elements, not a new
   * component type.
   */
  const wrap = (wrapStyle: StyleProp<ViewStyle>, body: React.ReactNode) =>
    onPress ? (
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole={accessibilityRole ?? "button"}
        accessibilityLabel={accessibilityLabel}
      >
        {/* The visual style lives on the animated node so the whole surface
            depresses, not just its contents. */}
        <Animated.View style={[wrapStyle, { transform: [{ scale: press.scale }] }]}>{body}</Animated.View>
      </Pressable>
    ) : (
      <View style={wrapStyle}>{body}</View>
    );

  if (c.isGlass) {
    return (
      wrap([{ borderRadius: radius, overflow: "hidden", borderWidth: 1, borderColor: c.glassBorder }, style], (
        <>
          <BlurView intensity={scheme === "dark" ? 40 : 55} tint={c.glassTint} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: hi ? c.surfaceHi : c.glassFill }]} />
          <View style={{ padding: pad }}>{children}</View>
        </>
      ))
    );
  }

  if (c.isNeo) {
    /*
     * One path for both platforms now.
     *
     * Card and PrimaryButton each carried their own copy of the iOS/Android
     * split, which is how they drifted: the offsets here were 5 and 8 while
     * NeoRaised used its own, so the same theme extruded by different amounts
     * depending on which component you were looking at.
     */
    return wrap(style, (
      <NeoRaised radius={radius} c={c}>
        <View style={{ borderRadius: radius, padding: pad, backgroundColor: c.surface }}>{children}</View>
      </NeoRaised>
    ));
  }

  // aurora
  return (
    wrap(
      [
        { borderRadius: radius, backgroundColor: hi ? c.cardHi : c.card, borderWidth: 1, borderColor: c.border, padding: pad },
        style,
      ],
      children
    )
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
    // Same platform split as Card: iOS can offset a coloured shadow to make the
    // button look raised; Android cannot, so the raise comes from a diagonal
    // gradient over the accent plus a lit top edge.
    const raised =
      Platform.OS === "ios"
        ? { shadowColor: c.neoDark, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.6, shadowRadius: 7 }
        : /*
           * Nothing on Android.
           *
           * This used to be `elevation: 5`, which is a grey Material drop
           * shadow — the one thing a neumorphic button is not. The raise here
           * comes from the diagonal gradient over the accent below, which is
           * what the surrounding surfaces do too.
           */
          {};
    return (
      <Pressable onPress={disabled || busy ? undefined : fire} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityState={{ disabled: !!disabled, busy: !!busy }} style={({ pressed }) => [{ opacity: disabled ? 0.5 : 1 }, style]}>
        <Animated.View style={{ transform: [{ scale: press.scale }], borderRadius: RADIUS.control, overflow: "hidden", ...raised }}>
          <LinearGradient
            colors={[mixHex(c.accent, "#ffffff", 0.22), c.accent, mixHex(c.accent, "#000000", 0.18)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            locations={[0, 0.45, 1]}
            style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center", minHeight: 52 }}
          >
            {content}
          </LinearGradient>
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

/**
 * Human wording for an icon-only button, used when the caller gives no label.
 *
 * The fallback before this was the icon's own name, which reads acceptably for
 * "search" or "close" and badly for the rest — a screen reader announcing
 * "chevron" tells the user what the picture is, not what the button does.
 */
const ICON_LABEL: Partial<Record<IconName, string>> = {
  back: "Back",
  chevron: "Open",
  close: "Close",
  search: "Search",
  add: "Add",
  bell: "Notifications",
  settings: "Settings",
  refresh: "Refresh",
  edit: "Edit",
  star: "Remove from favourites",
  starOff: "Add to favourites",
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
  // Roughly thirty screens use this as their back arrow via glyph="‹". Hiding
  // it here removes all of them at once, and only the back arrow — every other
  // icon button is untouched.
  if (resolved === "back" && !SHOW_BACK_BUTTONS) return null;
  return (
    <Pressable
      onPress={() => { tapLight(); onPress(); }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label ?? (resolved ? ICON_LABEL[resolved] ?? resolved.replace(/-/g, " ") : undefined)}
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
  const chip = (
    <Pressable
      onPress={onPress ? () => { tapLight(); onPress(); } : undefined}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      hitSlop={6}
      style={{ minHeight: 38, justifyContent: "center", paddingHorizontal: SPACE.lg, paddingVertical: 9, borderRadius: RADIUS.pill, backgroundColor: active ? c.accent : c.isNeo ? c.surface : c.card, borderWidth: 1, borderColor: active ? c.accent : c.isNeo ? "transparent" : c.border }}
    >
      <Text style={{ color: active ? c.onAccent : c.textDim, fontWeight: "700", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
  // Selected keeps the accent fill: an extruded chip and a filled chip say
  // different things, and "which one is on" must stay the louder signal.
  if (c.isNeo && !active) {
    return (
      <NeoRaised radius={RADIUS.pill} c={c} spec={NEO_SMALL}>
        {chip}
      </NeoRaised>
    );
  }
  return chip;
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
    <View style={{ flexDirection: "row", padding: 3, borderRadius: RADIUS.pill, backgroundColor: c.isNeo ? c.bg : c.cardHi, borderWidth: c.isNeo ? 0 : 1, borderColor: c.border, gap: 2 }}>
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
  return <View style={{ alignSelf: "flex-start" }}><Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityLabel="Help" accessibilityHint={open ? "Hides the explanation" : "Shows an explanation"} accessibilityState={{ expanded: open }} hitSlop={10} style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.cardHi, borderWidth: 1, borderColor: c.borderHi }}><Text style={{ color: c.textDim, fontWeight: "900" }}>?</Text></Pressable>{open ? <View accessibilityLiveRegion="polite" style={{ position: "absolute", top: 28, left: 0, width: 220, zIndex: 20, borderRadius: 12, padding: 10, backgroundColor: c.surfaceHi, borderWidth: 1, borderColor: c.borderHi }}><Text style={{ color: c.textDim, fontSize: 12 }}>{text}</Text></View> : null}</View>;
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
  const insets = useSafeArea();
  const urgent = toast?.kind === "error" || toast?.kind === "warning";

  useEffect(() => {
    if (!toast) return;
    // A toast is the only confirmation most actions ever get, so it has to
    // reach screen-reader users as well as sighted ones. Android picks the
    // text up from `accessibilityLiveRegion` below; iOS ignores live regions
    // on a view that is newly mounted rather than updated, so it needs an
    // explicit announcement. Doing both on both platforms double-speaks.
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(toast.text);
    // Errors and warnings carry recovery information. 2.2s is not enough to
    // read one, and nowhere near enough to hear one spoken.
    const t = setTimeout(onHide, urgent ? 4600 : 2200);
    return () => clearTimeout(t);
  }, [toast, onHide, urgent]);

  if (!toast) return null;
  const color = toast.kind === "success" ? c.green : toast.kind === "warning" ? c.amber : toast.kind === "error" ? c.red : c.accent;
  return (
    <Pressable
      onPress={onHide}
      accessibilityRole="alert"
      accessibilityLabel={toast.text}
      accessibilityHint="Dismisses this message"
      accessibilityLiveRegion={urgent ? "assertive" : "polite"}
      style={{
        position: "absolute",
        left: 18,
        right: 18,
        // Overlay screens render this with no tab bar beneath it, so a fixed
        // inset would put a tappable surface inside the home-indicator area.
        bottom: Math.max(28, insets.bottom + 12),
        minHeight: 48,
        justifyContent: "center",
        borderRadius: 16,
        backgroundColor: c.surfaceHi,
        borderWidth: 1,
        borderColor: color,
        padding: 14,
      }}
    >
      <Text style={{ color: c.text, fontWeight: "800" }}>{toast.text}</Text>
    </Pressable>
  );
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
export function PillToggle({ value, onChange, size = "md", disabled, label, style }: { value: boolean; onChange: (v: boolean) => void; size?: "sm" | "md"; disabled?: boolean; label?: string; style?: StyleProp<ViewStyle> }) {
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
      // Without a name a screen reader announces only "on, switch", which is
      // useless on a screen holding several of them. Callers that render the
      // control away from its text should pass `label`.
      accessibilityLabel={label}
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

/**
 * Segmented capsule selector (e.g. Cool · Dry · Fan).
 *
 * Each option takes an equal share of the row, which is right for the three or
 * four it was built for. The camera screen passes seven resolutions, and on a
 * 411dp phone that squeezed "qqvga" into a two-line stack overlapping its own
 * label while "sxga" ran off the right edge of the screen. Found by installing
 * the release build and looking at it -- no static check sees a layout.
 *
 * Past four options it becomes a horizontal scroller with pills sized to their
 * text, which is the shape that survives any number of them.
 */
export function PillSelector<T extends string>({ options, value, onChange, style }: { options: readonly T[]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const scrolls = options.length > 4;

  const pill = (o: T) => {
    const sel = o === value;
    return (
      <Pressable
        key={o}
        onPress={() => { if (o !== value) { tapLight(); onChange(o); } }}
        accessibilityRole="button"
        accessibilityState={{ selected: sel }}
        style={{
          flex: scrolls ? undefined : 1,
          paddingHorizontal: scrolls ? 18 : 0,
          borderRadius: RADIUS.pill,
          paddingVertical: 13,
          minHeight: 46,
          minWidth: 46,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: sel ? c.accent : c.card,
          borderWidth: sel ? 0 : 1,
          borderColor: c.border,
        }}
      >
        <Text numberOfLines={1} style={{ color: sel ? c.onAccent : c.textDim, fontWeight: sel ? "800" : "600", textTransform: "capitalize" }}>{o}</Text>
      </Pressable>
    );
  };

  if (scrolls) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={style}
        contentContainerStyle={{ flexDirection: "row", gap: 10, paddingRight: 4 }}
      >
        {options.map(pill)}
      </ScrollView>
    );
  }

  return <View style={[{ flexDirection: "row", gap: 10 }, style]}>{options.map(pill)}</View>;
}

/** Horizontal room / category filter chips. */
export function RoomChips({ options, value, onChange, style }: { options: string[]; value: number; onChange: (i: number) => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
      {options.map((o, i) => {
        const sel = i === value;
        return (
          <Pressable key={`${o}-${i}`} onPress={() => { if (i !== value) { tapLight(); onChange(i); } }} accessibilityRole="button" accessibilityState={{ selected: sel }}           style={{ paddingHorizontal: 18, paddingVertical: 11, minHeight: 44, justifyContent: "center", borderRadius: RADIUS.pill, backgroundColor: sel ? c.accent : c.card, borderWidth: sel ? 0 : 1, borderColor: c.border }}>
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
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} style={{ alignItems: "center", width: 68 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: active ? c.accent : c.cardHi, borderWidth: active ? 0 : 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
        {/* The glyph is a user-picked scene avatar, so it stays an emoji — but
            it is decorative next to the label, and a screen reader announcing
            "crescent moon, Night" reads as noise. Hide it from the tree. */}
        <Text importantForAccessibility="no" accessibilityElementsHidden style={{ fontSize: 22 }}>{glyph}</Text>
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
