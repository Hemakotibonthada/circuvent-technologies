"use client";

/**
 * Voice assistants — what can control this home by speaking to it.
 *
 * This screen exists because the question had no answer. Account linking is a
 * stateless token exchange, so an Echo in a house somebody moved out of, or a
 * Google account shared with an ex-partner, held a working grant with nothing
 * anywhere recording it and no way to take it back.
 */

import { useCallback, useEffect, useState } from "react";
import { Mic, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  LoadingState,
  SectionTitle,
  Surface,
  formatRelative,
} from "../_kit/primitives";
import { ConfirmDialog, useToast } from "../_kit/overlays";
import { controlPlane, type LinkedAssistant } from "@/lib/control-plane";

const LABEL: Record<LinkedAssistant["assistant"], string> = {
  google: "Google Home",
  alexa: "Amazon Alexa",
};

export default function AssistantsSection() {
  const toast = useToast();
  const [links, setLinks] = useState<LinkedAssistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [confirm, setConfirm] = useState<LinkedAssistant | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await controlPlane.assistants();
    /* A hub older than this feature has no such route. Told apart from "you
       have linked nothing", which looks identical from here and would tell
       somebody with a linked Echo that they had none. */
    if (r.status === 404) setUnsupported(true);
    else if (r.ok) setLinks(r.data.assistants ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const doUnlink = async () => {
    if (!confirm) return;
    setBusy(true);
    const r = await controlPlane.unlinkAssistant(confirm.assistant);
    setBusy(false);
    setConfirm(null);
    if (!r.ok) {
      toast.err("Could not unlink", (r.data as { error?: string })?.error ?? "");
      return;
    }
    toast.ok(`${LABEL[confirm.assistant]} disconnected`, r.data.message);
    void load();
  };

  if (loading) return <LoadingState label="Loading voice assistants" />;

  if (unsupported) {
    return (
      <>
        <SectionTitle>Voice assistants</SectionTitle>
        <Callout tone="warning" title="Your hub does not report linked assistants yet">
          Rebuild the control plane to see and manage what can control this home by voice.
        </Callout>
      </>
    );
  }

  return (
    <>
      <SectionTitle>Voice assistants</SectionTitle>
      <Surface>
        {links.length === 0 ? (
          <EmptyState
            icon={Mic}
            title="No assistants linked"
            body="Search for Circuvent in the Google Home or Alexa app to control your devices by voice."
          />
        ) : (
          <div className="space-y-1">
            {links.map((l) => (
              <div key={l.assistant} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                <Mic className="h-4 w-4 shrink-0" style={{ color: "var(--cv-muted)" }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{LABEL[l.assistant]}</div>
                  <div className="truncate text-xs" style={{ color: "var(--cv-muted)" }}>
                    Linked <RelativeOrNever iso={l.linkedAt} />
                    {l.lastSyncAt && <> · devices last synced {formatRelative(l.lastSyncAt)}</>}
                  </div>
                </div>
                {!l.receivesUpdates && (
                  /* Explains a real symptom rather than hiding a limitation:
                     without push, the assistant's app shows whatever it last
                     asked for, so a wall switch leaves it stale. */
                  <Badge tone="warning" title="This assistant is not sent live updates">
                    No live updates
                  </Badge>
                )}
                <Button variant="ghost" onClick={() => setConfirm(l)} title="Disconnect">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Surface>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={doUnlink}
        title={confirm ? `Disconnect ${LABEL[confirm.assistant]}?` : ""}
        body={
          <>
            It will no longer be able to control your devices.
            <br />
            <br />
            {/* Stated before they press it, not after. Over-revoking is the
                right side to err on, but being surprised by it is not. */}
            <strong>Your other devices will be signed out too</strong> — you will need to sign in
            again on your phone and on this console.
          </>
        }
        confirmLabel="Disconnect"
        danger
        busy={busy}
      />
    </>
  );
}

function RelativeOrNever({ iso }: { iso: string | null }) {
  if (!iso) return <>at an unknown time</>;
  return <>{formatRelative(iso)}</>;
}
