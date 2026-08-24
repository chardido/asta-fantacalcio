import type { StatFantacalcio } from "@asta/contracts";

export const FM_BASE = 5_000;
export const FM_ESCURSIONE = 3_000;
export const MV_BASE = 5_500;
export const MV_ESCURSIONE = 1_500;
export const PRESENZE_RIF = 30;
export const K_FM = 50;
export const K_MV = 25;
export const K_PRES = 25;
export const MR_MIN = 700;
export const MR_MAX = 1_300;
export const BONUS_SCARSITA = 600;
export const PASSO_AUDACIA = 5;

const PUNTEGGIO_MIN = 0;
const PUNTEGGIO_NEUTRO = 500;
const PUNTEGGIO_MAX = 1_000;

type StatisticheRendimento = Pick<
  StatFantacalcio,
  "fantamediaMilli" | "mediaVotoMilli" | "presenze"
>;

export interface EsitoPunteggioRendimento {
  readonly punteggio: number;
  readonly datiIncompleti: boolean;
}

interface TermineRendimento {
  readonly peso: number;
  readonly valore: number;
}

function normalizzaMedia(
  valoreMilli: number,
  base: number,
  escursione: number,
): number {
  if (valoreMilli <= base) {
    return PUNTEGGIO_MIN;
  }

  if (valoreMilli >= base + escursione) {
    return PUNTEGGIO_MAX;
  }

  return Math.trunc(((valoreMilli - base) * PUNTEGGIO_MAX) / escursione);
}

function normalizzaPresenze(presenze: number): number {
  if (presenze >= PRESENZE_RIF) {
    return PUNTEGGIO_MAX;
  }

  return Math.trunc((presenze * PUNTEGGIO_MAX) / PRESENZE_RIF);
}

/**
 * Calcola R in [0, 1000] usando esclusivamente le statistiche disponibili.
 * I pesi dei termini assenti sono esclusi dal denominatore.
 */
export function calcolaPunteggioRendimento(
  statistiche: StatisticheRendimento | null,
): EsitoPunteggioRendimento {
  const termini: TermineRendimento[] = [];

  if (statistiche?.fantamediaMilli !== null && statistiche !== null) {
    termini.push({
      peso: K_FM,
      valore: normalizzaMedia(
        statistiche.fantamediaMilli,
        FM_BASE,
        FM_ESCURSIONE,
      ),
    });
  }

  if (statistiche?.mediaVotoMilli !== null && statistiche !== null) {
    termini.push({
      peso: K_MV,
      valore: normalizzaMedia(
        statistiche.mediaVotoMilli,
        MV_BASE,
        MV_ESCURSIONE,
      ),
    });
  }

  if (statistiche?.presenze !== null && statistiche !== null) {
    termini.push({
      peso: K_PRES,
      valore: normalizzaPresenze(statistiche.presenze),
    });
  }

  if (termini.length === 0) {
    return {
      punteggio: PUNTEGGIO_NEUTRO,
      datiIncompleti: true,
    };
  }

  const pesoTotale = termini.reduce(
    (totale, termine) => totale + termine.peso,
    0,
  );
  const sommaPesata = termini.reduce(
    (totale, termine) => totale + termine.peso * termine.valore,
    0,
  );

  return {
    punteggio: Math.trunc(sommaPesata / pesoTotale),
    datiIncompleti: termini.length < 3,
  };
}
