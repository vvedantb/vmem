"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { AnimatePresence, motion } from "motion/react";
import { motionDuration, motionEase } from "../motion/presets";
import { cn } from "../utils/cn";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "glass-panel-subtle inline-flex h-10 items-center justify-center rounded-full p-1 text-muted-foreground",
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
      "glass-tab-trigger inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium ring-offset-background transition-[background-color,color,box-shadow,transform] duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground active:scale-[0.96]",
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
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
 * Animated label slot for icon-only tab triggers. Renders nothing when
 * `isActive` is false; when it flips true the label slides in (width
 * grows from 0 + fade in) so the active pill expands smoothly instead
 * of snapping. Compose alongside an icon inside any `<TabsTrigger>` to
 * get the "icon-only when inactive, icon + label when active" pattern.
 */
function AnimatedTabLabel({
  isActive,
  label,
}: {
  isActive: boolean;
  label: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {isActive ? (
        <motion.span
          key={label}
          className="ml-1.5 overflow-hidden whitespace-nowrap"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "auto", opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: motionDuration.fast, ease: motionEase }}
        >
          {label}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, AnimatedTabLabel };
