import { IconLoader2 } from "@tabler/icons-react";
import { cn } from "../utils/cn";

const sizeClasses = {
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
};

function Spinner({
  size = "md",
  className,
  ...props
}: Omit<React.ComponentPropsWithoutRef<"svg">, "size" | "stroke"> & {
  size?: "sm" | "md" | "lg";
}) {
  return (
    <IconLoader2
      role="status"
      aria-label="Loading"
      className={cn("animate-spin text-muted", sizeClasses[size], className)}
      {...props}
    />
  );
}

export { Spinner };
