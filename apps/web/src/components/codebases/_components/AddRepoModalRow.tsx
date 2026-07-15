import { Button, cn } from "@vmem/ui";
import { IconLoader2, IconLock, IconPlus } from "@tabler/icons-react";
import { codebaseLanguageColor } from "../CodebaseCardInsides";
import type { AddRepoModalRepo } from "../-types";

interface AddRepoModalRowProps {
  repo: AddRepoModalRepo;
  isAdding: boolean;
  disabled: boolean;
  onAdd: () => void;
}

export function AddRepoModalRow({
  repo,
  isAdding,
  disabled,
  onAdd,
}: AddRepoModalRowProps) {
  const langColor = codebaseLanguageColor(repo.language);

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onAdd}
      className={cn(
        "group flex h-auto w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-[background-color]",
        disabled && !isAdding ? "opacity-50" : "hover:bg-surface-tertiary/50",
      )}
    >
      <img
        src={`https://github.com/${repo.owner}.png?size=64`}
        alt={repo.owner}
        width={36}
        height={36}
        className="size-9 shrink-0 rounded-full outline outline-1 -outline-offset-1 outline-separator"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-sm font-semibold text-foreground">
            {repo.name}
          </span>
          {repo.isPrivate ? (
            <IconLock
              size={12}
              className="shrink-0 text-muted"
              aria-label="Private repository"
            />
          ) : null}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted">
          <span className="truncate">{repo.owner}</span>
          {repo.language ? (
            <>
              <span className="shrink-0">·</span>
              <span className="flex shrink-0 items-center gap-1">
                {langColor ? (
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: langColor }}
                  />
                ) : null}
                {repo.language}
              </span>
            </>
          ) : null}
        </div>
        {repo.description ? (
          <p className="mt-1 truncate text-xs text-muted/80">
            {repo.description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-muted">
        {isAdding ? (
          <IconLoader2 size={16} className="animate-spin" aria-hidden />
        ) : (
          <>
            <span className="text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100">
              Add
            </span>
            <IconPlus
              size={16}
              className="opacity-60 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </>
        )}
      </div>
    </Button>
  );
}
