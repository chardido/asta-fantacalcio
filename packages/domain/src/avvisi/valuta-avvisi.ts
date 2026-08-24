import type { MacroReparto, Reparto, VoceRosa } from "@asta/contracts";

import {
  avvisoBloccoDifensivo,
  avvisoConcentrazioneSquadra,
  avvisoPortiereCostosoGiaInRosa,
  avvisoPrezzoPersonaleOltreConsigliato,
  avvisoQuotazioneOltreBudgetReparto,
  avvisoQuotazioneOltrePrezzoConsigliato,
  avvisoRepartoCompleto,
  avvisoRiservaMinimaInsufficiente,
  type Avviso,
  type LivelloAvviso,
} from "./predicati.js";

interface IngressoAvvisiComune {
  readonly avvisiInformativiAttivi: boolean;
  readonly reparto: Reparto;
  readonly macroReparto: MacroReparto;
  readonly squadra: string;
  readonly quotazione: number;
  readonly creditiIniziali: number;
  readonly slotResiduiReparto: number;
  readonly budgetRepartoResiduo: number;
  readonly budgetResiduo: number;
  readonly riservaMinima: number;
  readonly modificatoreDifesa: boolean;
  readonly rosa: readonly VoceRosa[];
  readonly prezzoMassimoPersonale: number | null;
}

/**
 * Per un giocatore non disponibile il prezzo consigliato non esiste. La union
 * discriminata impedisce ai chiamanti di sostituirlo con un valore fittizio.
 */
export type IngressoAvvisi = IngressoAvvisiComune &
  (
    | {
        readonly giocatoreDisponibile: true;
        readonly prezzoMassimoConsigliato: number;
      }
    | {
        readonly giocatoreDisponibile: false;
        readonly prezzoMassimoConsigliato: null;
      }
  );

const PRIORITA_LIVELLO = {
  informativo: 1,
  attenzione: 2,
  critico: 3,
} as const satisfies Readonly<Record<LivelloAvviso, number>>;

const NUMERO_MASSIMO_AVVISI = 8;

function isAvviso(avviso: Avviso | null): avviso is Avviso {
  return avviso !== null;
}

/**
 * Valuta una volta ciascuna condizione applicabile, filtra le categorie
 * disattivate, ordina deterministicamente e applica infine il limite massimo.
 */
export function valutaAvvisi(ingresso: IngressoAvvisi): readonly Avviso[] {
  const candidati: (Avviso | null)[] = [
    avvisoRepartoCompleto(ingresso),
    avvisoPortiereCostosoGiaInRosa(ingresso),
    ingresso.giocatoreDisponibile
      ? avvisoQuotazioneOltrePrezzoConsigliato(ingresso)
      : null,
    avvisoQuotazioneOltreBudgetReparto(ingresso),
    avvisoRiservaMinimaInsufficiente(ingresso),
    avvisoConcentrazioneSquadra(ingresso),
    avvisoBloccoDifensivo(ingresso),
    ingresso.giocatoreDisponibile
      ? avvisoPrezzoPersonaleOltreConsigliato(ingresso)
      : null,
  ];

  const filtrati = candidati
    .filter(isAvviso)
    .filter(
      (avviso) =>
        ingresso.avvisiInformativiAttivi ||
        avviso.livello !== "informativo",
    );

  return filtrati
    .map((avviso, indiceOriginale) => ({ avviso, indiceOriginale }))
    .sort((sinistra, destra) => {
      const confrontoLivello =
        PRIORITA_LIVELLO[destra.avviso.livello] -
        PRIORITA_LIVELLO[sinistra.avviso.livello];
      if (confrontoLivello !== 0) {
        return confrontoLivello;
      }

      const confrontoCriterio =
        sinistra.avviso.criterio - destra.avviso.criterio;
      return confrontoCriterio !== 0
        ? confrontoCriterio
        : sinistra.indiceOriginale - destra.indiceOriginale;
    })
    .slice(0, NUMERO_MASSIMO_AVVISI)
    .map(({ avviso }) => avviso);
}
