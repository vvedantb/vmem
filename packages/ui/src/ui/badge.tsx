import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-1 text-xs font-medium tracking-normal transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-border bg-default text-foreground",
        secondary: "border-separator bg-default text-default-foreground",
        destructive: "border-danger/25 bg-danger/12 text-danger",
        outline: "border-separator bg-transparent text-muted",
        success: "border-success/25 bg-success/12 text-success",
        warning: "border-warning/25 bg-warning/12 text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge };
