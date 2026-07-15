import type { ReactNode } from "react";
import { Label, Switch } from "@vmem/ui";

interface SettingsSwitchRowProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  icon?: ReactNode;
}

// same row pattern as apps/web settings preferences
export function SettingsSwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  icon,
}: SettingsSwitchRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {icon ? (
          <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
        ) : null}
        <div className="min-w-0">
          <Label htmlFor={id} className="text-sm font-medium">
            {label}
          </Label>
          {description ? (
            <p className="mt-1 text-xs text-muted text-pretty">{description}</p>
          ) : null}
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}
