import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./brand.css";
import "./styles.css";
import "./onboarding.css";
import { registerSW } from "virtual:pwa-register";

// Ask the browser not to clear saved audits when storage runs low, and cache the app so it opens with no signal.
void navigator.storage?.persist?.();
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
