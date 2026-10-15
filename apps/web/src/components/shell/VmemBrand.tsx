import { cn } from "@vvedantb/ui";

const brandTextClassName =
  "text-lg font-semibold leading-none tracking-tight text-foreground";

export function VmemBrandText({ className }: { className?: string }) {
  return (
    <span className={cn(brandTextClassName, className)}>
      v<span className="italic">mem</span>
    </span>
  );
}
