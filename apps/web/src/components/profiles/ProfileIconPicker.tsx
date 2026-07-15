import { Button, cn } from "@vmem/ui";
import { PROFILE_ICON_OPTIONS } from "./profile-icon";

export function ProfileIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROFILE_ICON_OPTIONS.map((i) => {
        const IconComponent = i.icon;
        return (
          <Button
            key={i.name}
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange(i.name)}
            aria-label={i.name}
            className={cn(
              "h-9 w-9 rounded-lg",
              value === i.name
                ? "bg-segment text-foreground"
                : "bg-surface-secondary hover:bg-surface-tertiary",
            )}
          >
            <IconComponent className="h-4 w-4" />
          </Button>
        );
      })}
    </div>
  );
}
