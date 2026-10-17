import { createRoot } from "react-dom/client";
import "./theme";
import "./globals.css";
import { App } from "./App";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root");
createRoot(root).render(<App />);
