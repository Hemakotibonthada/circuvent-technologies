import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Switch } from "react-native";
import {
  SECTION_META,
  isDefault,
  isHidden,
  move,
  setHidden,
  visibleSections,
  DEFAULT_LAYOUT,
  type HomeLayout,
  type HomeSection,
} from "./home-layout";
import { getLayout, loadLayout, onLayoutChange, saveLayout } from "./home-layout-store";
import { useTheme, Card, SectionLabel } from "./ui";
import { Icon } from "./icons";
import { tapLight } from "./haptics";
import { TAP_SLOP } from "./theme";

/**
 * The current home layout, kept in step with the store.
 *
 * The store is a module singleton rather than context because the layout is
 * read by the home screen and written by a sheet the home screen owns; putting
 * it in context would mean a provider above both for one value that changes a
 * few times in a lifetime.
 */
export function useHomeLayout(): HomeLayout {
  const [layout, setLayout] = useState<HomeLayout>(getLayout);

  useEffect(() => {
    const off = onLayoutChange(() => setLayout(getLayout()));
    void loadLayout();
    return off;
  }, []);

  return layout;
}

/** The sections to render, in the user's order. */
export function useVisibleSections(): HomeSection[] {
  return visibleSections(useHomeLayout());
}

/**
 * The editor.
 *
 * Arrows rather than drag-and-drop. The list is inside a vertical scroll view,
 * where a long-press-then-drag competes with the scroll for the same gesture
 * and loses often enough to feel broken — and a drag handle is unusable with a
 * screen reader or a switch. Two buttons always work, and the whole interaction
 * is legible without a tutorial.
 *
 * Changes apply immediately rather than on a Save button: the thing being
 * edited is a list of sections whose effect is obvious, every change is one tap
 * to undo, and Reset is right there.
 */
export function HomeEditor({ onClose }: { onClose: () => void }) {
  const { c } = useTheme();
  const layout = useHomeLayout();

  const apply = useCallback((next: HomeLayout) => {
    tapLight();
    void saveLayout(next);
  }, []);

  const s = styles(c);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.head}>
        <Text style={s.title}>Customise home</Text>
        <Pressable onPress={onClose} hitSlop={TAP_SLOP} accessibilityRole="button" accessibilityLabel="Done">
          <Text style={s.done}>Done</Text>
        </Pressable>
      </View>

      <Text style={s.lead}>
        Reorder the sections of your home screen, or hide the ones you never use. This applies to every theme, and
        follows your account to the web.
      </Text>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <SectionLabel>Sections</SectionLabel>
        <Card padded>
          {layout.order.map((key, i) => {
            const meta = SECTION_META[key];
            const hidden = isHidden(layout, key);
            const first = i === 0;
            const last = i === layout.order.length - 1;
            return (
              <View
                key={key}
                style={[s.row, i < layout.order.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}
              >
                <View style={s.arrows}>
                  <Pressable
                    onPress={() => apply(move(layout, key, -1))}
                    disabled={first}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${meta.label} up`}
                    accessibilityState={{ disabled: first }}
                    style={s.arrow}
                  >
                    <Icon name="collapse" size={17} color={first ? c.faint : c.accent} />
                  </Pressable>
                  <Pressable
                    onPress={() => apply(move(layout, key, 1))}
                    disabled={last}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${meta.label} down`}
                    accessibilityState={{ disabled: last }}
                    style={s.arrow}
                  >
                    <Icon name="expand" size={17} color={last ? c.faint : c.accent} />
                  </Pressable>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[s.label, hidden && { color: c.faint }]} numberOfLines={1}>
                    {meta.label}
                  </Text>
                  <Text style={s.hint} numberOfLines={1}>
                    {meta.required ? "Always shown" : meta.hint}
                  </Text>
                </View>

                {/*
                  The device grid has no switch at all rather than a disabled
                  one. A control that is present but refuses to move invites you
                  to keep trying; saying "Always shown" answers the question.
                */}
                {!meta.required && (
                  <Switch
                    value={!hidden}
                    onValueChange={(v) => apply(setHidden(layout, key, !v))}
                    trackColor={{ true: c.accent, false: c.borderHi }}
                    thumbColor="#fff"
                    accessibilityLabel={`Show ${meta.label}`}
                  />
                )}
              </View>
            );
          })}
        </Card>

        {!isDefault(layout) && (
          <Pressable
            onPress={() => apply({ ...DEFAULT_LAYOUT, order: [...DEFAULT_LAYOUT.order] })}
            style={s.reset}
            accessibilityRole="button"
            accessibilityLabel="Reset home layout to default"
          >
            <Text style={s.resetT}>Reset to default</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>["c"]) =>
  StyleSheet.create({
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
    title: { color: c.text, fontSize: 20, fontWeight: "800" },
    done: { color: c.accent, fontSize: 16, fontWeight: "700" },
    lead: { color: c.textDim, fontSize: 13, lineHeight: 19, marginBottom: 12 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
    arrows: { width: 30, alignItems: "center" },
    arrow: { paddingVertical: 3 },
    label: { color: c.text, fontSize: 15, fontWeight: "700" },
    hint: { color: c.faint, fontSize: 12, marginTop: 1 },
    reset: {
      marginTop: 16,
      paddingVertical: 13,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
    },
    resetT: { color: c.textDim, fontWeight: "700" },
  });
