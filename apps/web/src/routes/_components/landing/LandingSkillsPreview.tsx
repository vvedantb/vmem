import { useState } from "react";
import { Button, cn } from "@vmem/ui";
import ShapeIndicator from "@/components/_components/ShapeIndicator";
import { hslToHex } from "@vmem/shared/graph";
import { useTheme } from "next-themes";
import { demoSkills, skillAt } from "./landing-preview-data";

export function LandingSkillsPreview() {
  const [selected, setSelected] = useState(0);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const color = isDark ? hslToHex(285, 55, 72) : hslToHex(285, 60, 50);
  const skill = skillAt(selected);

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto px-2 py-2 scrollbar-thin md:px-3">
        {demoSkills.map((item, index) => (
          <Button
            key={item.name}
            type="button"
            variant="ghost"
            onClick={() => setSelected(index)}
            className={cn(
              "h-auto w-full justify-start gap-2 rounded-lg px-3 py-1.5 text-left text-sm",
              index === selected
                ? "text-foreground"
                : "text-muted hover:text-foreground",
            )}
          >
            <ShapeIndicator
              kind="skill"
              color={color}
              className="h-2.5 w-2.5"
            />
            <span className="truncate font-mono text-[13px]">{item.name}</span>
          </Button>
        ))}
      </div>
      <aside className="hidden w-[min(100%,18rem)] shrink-0 border-l border-separator p-4 lg:block">
        <p className="font-mono text-sm text-foreground">{skill.name}</p>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted">
          {skill.hint}
        </p>
        <p className="mt-4 text-xs text-muted">
          Agents call this over MCP. Results come back with a Context Trace.
        </p>
      </aside>
    </div>
  );
}
