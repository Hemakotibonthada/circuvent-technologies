import React, { useCallback, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions, Animated } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Screen, useTheme, useSafeArea } from "../ui";
import { Icon, type IconName } from "../icons";
import { tapLight } from "../haptics";

/**
 * First-run introduction.
 *
 * Circuvent is not a self-explanatory app: it needs hardware, the hardware has
 * to be joined to Wi-Fi through a setup hotspot, and the two most useful
 * features — scheduling and telling a channel what it is wired to — are not
 * discoverable by tapping around. Someone who has just unboxed a switchboard
 * lands on an empty device list with no idea what to do next.
 *
 * Four screens, then out of the way. It shows once and remembers, and it is
 * skippable from the first screen: an onboarding flow you cannot leave is worse
 * than none, and anyone reinstalling has seen it already.
 *
 * Deliberately does not ask for permissions here. Location and camera are
 * requested at the moment they are used, during device setup, where the reason
 * is on screen — a permission dialog on the second screen of an app nobody has
 * used yet gets denied, and on Android a denied permission is awkward to
 * recover.
 */

const SEEN_KEY = "cv-onboarded-v1";

/** Resolved once at startup so the app does not flash the intro at a returning user. */
export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) === "1";
  } catch {
    // A storage failure should not trap someone in the intro forever.
    return true;
  }
}

async function markSeen(): Promise<void> {
  try { await AsyncStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
}

interface Page {
  icon: IconName;
  title: string;
  body: string;
  grad: readonly [string, string];
}

const PAGES: Page[] = [
  {
    icon: "home",
    title: "Your home, in one place",
    body:
      "Lights, fans, plugs, switchboards, pumps, locks, cameras and safety sensors — grouped by room, controlled from one screen.",
    grad: ["#06b6d4", "#8b5cf6"],
  },
  {
    icon: "add",
    title: "Add a device in a minute",
    body:
      "Tap Add, scan the QR label on the hardware, and pick your Wi-Fi. The device joins your network and appears here. No manual, no router settings.",
    grad: ["#8b5cf6", "#ec4899"],
  },
  {
    icon: "touchboard",
    title: "Say what each switch controls",
    body:
      "A relay board cannot know what it is wired to. Tell it once — light, fan, geyser, socket — and every tile shows the right icon, colour and animation.",
    grad: ["#f59e0b", "#ef4444"],
  },
  {
    icon: "clock",
    title: "Set it and forget it",
    body:
      "Have the porch light come on at dusk and off at bedtime. Build scenes for Away and Night. Everything keeps running on the device even if the internet drops.",
    grad: ["#22c55e", "#06b6d4"],
  },
];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { c } = useTheme();
  const insets = useSafeArea();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);

  const finish = useCallback(() => {
    void markSeen();
    onDone();
  }, [onDone]);

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(PAGES.length - 1, i));
    setPage(next);
    scroller.current?.scrollTo({ x: next * width, animated: true });
  };

  const last = page === PAGES.length - 1;

  return (
    <Screen>
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <View style={[s.topBar, { paddingBottom: 4 }]}>
          <Pressable
            onPress={() => { tapLight(); finish(); }}
            accessibilityRole="button"
            accessibilityLabel="Skip the introduction"
            hitSlop={10}
            style={s.skip}
          >
            <Text style={{ color: c.faint, fontSize: 15, fontWeight: "600" }}>Skip</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // Keeps the dots in step when the user swipes rather than taps Next.
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
        >
          {PAGES.map((p) => (
            <View key={p.title} style={[s.page, { width }]}>
              <LinearGradient colors={p.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.badge}>
                <Icon name={p.icon} size={56} color="#fff" />
              </LinearGradient>
              <Text style={[s.title, { color: c.text }]}>{p.title}</Text>
              <Text style={[s.body, { color: c.textDim }]}>{p.body}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.dots} accessibilityRole="progressbar" accessibilityLabel={`Step ${page + 1} of ${PAGES.length}`}>
            {PAGES.map((p, i) => (
              <View
                key={p.title}
                style={[
                  s.dot,
                  {
                    backgroundColor: i === page ? c.accentHi : c.border,
                    width: i === page ? 22 : 8,
                  },
                ]}
              />
            ))}
          </View>

          <Pressable
            onPress={() => { tapLight(); last ? finish() : goTo(page + 1); }}
            accessibilityRole="button"
            accessibilityLabel={last ? "Get started" : "Next"}
            style={({ pressed }) => [s.cta, { opacity: pressed ? 0.85 : 1 }]}
          >
            <LinearGradient colors={c.accentGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ctaFill}>
              <Text style={{ color: c.onAccent, fontWeight: "800", fontSize: 16 }}>
                {last ? "Get started" : "Next"}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16 },
  skip: { minHeight: 44, minWidth: 60, alignItems: "flex-end", justifyContent: "center" },
  page: { alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  badge: {
    width: 128, height: 128, borderRadius: 40,
    alignItems: "center", justifyContent: "center", marginBottom: 36,
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10,
  },
  title: { fontSize: 27, fontWeight: "800", textAlign: "center", letterSpacing: -0.4 },
  body: { fontSize: 16, lineHeight: 24, textAlign: "center", marginTop: 14 },
  footer: { paddingHorizontal: 24, gap: 20 },
  dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7 },
  dot: { height: 8, borderRadius: 4 },
  cta: { borderRadius: 16, overflow: "hidden" },
  ctaFill: { minHeight: 54, alignItems: "center", justifyContent: "center" },
});
