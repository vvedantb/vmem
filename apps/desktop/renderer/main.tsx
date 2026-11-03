import { ClerkProvider, getToken } from "@clerk/electron/react";
import { createRoot } from "react-dom/client";
import { publishableKey } from "../src/clerk";
import "./theme";
import "./globals.css";
import { App } from "./App";

const PUBLISHABLE_KEY = publishableKey(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// The sign-in UI follows the @vvedantb/ui tokens, so it switches with the light or dark theme.
const APPEARANCE = {
  variables: {
    colorBackground: "var(--color-card)",
    colorForeground: "var(--color-foreground)",
    colorMutedForeground: "var(--color-muted-foreground)",
    colorPrimary: "var(--color-primary)",
    colorPrimaryForeground: "var(--color-primary-foreground)",
    colorInput: "var(--color-field-background)",
    colorInputForeground: "var(--color-field-foreground)",
    colorBorder: "var(--color-border)",
    colorRing: "var(--color-ring)",
    colorDanger: "var(--color-danger)",
    fontFamily: "inherit",
  },
};

// Main asks for a session token before each upload, also while this window is hidden.
window.vmemDesktop.answerTokenRequests(() => getToken());

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root");
createRoot(root).render(
  <ClerkProvider
    publishableKey={PUBLISHABLE_KEY}
    appearance={APPEARANCE}
    telemetry={false}
  >
    <App />
  </ClerkProvider>,
);
