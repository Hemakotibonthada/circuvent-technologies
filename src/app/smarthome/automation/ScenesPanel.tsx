"use client";

import { useState } from "react";
import { Film, Pencil, Play, Plus, Star, Trash2 } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { useScenes } from "../_data/hooks";
import { useHomeAccess } from "@/lib/useHomeAccess";
import { useToast, ConfirmDialog } from "../_kit/overlays";
import { Button, EmptyState, ErrorState, LoadingState, RelativeTime, SectionTitle } from "../_kit/primitives";
import type { Scene } from "@/lib/control-plane";
import SceneEditor from "./SceneEditor";

export default function ScenesPanel() {
  const { scenes, loading, error, refresh, activate } = useScenes();
  const toast = useToast();
  /*
   * Running a scene is using the home; editing one changes what the household
   * does. A member with everyday access can press Goodnight and should not be
   * offered a delete button that only refuses them.
   */
  const access = useHomeAccess();
  const mayEdit = access.can("manage-automations");

  const [editorTarget, setEditorTarget] = useState<Scene | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<Scene | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activating, setActivating] = useState<number | null>(null);

  const handleActivate = async (scene: Scene) => {
    setActivating(scene.id);
    const sent = await activate(scene.id);
    setActivating(null);
    if (sent === null) {
      toast.err(`Could not activate "${scene.name}"`, "Check your connection.");
    } else {
      toast.ok(`"${scene.name}" activated`, `${sent} command${sent !== 1 ? "s" : ""} sent`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const r = await controlPlane.deleteScene(deleteTarget.id);
    setDeleting(false);
    if (r.ok) {
      toast.ok(`"${deleteTarget.name}" deleted`);
      refresh();
    } else {
      toast.err("Could not delete scene");
    }
    setDeleteTarget(null);
  };

  if (loading) return <LoadingState label="Loading scenes" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const favourites = scenes.filter((s) => s.favorite);
  const rest = scenes.filter((s) => !s.favorite);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {mayEdit && (
          <Button variant="primary" icon={Plus} onClick={() => setEditorTarget("new")}>
            New scene
          </Button>
        )}
      </div>

      {scenes.length === 0 && (
        <EmptyState
          icon={Film}
          title="No scenes yet"
          body={
            mayEdit
              ? "Scenes let you activate multiple devices in one tap. Capture the current state of your home or build one from scratch."
              : "Nobody has set up any scenes in this home yet. Ask an adult of the household to create one."
          }
          action={
            mayEdit ? (
              <Button variant="primary" icon={Plus} onClick={() => setEditorTarget("new")}>
                Create your first scene
              </Button>
            ) : undefined
          }
        />
      )}

      {favourites.length > 0 && (
        <>
          <SectionTitle>Favourites</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {favourites.map((s) => (
              <SceneCard
                key={s.id}
                scene={s}
                activating={activating === s.id}
                onActivate={() => handleActivate(s)}
                onEdit={mayEdit ? () => setEditorTarget(s) : undefined}
                onDelete={mayEdit ? () => setDeleteTarget(s) : undefined}
              />
            ))}
          </div>
        </>
      )}

      {rest.length > 0 && (
        <>
          {favourites.length > 0 && <SectionTitle>All scenes</SectionTitle>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((s) => (
              <SceneCard
                key={s.id}
                scene={s}
                activating={activating === s.id}
                onActivate={() => handleActivate(s)}
                onEdit={mayEdit ? () => setEditorTarget(s) : undefined}
                onDelete={mayEdit ? () => setDeleteTarget(s) : undefined}
              />
            ))}
          </div>
        </>
      )}

      {editorTarget !== null && (
        <SceneEditor
          scene={editorTarget === "new" ? null : editorTarget}
          onClose={() => setEditorTarget(null)}
          onSaved={() => {
            setEditorTarget(null);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete scene"
        body={
          <>
            Permanently delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
          </>
        }
        confirmLabel="Delete scene"
        danger
        busy={deleting}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scene card                                                          */
/* ------------------------------------------------------------------ */

function SceneCard({
  scene,
  activating,
  onActivate,
  onEdit,
  onDelete,
}: {
  scene: Scene;
  activating: boolean;
  onActivate: () => void;
  /** Absent when the viewer may run this scene but not change it. */
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className="cv-card flex flex-col rounded-2xl p-5"
      style={{ border: "1px solid var(--cv-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-4xl leading-none" role="img" aria-label={scene.name}>
          {scene.icon || "🎬"}
        </span>
        {scene.favorite && (
          <Star
            className="h-4 w-4 shrink-0 fill-current"
            style={{ color: "#f59e0b" }}
            aria-label="Favourite"
          />
        )}
      </div>

      <div className="mt-4 flex-1">
        <div className="font-bold" style={{ color: "var(--cv-text)" }}>
          {scene.name}
        </div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--cv-muted)" }}>
          {scene.actions.length} action{scene.actions.length !== 1 ? "s" : ""}
          {scene.created_at && (
            <>
              {" · "}
              <RelativeTime iso={scene.created_at} />
            </>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          variant="primary"
          icon={Play}
          busy={activating}
          onClick={onActivate}
          className="flex-1"
          title={`Activate ${scene.name}`}
        >
          Activate
        </Button>
        {onEdit && (
          <button
            onClick={onEdit}
            aria-label={`Edit ${scene.name}`}
            className="flex h-10 w-10 items-center justify-center rounded-xl transition hover:brightness-125"
            style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)", border: "1px solid var(--cv-border)" }}
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            aria-label={`Delete ${scene.name}`}
            className="flex h-10 w-10 items-center justify-center rounded-xl transition hover:brightness-125"
            style={{ background: "var(--cv-card-hi)", color: "#ef4444", border: "1px solid var(--cv-border)" }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
