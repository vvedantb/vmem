import { IconSearch, IconX } from "@tabler/icons-react";
import { Button, Input, cn } from "@vmem/ui";

interface HeaderSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  inputClassName?: string;
}

// stable rounded search field no enter/clear animations, no layout jump.
export default function HeaderSearchInput({
  value,
  onChange,
  placeholder = "Search...",
  label = "Search",
  className,
  inputClassName,
}: HeaderSearchInputProps) {
  const active = value.trim().length > 0;

  return (
    <div className={cn("relative min-w-0 flex-1 sm:flex-none", className)}>
      <IconSearch
        size={14}
        className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-muted"
      />
      <Input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
        className={cn(
          // match outline toolbar buttons beside it (view / filters / add)
          "h-8 w-full min-w-0 rounded-lg border border-border bg-transparent pl-8 pr-8 text-xs shadow-none sm:w-44 md:w-52",
          "placeholder:text-muted/70 hover:bg-default",
          "focus-visible:border-border focus-visible:bg-default focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          inputClassName,
        )}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Clear search"
        tabIndex={active ? 0 : -1}
        aria-hidden={!active}
        className={cn(
          "absolute right-0.5 top-1/2 z-[1] h-7 w-7 -translate-y-1/2 text-muted hover:text-foreground",
          !active && "pointer-events-none opacity-0",
        )}
        onClick={() => onChange("")}
      >
        <IconX size={14} stroke={1.75} />
      </Button>
    </div>
  );
}
