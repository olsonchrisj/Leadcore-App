import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const sha = (process.env.GITHUB_SHA ?? "").slice(0, 7);
const buildId = `${new Date().toISOString().slice(0, 10)}${sha ? ` (${sha})` : " (local)"}`;

export default defineConfig({
  base: "./",
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Leadcore Trolling Calculator",
        short_name: "Leadcore",
        display: "standalone",
        background_color: "#082c40",
        theme_color: "#082c40",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        // install-time icons are fetched by the OS, not the app: keep them out of the offline cache
        globIgnores: ["icon-512.png", "icon-maskable-512.png"],
      },
    }),
  ],
  test: { include: ["src/**/*.test.ts"] },
});
