import { ErroreHttpAccessoSessione } from "../sessioni/carica-sessione-propria";
import {
  ErroreInputCanaleEventi,
  type CanaleEventi,
} from "./canale-eventi";

function erroreJson(status: number, codice: string, messaggio: string): Response {
  return Response.json({ codice, messaggio }, { status });
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
    if (error_ instanceof ErroreInputCanaleEventi) {
      return Response.json(
        {
          codice: "parametro_eventi_non_valido",
          campo: error_.campo,
          valore: error_.valore,
          messaggio: error_.message,
        },
        { status: 400 },
      );
    }
    return erroreJson(
      503,
      "canale_eventi_non_disponibile",
      "Il canale eventi non è disponibile. Usare temporaneamente il polling.",
    );
  }
}

export function gestisciStreamEventi(
  richiesta: Request,
  sessioneAstaId: string,
  canale: CanaleEventi,
): Promise<Response> {
  return eseguiGestore(() =>
    canale.apri(
      sessioneAstaId,
      richiesta.headers.get("last-event-id"),
      richiesta.signal,
    ),
  );
}

export function gestisciDeltaRegistro(
  richiesta: Request,
  sessioneAstaId: string,
  canale: CanaleEventi,
): Promise<Response> {
  return eseguiGestore(async () => {
    const dopoOrdinale = new URL(richiesta.url).searchParams.get(
      "dopoOrdinale",
    );
    const delta = await canale.delta(sessioneAstaId, dopoOrdinale);
    return Response.json(delta, {
      headers: {
        "Cache-Control": "no-store",
        "X-Polling-Interval-Ms": "5000",
      },
    });
  });
}
