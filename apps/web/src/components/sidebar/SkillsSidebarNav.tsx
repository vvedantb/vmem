"use client";

import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useQueryStates } from "nuqs";
import { motion } from "motion/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import { IconBolt } from "@tabler/icons-react";
import { SkillCard } from "@/components/skills/SkillCard";
import { SkillsSearchBar } from "@/components/skills/SkillsSearchBar";
import { SkillsAddMenu } from "@/components/skills/SkillsAddMenu";
import { WriteSkillDialog } from "@/components/skills/WriteSkillDialog";
import { UploadSkillDialog } from "@/components/skills/UploadSkillDialog";
import { skillsSearchParams } from "@/routes/_main/$profileId/skills/-searchParams";
import { SharedLayoutBackground } from "./SharedLayoutBackground";
import {
  useActiveProfileId,
  useActiveTeamId,
} from "@/components/workspace/active-profile";

export type SkillsSidebarNavProps = {
  isIconOnly: boolean;
  isMobile: boolean;
};

type CreateModalState = "none" | "write" | "upload";

export function SkillsSidebarNav({
  isIconOnly,
  isMobile,
}: SkillsSidebarNavProps) {
  const navigate = useNavigate();
  const profileId = useActiveProfileId();
  const teamId = useActiveTeamId();
  const params = useParams({ strict: false });
  const skillId = typeof params.id === "string" ? params.id : undefined;

  const skills = useQuery(api.skills.listMy, { teamId });
  const [{ q: searchQuery }, setSearchParams] =
    useQueryStates(skillsSearchParams);
  const [createModal, setCreateModal] = useState<CreateModalState>("none");

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

  const openSkill = (id: Id<"skills">) => {
    if (profileId === undefined) return;
    void navigate({
      to: "/$profileId/skills/$id",
      params: { profileId, id },
    });
  };

  const handleSkillCreated = (id: Id<"skills">) => {
    openSkill(id);
  };

  return (
    <motion.nav
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin px-1">
        {skills === undefined ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-2 py-10 text-center">
            <IconBolt size={28} className="mb-2 text-muted" />
            {!isIconOnly ? (
              <p className="text-xs text-muted">No skills yet</p>
            ) : null}
          </div>
        ) : (
          <>
            {!isIconOnly ? (
              <SkillsSearchBar
                value={searchQuery}
                onChange={(value) => {
                  void setSearchParams({ q: value });
                }}
              />
            ) : null}
            {filteredSkills.length === 0 ? (
              !isIconOnly ? (
                <p className="px-2 py-4 text-center text-xs text-muted">
                  No skills match your search.
                </p>
              ) : null
            ) : (
              <SharedLayoutBackground.Root
                pinnedId={skillId ?? null}
                className="gap-0.5"
              >
                {filteredSkills.map((skill) => (
                  <SharedLayoutBackground.Item key={skill._id} id={skill._id}>
                    <SkillCard
                      skill={skill}
                      selected={skillId === skill._id}
                      onSelect={() => openSkill(skill._id)}
                    />
                  </SharedLayoutBackground.Item>
                ))}
              </SharedLayoutBackground.Root>
            )}
          </>
        )}
      </div>

      {!isIconOnly ? (
        <div className="shrink-0 px-1 pt-2">
          <SkillsAddMenu
            className="w-full gap-2"
            onWriteSkill={() => setCreateModal("write")}
            onUploadSkill={() => setCreateModal("upload")}
          />
        </div>
      ) : null}

      <WriteSkillDialog
        open={createModal === "write"}
        onOpenChange={(open) => {
          if (!open) setCreateModal("none");
        }}
        onCreated={handleSkillCreated}
      />

      <UploadSkillDialog
        open={createModal === "upload"}
        onOpenChange={(open) => {
          if (!open) setCreateModal("none");
        }}
        onCreated={handleSkillCreated}
      />
    </motion.nav>
  );
}
