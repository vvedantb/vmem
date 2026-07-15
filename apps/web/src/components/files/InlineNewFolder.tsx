import { useRef, useEffect } from "react";
import { Input } from "@vmem/ui";
import { IconFolder } from "@tabler/icons-react";

interface NewFolderInputProps {
  onConfirm: (name: string) => void;
  onCancel: () => void;
  className?: string;
}

function NewFolderNameInput({
  onConfirm,
  onCancel,
  className,
}: NewFolderInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const value = e.currentTarget.value.trim();
      if (value) onConfirm(value);
      else onCancel();
      return;
    }
    if (e.key === "Escape") onCancel();
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const value = e.currentTarget.value.trim();
    if (value) onConfirm(value);
    else onCancel();
  }

  return (
    <Input
      ref={inputRef}
      type="text"
      defaultValue="Untitled Folder"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className={className}
    />
  );
}

interface InlineNewFolderProps {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function InlineNewFolderGrid({
  onConfirm,
  onCancel,
}: InlineNewFolderProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-accent/40 bg-surface-secondary/50 p-3">
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-surface-secondary">
        <IconFolder size={48} stroke={1.2} className="text-muted" />
      </div>
      <NewFolderNameInput
        onConfirm={onConfirm}
        onCancel={onCancel}
        className="h-8 px-2 py-1 text-center text-sm"
      />
    </div>
  );
}

export function InlineNewFolderList({
  onConfirm,
  onCancel,
}: InlineNewFolderProps) {
  return (
    <tr className="border-b border-separator bg-surface-secondary/30">
      <td className="w-10 px-3 py-2" />
      <td className="py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
            <IconFolder size={18} stroke={1.5} className="text-muted" />
          </div>
          <NewFolderNameInput
            onConfirm={onConfirm}
            onCancel={onCancel}
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
