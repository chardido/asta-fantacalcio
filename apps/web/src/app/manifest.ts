import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Asta Fantacalcio Companion",
    short_name: "Asta Companion",
    description: "Assistente alle decisioni durante l'asta del fantacalcio.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1864ab",
    lang: "it",
    categories: ["sports", "productivity"],
    icons: [
      {
        src: "/pwa-icon.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/pwa-icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
