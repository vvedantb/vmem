import { formatForDisplay, type Hotkey } from "@tanstack/react-hotkeys";
import { cn } from "@vvedantb/ui";
import { z } from "zod";
import { useAltHeld } from "./useAltHeld";

// `Hotkey` covers combinations, not a bare modifier, so the literal is parsed
// in rather than asserted. `formatForDisplay` renders it as ⌥ / Alt.
const ALT_HOTKEY = z.custom<Hotkey>().parse("Alt");

/** Platform-native "⌥-click skips confirmation" / "Alt-click skips confirmation". */
export function skipConfirmTitle(actionTitle?: string): string {
  const skip = `${formatForDisplay(ALT_HOTKEY)}-click skips confirmation`;
  return actionTitle ? `${actionTitle} · ${skip}` : skip;
}

/**
 * Visible only while Alt is held. Stays mounted (hidden) otherwise so an open
 * Radix menu item keeps a stable child tree. Sits after the action label so every
 * confirmable control shows that this click will skip the dialog.
 */
export function ConfirmSkipHint({ className }: { className?: string }) {
  const altHeld = useAltHeld();
  return (
    <kbd
      className={cn(
        "ml-auto shrink-0 rounded bg-surface-secondary px-1 py-0.5 font-mono text-[10px] text-muted",
        !altHeld && "hidden",
        className,
      )}
      aria-hidden
    >
      {formatForDisplay(ALT_HOTKEY)}
    </kbd>
  );
}
