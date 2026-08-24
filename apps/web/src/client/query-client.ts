import { QueryClient, type QueryKey } from "@tanstack/react-query";

export const DURATA_DATI_FRESCHI_MS = 30_000;
export const DURATA_CACHE_MS = 5 * 60_000;

/** Chiave canonica per le letture HTTP non tRPC legate a una sessione. */
export function chiaveQuerySessione(
  sessioneAstaId: string,
  ...segmenti: readonly unknown[]
): QueryKey {
  return ["sessione", sessioneAstaId, ...segmenti];
}

function contieneSessione(valore: unknown, sessioneAstaId: string): boolean {
  if (valore === sessioneAstaId) return true;
  if (Array.isArray(valore)) {
    return valore.some((elemento) => contieneSessione(elemento, sessioneAstaId));
  }
  if (valore !== null && typeof valore === "object") {
    return Object.values(valore).some((elemento) =>
      contieneSessione(elemento, sessioneAstaId),
    );
  }
  return false;
}

/**
 * Riconosce sia le chiavi HTTP canoniche sia le chiavi generate da tRPC, che
 * includono l'input della procedura. In questo modo un evento di sessione non
 * invalida dati appartenenti ad altre aste.
 */
export function queryAppartieneASessione(
  queryKey: QueryKey,
  sessioneAstaId: string,
): boolean {
  return contieneSessione(queryKey, sessioneAstaId);
}

export function creaQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DURATA_DATI_FRESCHI_MS,
        gcTime: DURATA_CACHE_MS,
        retry: 1,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
