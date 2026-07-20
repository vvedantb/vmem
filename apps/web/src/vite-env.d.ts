/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_GRAPH_RENDERER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
