"use client";

import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useQueryStates } from "nuqs";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { IconBolt } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import PageContainer from "@/components/PageContainer";
import { SkillsHub } from "@/components/skills/SkillsHub";
import { ViewSkillPanel } from "@/components/skills/ViewSkillPanel";
import { SkillPageTitle } from "@/components/skills/SkillPageTitle";
import { SkillHeaderActions } from "@/components/skills/SkillHeaderActions";
import { EditSkillDialog } from "@/components/skills/EditSkillDialog";
import { skillsSearchParams } from "./-searchParams";
import { useActiveProfile } from "@/components/workspace/active-profile";

export const Route = createFileRoute("/_main/$profileId/skills")({
  component: SkillsLayout,
});

type ModalState = { mode: "none" } | { mode: "edit"; skillId: Id<"skills"> };

function SkillsLayout() {
  const { profileId } = Route.useParams();
  const teamId = useActiveProfile().teamId;
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const skillId = typeof params.id === "string" ? params.id : undefined;
  // The Hub is a child route (/skills/hub) rendered by this layout — same
  // pattern as the skill detail view (the layout owns rendering).
  const pathname = useLocation({ select: (l) => l.pathname });
  const onHub = pathname.endsWith("/skills/hub");

  const skills = useQuery(api.skills.listMy, { teamId });
  const updateSkill = useMutation(api.skills.updateSkill).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.skills.listMy, { teamId });
      if (!current) return;
      const now = Date.now();
      localStore.setQuery(
        api.skills.listMy,
        { teamId },
        current.map((row) => {
          if (row._id !== args.id) return row;
          return {
            ...row,
            ...(args.name !== undefined ? { name: args.name.trim() } : {}),
            ...(args.description !== undefined
              ? { description: args.description }
              : {}),
            ...(args.instructions !== undefined
              ? { instructions: args.instructions }
              : {}),
            ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
            updatedAt: now,
          };
        }),
      );
    },
  );
  const [{ q: searchQuery }] = useQueryStates(skillsSearchParams);
  const [modal, setModal] = useState<ModalState>({ mode: "none" });
  const [nameDraft, setNameDraft] = useState("");

  const filteredSkills = useMemo(() => {
    if (!skills) return [];
    const query = searchQuery.trim().toLowerCase();
    if (query.length === 0) return skills;
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query),
    );
  }, [skills, searchQuery]);

  const hasSkillId = typeof skillId === "string" && skillId.length > 0;
  const viewedSkill = hasSkillId
    ? skills?.find((skill) => skill._id === skillId)
    : undefined;
  const hasSkill = hasSkillId && viewedSkill !== undefined;
  const isSkillLoading = hasSkillId && skills === undefined;

  const editingSkill =
    modal.mode === "edit"
      ? skills?.find((skill) => skill._id === modal.skillId)
      : undefined;

  const pageTitle =
    hasSkill && viewedSkill ? nameDraft || viewedSkill.name : "Skills";

  const handleNameCommit = useCallback(async () => {
    if (!viewedSkill) return;
    const trimmed = nameDraft.trim();
    if (trimmed.length === 0 || trimmed === viewedSkill.name) {
      setNameDraft(viewedSkill.name);
      return;
    }
    try {
      await updateSkill({ id: viewedSkill._id, name: trimmed });
      toast.success("Saved!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      setNameDraft(viewedSkill.name);
    }
  }, [nameDraft, updateSkill, viewedSkill]);

  useEffect(() => {
    if (!hasSkillId) {
      setNameDraft("");
    }
  }, [hasSkillId]);

  useEffect(() => {
    if (viewedSkill) {
      setNameDraft(viewedSkill.name);
    }
  }, [viewedSkill?._id, viewedSkill?.name]);

  useEffect(() => {
    if (!skills || !hasSkillId) return;
    if (filteredSkills.length === 0) return;
    if (isSkillLoading) return;
    if (filteredSkills.some((skill) => skill._id === skillId)) return;
    void navigate({
      to: "/$profileId/skills/$id",
      params: { profileId, id: filteredSkills[0]._id },
      replace: true,
    });
  }, [
    filteredSkills,
    hasSkillId,
    isSkillLoading,
    skillId,
    navigate,
    skills,
    profileId,
  ]);

  useEffect(() => {
    if (!skills) return;
    if (modal.mode === "edit" && !skills.some((s) => s._id === modal.skillId)) {
      setModal({ mode: "none" });
    }
  }, [skills, modal]);

  const handleSkillDeleted = () => {
    setModal({ mode: "none" });
    if (!skills) {
      void navigate({
        to: "/$profileId/skills",
        params: { profileId },
        replace: true,
      });
      return;
    }
    const remaining = skills.filter((skill) => skill._id !== skillId);
    if (remaining.length === 0) {
      void navigate({
        to: "/$profileId/skills",
        params: { profileId },
        replace: true,
      });
      return;
    }
    void navigate({
      to: "/$profileId/skills/$id",
      params: { profileId, id: remaining[0]._id },
      replace: true,
    });
  };

  // The Hub is its own page — use the settings convention (centered, titled
  // container) rather than the editor-style detail layout below.
  if (onHub) {
    return (
      <PageContainer title="Skills Hub" centeredMaxWidth showTitle>
        <SkillsHub />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={pageTitle}
      noScroll
      centeredMaxWidth
      breadcrumb={
        hasSkill || isSkillLoading ? (
          <SkillPageTitle
            name={nameDraft}
            onNameChange={setNameDraft}
            onNameCommit={() => void handleNameCommit()}
          />
        ) : undefined
      }
      rightSection={
        hasSkill && viewedSkill ? (
          <SkillHeaderActions
            skill={viewedSkill}
            onEdit={() => setModal({ mode: "edit", skillId: viewedSkill._id })}
            onDeleted={handleSkillDeleted}
          />
        ) : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {hasSkill && viewedSkill ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <ViewSkillPanel skill={viewedSkill} />
          </div>
        ) : isSkillLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
          </div>
        ) : skills === undefined ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <IconBolt size={40} className="mb-3 text-muted" />
            <p className="text-sm text-muted">
              No skills yet. Use Add in the sidebar to get started.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted">
              Select a skill from the sidebar
            </p>
          </div>
        )}
      </div>

      <Outlet />

      <EditSkillDialog
        skill={editingSkill}
        open={modal.mode === "edit"}
        onOpenChange={(open) => {
          if (!open) setModal({ mode: "none" });
        }}
      />
    </PageContainer>
  );
}
