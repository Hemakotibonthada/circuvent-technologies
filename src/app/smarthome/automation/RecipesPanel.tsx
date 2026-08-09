"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Check } from "lucide-react";
import { controlPlane, type Device } from "@/lib/control-plane";
import {
  RECIPES,
  recipesFor,
  buildAutomation,
  listUsedRecipeIds,
  markUsed,
  type RecipeTemplate,
} from "@/lib/smarthome-recipes";
import {
  Surface,
  SectionTitle,
  Button,
  SelectInput,
  Field,
  EmptyState,
  ErrorState,
  LoadingState,
  Callout,
} from "../_kit/primitives";
import { useToast } from "../_kit/overlays";

/**
 * One-tap automations.
 *
 * The rule editor asks for a trigger type, a device, a field, an operator, a
 * value, an action type and a command before it will save anything. That is
 * the right amount of control for the tenth rule and far too much for the
 * first, which is usually "turn this off at midnight".
 *
 * Only templates the selected device can actually carry out are offered --
 * see recipesFor. Showing "alert me when the tank runs low" next to a light
 * switch is how a features list gets long and a product gets worse.
 */
export default function RecipesPanel() {
  const toast = useToast();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [used, setUsed] = useState<string[]>([]);

  useEffect(() => setUsed(listUsedRecipeIds()), []);

  const load = async () => {
    setError(null);
    const r = await controlPlane.devices();
    if (r.ok) {
      const list = r.data.devices ?? [];
      setDevices(list);
      setDeviceId((cur) => cur || list[0]?.id || "");
    } else {
      setDevices(null);
      setError(r.status === 0 ? "Can't reach the control plane." : `Couldn't load your devices (${r.status}).`);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const device = useMemo(() => devices?.find((d) => d.id === deviceId) ?? null, [devices, deviceId]);
  const available = useMemo(() => recipesFor(device), [device]);
  const hidden = RECIPES.length - available.length;

  const apply = async (recipe: RecipeTemplate) => {
    if (!device) return;
    const body = buildAutomation(recipe, device);
    if (!body) {
      // Should be unreachable: recipesFor already dropped anything that cannot
      // be built. Saying so is better than saving a rule that does nothing.
      toast.err("That automation can't be built", `${device.name || device.id} does not accept this command.`);
      return;
    }

    setBusyId(recipe.id);
    const r = await controlPlane.createAutomation(body as never);
    setBusyId(null);

    if (r.ok) {
      markUsed(recipe.id);
      setUsed(listUsedRecipeIds());
      toast.ok("Automation created", body.name);
    } else {
      toast.err(
        "Could not create the automation",
        r.status === 0 ? "Network error." : `Server error ${r.status}.`
      );
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!devices) return <LoadingState label="Loading your devices" />;

  if (!devices.length) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No devices yet"
        body="Quick automations build a rule around one of your devices. Add a device first."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Surface>
        <SectionTitle>Quick automations</SectionTitle>
        <p className="mb-4 text-sm" style={{ color: "var(--cv-muted)" }}>
          A ready-made rule in one tap. Everything here creates a normal automation — it will appear
          under Rules, and you can edit or delete it there like any other.
        </p>

        <Field label="Device">
          <SelectInput
            value={deviceId}
            onChange={setDeviceId}
            options={devices.map((d) => ({ value: d.id, label: d.name || d.id }))}
          />
        </Field>
      </Surface>

      {available.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nothing to offer for this device"
          body={`${device?.name || "This device"} does not report the readings or accept the commands any of the quick automations need. The rule editor can still build one by hand.`}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {available.map((r) => {
            const done = used.includes(r.id);
            return (
              <Surface key={r.id} className="flex flex-col justify-between">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span aria-hidden className="text-xl">{r.icon}</span>
                    <h4 className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>{r.title}</h4>
                  </div>
                  <p className="text-xs" style={{ color: "var(--cv-muted)" }}>{r.description}</p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button onClick={() => apply(r)} disabled={busyId === r.id} busy={busyId === r.id} variant="primary">
                    {busyId === r.id ? "Creating…" : "Create"}
                  </Button>
                  {done && (
                    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                      <Check className="h-3 w-3" aria-hidden /> used before
                    </span>
                  )}
                </div>
              </Surface>
            );
          })}
        </div>
      )}

      {hidden > 0 && available.length > 0 && (
        <Callout tone="info">
          {hidden} more {hidden === 1 ? "template is" : "templates are"} hidden because{" "}
          {device?.name || "this device"} does not report the readings they need.
        </Callout>
      )}
    </div>
  );
}
