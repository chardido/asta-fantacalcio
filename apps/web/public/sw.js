/* global Headers, Request, Response, URL, caches, fetch, self */

const VERSIONE_CACHE = "v1";
const PREFISSO_CACHE = "asta-fantacalcio-pwa-";
const CACHE_SHELL = `${PREFISSO_CACHE}shell-${VERSIONE_CACHE}`;
const CACHE_INDICE = `${PREFISSO_CACHE}indice-${VERSIONE_CACHE}`;
const RISORSE_SHELL = [
  "/",
  "/accedi",
  "/registrati",
  "/manifest.webmanifest",
  "/pwa-icon.svg",
];
const ROTTE_SHELL = new Set(["/", "/accedi", "/registrati"]);
const PERCORSO_INDICE = "/api/snapshot/corrente/indice";

function rispostaMemorizzabile(risposta) {
  return risposta.ok && (risposta.type === "basic" || risposta.type === "default");
}

async function memorizzaSeValida(cache, richiesta, risposta) {
  if (rispostaMemorizzabile(risposta)) {
    await cache.put(richiesta, risposta.clone());
  }
  return risposta;
}

async function precaricaShell() {
  const cache = await caches.open(CACHE_SHELL);
  await Promise.allSettled(
    RISORSE_SHELL.map(async (url) => {
      const risposta = await fetch(new Request(url, { cache: "reload" }));
      await memorizzaSeValida(cache, url, risposta);
    }),
  );
}

async function eliminaCacheSuperate() {
  const nomi = await caches.keys();
  await Promise.all(
    nomi
      .filter((nome) => nome.startsWith(PREFISSO_CACHE))
      .filter((nome) => nome !== CACHE_SHELL && nome !== CACHE_INDICE)
      .map((nome) => caches.delete(nome)),
  );
}

async function cachePrimaConAggiornamento(richiesta) {
  const cache = await caches.open(CACHE_SHELL);
  const memorizzata = await cache.match(richiesta);
  const aggiornamento = fetch(richiesta)
    .then((risposta) => memorizzaSeValida(cache, richiesta, risposta))
    .catch(() => null);

  if (memorizzata !== undefined) {
    void aggiornamento;
    return memorizzata;
  }

  const risposta = await aggiornamento;
  if (risposta === null) throw new Error("Risorsa dello shell non disponibile offline.");
  return risposta;
}

async function navigazioneConRipiego(richiesta) {
  const cache = await caches.open(CACHE_SHELL);
  try {
    const risposta = await fetch(richiesta);
    const url = new URL(richiesta.url);
    if (ROTTE_SHELL.has(url.pathname)) {
      await memorizzaSeValida(cache, url.pathname, risposta);
    }
    return risposta;
  } catch {
    return (await cache.match(new URL(richiesta.url).pathname))
      ?? (await cache.match("/"))
      ?? Response.error();
  }
}

async function indiceConRipiegoOffline(richiesta) {
  const cache = await caches.open(CACHE_INDICE);
  const memorizzata = await cache.match(richiesta);
  const headers = new Headers(richiesta.headers);
  const etag = memorizzata?.headers.get("etag");
  if (etag !== null && etag !== undefined) headers.set("If-None-Match", etag);

  try {
    const risposta = await fetch(new Request(richiesta, { headers }));
    if (risposta.status === 304 && memorizzata !== undefined) return memorizzata;
    if (risposta.status === 401 || risposta.status === 403) {
      await cache.delete(richiesta);
      return risposta;
    }
    return memorizzaSeValida(cache, richiesta, risposta);
  } catch {
    return memorizzata ?? Response.error();
  }
}

self.addEventListener("install", (evento) => {
  evento.waitUntil(precaricaShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(eliminaCacheSuperate().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== "GET") return;

  const url = new URL(richiesta.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === PERCORSO_INDICE) {
    evento.respondWith(indiceConRipiegoOffline(richiesta));
    return;
  }

  if (richiesta.mode === "navigate") {
    evento.respondWith(navigazioneConRipiego(richiesta));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/")
    || url.pathname === "/manifest.webmanifest"
    || url.pathname === "/pwa-icon.svg"
  ) {
    evento.respondWith(cachePrimaConAggiornamento(richiesta));
  }
});
