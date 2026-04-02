import { forwardRef } from "react";
import { Pressable, type PressableProps, type View } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { TextClassContext } from "./text";

const buttonVariants = cva("flex-row items-center justify-center rounded-lg", {
  variants: {
    variant: {
      default: "bg-primary active:opacity-90",
      destructive: "bg-destructive active:opacity-90",
      outline: "border border-border bg-background active:bg-accent",
      secondary: "bg-secondary active:opacity-80",
      ghost: "active:bg-accent",
      link: "",
    },
    size: {
      default: "h-11 px-5",
      sm: "h-9 px-3",
      lg: "h-12 px-8",
      icon: "h-10 w-10",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

const buttonTextVariants = cva("text-base font-sans-semibold", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground",
      secondary: "text-secondary-foreground",
      ghost: "text-foreground",
      link: "text-primary underline",
    },
    size: {
      default: "text-base",
      sm: "text-sm",
      lg: "text-lg",
      icon: "text-base",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

type ButtonProps = PressableProps &
  VariantProps<typeof buttonVariants> & {
    className?: string;
  };

const Button = forwardRef<View, ButtonProps>(
  ({ className, variant, size, disabled, children, ...props }, ref) => {
    return (
      <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
        <Pressable
          ref={ref}
          disabled={disabled}
          className={cn(
            buttonVariants({ variant, size }),
            disabled && "opacity-50",
            className,
          )}
          {...props}
        >
          {children}
        </Pressable>
      </TextClassContext.Provider>
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants, buttonTextVariants };
