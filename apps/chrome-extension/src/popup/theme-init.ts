import { applyThemeClass, getSystemTheme } from "@vvedantb/ui/client";

// set theme class before react renders to avoid theme flash
// module file required for script-src 'self' csp
applyThemeClass(getSystemTheme());
