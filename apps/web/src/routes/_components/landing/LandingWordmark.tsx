import { cn } from "@vvedantb/ui";
import { VmemDrawInIcon } from "@/components/icons/animations";

/** Marketing wordmark: Instrument Serif at 400. Do not reuse in the product app. */
const wordmarkTextClassName =
  "landing-wordmark-text text-lg leading-none tracking-tight text-foreground";

export function LandingWordmark({
  iconSize = 22,
  className,
}: {
  iconSize?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-row items-center gap-2", className)}>
      <VmemDrawInIcon size={iconSize} className="text-foreground" />
      <span className={wordmarkTextClassName}>
        v<span className="italic">mem</span>
      </span>
    </span>
  );
}
