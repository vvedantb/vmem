import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@vmem/ui";
import type { Profile } from "@/types/api";

export function ProfileSelect({
  profiles,
  value,
  onValueChange,
  disabled,
  placeholder = "Select...",
}: {
  profiles: Profile[];
  value: string;
  onValueChange: (profileId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const selected = profiles.find((p) => p._id === value);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="h-9 w-[160px]">
        <SelectValue>
          {selected ? (
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: selected.color }}
              />
              <span className="truncate">{selected.name}</span>
            </div>
          ) : (
            placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {profiles.map((profile) => (
          <SelectItem key={profile._id} value={profile._id}>
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: profile.color }}
              />
              <span>{profile.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
