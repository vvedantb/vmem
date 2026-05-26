"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../utils/cn";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-8 items-center justify-center rounded-[calc(var(--radius)*2.5)] bg-default p-1 text-muted",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "group/tab glass-tab-trigger inline-flex h-8 items-center justify-center whitespace-nowrap rounded-3xl px-4 text-sm font-medium text-muted ring-offset-background transition-[background-color,color,opacity,transform] duration-150 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-segment-foreground",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

/**
 * Raw Radix primitives — use these when you need a tabs layout that the
 * styled `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` defaults don't fit
 * (e.g. a vertical sidebar of tabs inside a popover). The styled exports
 * above are tuned for horizontal pill-style tab bars.
 */
export { TabsPrimitive };

/**
 * Animated label slot for icon-only tab triggers.
 *
 * Always rendered, but collapsed to width 0 (and faded out) when the tab
 * is inactive. Expands when the tab is active OR when its parent
 * `<TabsTrigger>` is hovered, so users get a label preview before
 * committing. Driven by CSS (`grid-template-columns 0fr → 1fr` + opacity
 * + margin) rather than `AnimatePresence` — this lets `group-hover/tab`
 * drive the hover state without per-trigger React state.
 *
 * Compose alongside an icon inside any `<TabsTrigger>` to get the
 * "icon-only when inactive, icon + label when active or hovered" pattern.
 */
function AnimatedTabLabel({
  isActive,
  label,
}: {
  isActive: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "grid transition-[grid-template-columns,margin-left,opacity] duration-200 ease-smooth",
        isActive
          ? "ml-1.5 grid-cols-[1fr] opacity-100"
          : "ml-0 grid-cols-[0fr] opacity-0 group-hover/tab:ml-1.5 group-hover/tab:grid-cols-[1fr] group-hover/tab:opacity-100",
      )}
    >
      <span className="overflow-hidden whitespace-nowrap">{label}</span>
    </span>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, AnimatedTabLabel };
