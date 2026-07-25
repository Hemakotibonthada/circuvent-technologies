import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Animated, Easing, Switch } from "react-native";
import { Screen, Card, SectionLabel, useTheme, IconButton, useBackHandler } from "../../ui";
import { useDevices } from "../../store";
import { parseCommand, VOICE_EXAMPLES } from "../../voice";

// TTS via expo-speech, loaded defensively so the screen still works if the
// native module isn't linked (e.g. in Expo Go).
let Speech: { speak?: (t: string, o?: Record<string, unknown>) => void; stop?: () => void } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Speech = require("expo-speech");
} catch {
  Speech = null;
}

interface Turn { who: "you" | "cv"; text: string }

export default function VoiceAssistant({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const { devices, command } = useDevices();
  const [turns, setTurns] = useState<Turn[]>([{ who: "cv", text: "Hi! I'm your Circuvent assistant. Tell me what to do — like 'turn on the living room lights'." }]);
  const [text, setText] = useState("");
  const [speakOn, setSpeakOn] = useState(true);
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<ScrollView | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  useBackHandler(() => { onBack(); return true; });

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const say = (t: string) => { if (speakOn && Speech?.speak) { try { Speech.stop?.(); Speech.speak(t, { rate: 1.0, pitch: 1.05 }); } catch { /* ignore */ } } };

  const run = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setText("");
    setTurns((p) => [...p, { who: "you", text: q }]);
    setThinking(true);
    setTimeout(() => {
      const res = parseCommand(q, devices);
      res.commands.forEach(({ id, cmd }) => command(id, cmd));
      setTurns((p) => [...p, { who: "cv", text: res.reply }]);
      say(res.reply);
      setThinking(false);
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80);
    }, 300);
  };

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });

  return (
    <Screen>
      <View style={{ flex: 1, paddingTop: 52 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginBottom: 8 }}>
          <IconButton glyph="‹" onPress={onBack} />
          <Text style={{ color: c.text, fontSize: 22, fontWeight: "800", flex: 1 }}>Assistant</Text>
          <Text style={{ color: c.faint, fontSize: 12 }}>Speak</Text>
          <Switch value={speakOn} onValueChange={setSpeakOn} trackColor={{ true: c.accent, false: c.border }} thumbColor="#fff" />
        </View>

        <ScrollView ref={scroller} contentContainerStyle={{ padding: 16, paddingBottom: 12 }} style={{ flex: 1 }}>
          {turns.map((t, i) => (
            <View key={i} style={{ alignSelf: t.who === "you" ? "flex-end" : "flex-start", maxWidth: "86%", marginBottom: 10 }}>
              <View style={{ backgroundColor: t.who === "you" ? c.accent : c.card, borderColor: c.border, borderWidth: t.who === "you" ? 0 : 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 }}>
                <Text style={{ color: t.who === "you" ? c.onAccent || "#fff" : c.text, fontSize: 15 }}>{t.text}</Text>
              </View>
            </View>
          ))}
          {thinking && <Text style={{ color: c.faint, marginLeft: 6 }}>…</Text>}
        </ScrollView>

        <View style={{ paddingHorizontal: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 8 }}>
            {VOICE_EXAMPLES.map((ex) => (
              <Pressable key={ex} onPress={() => run(ex)} style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 }}>
                <Text style={{ color: c.textDim, fontSize: 12 }}>{ex}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 16 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 24, paddingHorizontal: 14, height: 48 }}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Type a command…"
                placeholderTextColor={c.faint}
                style={{ flex: 1, color: c.text, fontSize: 15 }}
                onSubmitEditing={() => run(text)}
                returnKeyType="send"
                blurOnSubmit={false}
              />
            </View>
            <Pressable onPress={() => run(text || "what is the status")}>
              <Animated.View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", transform: [{ scale }], shadowColor: c.accentHi, shadowOpacity: glow as unknown as number, shadowRadius: 12 }}>
                <Text style={{ fontSize: 22 }}>{text ? "➤" : "🎙️"}</Text>
              </Animated.View>
            </Pressable>
          </View>
          {!Speech?.speak && <Text style={{ color: c.faint, fontSize: 11, textAlign: "center", marginBottom: 8 }}>Voice replies need a device build (not Expo Go).</Text>}
        </View>
      </View>
    </Screen>
  );
}
