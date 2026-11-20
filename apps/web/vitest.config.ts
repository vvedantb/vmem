import react from "@vitejs/plugin-react";
import { defineWebVitestConfig, srcAlias } from "@vvedantb/config";
import { defineConfig } from "vitest/config";

export default defineConfig(
  defineWebVitestConfig({
    plugins: [react()],
    automaticJsx: true,
    alias: srcAlias(import.meta.dirname),
    include: ["src/**/*.test.{ts,tsx}"],
    // Mobile pins React 19.2.3 and web uses the catalog React, so the hoisted
    // install nests a second React under @floating-ui/react-dom. Vitest loads
    // node_modules with Node, which ignores `dedupe`. Inline the menu chain
    // down to it, so Vite resolves it and every hook uses the one React.
    dedupe: ["react", "react-dom"],
    inline: [
      "@vvedantb/ui",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-menu",
      "@radix-ui/react-popper",
      "@floating-ui/react-dom",
    ],
  }),
);
