import { forwardRef } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";
import { Text, TextClassContext } from "./text";

const Card = forwardRef<View, ViewProps & { className?: string }>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("rounded-xl border border-border bg-card", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = forwardRef<View, ViewProps & { className?: string }>(
  ({ className, ...props }, ref) => (
    <View ref={ref} className={cn("p-4 gap-1", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

function CardTitle({
  className,
  children,
  ...props
}: ViewProps & { className?: string; children: string }) {
  return (
    <Text
      className={cn("text-base font-semibold text-card-foreground", className)}
      {...props}
    >
      {children}
    </Text>
  );
}

function CardDescription({
  className,
  children,
  ...props
}: ViewProps & { className?: string; children: string }) {
  return (
    <Text className={cn("text-sm text-muted-foreground", className)} {...props}>
      {children}
    </Text>
  );
}

const CardContent = forwardRef<View, ViewProps & { className?: string }>(
  ({ className, ...props }, ref) => (
    <View ref={ref} className={cn("px-4 pb-4", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = forwardRef<View, ViewProps & { className?: string }>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("flex-row items-center px-4 pb-4", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
};
