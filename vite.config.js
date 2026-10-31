import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The preview server sends the production security headers, so browser tests
// fail if the built app breaks the Content Security Policy.
const vercel = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url)));
const productionHeaders = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value]));

export default defineConfig({
  plugins: [react()],
  appType: "mpa",
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1", headers: productionHeaders },
  build: {
    sourcemap: false,
    rollupOptions: {
      input: { index: resolve(import.meta.dirname, "index.html"), app: resolve(import.meta.dirname, "app.html") },
    },
  },
});
