import { IconPlus } from "@tabler/icons-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@vmem/ui";
import type { ReactNode } from "react";

interface FeatureAddMenuProps {
  children: ReactNode;
}

export function FeatureAddMenu({ children }: FeatureAddMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Add"
          title="Add"
          className="shrink-0 rounded-lg text-muted transition-colors hover:bg-surface-tertiary/50 hover:text-foreground"
        >
          <IconPlus size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
