import { useMemo, useState } from "react";
import {
  IconChevronRight,
  IconFileText,
  IconFolder,
} from "@tabler/icons-react";
import { Button, cn } from "@vmem/ui";
import { demoWikiTree, type DemoWikiNode } from "./landing-preview-data";

function flattenDocs(node: DemoWikiNode): DemoWikiNode[] {
  if (node.kind === "document") return [node];
  return (node.children ?? []).flatMap(flattenDocs);
}

export function LandingWikiPreview() {
  const docs = useMemo(() => flattenDocs(demoWikiTree), []);
  const [activeId, setActiveId] = useState(docs[0]?.id ?? "recall");
  const active = docs.find((doc) => doc.id === activeId) ?? docs[0];

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-52 shrink-0 overflow-y-auto border-r border-separator px-2 py-2 scrollbar-thin sm:block">
        <WikiTree
          node={demoWikiTree}
          activeId={activeId}
          onSelect={setActiveId}
          depth={0}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-4 pb-8 pt-2 scrollbar-thin sm:px-6">
        <div className="mb-4 flex gap-1 overflow-x-auto pb-1 sm:hidden">
          {docs.map((doc) => (
            <Button
              key={doc.id}
              type="button"
              size="sm"
              variant={doc.id === activeId ? "default" : "secondary"}
              onClick={() => setActiveId(doc.id)}
              className="h-8 shrink-0 rounded-full px-3 text-xs"
            >
              {doc.title}
            </Button>
          ))}
        </div>

        {active ? (
          <article className="max-w-xl">
            <p className="mb-3 text-xs text-muted">
              Final year project / {active.title}
            </p>
            <h3 className="font-instrumentSerif text-[1.875rem] leading-tight text-foreground text-balance">
              {active.heading}
            </h3>
            <div className="mt-5 space-y-4">
              {active.paragraphs?.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-pretty text-[15px] leading-relaxed text-foreground/90"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        ) : null}
      </div>
    </div>
  );
}

function WikiTree({
  node,
  activeId,
  onSelect,
  depth,
}: {
  node: DemoWikiNode;
  activeId: string;
  onSelect: (id: string) => void;
  depth: number;
}) {
  if (node.kind === "folder") {
    return (
      <div>
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted"
          style={{ paddingLeft: 12 + depth * 8 }}
        >
          <IconChevronRight size={12} className="rotate-90" />
          <IconFolder size={14} className="shrink-0" />
          <span className="truncate">{node.title}</span>
        </div>
        <div>
          {node.children?.map((child) => (
            <WikiTree
              key={child.id}
              node={child}
              activeId={activeId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      </div>
    );
  }

  const isActive = node.id === activeId;
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onSelect(node.id)}
      className={cn(
        "h-auto w-full justify-start gap-2 rounded-lg py-1.5 pr-3 text-left text-sm",
        isActive
          ? "bg-surface-secondary text-foreground"
          : "text-muted hover:bg-surface-tertiary hover:text-foreground",
      )}
      style={{ paddingLeft: 12 + depth * 8 }}
    >
      <IconFileText size={14} className="shrink-0" />
      <span className="truncate">{node.title}</span>
    </Button>
  );
}
