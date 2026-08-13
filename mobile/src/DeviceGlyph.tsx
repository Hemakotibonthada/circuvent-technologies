import { useMemo } from "react";
import { View, StyleSheet, Animated } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { Device } from "./api";
import { capabilitiesFor } from "./store";
import { fanLevel } from "./fan";
import { deviceMeta } from "./theme";
import { deviceMotion, useSpin, useGlowPulse } from "./ui";
import { spinSecondsFor, ringDash, deviceTint } from "./tile-visual";
import { Icon } from "./icons";

/**
 * What a device is doing, in the terms a glyph needs to draw it.
 *
 * One hook rather than the same derivation repeated on every screen that shows
 * a device. The device list, the room list and the device hub each drew their
 * own icon, and only the list ever learned to show a level — so the same lamp
 * appeared dimmable on one screen and a plain switch on the next two.
 *
 * The rules themselves live in tile-visual.ts, which the browser also reads
 * through its own copy; tests/tile-visual-parity.test.ts holds the two together.
 */
export function useDeviceVisual(device: Device) {
  const cap = capabilitiesFor(device);
  const meta = deviceMeta(device.type);

  const field = cap.power?.field ?? meta.toggle?.field ?? "";
  const isOn = field ? !!device.state[field] : false;
  const live = isOn && device.online;

  const level = useMemo(() => {
    if (cap.fan) return fanLevel(device, cap.fan);
    if (cap.dimmer) {
      const raw = device.state[cap.dimmer.field];
      return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    }
    return null;
  }, [device, cap.fan, cap.dimmer]);

  const tint = deviceTint(cap.color ? device.state[cap.color.field] : undefined, meta.accent, live);
  const motion = deviceMotion(device.type);
  const spinMs = spinSecondsFor(level, live);

  /*
   * Hooks are called unconditionally and told whether to run, because calling
   * them behind a condition changes hook order between renders — the same
   * mistake that silently disabled the tilt on the shop page.
   */
  const spin = useSpin(motion === "spin" && spinMs !== null, spinMs ? spinMs * 1000 : undefined);
  const glow = useGlowPulse(motion === "glow" && isOn);

  return { cap, meta, field, isOn, live, level, tint, motion, spinMs, spin, glow };
}

/**
 * A device icon that shows how hard the device is working.
 *
 * The ring is state and the spin is motion, which is why the ring is drawn
 * whenever a level is known — including for a device that has gone offline,
 * where the last reading is still a fact — while the spin stops the moment the
 * device stops answering.
 */
export function DeviceGlyph({ device, size = 20 }: { device: Device; size?: number }) {
  const { meta, level, tint, motion, spinMs, spin } = useDeviceVisual(device);

  const box = size * 2.2;
  const r = box / 2 - 2;
  const ring = level !== null ? ringDash(level, r) : null;

  return (
    <View style={{ width: box, height: box, alignItems: "center", justifyContent: "center" }}>
      {ring && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width={box} height={box} style={{ transform: [{ rotate: "-90deg" }] }}>
            <Circle cx={box / 2} cy={box / 2} r={r} stroke={tint} strokeOpacity={0.22} strokeWidth={2} fill="none" />
            <Circle
              cx={box / 2}
              cy={box / 2}
              r={r}
              stroke={tint}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={`${ring.dash} ${ring.gap}`}
              fill="none"
            />
          </Svg>
        </View>
      )}
      <Animated.View style={motion === "spin" && spinMs !== null ? { transform: [{ rotate: spin }] } : undefined}>
        <Icon name={meta.icon} size={size} color={tint} />
      </Animated.View>
    </View>
  );
}
