"use client";

import { cn } from "@vmem/ui";
import { VmemDrawInIcon } from "@/components/svg-animations";

const brandTextClassName =
  "text-xl leading-none font-instrumentSerif text-foreground";

export function VmemBrandText({ className }: { className?: string }) {
  return (
    <span className={cn(brandTextClassName, className)}>
      v<span className="italic">mem</span>
    </span>
  );
}

interface VmemBrandProps {
  iconSize?: number;
  className?: string;
  textClassName?: string;
}

export function VmemBrand({
  iconSize = 22,
  className,
  textClassName,
}: VmemBrandProps) {
  return (
    <span className={cn("inline-flex flex-row items-center gap-2", className)}>
      <VmemDrawInIcon size={iconSize} className="text-foreground" />
      <VmemBrandText className={textClassName} />
    </span>
  );
}
