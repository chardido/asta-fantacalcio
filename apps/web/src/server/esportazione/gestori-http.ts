import { ErroreHttpAccessoSessione } from "../sessioni/carica-sessione-propria";
import { ErroreApplicativo } from "../trpc/errori";
import type { ServizioEsportazione } from "./servizio-esportazione";

function rispostaErrore(
  status: number,
  codice: string,
  messaggio: string,
  dettagli?: unknown,
): Response {
  return Response.json({ codice, messaggio, dettagli: dettagli ?? null }, { status });
}

async function eseguiGestore(operazione: () => Promise<Response>): Promise<Response> {
  try {
    return await operazione();
  } catch (error_) {
    if (error_ instanceof ErroreHttpAccessoSessione) {
      return Response.json(error_.toJSON(), { status: error_.status });
    }
    if (error_ instanceof ErroreApplicativo) {
      return rispostaErrore(
        error_.status,
        error_.dati.codice,
        error_.message,
        {
          campo: error_.dati.campo ?? null,
          vincolo: error_.dati.vincolo ?? null,
          ...(error_.dati.dettagli === undefined
            ? {}
            : { causa: error_.dati.dettagli }),
        },
      );
    }
    return rispostaErrore(
      503,
      "servizio_esportazione_non_disponibile",
      "Il servizio di esportazione e importazione non è momentaneamente disponibile.",
    );
  }
}

export function gestisciEsportazione(
  sessioneAstaId: string,
  servizio: Pick<ServizioEsportazione, "esporta">,
): Promise<Response> {
  return eseguiGestore(async () => {
    if (sessioneAstaId.trim().length === 0) {
      return rispostaErrore(400, "sessione_asta_id_obbligatorio", "L'identificativo della sessione è obbligatorio.");
    }
    const file = await servizio.esporta(sessioneAstaId);
    return new Response(JSON.stringify(file), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="asta-${sessioneAstaId}.json"`,
      },
    });
  });
}

export function gestisciImportazione(
  richiesta: Request,
  sessioneAstaId: string,
  servizio: Pick<ServizioEsportazione, "importa">,
): Promise<Response> {
  return eseguiGestore(async () => {
    if (sessioneAstaId.trim().length === 0) {
      return rispostaErrore(400, "sessione_asta_id_obbligatorio", "L'identificativo della sessione è obbligatorio.");
    }
    let contenuto: string;
    try {
      contenuto = await richiesta.text();
    } catch {
      return rispostaErrore(
        400,
        "file_illeggibile",
        "Il file da importare non è leggibile.",
      );
    }
    const esito = await servizio.importa(sessioneAstaId, contenuto);
    return Response.json(esito, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  });
}
