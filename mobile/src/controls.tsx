/**
 * Device controls that behave like the thing they control — phone build.
 *
 * The web console's `_kit/controls.tsx` is the same set of ideas; the app is a
 * separate project and cannot import from it, so these are written natively
 * against React Native's gesture and animation primitives rather than shimmed.
 * `tests/mobile-controls.test.ts` pins the behaviour the two share.
 *
 * A switch is the right control for exactly one kind of device: something with
 * two states and nothing between them. It was being used for a lamp that dims,
 * a fan with four speeds, a curtain that stops anywhere, and a lock — throwing
 * away most of what each can do.
 *
 * On a phone the case is stronger still. A switch is a small target that needs
 * a precise tap; a tall column you drag with a thumb is reachable one-handed
 * and gives fine control without precision.
 */

import React, { useCallback, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { Palette } from "./theme";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function snap(v: number, min: number, max: number, step: number): number {
  const n = Math.round((v - min) / step) * step + min;
  return clamp(Number(n.toFixed(4)), min, max);
}

/* ----------------------------------------------------------- LevelSlider -- */

export function LevelSlider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 100,
  step = 1,
  label,
  glyph,
  accent,
  c,
  disabled,
  height = 190,
  width = 84,
  off,
  valueText,
  unit = "%",
}: {
  value: number;
  onChange?: (v: number) => void;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  /** A short glyph at the foot of the column. */
  glyph?: string;
  accent?: string;
  c: Palette;
  disabled?: boolean;
  height?: number;
  width?: number;
  off?: boolean;
  valueText?: (v: number) => string;
  unit?: string;
}) {
  const tint = accent || c.accent;
  const [box, setBox] = useState(height);
  /*
   * While a thumb is down, the thumb is the truth. Without this the fill
   * fights the device: you drag to 70, the lamp reports 40 from before your
   * last change, and the column jumps backwards under your finger.
   */
  const [local, setLocal] = useState(value);
  const [dragging, setDragging] = useState(false);
  const shown = dragging ? local : value;
  const pct = max > min ? ((shown - min) / (max - min)) * 100 : 0;

  const fill = useRef(new Animated.Value(pct)).current;
  const draggingRef = useRef(false);
  const boxRef = useRef(height);
  const localRef = useRef(value);

  React.useEffect(() => {
    if (dragging) {
      // No animation while dragging: easing here lags the finger and reads as
      // the control being slow rather than smooth.
      fill.setValue(pct);
    } else {
      Animated.timing(fill, {
        toValue: pct,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [pct, dragging, fill]);

  const fromY = useCallback(
    (y: number) => {
      const ratio = 1 - y / (boxRef.current || 1);
      return snap(min + ratio * (max - min), min, max, step);
    },
    [min, max, step],
  );

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (e) => {
        draggingRef.current = true;
        setDragging(true);
        const v = fromY(e.nativeEvent.locationY);
        localRef.current = v;
        setLocal(v);
        onChange?.(v);
      },
      onPanResponderMove: (e) => {
        if (!draggingRef.current) return;
        const v = fromY(e.nativeEvent.locationY);
        if (v !== localRef.current) {
          localRef.current = v;
          setLocal(v);
          onChange?.(v);
        }
      },
      onPanResponderRelease: () => {
        draggingRef.current = false;
        setDragging(false);
        onCommit(localRef.current);
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false;
        setDragging(false);
        onCommit(localRef.current);
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    boxRef.current = h;
    setBox(h);
  };

  const readout = off ? "Off" : `${Math.round(shown)}${unit}`;
  const spoken = valueText ? valueText(shown) : readout;

  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <View
        {...pan.panHandlers}
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: Math.round(shown), text: spoken }}
        accessibilityState={{ disabled: !!disabled }}
        /*
         * The accessibility increment/decrement actions are what make this
         * usable with a screen reader — a drag gesture is not something
         * TalkBack can perform, so without these the control is unreachable.
         */
        onAccessibilityAction={(e) => {
          const bigStep = Math.max(step, Math.round((max - min) / 10));
          if (e.nativeEvent.actionName === "increment") {
            const v = snap(shown + bigStep, min, max, step);
            setLocal(v);
            onCommit(v);
          } else if (e.nativeEvent.actionName === "decrement") {
            const v = snap(shown - bigStep, min, max, step);
            setLocal(v);
            onCommit(v);
          }
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        style={{
          width,
          height,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          overflow: "hidden",
          justifyContent: "flex-end",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <Animated.View
          style={{
            width: "100%",
            height: fill.interpolate({ inputRange: [0, 100], outputRange: [0, box] }),
            backgroundColor: off || disabled ? c.faint : tint,
            opacity: off || disabled ? 0.35 : 0.9,
          }}
        />
        <View style={{ position: "absolute", top: 12, left: 0, right: 0, alignItems: "center" }}>
          <Text style={{ color: c.text, fontWeight: "800", fontSize: 15 }}>{readout}</Text>
        </View>
        {glyph ? (
          <View style={{ position: "absolute", bottom: 12, left: 0, right: 0, alignItems: "center" }}>
            <Text style={{ fontSize: 17, opacity: off || disabled ? 0.5 : 1 }}>{glyph}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: c.faint, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------- PowerDial -- */

export function PowerDial({
  on,
  onToggle,
  level,
  label,
  accent,
  c,
  disabled,
  size = 128,
}: {
  on: boolean;
  onToggle: () => void;
  level?: number | null;
  label: string;
  accent?: string;
  c: Palette;
  disabled?: boolean;
  size?: number;
}) {
  const tint = accent || c.accent;
  const stroke = 6;
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const lit = on && !disabled;
  const dash = typeof level === "number" ? (clamp(level, 0, 100) / 100) * circ : 0;

  return (
    <Pressable
      onPress={() => { if (!disabled) onToggle(); }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      accessibilityLabel={label}
      accessibilityHint={on ? "Double tap to turn off" : "Double tap to turn on"}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: lit ? tint + "22" : c.card,
        borderWidth: 1,
        borderColor: lit ? tint + "66" : c.border,
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      {typeof level === "number" && (
        <View style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
          <Svg width={size} height={size}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.border} strokeWidth={stroke} fill="none" />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={lit ? tint : c.faint}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              fill="none"
            />
          </Svg>
        </View>
      )}
      <Text style={{ fontSize: 26 }}>⏻</Text>
      <Text
        style={{
          color: lit ? c.text : c.faint,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 1,
          marginTop: 2,
        }}
      >
        {on ? "ON" : "OFF"}
      </Text>
    </Pressable>
  );
}

/* ---------------------------------------------------------- ModeSelector -- */

export function ModeSelector<T extends string | number>({
  value,
  options,
  onChange,
  label,
  accent,
  c,
  disabled,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  accent?: string;
  c: Palette;
  disabled?: boolean;
}) {
  const tint = accent || c.accent;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        backgroundColor: c.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.border,
        padding: 4,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => !disabled && onChange(o.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled: !!disabled }}
            accessibilityLabel={o.label}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: active ? tint : "transparent",
            }}
          >
            <Text style={{ color: active ? c.onAccent : c.textDim, fontWeight: "700", fontSize: 13 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* -------------------------------------------------------- SlideToConfirm -- */

/**
 * A deliberate gesture for something that should not happen by accident.
 *
 * Unlocking a door is not the same class of action as turning on a lamp, and a
 * switch gives them the same one-tap cost. A phone in a pocket should not be
 * able to open a front door.
 *
 * Screen reader users get an activate action instead, which carries the same
 * commitment: it cannot happen by brushing past.
 */
export function SlideToConfirm({
  onConfirm,
  label,
  hint,
  accent,
  c,
  disabled,
  glyph = "🔓",
}: {
  onConfirm: () => void;
  label: string;
  hint?: string;
  accent?: string;
  c: Palette;
  disabled?: boolean;
  glyph?: string;
}) {
  // Defaults to the theme's own red rather than a literal, so the knob follows
  // the scheme like everything else. Callers pass c.green for "unlock", where
  // the action is permissive rather than destructive.
  const knob = accent || c.red;
  const KNOB = 52;
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const xRef = useRef(0);
  const [done, setDone] = useState(false);
  const travel = Math.max(0, w - KNOB - 8);

  const finish = useCallback(() => {
    setDone(true);
    onConfirm();
    AccessibilityInfo.announceForAccessibility?.(`${label} confirmed`);
    setTimeout(() => {
      setDone(false);
      Animated.timing(x, { toValue: 0, duration: 200, useNativeDriver: false }).start();
      xRef.current = 0;
    }, 1200);
  }, [onConfirm, label, x]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderMove: (_e, g) => {
        const v = clamp(g.dx, 0, travel);
        xRef.current = v;
        x.setValue(v);
      },
      onPanResponderRelease: () => {
        // Nine tenths rather than the whole rail: asking for the exact end
        // turns a safety gesture into a dexterity test.
        if (travel > 0 && xRef.current >= travel * 0.9) {
          Animated.timing(x, { toValue: travel, duration: 120, useNativeDriver: false }).start(finish);
        } else {
          Animated.timing(x, { toValue: 0, duration: 200, useNativeDriver: false }).start();
          xRef.current = 0;
        }
      },
    }),
  ).current;

  return (
    <View style={{ marginBottom: 12 }}>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={{
          height: 60,
          borderRadius: 30,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.border,
          justifyContent: "center",
          overflow: "hidden",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <Text style={{ textAlign: "center", color: done ? c.text : c.faint, fontWeight: "700", fontSize: 13 }}>
          {done ? "Done" : label}
        </Text>
        <Animated.View
          {...pan.panHandlers}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Slide, or double tap to confirm"
          onAccessibilityTap={() => !disabled && finish()}
          style={{
            position: "absolute",
            left: 4,
            width: KNOB,
            height: KNOB,
            borderRadius: KNOB / 2,
            backgroundColor: knob,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ translateX: x }],
          }}
        >
          <Text style={{ fontSize: 20 }}>{glyph}</Text>
        </Animated.View>
      </View>
      {hint ? (
        <Text style={{ color: c.faint, fontSize: 11, textAlign: "center", marginTop: 6 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ ControlTile -- */

/**
 * One device as a pressable tile: icon, name, and the state as a word.
 *
 * The state being a word rather than the position of a switch is the point.
 * "Locked" reads at a glance, reads correctly in a screenshot, and reads to
 * someone who cannot tell which way a switch is thrown. The tint is a second
 * signal and never the only one — colour alone fails in sunlight and fails for
 * anyone with a colour vision deficiency.
 */
export function ControlTile({
  name,
  state,
  glyph,
  active,
  accent,
  c,
  onPress,
  onOpen,
  disabled,
  detail,
}: {
  name: string;
  state: string;
  glyph: string;
  active?: boolean;
  accent?: string;
  c: Palette;
  onPress?: () => void;
  onOpen?: () => void;
  disabled?: boolean;
  detail?: string;
}) {
  const tint = accent || c.accent;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onOpen}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${state}`}
      accessibilityHint={onOpen ? "Long press for all controls" : undefined}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 104,
        borderRadius: 22,
        padding: 12,
        justifyContent: "space-between",
        backgroundColor: active ? tint + "26" : c.card,
        borderWidth: 1,
        borderColor: active ? tint + "55" : c.border,
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? tint : c.surfaceHi,
        }}
      >
        <Text style={{ fontSize: 18 }}>{glyph}</Text>
      </View>
      <View>
        <Text numberOfLines={1} style={{ color: c.text, fontWeight: "700", fontSize: 13 }}>
          {name}
        </Text>
        <Text numberOfLines={1} style={{ color: c.textDim, fontSize: 11 }}>
          {state}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={{ color: c.faint, fontSize: 10 }}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
