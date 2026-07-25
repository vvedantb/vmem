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
import { Spinner } from "@vmem/ui";
import { IconBolt } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import PageContainer from "@/components/shell/PageContainer";
import { SkillsHub } from "@/components/skills/SkillsHub";
import { SystemSkillDetail } from "@/components/skills/SystemSkillDetail";
import { ViewSkillPanel } from "@/components/skills/ViewSkillPanel";
import { SkillPageTitle } from "@/components/skills/SkillPageTitle";
import { SkillHeaderActions } from "@/components/skills/SkillHeaderActions";
import { EditSkillDialog } from "@/components/skills/EditSkillDialog";
import { skillsSearchParams } from "@/lib/url-state/skills";
import { patchSkillInLists } from "@/lib/convex-optimistic";
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
  // the Hub is a child route (/skills/hub) rendered by this layout — same
  // pattern as the skill detail view (the layout owns rendering)
  const pathname = useLocation({ select: (l) => l.pathname });
  const onHub = pathname.endsWith("/skills/hub");
  const systemSkillId =
    typeof params.skillId === "string" ? params.skillId : undefined;

  const skills = useQuery(api.skills.listMy, { teamId });
  const updateSkill = useMutation(api.skills.updateSkill).withOptimisticUpdate(
    (localStore, args) => {
      patchSkillInLists(localStore, args);
    },
  );
  const [{ q: searchQuery }] = useQueryStates(skillsSearchParams);
  const [modal, setModal] = useState<ModalState>({ mode: "none" });

  const query = searchQuery.trim().toLowerCase();

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

  const pageTitle = hasSkill && viewedSkill ? viewedSkill.name : "Skills";

  function handleNameChange(value: string) {
    if (!viewedSkill) return;
    void updateSkill({ id: viewedSkill._id, name: value });
  }

  function handleNameCommit() {
    if (!viewedSkill) return;
    const trimmed = viewedSkill.name.trim();
    if (trimmed.length === 0) {
      void updateSkill({ id: viewedSkill._id, name: "Untitled skill" });
      return;
    }
    if (trimmed !== viewedSkill.name) {
      void updateSkill({ id: viewedSkill._id, name: trimmed });
    }
  }

  useEffect(() => {
    if (!skills || !hasSkillId) return;
    if (isSkillLoading) return;
    const filtered =
      query.length === 0
        ? skills
        : skills.filter(
            (skill) =>
              skill.name.toLowerCase().includes(query) ||
              skill.description.toLowerCase().includes(query),
          );
    if (filtered.length === 0) return;
    if (filtered.some((skill) => skill._id === skillId)) return;
    const first = filtered.at(0);
    if (!first) return;
    void navigate({
      to: "/$profileId/skills/$id",
      params: { profileId, id: first._id },
      replace: true,
    });
  }, [query, hasSkillId, isSkillLoading, skillId, navigate, skills, profileId]);

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
    const next = remaining.at(0);
    if (!next) return;
    void navigate({
      to: "/$profileId/skills/$id",
      params: { profileId, id: next._id },
      replace: true,
    });
  };

  // the Hub is its own page — use the settings convention (centred, titled
  // container) rather than the editor-style detail layout below
  if (onHub) {
    return (
      <PageContainer title="Skills Hub" centeredMaxWidth showTitle>
        <SkillsHub profileId={profileId} />
      </PageContainer>
    );
  }

  // A catalogue system skill has its own read-only detail page
  if (systemSkillId !== undefined) {
    return (
      <SystemSkillDetail systemSkillId={systemSkillId} profileId={profileId} />
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
            name={viewedSkill?.name ?? ""}
            onNameChange={handleNameChange}
            onNameCommit={handleNameCommit}
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
          <ViewSkillPanel skill={viewedSkill} />
        ) : isSkillLoading || skills === undefined ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size="sm" />
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
