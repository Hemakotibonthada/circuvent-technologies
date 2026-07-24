import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
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
const KEY = "cv-theme-v1";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeS] = useState<ThemeMode>("aurora");
  const [scheme, setSchemeS] = useState<Scheme>("dark");
  const [accentKey, setAccentKeyS] = useState<string>("brand");

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
