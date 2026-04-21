import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { Button } from "@vmem/ui";
import { IconBolt, IconPlus } from "@tabler/icons-react";
import { useState, useEffect } from "react";
import PageContainer from "@/components/PageContainer";
import { SkillCard } from "@/components/skills/SkillCard";
import { EditSkillPanel } from "@/components/skills/EditSkillPanel";
import { AddSkillPanel } from "@/components/skills/AddSkillPanel";

export const Route = createFileRoute("/_main/skills")({
  component: SkillsPage,
});

type PanelState =
  | { mode: "none" }
  | { mode: "add" }
  | { mode: "edit"; skillId: Id<"skills"> };

function SkillsPage() {
  const skills = useQuery(api.skills.listMy);
  const [panel, setPanel] = useState<PanelState>({ mode: "none" });

  // Clear selection if selected skill was deleted
  useEffect(() => {
    if (panel.mode === "edit" && skills) {
      const stillExists = skills.some((s) => s._id === panel.skillId);
      if (!stillExists) {
        setPanel({ mode: "none" });
      }
    }
  }, [skills, panel]);

  const selectedSkill =
    panel.mode === "edit"
      ? skills?.find((s) => s._id === panel.skillId)
      : undefined;

  const isPanelOpen = panel.mode !== "none";

  return (
    <PageContainer
      title="Skills"
      rightSection={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPanel({ mode: "add" })}
        >
          <IconPlus size={16} />
          Add Skill
        </Button>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
        {/* Left: Skill list. Hidden on mobile when a panel is open. */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto ${isPanelOpen ? "hidden md:block" : "block"}`}
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {skills.map((skill) => (
                <SkillCard
                  key={skill._id}
                  skill={skill}
                  selected={
                    panel.mode === "edit" && panel.skillId === skill._id
                  }
                  onSelect={() =>
                    setPanel({ mode: "edit", skillId: skill._id })
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: Panel. Inline on mobile (replaces the list), fixed-width card on desktop. */}
        {isPanelOpen && (
          <div className="flex min-h-0 flex-1 flex-col md:w-[400px] md:flex-initial md:shrink-0 md:rounded-xl md:bg-muted/40">
            {panel.mode === "add" && (
              <AddSkillPanel
                onClose={() => setPanel({ mode: "none" })}
                onCreated={() => setPanel({ mode: "none" })}
              />
            )}
            {panel.mode === "edit" && selectedSkill && (
              <EditSkillPanel
                skill={selectedSkill}
                onClose={() => setPanel({ mode: "none" })}
              />
            )}
          </div>
        )}

        {/* Placeholder when no panel open (desktop only) */}
        {!isPanelOpen && (
          <div className="hidden w-[400px] shrink-0 items-center justify-center rounded-xl bg-muted/40 md:flex">
            <p className="text-sm text-muted-foreground">
              Select a skill to edit
            </p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
