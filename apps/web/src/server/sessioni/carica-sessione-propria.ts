import type { RepositorySessioniAsta, SessioneAstaPersistita } from "@asta/db";

import type {
  ServizioAutenticazione,
  UtenteRegistrato,
} from "../autenticazione/servizio-autenticazione";

export type StatoErroreAccessoSessione = 401 | 404;

type DettagliErroreAccessoSessione = Readonly<{
  codice: "non_autenticato" | "sessione_non_disponibile";
  messaggio: string;
}>;

const DETTAGLI_ERRORE: Readonly<
  Record<StatoErroreAccessoSessione, DettagliErroreAccessoSessione>
> = Object.freeze({
  401: Object.freeze({
    codice: "non_autenticato",
    messaggio: "Autenticazione richiesta.",
  }),
  404: Object.freeze({
    codice: "sessione_non_disponibile",
    messaggio: "Sessione d'asta non disponibile.",
  }),
});

/**
 * Errore applicativo traducibile dallo strato API senza esporre dati della
 * sessione. Il payload 404 e intenzionalmente unico per risorse inesistenti e
 * risorse appartenenti a un altro utente.
 */
export class ErroreHttpAccessoSessione extends Error {
  override readonly name = "ErroreHttpAccessoSessione";
  readonly codice: DettagliErroreAccessoSessione["codice"];

  constructor(readonly status: StatoErroreAccessoSessione) {
    const dettagli = DETTAGLI_ERRORE[status];
    super(dettagli.messaggio);
    this.codice = dettagli.codice;
  }

  toJSON(): DettagliErroreAccessoSessione {
    return {
      codice: this.codice,
      messaggio: this.message,
    };
  }
}

export interface ContestoAccessoSessione {
  /** Token opaco letto dal cookie sid; non deve essere persistito dal chiamante. */
  readonly tokenSessione: string | null | undefined;
  readonly autenticazione: Pick<ServizioAutenticazione, "risolvi">;
  readonly sessioniAsta: Pick<RepositorySessioniAsta, "trovaPerId">;
}

function nonAutorizzato(): never {
  throw new ErroreHttpAccessoSessione(401);
}

function sessioneNonDisponibile(): never {
  throw new ErroreHttpAccessoSessione(404);
}

/**
 * Unico confine applicativo per caricare una sessione d'asta indirizzata per ID.
 * Risolve sempre l'autenticazione prima di interrogare il repository e non
 * restituisce mai una sessione appartenente a un utente diverso.
 */
export async function caricaSessionePropria(
  contesto: ContestoAccessoSessione,
  sessioneAstaId: string,
): Promise<SessioneAstaPersistita> {
  if (!contesto.tokenSessione) {
    return nonAutorizzato();
  }

  const utente: UtenteRegistrato | null = await contesto.autenticazione.risolvi(
    contesto.tokenSessione,
  );
  if (utente === null) {
    return nonAutorizzato();
  }

  const sessione = await contesto.sessioniAsta.trovaPerId(sessioneAstaId);
  if (sessione?.utenteId !== utente.id) {
    return sessioneNonDisponibile();
  }

  return sessione;
}
