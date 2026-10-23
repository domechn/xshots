import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Hosts fetched at runtime: the import APIs, plus twimg images that export
// re-fetches with CORS to inline them into the PNG.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.fxtwitter.com https://publish.twitter.com https://*.twimg.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export default defineConfig({
  plugins: [
    react(),
    {
      // Build only: the dev server relies on inline scripts and styles for HMR.
      name: "content-security-policy",
      apply: "build",
      transformIndexHtml: () => [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: CONTENT_SECURITY_POLICY,
          },
          injectTo: "head-prepend",
        },
      ],
    },
  ],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    coverage: {
      provider: "v8",
    },
  },
});
