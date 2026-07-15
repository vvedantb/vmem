import { Label, Textarea } from "@vmem/ui";

export function PreferenceTextareaRow({
  id,
  label,
  placeholder,
  value,
  maxLength,
  rows,
  onFocus,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  maxLength: number;
  rows: number;
  onFocus: () => void;
  onChange: (next: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <span className="text-xs text-muted tabular-nums">
          {value.length}/{maxLength}
        </span>
      </div>
      <Textarea
        id={id}
        placeholder={placeholder}
        value={value}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={rows}
        maxLength={maxLength}
      />
    </div>
  );
}
