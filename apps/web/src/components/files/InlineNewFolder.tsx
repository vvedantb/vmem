"use client";

import { useRef, useEffect, useCallback } from "react";
import { Input } from "@vmem/ui";
import { IconFolder } from "@tabler/icons-react";

interface InlineNewFolderProps {
  variant: "grid" | "list";
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export default function InlineNewFolder({
  variant,
  onConfirm,
  onCancel,
}: InlineNewFolderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // auto-focus and select all text on mount
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const value = e.currentTarget.value.trim();
        if (value) onConfirm(value);
        else onCancel();
      } else if (e.key === "Escape") {
        onCancel();
      }
    },
    [onConfirm, onCancel],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const value = e.currentTarget.value.trim();
      if (value) onConfirm(value);
      else onCancel();
    },
    [onConfirm, onCancel],
  );

  if (variant === "grid") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-accent/40 bg-surface-secondary/50 p-3">
        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-surface-secondary">
          <IconFolder size={48} stroke={1.2} className="text-muted" />
        </div>
        <Input
          ref={inputRef}
          type="text"
          defaultValue="Untitled Folder"
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="h-8 px-2 py-1 text-center text-sm"
        />
      </div>
    );
  }

  // list variant
  return (
    <tr className="border-b border-separator bg-surface-secondary/30">
      <td className="w-10 px-3 py-2" />
      <td className="py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
            <IconFolder size={18} stroke={1.5} className="text-muted" />
          </div>
          <Input
            ref={inputRef}
            type="text"
            defaultValue="Untitled Folder"
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="h-8 px-2 py-1 text-sm"
          />
        </div>
      </td>
      <td className="hidden md:table-cell" />
      <td className="hidden md:table-cell" />
      <td />
    </tr>
  );
}
