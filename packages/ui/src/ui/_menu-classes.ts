/** Eva-aligned floating overlay shell — border + bg-overlay + shadow-lg. */
export const floatingSurfaceClass =
  "rounded-lg border border-border bg-overlay text-overlay-foreground shadow-lg";

export const floatingSurfaceAnimateClass = [
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
].join(" ");

/** Shared floating menu surfaces — matches Eva's popover + shadow-lg pattern. */
export const menuContentClass = [
  "z-50 min-w-[12rem] overflow-hidden p-1.5 outline-none",
  floatingSurfaceClass,
  floatingSurfaceAnimateClass,
].join(" ");
