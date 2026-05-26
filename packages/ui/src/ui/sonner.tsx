"use client";

import { Toaster, type ToasterProps } from "sonner";
import "./sonner.css";

/**
 * Sonner toaster aligned with flat tonal surfaces.
 *
 * `unstyled: true` strips Sonner's default visual styling so our classes are
 * the single source of truth. Toast surfaces use `glass-panel-strong` (flat
 * popover fill + shadow) via app globals.
 *
 * `!font-sans` is forced on the toaster section because Sonner sets its own
 * `font-family` on `[data-sonner-toaster]` from a stylesheet that ships with
 * the package (loaded after our globals), so plain inheritance from `<body>`
 * loses the cascade. The `!important` here guarantees Instrument Sans wins
 * — toasts inherit from the section, so this single class covers everything.
 *
 * Variant icons (success / error / warning / info) are tinted via a
 * `data-icon` descendant selector, leaving the rest of the toast neutral.
 *
 * Callers should pass `theme` from `next-themes` so Sonner's internal
 * `data-theme` attribute matches the active app theme (used by its focus
 * ring and a few internal states that aren't reachable via classNames).
 *
 * Stacking: `expand={false}` keeps toasts collapsed (offset + scale). Hovering
 * the stack expands them. `sonner.css` hides back-toast content while collapsed
 * because `unstyled` disables Sonner's built-in `data-styled` stack rules.
 */
function SonnerToaster(props: ToasterProps) {
  return (
    <Toaster
      expand={false}
      visibleToasts={4}
      gap={12}
      className="toaster group !font-sans"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group toast glass-panel-strong flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-foreground",
          title: "font-medium leading-snug",
          description: "text-[13px] leading-snug text-muted-foreground",
          actionButton:
            "rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          cancelButton:
            "rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80",
          closeButton:
            "border border-border bg-background text-foreground hover:bg-muted",
          loader: "text-muted-foreground",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-destructive",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-info",
        },
      }}
      {...props}
    />
  );
}

export { SonnerToaster };
