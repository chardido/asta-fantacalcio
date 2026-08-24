export const URL_SERVICE_WORKER = "/sw.js";

interface ContenitoreServiceWorker {
  register(
    scriptURL: string | URL,
    options?: RegistrationOptions,
  ): Promise<ServiceWorkerRegistration>;
}

function contenitoreBrowser(): ContenitoreServiceWorker | null {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  return navigator.serviceWorker;
}

/** Registra il worker sullo scope dell'intera applicazione quando supportato. */
export async function registraServiceWorker(
  contenitore: ContenitoreServiceWorker | null = contenitoreBrowser(),
): Promise<ServiceWorkerRegistration | null> {
  if (contenitore === null) return null;
  return contenitore.register(URL_SERVICE_WORKER, {
    scope: "/",
    updateViaCache: "none",
  });
}
