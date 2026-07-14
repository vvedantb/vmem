import { cn } from "@vmem/ui";
import { getProfileIcon } from "./profile-icon";

// colored icon chip used in workspace switcher / profile cards
export function ProfileAvatar({
  icon,
  color,
  className,
  iconClassName,
}: {
  icon: string;
  color: string;
  className?: string;
  iconClassName?: string;
}) {
  const Icon = getProfileIcon(icon);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        className,
      )}
      style={{ backgroundColor: color + "20" }}
    >
      <Icon className={cn("h-4 w-4", iconClassName)} style={{ color }} />
    </div>
  );
}
