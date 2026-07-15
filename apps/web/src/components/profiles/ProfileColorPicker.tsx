import { Button, cn } from "@vmem/ui";
import { PROFILE_COLORS } from "./profile-icon";

export function ProfileColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROFILE_COLORS.map((c) => (
        <Button
          key={c}
          type="button"
          variant="ghost"
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
          className={cn(
            "h-8 w-8 rounded-full p-0 transition-transform",
            value === c &&
              "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110",
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}
