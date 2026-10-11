import "../../popup/theme-init";
import "@/popup/globals.css";
import { createRoot } from "react-dom/client";
import { Providers } from "../../popup/providers";
import { App } from "../../popup/App";
import { CLERK_SYNC_HOST } from "@/lib/constants";

const bootLink = document.getElementById("boot-link");
if (bootLink instanceof HTMLAnchorElement) bootLink.href = CLERK_SYNC_HOST;

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <Providers>
      <App />
    </Providers>,
  );
}
