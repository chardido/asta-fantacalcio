import type {
  ServizioAutenticazione,
  UtenteRegistrato,
} from "../autenticazione/servizio-autenticazione";

export interface ContestoTrpc {
  /** Token opaco letto dal cookie sid, necessario soltanto per logout e guardie applicative. */
  readonly tokenSessione: string | null;
  /** Utente risolto una sola volta per richiesta; null per procedure pubbliche. */
  readonly utente: UtenteRegistrato | null;
  readonly autenticazione: Pick<ServizioAutenticazione, "risolvi">;
}

export interface DipendenzeContestoTrpc {
  readonly autenticazione: Pick<ServizioAutenticazione, "risolvi">;
}

/** Estrae un cookie senza dipendere dalle API Next, così il contesto resta testabile. */
export function leggiCookie(
  intestazioneCookie: string | null,
  nome: string,
): string | null {
  if (intestazioneCookie === null) {
    return null;
  }

  for (const parte of intestazioneCookie.split(";")) {
    const separatore = parte.indexOf("=");
    if (separatore < 0 || parte.slice(0, separatore).trim() !== nome) {
      continue;
    }

    const valore = parte.slice(separatore + 1).trim();
    if (valore.length === 0) {
      return null;
    }

    try {
      return decodeURIComponent(valore);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Costruisce il contesto per una richiesta tRPC e risolve la sessione al massimo
 * una volta. Un sid assente, scaduto, revocato o ignoto produce un utente nullo.
 */
export async function creaContestoTrpc(
  richiesta: Request,
  dipendenze: DipendenzeContestoTrpc,
): Promise<ContestoTrpc> {
  const tokenSessione = leggiCookie(richiesta.headers.get("cookie"), "sid");
  const utente =
    tokenSessione === null
      ? null
      : await dipendenze.autenticazione.risolvi(tokenSessione);

  return {
    tokenSessione,
    utente,
    autenticazione: dipendenze.autenticazione,
  };
}
