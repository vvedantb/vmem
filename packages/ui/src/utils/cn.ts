import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// `rounded-field` is a custom radius token — teach twMerge it conflicts with
// `rounded-none` / `rounded-md` / etc. so Input overrides actually win.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      borderRadius: ["field"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
