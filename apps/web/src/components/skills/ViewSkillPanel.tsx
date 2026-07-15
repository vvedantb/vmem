"use client";

import type { SkillViewFields } from "@/components/skills/_utils";
import {
  SkillDescriptionSection,
  SkillInstructionsSection,
  SkillPanelShell,
} from "@/components/skills/SkillPanelSections";

interface ViewSkillPanelProps {
  skill: SkillViewFields;
}

export function ViewSkillPanel({ skill }: ViewSkillPanelProps) {
  return (
    <SkillPanelShell>
      {skill.description ? (
        <SkillDescriptionSection>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {skill.description}
          </p>
        </SkillDescriptionSection>
      ) : null}

      <SkillInstructionsSection>
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
          {skill.instructions}
        </pre>
      </SkillInstructionsSection>
    </SkillPanelShell>
  );
}
