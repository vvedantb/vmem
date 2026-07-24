import { Toaster, type ToasterProps } from "sonner";
import "./sonner.css";

// sonner toaster aligned with flat tonal surfaces `unstyled: true` strips sonner's default visual styling so our classes are
// the single source of truth toast surfaces use `glass, panel, strong` (flat
// popover fill + shadow) via app globals `!font, sans` is forced on the toaster section because sonner sets its own
// `font, family` on `[data, sonner, toaster]` from a stylesheet that ships with
// the package (loaded after our globals), so plain inheritance from `<body>`
// loses the cascade the `!important` here guarantees instrument sans wins, toasts inherit from the section, so this single class covers everything variant icons (success / error / warning / info) are tinted via a
// `data, icon` descendant selector, leaving the rest of the toast neutral callers should pass `theme` from `next, themes` so sonner's internal
// `data, theme` attribute matches the active app theme (used by its focus
// ring and a few internal states that aren't reachable via classnames) stacking: `expand={false}` keeps toasts collapsed (offset + scale) hovering
// the stack expands them `sonner.css` hides back, toast content while collapsed
// because `unstyled` disables sonner's built, in `data, styled` stack rules
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
          description: "text-[13px] leading-snug text-muted",
          actionButton:
            "rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90",
          cancelButton:
            "rounded-lg bg-surface-secondary px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-tertiary",
          closeButton:
            "rounded-lg bg-default px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-default/78",
          loader: "text-muted",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-danger",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-accent",
        },
      }}
      {...props}
    />
  );
}

export { SonnerToaster };
