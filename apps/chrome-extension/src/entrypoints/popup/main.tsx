import "../../popup/theme-init";
import "@/popup/globals.css";
import { createRoot } from "react-dom/client";
import { Providers } from "../../popup/providers";
import { App } from "../../popup/App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <Providers>
      <App />
    </Providers>,
  );
}
