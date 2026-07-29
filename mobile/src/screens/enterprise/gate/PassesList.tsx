/**
 * Passes list — a searchable/filterable/sortable roster of every guest pass
 * the account owns.
 *
 * Data is `api.gatePasses()` with no client-side status derivation. Sort and
 * filter operate purely on the fetched rows.
 *
 * CSV export uses `toCsv` from the shared enterprise layer and hands the
 * string to the React Native core `Share` API, which lets the operator paste
 * it into a spreadsheet, email or a note. The code column is intentionally
 * omitted from the export — an unrevoked code is a live credential and does
 * not belong in a spreadsheet.
 */
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Share, Text, View } from "react-native";
import { toCsv } from "../../../enterprise";
import { ToastHost, useTheme, useToast } from "../../../ui";
import {
  Callout,
  FilterBar,
  Kpi,
  KpiGrid,
  SearchField,
} from "../../../enterprise-ui";
import type { GatePass } from "../../../api";
import { GateScaffold, HonestEmpty, PassRow, Section } from "./parts";
import { PassDetail } from "./PassDetail";
import { CreatePass } from "./CreatePass";
import {
  PASS_CSV_COLUMNS,
  PASS_FILTERS,
  matchesFilter,
  passCounts,
  passesToCsvRows,
  searchMatches,
  sortPasses,
  type PassFilter,
} from "./types";
import { useGateData } from "./useGate";

interface Props {
  onBack: () => void;
}

type SubView =
  | { kind: "list" }
  | { kind: "detail"; passId: number }
  | { kind: "create" };

export default function PassesList({ onBack }: Props) {
  const { c } = useTheme();
  const gate = useGateData();
  const [view, setView] = useState<SubView>({ kind: "list" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PassFilter>("all");
  const { toast, show, hide } = useToast();

  const counts = useMemo(() => passCounts(gate.passes), [gate.passes]);

  const shownPasses = useMemo(() => {
    const filtered = gate.passes.filter((p) => matchesFilter(p, filter) && searchMatches(p, query));
    return sortPasses(filtered);
  }, [gate.passes, filter, query]);

  const exportCsv = useCallback(async () => {
    if (!gate.passes.length) {
      show("Nothing to export yet", "warning");
      return;
    }
    const csv = toCsv(passesToCsvRows(gate.passes) as unknown as Record<string, unknown>[], PASS_CSV_COLUMNS as unknown as string[]);
    try {
      // Share the CSV as the message body. No file system access is required
      // — every share target that accepts long text will take this. The
      // caller (operator) then pastes into their spreadsheet of choice.
      await Share.share({ message: csv, title: "Guest passes export" });
    } catch (err) {
      show(err instanceof Error ? err.message : "Could not export", "error");
    }
  }, [gate.passes, show]);

  const openDetail = useCallback((pass: GatePass) => {
    setView({ kind: "detail", passId: pass.id });
  }, []);

  if (view.kind === "detail") {
    const pass = gate.passes.find((p) => p.id === view.passId) ?? null;
    return (
      <PassDetail
        pass={pass}
        onBack={() => setView({ kind: "list" })}
        onRevoked={() => {
          show("Pass revoked", "success");
          setView({ kind: "list" });
        }}
      />
    );
  }

  if (view.kind === "create") {
    return (
      <CreatePass
        onBack={() => setView({ kind: "list" })}
        onCreated={(pass) => {
          show("Pass created", "success");
          setView({ kind: "detail", passId: pass.id });
        }}
      />
    );
  }

  const filterOptions = PASS_FILTERS.map((f) => ({ value: f.value, label: f.label }));

  return (
    <GateScaffold
      title="Guest passes"
      subtitle={`${gate.passes.length} pass${gate.passes.length === 1 ? "" : "es"} loaded from the control plane`}
      onBack={onBack}
      onRefresh={gate.refresh}
      refreshing={gate.refreshing}
      loading={gate.loading}
      error={gate.error && !gate.lastUpdated ? gate.error : null}
      onRetry={gate.reload}
      actions={[
        { icon: "add", label: "Create pass", onPress: () => setView({ kind: "create" }), tint: c.accentHi },
        { icon: "download", label: "Export CSV", onPress: exportCsv },
      ]}
    >
      <ScrollView
        refreshControl={<RefreshControl refreshing={gate.refreshing} onRefresh={gate.refresh} tintColor={c.accent} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {gate.error ? <Callout kind="warning" icon="warning" text={gate.error} /> : null}

        <KpiGrid>
          <Kpi icon="pass" label="All passes" value={counts.all} tint={c.text} />
          <Kpi icon="check" label="Active" value={counts.active} tint={c.green} />
          <Kpi icon="clock" label="Scheduled" value={counts.scheduled} tint={c.cyan} />
          <Kpi icon="history" label="Expired" value={counts.expired} tint={c.faint} invertDelta />
          <Kpi icon="success" label="Used" value={counts.used} tint={c.violet} />
          <Kpi icon="cancel" label="Revoked" value={counts.revoked} tint={c.red} invertDelta />
        </KpiGrid>

        <View style={{ marginHorizontal: -16 }}>
          <FilterBar options={filterOptions} value={filter} onChange={setFilter} counts={counts} />
        </View>

        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search by label, code or device id"
        />

        <Section
          title={`${shownPasses.length} of ${gate.passes.length} pass${gate.passes.length === 1 ? "" : "es"}`}
          subtitle="Tap a row for QR, share and revoke"
        >
          {shownPasses.length ? (
            shownPasses.map((pass) => (
              <PassRow
                key={pass.id}
                pass={pass}
                device={gate.devices.find((d) => d.id === pass.device_id)}
                onPress={() => openDetail(pass)}
              />
            ))
          ) : gate.passes.length ? (
            <HonestEmpty
              title="No passes match"
              subtitle="Try clearing the filter or search term."
              actionLabel="Clear filters"
              onAction={() => {
                setFilter("all");
                setQuery("");
              }}
            />
          ) : (
            <HonestEmpty
              icon="pass"
              title="No passes yet"
              subtitle="Guest passes you create will appear here."
              actionLabel="Create first pass"
              onAction={() => setView({ kind: "create" })}
            />
          )}
        </Section>

        <Text style={{ color: c.faint, fontSize: 11, textAlign: "center", marginTop: 12 }}>
          Pass status is computed server-side. A revoked pass will never re-appear as active.
        </Text>
      </ScrollView>
      <ToastHost toast={toast} onHide={hide} />
    </GateScaffold>
  );
}
