"use client";

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@vmem/ui";
import {
  IconBolt,
  IconChevronDown,
  IconPencil,
  IconPlus,
  IconUpload,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import PageContainer from "@/components/PageContainer";
import { SkillCard } from "@/components/skills/SkillCard";
import { ViewSkillPanel } from "@/components/skills/ViewSkillPanel";
import { WriteSkillDialog } from "@/components/skills/WriteSkillDialog";
import { UploadSkillDialog } from "@/components/skills/UploadSkillDialog";
import { EditSkillDialog } from "@/components/skills/EditSkillDialog";

export const Route = createFileRoute("/_main/skills")({
  component: SkillsPage,
});

type PanelState = { mode: "none" } | { mode: "view"; skillId: Id<"skills"> };

type ModalState =
  | { mode: "none" }
  | { mode: "write" }
  | { mode: "upload" }
  | { mode: "edit"; skillId: Id<"skills"> };

function SkillsPage() {
  const skills = useQuery(api.skills.listMy);
  const [panel, setPanel] = useState<PanelState>({ mode: "none" });
  const [modal, setModal] = useState<ModalState>({ mode: "none" });

  useEffect(() => {
    if (!skills) return;

    if (panel.mode === "view" && !skills.some((s) => s._id === panel.skillId)) {
      setPanel({ mode: "none" });
    }

    if (modal.mode === "edit" && !skills.some((s) => s._id === modal.skillId)) {
      setModal({ mode: "none" });
    }
  }, [skills, panel, modal]);

  const viewedSkill =
    panel.mode === "view"
      ? skills?.find((s) => s._id === panel.skillId)
      : undefined;

  const editingSkill =
    modal.mode === "edit"
      ? skills?.find((s) => s._id === modal.skillId)
      : undefined;

  const isPanelOpen = panel.mode === "view";

  const openView = (skillId: Id<"skills">) => {
    setPanel({ mode: "view", skillId });
  };

  const handleSkillCreated = (skillId: Id<"skills">) => {
    setPanel({ mode: "view", skillId });
  };

  return (
    <PageContainer
      title="Skills"
      rightSection={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <IconPlus size={16} />
              Add Skill
              <IconChevronDown size={14} className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setModal({ mode: "write" })}>
              <IconPencil size={16} />
              Write skill
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setModal({ mode: "upload" })}>
              <IconUpload size={16} />
              Upload skill
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
        <div
          className={`min-h-0 overflow-y-auto md:w-1/3 md:shrink-0 ${isPanelOpen ? "hidden md:block" : "block w-full"}`}
        >
          {skills === undefined ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <IconBolt size={40} className="mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No skills yet. Add one to get started.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {skills.map((skill) => (
                <SkillCard
                  key={skill._id}
                  skill={skill}
                  selected={
                    panel.mode === "view" && panel.skillId === skill._id
                  }
                  onSelect={() => openView(skill._id)}
                />
              ))}
            </div>
          )}
        </div>

        {isPanelOpen && viewedSkill ? (
          <div className="flex min-h-0 w-full flex-col md:w-2/3 md:rounded-xl md:bg-muted/40">
            <ViewSkillPanel
              skill={viewedSkill}
              onClose={() => setPanel({ mode: "none" })}
              onEdit={() =>
                setModal({ mode: "edit", skillId: viewedSkill._id })
              }
            />
          </div>
        ) : (
          <div className="hidden min-h-0 w-2/3 items-center justify-center rounded-xl bg-muted/40 md:flex">
            <p className="text-sm text-muted-foreground">
              Select a skill to view
            </p>
          </div>
        )}
      </div>

      <WriteSkillDialog
        open={modal.mode === "write"}
        onOpenChange={(open) => {
          if (!open) setModal({ mode: "none" });
        }}
        onCreated={handleSkillCreated}
      />

      <UploadSkillDialog
        open={modal.mode === "upload"}
        onOpenChange={(open) => {
          if (!open) setModal({ mode: "none" });
        }}
        onCreated={handleSkillCreated}
      />

      <EditSkillDialog
        skill={editingSkill}
        open={modal.mode === "edit"}
        onOpenChange={(open) => {
          if (!open) setModal({ mode: "none" });
        }}
        onDeleted={() => {
          setPanel({ mode: "none" });
        }}
      />
    </PageContainer>
  );
}
