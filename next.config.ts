import type { NextConfig } from "next";

// Hinweis: `cacheComponents` ist bewusst nicht aktiviert. Fast jede Seite dieser App
// hängt vom angemeldeten Benutzer und Mandanten ab und wird daher pro Anfrage gerendert.
const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Dokument-Uploads (höchstens 30 MB, Fotos 10 MB, siehe src/lib/dateispeicher.ts) plus Formularfelder
    serverActions: { bodySizeLimit: "31mb" },
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
