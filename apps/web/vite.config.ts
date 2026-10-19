import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tanstackRouter from "@tanstack/router-plugin/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { defineWebViteConfig, srcAlias } from "@vvedantb/config";
import path from "path";
import { createRequire } from "module";
// Loaded by `react({ compiler: true })`; imported here so knip sees the peer.
import "oxc-transform-react";
import {
  AGENT_LOGIN_PATH,
  createAgentLoginResult,
} from "./src/lib/dev-agent-login";

const require = createRequire(import.meta.url);

function agentLoginPlugin(): Plugin {
  let env: Record<string, string>;

  return {
    name: "agent-login",
    configureServer(server) {
      env = loadEnv("development", server.config.root, "");

      server.middlewares.use(AGENT_LOGIN_PATH, async (_req, res) => {
        const result = await createAgentLoginResult({
          secretKey: env.CLERK_SECRET_KEY,
          agentUserId: env.AGENT_CLERK_USER_ID,
        });

        if (result.kind === "redirect") {
          res.writeHead(302, { Location: result.location });
          res.end();
          return;
        }

        res.writeHead(result.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result.body));
      });
    },
  };
}

/** Cosmos imports default from gl-bench; Vite prefers `browser` (UMD min) which has no ESM default. */
const glBenchEsm = path.join(
  path.dirname(require.resolve("gl-bench/package.json")),
  "dist/gl-bench.module.js",
);

export default defineConfig({
  ...defineWebViteConfig({
    tailwindcss,
    router: {
      plugin: tanstackRouter,
      options: {
        routesDirectory: "./src/routes",
        routeFileIgnorePattern:
          "([sS]earchParams\\.ts|_components|_utils\\.ts|Client\\.tsx|Panel\\.tsx)",
      },
    },
    react: { plugin: react, compiler: true },
    plugins: [
      agentLoginPlugin(),
      process.env.ANALYZE === "true" &&
        visualizer({
          filename: "stats.html",
          open: true,
          gzipSize: true,
          brotliSize: true,
        }),
    ],
    alias: { ...srcAlias(__dirname), "gl-bench": glBenchEsm },
    // Packages using React Context MUST be deduplicated to prevent "Context not found" errors
    // When pnpm installs multiple copies (different peer deps), each has its own context instance
    // This forces all imports to resolve to the same instance at bundle time
    dedupe: [
      "react",
      "react-dom",
      "convex",
      "convex-helpers",
      "@tanstack/react-router",
      "@tanstack/react-query",
      "@clerk/clerk-react",
    ],
    vendorChunks: { convex: /node_modules[\\/](convex|convex-helpers)/ },
  }),
  server: {
    host: "0.0.0.0",
    cors: false,
  },
});
