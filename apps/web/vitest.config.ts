import react from "@vitejs/plugin-react";
import { defineWebVitestConfig, srcAlias } from "@vvedantb/config";
import { defineConfig } from "vitest/config";

export default defineConfig(
  defineWebVitestConfig({
    plugins: [react()],
    automaticJsx: true,
    alias: srcAlias(import.meta.dirname),
    include: ["src/**/*.test.{ts,tsx}"],
    inline: ["@vvedantb/ui"],
  }),
);
