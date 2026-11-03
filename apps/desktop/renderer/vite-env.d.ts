/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Overrides the built-in sign-in instance (see src/clerk.ts). */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}
