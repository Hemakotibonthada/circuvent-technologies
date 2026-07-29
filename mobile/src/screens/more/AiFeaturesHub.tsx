import React from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Card, IconButton, Screen, SectionLabel, Title, useTheme, useSafeArea } from "../../ui";
import { Icon, type IconName } from "../../icons";
import { RADIUS, SPACE, TYPE } from "../../theme";

type FeatureKey = "suggestions" | "automate" | "security" | "energy";

const FEATURES: { key: FeatureKey; icon: IconName; label: string; subtitle: string }[] = [
  { key: "suggestions", icon: "idea", label: "Smart suggestions", subtitle: "Real-data actions" },
  { key: "automate", icon: "automate", label: "Automations", subtitle: "Rules and scenes" },
  { key: "security", icon: "alert", label: "Anomaly alerts", subtitle: "Alert & security events" },
  { key: "energy", icon: "energy", label: "Energy insights", subtitle: "Consumption trends" },
];

export default function AiFeaturesHub({ onBack, onOpenSuggestions, onOpenAutomate, onOpenSecurity, onOpenEnergy }: { onBack: () => void; onOpenSuggestions: () => void; onOpenAutomate: () => void; onOpenSecurity: () => void; onOpenEnergy: () => void }) {
  const { c } = useTheme();
  const insets = useSafeArea();
  const { width: winW } = useWindowDimensions();
  const colW = Math.floor((winW - SPACE.lg * 2 - SPACE.md) / 2);
  const go: Record<FeatureKey, () => void> = { suggestions: onOpenSuggestions, automate: onOpenAutomate, security: onOpenSecurity, energy: onOpenEnergy };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingTop: insets.top + SPACE.md, paddingBottom: 90 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md, marginBottom: SPACE.lg }}>
          <IconButton glyph="‹" onPress={onBack} />
          <Title>AI features</Title>
        </View>
        <SectionLabel>Intelligence grid</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACE.md }}>
          {FEATURES.map((f) => (
            <View key={f.key} style={{ width: colW }}>
              <Card onPress={go[f.key]} style={{ minHeight: 128 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: RADIUS.control,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: c.accent + "22",
                  }}
                >
                  <Icon name={f.icon} size={22} color={c.accentHi} />
                </View>
                <Text style={{ color: c.text, ...TYPE.body, fontWeight: "700", marginTop: SPACE.md }} numberOfLines={1}>
                  {f.label}
                </Text>
                <Text style={{ color: c.faint, ...TYPE.caption, marginTop: SPACE.xs }} numberOfLines={2}>
                  {f.subtitle}
                </Text>
              </Card>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
