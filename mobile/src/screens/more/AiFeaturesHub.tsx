import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Card, IconButton, Screen, SectionLabel, Title, useTheme } from "../../ui";
const features = [["💡", "Smart Suggestions", "Real-data actions", "suggestions"], ["✨", "Automations", "Rules and scenes", "automate"], ["🚨", "Anomaly alerts", "Alert/security events", "security"], ["⚡", "Energy insights", "Consumption trends", "energy"]] as const;
export default function AiFeaturesHub({ onBack, onOpenSuggestions, onOpenAutomate, onOpenSecurity, onOpenEnergy }: { onBack: () => void; onOpenSuggestions: () => void; onOpenAutomate: () => void; onOpenSecurity: () => void; onOpenEnergy: () => void }) {
  const { c } = useTheme(); const go = { suggestions: onOpenSuggestions, automate: onOpenAutomate, security: onOpenSecurity, energy: onOpenEnergy };
  return <Screen><ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}><IconButton glyph="‹" onPress={onBack} /><Title>AI Features</Title></View><SectionLabel>INTELLIGENCE GRID</SectionLabel><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{features.map(([g, t, s, k]) => <Card key={t} onPress={go[k]} style={{ width: "48%", minHeight: 140 }}><Text style={{ fontSize: 28 }}>{g}</Text><Text style={{ color: c.text, fontWeight: "900", marginTop: 8 }}>{t}</Text><Text style={{ color: c.faint, marginTop: 6 }}>{s}</Text></Card>)}</View></ScrollView></Screen>;
}
