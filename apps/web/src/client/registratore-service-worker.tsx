"use client";

import { useEffect } from "react";

import { registraServiceWorker } from "./service-worker";

export function RegistratoreServiceWorker() {
  useEffect(() => {
    void registraServiceWorker().catch(() => {
      // Il supporto offline è progressivo: un errore di registrazione non blocca l'app.
    });
  }, []);

  return null;
}
