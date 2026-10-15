import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./brand.css";
import "./styles.css";
import { registerSW } from "virtual:pwa-register";

// Ask the browser not to clear saved audits when storage runs low, and cache the app so it opens with no signal.
void navigator.storage?.persist?.();
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

/** Keep the splash up for at least 0.8 s so a fast start does not flicker, then fade it out. */
const boot = document.getElementById("boot");
if (boot) {
  const wait = Math.max(0, 800 - performance.now());
  setTimeout(() => { boot.classList.add("boot--out"); setTimeout(() => boot.remove(), 400); }, wait);
}
