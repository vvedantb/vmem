import { IconPlus } from "@tabler/icons-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@vvedantb/ui";
import type { ReactNode } from "react";

// ghost icon-sm chrome shared by sidebar title-row controls (add, search)
export const featureHeaderIconClassName =
  "shrink-0 rounded-lg text-muted transition-colors hover:bg-surface-tertiary/50 hover:text-foreground";

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
          className={featureHeaderIconClassName}
        >
          <IconPlus size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
