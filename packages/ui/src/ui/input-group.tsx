"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils/cn";
import { Button, type ButtonProps } from "./button";
import { Input } from "./input";
import { Textarea } from "./textarea";

const InputGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { error?: boolean }
>(({ className, error, ...props }, ref) => (
  <div
    ref={ref}
    data-input-group=""
    className={cn(
      "flex h-10 flex-wrap rounded-xl border border-input bg-card/90 text-sm shadow-insetSoft transition-all duration-200 ease-smooth",
      "has-[textarea]:h-auto",
      "has-[:focus-visible]:border-ring/70 has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/30",
      error &&
        "border-destructive/70 has-[:focus-visible]:border-destructive has-[:focus-visible]:ring-destructive/25",
      className,
    )}
    {...props}
  />
));
InputGroup.displayName = "InputGroup";

const inputGroupAddonVariants = cva("flex items-center", {
  variants: {
    align: {
      "inline-start": "flex-row ps-3",
      "inline-end": "flex-row pe-3",
      "block-start": "w-full flex-row border-b border-input px-3 py-2",
      "block-end": "w-full flex-row border-t border-input px-3 py-2",
    },
  },
  defaultVariants: {
    align: "inline-start",
  },
});

const InputGroupAddon = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof inputGroupAddonVariants>
>(({ className, align, onClick, ...props }, ref) => (
  <div
    ref={ref}
    data-align={align}
    className={cn(inputGroupAddonVariants({ align }), className)}
    onClick={(e) => {
      if (onClick) {
        onClick(e);
        return;
      }
      const group = (e.currentTarget as HTMLElement).closest(
        "[data-input-group]",
      );
      const input = group?.querySelector("textarea, input");
      if (input instanceof HTMLElement) input.focus();
    }}
    {...props}
  />
));
InputGroupAddon.displayName = "InputGroupAddon";

const inputGroupButtonVariants = cva("shrink-0 shadow-none", {
  variants: {
    size: {
      xs: "h-7 rounded-lg px-2 text-xs",
      sm: "h-8 rounded-lg px-2.5 text-xs",
      "icon-xs": "h-7 w-7 rounded-lg",
      "icon-sm": "h-8 w-8 rounded-lg",
    },
  },
  defaultVariants: {
    size: "xs",
  },
});

const InputGroupButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & VariantProps<typeof inputGroupButtonVariants>
>(({ className, size, variant = "ghost", ...props }, ref) => (
  <Button
    ref={ref}
    variant={variant}
    className={cn(inputGroupButtonVariants({ size }), className)}
    {...props}
  />
));
InputGroupButton.displayName = "InputGroupButton";

function InputGroupText({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "flex items-center text-sm text-muted-foreground/95",
        className,
      )}
      {...props}
    />
  );
}

const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input>
>(({ className, ...props }, ref) => (
  <Input
    ref={ref}
    className={cn(
      "h-full flex-1 border-0 bg-transparent px-3 py-2 shadow-none focus-visible:border-0 focus-visible:ring-0",
      className,
    )}
    {...props}
  />
));
InputGroupInput.displayName = "InputGroupInput";

const InputGroupTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<typeof Textarea>
>(({ className, ...props }, ref) => (
  <Textarea
    ref={ref}
    className={cn(
      "flex-1 resize-none border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:border-0 focus-visible:ring-0 [field-sizing:content]",
      className,
    )}
    {...props}
  />
));
InputGroupTextarea.displayName = "InputGroupTextarea";

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
};
