import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Leadcore Trolling Calculator",
        short_name: "Leadcore",
        display: "standalone",
        background_color: "#0b1f2a",
        theme_color: "#0b1f2a",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg}"] },
    }),
  ],
  test: { include: ["src/**/*.test.ts"] },
});
