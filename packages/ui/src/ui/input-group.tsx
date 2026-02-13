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
    className={cn(
      "flex flex-wrap rounded-lg border border-input bg-background text-sm transition-colors",
      "has-[textarea]:h-auto h-9",
      "has-[:focus]:outline-none has-[:focus]:ring-1 has-[:focus]:ring-ring",
      error && "border-destructive has-[:focus]:ring-destructive",
      className,
    )}
    {...props}
  />
));
InputGroup.displayName = "InputGroup";

const inputGroupAddonVariants = cva("flex items-center", {
  variants: {
    align: {
      "inline-start": "flex-row ps-2",
      "inline-end": "flex-row pe-2",
      "block-start": "w-full flex-row border-b border-input px-2 py-1.5",
      "block-end": "w-full flex-row border-t border-input px-2 py-1.5",
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
        "[class*=InputGroup]",
      )?.parentElement;
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
      xs: "h-6 px-2 text-xs rounded-md",
      sm: "h-7 px-2.5 text-xs rounded-md",
      "icon-xs": "h-6 w-6 rounded-md",
      "icon-sm": "h-7 w-7 rounded-md",
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
        "flex items-center text-sm text-muted-foreground",
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
      "flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0",
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
      "flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 [field-sizing:content]",
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
