import { defineConfig, loadEnv, type Plugin } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tanstackRouter from "@tanstack/router-plugin/vite";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";

/**
 * Rewrite `new URL("./ort-wasm-*.wasm", import.meta.url)` inside
 * onnxruntime-web (transitive dep of @huggingface/transformers +
 * kokoro-js) to an absolute CDN URL. This stops rolldown from copying
 * ~44 MB of ORT wasm into the Vercel build output — the browser
 * fetches it from jsdelivr at runtime instead.
 *
 * Paired with `env.backends.onnx.wasm.wasmPaths` in stt-engine.ts for
 * code paths that read the runtime config rather than the `new URL`
 * reference.
 */
function externalizeOrtWasm(): Plugin {
  const WASM_CDN =
    "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.1.0/dist/";
  const WASM_PATTERN =
    /new URL\(\s*(["'])\.\/([\w.-]+\.wasm)\1\s*,\s*import\.meta\.url\s*\)/g;

  return {
    name: "externalize-ort-wasm",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("onnxruntime-web")) return null;
      WASM_PATTERN.lastIndex = 0;
      if (!WASM_PATTERN.test(code)) return null;
      WASM_PATTERN.lastIndex = 0;
      return {
        code: code.replace(WASM_PATTERN, `new URL("${WASM_CDN}$2")`),
        map: null,
      };
    },
  };
}

function agentLoginPlugin(): Plugin {
  let env: Record<string, string>;

  return {
    name: "agent-login",
    configureServer(server) {
      env = loadEnv("development", server.config.root, "");

      server.middlewares.use("/api/auth/agent-login", async (_req, res) => {
        const secretKey = env.CLERK_SECRET_KEY;
        const agentUserId = env.AGENT_CLERK_USER_ID;

        if (!secretKey || !agentUserId) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                "CLERK_SECRET_KEY and AGENT_CLERK_USER_ID must be set in .env.local",
            }),
          );
          return;
        }

        const resp = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: agentUserId,
            expires_in_seconds: 60,
          }),
        });

        if (!resp.ok) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Failed to create sign-in token",
              details: await resp.text(),
            }),
          );
          return;
        }

        const data = await resp.json();
        const token = data.token;
        if (typeof token !== "string") {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No token in Clerk response" }));
          return;
        }

        res.writeHead(302, {
          Location: `/agent-callback?ticket=${encodeURIComponent(token)}`,
        });
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({
      routesDirectory: "./src/routes",
      routeFileIgnorePattern:
        "(-searchParams\\.ts|_components|_utils\\.ts|Client\\.tsx|Panel\\.tsx)",
      autoCodeSplitting: true,
    }),
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    externalizeOrtWasm(),
    agentLoginPlugin(),
    process.env.ANALYZE === "true" &&
      visualizer({
        filename: "stats.html",
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
  server: {
    host: "0.0.0.0",
    cors: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
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
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Core vendor chunks
            {
              name: "vendor-radix",
              test: /node_modules[\\/]@radix-ui/,
              priority: 15,
            },
            {
              name: "vendor-convex",
              test: /node_modules[\\/](convex|convex-helpers)/,
              priority: 15,
            },
            {
              name: "vendor-clerk",
              test: /node_modules[\\/]@clerk/,
              priority: 15,
            },
            {
              name: "vendor-motion",
              test: /node_modules[\\/](motion|framer-motion)/,
              priority: 15,
            },
            // Heavy AI chunks - only loaded when user accesses voice/local LLM features
            {
              name: "vendor-webllm",
              test: /node_modules[\\/]@mlc-ai[\\/]web-llm/,
              priority: 20,
            },
            {
              name: "vendor-transformers",
              test: /node_modules[\\/]@huggingface[\\/]transformers/,
              priority: 20,
            },
            {
              name: "vendor-kokoro",
              test: /node_modules[\\/]kokoro-js/,
              priority: 20,
            },
            {
              name: "vendor-onnx",
              test: /node_modules[\\/]onnxruntime/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
});
