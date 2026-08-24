import type { VoceRegistro } from "@asta/contracts";

export interface GiocatoreIdentificabile {
  readonly identificativoGiocatore: string;
}

/**
 * Calcola i crediti ancora disponibili per un avversario usando soltanto i
 * prezzi annotati nelle sue voci attive. Le annotazioni senza avversario o
 * senza prezzo non alterano la stima.
 */
export function creditiResiduiStimati(
  creditiIniziali: number,
  registro: readonly VoceRegistro[],
  avversarioId: string,
): number {
  let creditiSpesi = 0;

  for (const voce of registro) {
    if (
      voce.annullataIl === null &&
      voce.assegnatarioTipo === "avversario" &&
      voce.avversarioId === avversarioId &&
      voce.prezzoAcquisto !== null
    ) {
      creditiSpesi += voce.prezzoAcquisto;
    }
  }

  return creditiIniziali - creditiSpesi;
}

/** Restituisce vero se il giocatore non compare in alcuna voce attiva. */
export function giocatoreDisponibile(
  identificativoGiocatore: string,
  registro: readonly VoceRegistro[],
): boolean {
  return !registro.some(
    (voce) =>
      voce.annullataIl === null &&
      voce.identificativoGiocatore === identificativoGiocatore,
  );
}

/**
 * Filtra i giocatori dello snapshot mantenendo ordine, riferimenti e tipo
 * concreto delle voci disponibili.
 */
export function filtraGiocatoriDisponibili<
  Giocatore extends GiocatoreIdentificabile,
>(
  giocatori: readonly Giocatore[],
  registro: readonly VoceRegistro[],
): readonly Giocatore[] {
  const identificativiNonDisponibili = new Set(
    registro
      .filter((voce) => voce.annullataIl === null)
      .map((voce) => voce.identificativoGiocatore),
  );

  return giocatori.filter(
    (giocatore) =>
      !identificativiNonDisponibili.has(
        giocatore.identificativoGiocatore,
      ),
  );
}
