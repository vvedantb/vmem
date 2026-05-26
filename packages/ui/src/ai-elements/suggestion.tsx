"use client";

import type { ComponentProps } from "react";
import { cn } from "../utils/cn";
import { Button } from "../ui/button";

type SuggestionsProps = ComponentProps<"div">;

function Suggestions({ className, children, ...props }: SuggestionsProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-2",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type SuggestionProps = ComponentProps<typeof Button>;

function Suggestion({
  className,
  variant = "ghost",
  size = "sm",
  ...props
}: SuggestionProps) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(
        "h-auto rounded-full px-3 py-1.5 text-sm text-muted bg-surface-secondary hover:bg-surface-tertiary",
        className,
      )}
      {...props}
    />
  );
}

export { Suggestions, Suggestion, type SuggestionsProps, type SuggestionProps };
