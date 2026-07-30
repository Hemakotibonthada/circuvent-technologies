import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View, RefreshControl } from "react-native";
import { Card, IconButton, Screen, SectionLabel, Title, useTheme, Banner, Skeleton } from "../../ui";
import { fetchHomeAnalysis, type HomeAnalysis, type Finding, type Severity } from "../../assistant";

/**
 * AI Insights.
 *
 * The findings come from the same server-side analysis the web console and the
 * assistant use, rather than a second set of rules written for the app. That
 * matters: rules maintained in two places drift, and a user shown "everything
 * is fine" on their phone while the console warns about a leak has been
 * actively misled.
 *
 * Nothing here is generated text. Each card is a computed finding.
 */

export default function AiHub({
  onBack, onOpenEnergy, onOpenAutomate, onOpenDevices, onOpenSuggestions,
}: {
  onBack: () => void;
  onOpenEnergy: () => void;
  onOpenAutomate: () => void;
  onOpenDevices: () => void;
  onOpenSuggestions: () => void;
}) {
  const { c } = useTheme();
  const [analysis, setAnalysis] = useState<HomeAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchHomeAnalysis();
    if (res.ok) {
      setAnalysis(res.data);
      setError(null);
    } else {
      setAnalysis(null);
      setError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const tone = (s: Severity) => (s === "critical" ? c.red : s === "warning" ? c.amber : c.accent);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={c.accent} />}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <IconButton glyph="‹" onPress={onBack} />
          <Title>AI Insights</Title>
        </View>

        {loading && !analysis && (
          <View style={{ gap: 10 }}>
            <Skeleton height={84} />
            <Skeleton height={84} />
            <Skeleton height={84} />
          </View>
        )}

        {error && !loading ? <Banner kind="warning" text={error} /> : null}

        {analysis && (
          <>
            <SectionLabel>Right now</SectionLabel>
            <Card style={{ marginBottom: 14, flexDirection: "row", justifyContent: "space-between" }}>
              <Stat label="Devices" value={String(analysis.counts.total)} color={c.text} />
              <Stat label="Online" value={String(analysis.counts.online)} color={analysis.counts.online > 0 ? c.green : c.faint} />
              <Stat label="Offline" value={String(analysis.counts.offline)} color={analysis.counts.offline > 0 ? c.red : c.faint} />
            </Card>

            {analysis.energy.meteredDevices > 0 && (
              <Card onPress={onOpenEnergy} style={{ marginBottom: 14 }}>
                <Text style={{ color: c.text, fontWeight: "900", fontSize: 17 }}>
                  {Math.round(analysis.energy.totalWatts)} W right now
                </Text>
                <Text style={{ color: c.textDim, marginTop: 6 }}>
                  About {analysis.energy.estimatedKWhPerDay} kWh/day if this held steady, across{" "}
                  {analysis.energy.meteredDevices} metered {analysis.energy.meteredDevices === 1 ? "device" : "devices"}.
                </Text>
                {analysis.energy.topConsumers.slice(0, 3).map((t) => (
                  <View key={t.id} style={{ flexDirection: "row", marginTop: 6 }}>
                    <Text style={{ color: c.textDim, flex: 1 }} numberOfLines={1}>{t.name}</Text>
                    <Text style={{ color: c.text }}>{Math.round(t.watts)} W</Text>
                    <Text style={{ color: c.faint, width: 46, textAlign: "right" }}>{t.sharePct}%</Text>
                  </View>
                ))}
                <Text style={{ color: c.accent, fontWeight: "800", marginTop: 10 }}>Open energy ›</Text>
              </Card>
            )}

            <SectionLabel>
              {analysis.findings.length === 0 ? "Findings" : `Findings (${analysis.findings.length})`}
            </SectionLabel>

            {analysis.findings.length === 0 ? (
              <Card onPress={onOpenSuggestions}>
                <Text style={{ color: c.text, fontWeight: "900", fontSize: 17 }}>Nothing looks wrong</Text>
                <Text style={{ color: c.textDim, marginTop: 6 }}>
                  Every check passed against the telemetry currently available.
                </Text>
                <Text style={{ color: c.accent, fontWeight: "800", marginTop: 10 }}>Suggestions ›</Text>
              </Card>
            ) : (
              analysis.findings.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  color={tone(f.severity)}
                  onPress={routeFor(f, { onOpenDevices, onOpenEnergy, onOpenAutomate })}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Sends the user where they can actually act on the finding. */
function routeFor(
  f: Finding,
  nav: { onOpenDevices: () => void; onOpenEnergy: () => void; onOpenAutomate: () => void },
): (() => void) | undefined {
  if (f.id.startsWith("schedule-conflict")) return nav.onOpenAutomate;
  if (f.id.startsWith("standby") || f.id.startsWith("energy")) return nav.onOpenEnergy;
  if (f.deviceIds.length > 0) return nav.onOpenDevices;
  return undefined;
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ color, fontSize: 22, fontWeight: "900" }}>{value}</Text>
      <Text style={{ color: c.faint, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function FindingCard({ finding, color, onPress }: { finding: Finding; color: string; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Card onPress={onPress} style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: color }}>
      <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>{finding.title}</Text>
      <Text style={{ color: c.textDim, marginTop: 6, lineHeight: 20 }}>{finding.detail}</Text>
      {finding.suggestion ? (
        <Text style={{ color, fontWeight: "700", marginTop: 8 }}>{finding.suggestion}</Text>
      ) : null}
      {onPress ? <Text style={{ color: c.accent, fontWeight: "800", marginTop: 10 }}>Open ›</Text> : null}
    </Card>
  );
}
