import type { NextConfig } from "next";

// Hinweis: `cacheComponents` ist bewusst nicht aktiviert. Fast jede Seite dieser App
// hängt vom angemeldeten Benutzer und Mandanten ab und wird daher pro Anfrage gerendert.
const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Foto-Uploads (höchstens 10 MB, siehe src/lib/dateispeicher.ts) plus Formularfelder
    serverActions: { bodySizeLimit: "11mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
