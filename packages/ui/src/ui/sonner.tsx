"use client";

import { Toaster, type ToasterProps } from "sonner";

/**
 * Glass-themed Sonner toaster aligned with our codebase tokens.
 *
 * `unstyled: true` strips Sonner's default visual styling so our classes are
 * the single source of truth — no specificity battles with the library's
 * own CSS. The toast surface uses `glass-panel-strong`, whose backdrop-blur,
 * border, shadow, and translucent fill all reference oklch tokens that are
 * redefined inside `.dark`, so the toast adapts to light/dark automatically.
 *
 * Variant icons (success / error / warning / info) are tinted via a
 * `data-icon` descendant selector, leaving the rest of the toast neutral.
 *
 * Callers should pass `theme` from `next-themes` so Sonner's internal
 * `data-theme` attribute matches the active app theme (used by its focus
 * ring and a few internal states that aren't reachable via classNames).
 */
function SonnerToaster(props: ToasterProps) {
  return (
    <Toaster
      className="toaster group"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group toast glass-panel-strong flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-foreground",
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
