/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  /** Set to `"cosmos"` to use Cosmos GL for the memory graph (default: legacy canvas). */
  readonly VITE_GRAPH_RENDERER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
