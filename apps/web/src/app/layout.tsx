import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@/tema/globali.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { FornitoreClient } from "@/client/fornitore-client";
import { RegistratoreServiceWorker } from "@/client/registratore-service-worker";
import { FornitoreTema } from "@/tema/fornitore-tema";

export const metadata: Metadata = {
  applicationName: "Asta Fantacalcio Companion",
  title: "Asta Fantacalcio Companion",
  description: "Assistente alle decisioni durante l'asta del fantacalcio.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/pwa-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/pwa-icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#161826",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="it" data-mantine-color-scheme="dark">
      <body>
        <RegistratoreServiceWorker />
        <FornitoreTema>
          <FornitoreClient>{children}</FornitoreClient>
        </FornitoreTema>
      </body>
    </html>
  );
}
