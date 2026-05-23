"use client";

import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
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
import { useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";
import { SkillCard } from "@/components/skills/SkillCard";
import { SkillsSearchBar } from "@/components/skills/SkillsSearchBar";
import { ViewSkillPanel } from "@/components/skills/ViewSkillPanel";
import { WriteSkillDialog } from "@/components/skills/WriteSkillDialog";
import { UploadSkillDialog } from "@/components/skills/UploadSkillDialog";
import { EditSkillDialog } from "@/components/skills/EditSkillDialog";

export const Route = createFileRoute("/_main/skills")({
  component: SkillsLayout,
});

type ModalState =
  | { mode: "none" }
  | { mode: "write" }
  | { mode: "upload" }
  | { mode: "edit"; skillId: Id<"skills"> };

function SkillsLayout() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const skillId = typeof params.id === "string" ? params.id : undefined;

  const skills = useQuery(api.skills.listMy);
  const [modal, setModal] = useState<ModalState>({ mode: "none" });
  const [searchQuery, setSearchQuery] = useState("");

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

  useEffect(() => {
    if (!skills || !skillId) return;
    if (filteredSkills.length === 0) return;

    if (!filteredSkills.some((s) => s._id === skillId)) {
      void navigate({
        to: "/skills/$id",
        params: { id: filteredSkills[0]._id },
        replace: true,
      });
    }
  }, [filteredSkills, skillId, navigate, skills]);

  useEffect(() => {
    if (!skills) return;
    if (modal.mode === "edit" && !skills.some((s) => s._id === modal.skillId)) {
      setModal({ mode: "none" });
    }
  }, [skills, modal]);

  const viewedSkill = skillId
    ? skills?.find((s) => s._id === skillId)
    : undefined;

  const editingSkill =
    modal.mode === "edit"
      ? skills?.find((s) => s._id === modal.skillId)
      : undefined;

  const isDetailRoute = skillId !== undefined;

  const openSkill = (id: Id<"skills">) => {
    void navigate({ to: "/skills/$id", params: { id } });
  };

  const handleSkillCreated = (id: Id<"skills">) => {
    openSkill(id);
  };

  const handleSkillDeleted = () => {
    setModal({ mode: "none" });
    if (!skills) {
      void navigate({ to: "/skills", replace: true });
      return;
    }
    const remaining = skills.filter((s) => s._id !== skillId);
    if (remaining.length === 0) {
      void navigate({ to: "/skills", replace: true });
      return;
    }
    void navigate({
      to: "/skills/$id",
      params: { id: remaining[0]._id },
      replace: true,
    });
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
          className={`min-h-0 overflow-y-auto md:w-1/3 md:shrink-0 ${isDetailRoute ? "hidden md:block" : "block w-full"}`}
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
            <>
              <SkillsSearchBar value={searchQuery} onChange={setSearchQuery} />
              {filteredSkills.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No skills match your search.
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {filteredSkills.map((skill) => (
                    <SkillCard
                      key={skill._id}
                      skill={skill}
                      selected={skillId === skill._id}
                      onSelect={() => openSkill(skill._id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {isDetailRoute && viewedSkill ? (
          <div className="flex min-h-0 w-full flex-col md:w-2/3 md:rounded-xl md:bg-muted/40">
            <ViewSkillPanel
              skill={viewedSkill}
              onEdit={() =>
                setModal({ mode: "edit", skillId: viewedSkill._id })
              }
              onDeleted={handleSkillDeleted}
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

      <Outlet />

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
      />
    </PageContainer>
  );
}
