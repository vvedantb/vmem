import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { Button } from "@vmem/ui";
import { IconBolt, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import PageContainer from "@/components/PageContainer";
import { SkillCard } from "@/components/skills/SkillCard";
import { AddSkillDialog } from "@/components/skills/AddSkillDialog";

export const Route = createFileRoute("/_main/skills")({
  component: SkillsPage,
});

function SkillsPage() {
  const skills = useQuery(api.skills.listMy);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <PageContainer
      title="Skills"
      rightSection={
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <IconPlus size={16} />
          Add Skill
        </Button>
      }
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {skills.map((skill) => (
            <SkillCard key={skill._id} skill={skill} />
          ))}
        </div>
      )}

      <AddSkillDialog open={addOpen} onOpenChange={setAddOpen} />
    </PageContainer>
  );
}
