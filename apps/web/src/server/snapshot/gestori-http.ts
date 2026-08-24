import { ErroreHttpAccessoSessione } from "../sessioni/carica-sessione-propria";
import {
  ErroreConsultazioneSnapshot,
  type ServizioConsultazioneSnapshot,
} from "./servizio-consultazione-snapshot";

const CACHE_CONTROL_INDICE = "private, max-age=0, must-revalidate";

function rispostaErrore(
  status: number,
  codice: string,
  messaggio: string,
): Response {
  return Response.json({ codice, messaggio }, { status });
}

function etagDaHash(hashContenuto: string): string {
  return `"${hashContenuto}"`;
}

function etagCorrisponde(intestazione: string | null, etag: string): boolean {
  if (intestazione === null) return false;
  return intestazione
    .split(",")
    .map((valore) => valore.trim())
    .some((valore) => valore === "*" || valore === etag);
}

async function eseguiGestore(
  operazione: () => Promise<Response>,
): Promise<Response> {
  try {
    return await operazione();
  } catch (error_) {
    if (error_ instanceof ErroreHttpAccessoSessione) {
      return Response.json(error_.toJSON(), { status: error_.status });
    }
    if (error_ instanceof ErroreConsultazioneSnapshot) {
      return rispostaErrore(error_.status, error_.codice, error_.message);
    }
    return rispostaErrore(
      503,
      "consultazione_snapshot_non_disponibile",
      "La consultazione dei dati dei giocatori non è momentaneamente disponibile.",
    );
  }
}

function leggiSessioneAstaId(richiesta: Request): string | null {
  const valore = new URL(richiesta.url).searchParams.get("sessioneAstaId");
  return valore === null || valore.trim().length === 0 ? null : valore.trim();
}

export function gestisciIndiceSnapshot(
  richiesta: Request,
  servizio: Pick<ServizioConsultazioneSnapshot, "indice">,
): Promise<Response> {
  return eseguiGestore(async () => {
    const sessioneAstaId = leggiSessioneAstaId(richiesta);
    if (sessioneAstaId === null) {
      return rispostaErrore(
        400,
        "sessione_asta_id_obbligatorio",
        "Il parametro sessioneAstaId è obbligatorio.",
      );
    }

    const indice = await servizio.indice(sessioneAstaId);
    const etag = etagDaHash(indice.hashContenuto);
    const headers = {
      "Cache-Control": CACHE_CONTROL_INDICE,
      ETag: etag,
    };
    if (etagCorrisponde(richiesta.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers });
    }

    return Response.json(indice, { headers });
  });
}

export function gestisciDashboardSnapshot(
  richiesta: Request,
  servizio: Pick<ServizioConsultazioneSnapshot, "dashboard">,
): Promise<Response> {
  return eseguiGestore(async () => {
    const sessioneAstaId = leggiSessioneAstaId(richiesta);
    if (sessioneAstaId === null) {
      return rispostaErrore(
        400,
        "sessione_asta_id_obbligatorio",
        "Il parametro sessioneAstaId è obbligatorio.",
      );
    }

    const dashboard = await servizio.dashboard(sessioneAstaId);
    return Response.json(dashboard, {
      headers: {
        "Cache-Control": CACHE_CONTROL_INDICE,
        ETag: etagDaHash(dashboard.hashContenuto),
      },
    });
  });
}

export function gestisciSchedaGiocatoreSnapshot(
  richiesta: Request,
  identificativoGiocatore: string,
  servizio: Pick<ServizioConsultazioneSnapshot, "scheda">,
): Promise<Response> {
  return eseguiGestore(async () => {
    const sessioneAstaId = leggiSessioneAstaId(richiesta);
    if (sessioneAstaId === null) {
      return rispostaErrore(
        400,
        "sessione_asta_id_obbligatorio",
        "Il parametro sessioneAstaId è obbligatorio.",
      );
    }
    if (identificativoGiocatore.trim().length === 0) {
      return rispostaErrore(
        400,
        "identificativo_giocatore_obbligatorio",
        "L'identificativo del giocatore è obbligatorio.",
      );
    }

    const scheda = await servizio.scheda(
      sessioneAstaId,
      identificativoGiocatore,
    );
    return Response.json(scheda, {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
