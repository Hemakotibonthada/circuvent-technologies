import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Screen, useTheme } from "../../../ui";
import { Kpi, KpiGrid, Callout, SeverityBadge } from "../../../enterprise-ui";
import { AccessRequired, FleetError, FleetLoading, FleetScaffold } from "./parts";
import { fetchFleetAnalysis, type FleetAnalysis, type Finding } from "../../../assistant";

/**
 * Fleet Intelligence.
 *
 * The other fleet screens count and list devices. This one correlates them:
 * every device of one owner offline together is that site's connectivity, not
 * six separate faults; a firmware version failing far above the fleet baseline
 * is a bad release rather than bad luck.
 *
 * The correlation runs on the server so this screen and the web console cannot
 * drift apart on thresholds — two implementations would eventually disagree
 * about whether a release is failing, and only one of them could be right.
 * Nothing here is generated text; each card is a computed finding with the
 * evidence it fired on.
 */

export default function FleetIntelligence({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const [analysis, setAnalysis] = useState<FleetAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchFleetAnalysis();
    if (res.ok) {
      setAnalysis(res.data);
      setError(null);
      setBlocked(false);
    } else {
      setAnalysis(null);
      // "You are not an administrator" is a different screen from "something
      // broke", so it is tracked separately rather than shown as an error.
      setBlocked(/administrator/i.test(res.error));
      setError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !analysis) return <FleetLoading text="Correlating fleet…" />;
  if (blocked) return <AccessRequired onRetry={load} />;
  if (error && !analysis) return <FleetError message={error} onRetry={load} />;
  if (!analysis) return <FleetError message="No analysis was returned." onRetry={load} />;

  const { counts, findings } = analysis;
  const critical = findings.filter((f) => f.severity === "critical").length;
  const onlinePct = counts.total ? Math.round((counts.online / counts.total) * 100) : 0;

  return (
    <Screen>
      <FleetScaffold
        title="Fleet intelligence"
        subtitle="Correlated findings across every registered device"
        onBack={onBack}
        onRefresh={load}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={c.accent} />}
        >
          <KpiGrid>
            <Kpi icon="fleet" label="Devices" value={counts.total} footnote={`${counts.owners} owners`} />
            <Kpi
              icon="wifi"
              label="Online"
              value={onlinePct}
              unit="%"
              tint={onlinePct >= 90 ? c.green : onlinePct >= 70 ? c.amber : c.red}
              footnote={`${counts.offline} offline`}
            />
            <Kpi
              icon="clock"
              label="Online but silent"
              value={counts.stale}
              tint={counts.stale === 0 ? c.green : c.amber}
              footnote="Not heard from recently"
            />
            <Kpi
              icon="help"
              label="Never reported"
              value={counts.neverSeen}
              tint={counts.neverSeen === 0 ? c.green : c.faint}
              footnote={`${counts.firmwareVersions} firmware versions`}
            />
          </KpiGrid>

          <View style={{ paddingHorizontal: 16, marginTop: 8, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: "900", fontSize: 15, flex: 1 }}>
              Correlated findings
            </Text>
            {critical > 0 ? <SeverityBadge severity="critical" label={`${critical} critical`} /> : null}
            <Text style={{ color: c.faint, fontSize: 12 }}>{findings.length}</Text>
          </View>

          {findings.length === 0 ? (
            <View style={{ paddingHorizontal: 16 }}>
              <Callout
                kind="success"
                title="No fleet-level patterns detected"
                text="Every correlation check passed against the devices currently registered."
                icon="shield"
              />
            </View>
          ) : (
            findings.map((f) => <FindingCard key={f.id} finding={f} />)
          )}
        </ScrollView>
      </FleetScaffold>
    </Screen>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const tint = finding.severity === "critical" ? c.red : finding.severity === "warning" ? c.amber : c.cyan;
  const evidence = Object.entries(finding.evidence);

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.border,
        borderLeftWidth: 3,
        borderLeftColor: tint,
        backgroundColor: c.card,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <SeverityBadge severity={finding.severity} />
        {finding.deviceIds.length > 0 ? (
          <Text style={{ color: c.faint, fontSize: 11 }}>
            {finding.deviceIds.length} {finding.deviceIds.length === 1 ? "device" : "devices"}
          </Text>
        ) : null}
      </View>

      <Text style={{ color: c.text, fontWeight: "900", fontSize: 15 }}>{finding.title}</Text>
      <Text style={{ color: c.textDim, marginTop: 6, lineHeight: 20 }}>{finding.detail}</Text>

      {finding.suggestion ? (
        <Text style={{ color: tint, fontWeight: "700", marginTop: 8 }}>{finding.suggestion}</Text>
      ) : null}

      {evidence.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {evidence.map(([k, v]) => (
            <View
              key={k}
              style={{
                backgroundColor: c.surface,
                borderColor: c.border,
                borderWidth: 1,
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 3,
              }}
            >
              <Text style={{ color: c.faint, fontSize: 11 }}>
                {k}=<Text style={{ color: c.text }}>{String(v)}</Text>
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {finding.deviceIds.length > 0 ? (
        <Text
          onPress={() => setOpen((p) => !p)}
          style={{ color: c.faint, fontSize: 11, marginTop: 10 }}
        >
          {open ? "Hide device IDs" : "Show affected device IDs"}
        </Text>
      ) : null}

      {open ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
          {finding.deviceIds.map((id) => (
            <Text
              key={id}
              style={{
                color: c.textDim,
                fontSize: 10,
                backgroundColor: c.surface,
                borderRadius: 4,
                paddingHorizontal: 5,
                paddingVertical: 2,
              }}
            >
              {id}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
