import "./theme-init";
import "@/popup/globals.css";
import { createRoot } from "react-dom/client";
import { Providers } from "./providers";
import { App } from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <Providers>
      <App />
    </Providers>,
  );
}
