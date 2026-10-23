import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { version } from "./package.json";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const commit = (process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim()).slice(0, 7);
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" }).trim().length > 0;

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, repositoryRoot, "VITE_"), ...process.env };
  if (env.VITE_BILLING_REQUIRED === "true" && (!env.VITE_API_URL || !env.VITE_ENTITLEMENT_PUBLIC_KEY)) {
    throw new Error("Subscription builds require VITE_API_URL and the API's public VITE_ENTITLEMENT_PUBLIC_KEY.");
  }
  return {
  define: {
    __APP_INFO__: JSON.stringify({ version, build: `${commit}${dirty ? "-dirty" : ""}`, builtAt: new Date().toISOString() }),
  },
  plugins: [
    react(),
    // Caches the whole app on first visit so it opens with no signal. The manifest is our own file in /public.
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      injectRegister: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,webp,ico,webmanifest,svg}"],
        globIgnores: ["splash/**"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // template.json / rulesets.json live in ./shared so the backend and the phone use identical data
  server: {},
  };
});
