import type { ReactNode } from "react";
import { Label, Switch } from "@vmem/ui";

export function PreferenceToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  trailing,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-1 text-xs text-muted">{description}</p>
      </div>
      {trailing ?? (
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={(next) => onCheckedChange?.(next)}
        />
      )}
    </div>
  );
}
