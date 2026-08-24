import type { PesiValutazione, StatFantacalcio } from "@asta/contracts";

import { calcolaPunteggioRendimento } from "./rendimento.js";

const MILLESIMI = 1_000;
const RAPPORTO_MERCATO_MINIMO = 500;
const RAPPORTO_MERCATO_MASSIMO = 1_500;
const RAPPORTO_QUOTA_MASSIMO = 2_000;
const INDICE_MINIMO = 0;
const INDICE_MASSIMO = 100;

/**
 * Contiene esclusivamente i dati ammessi dal requisito 13.4.
 */
export interface IngressoIndiceConvenienza {
  readonly prezzoMassimoConsigliato: number;
  readonly quotazione: number;
  readonly statFantacalcio: StatFantacalcio | null;
  readonly slotResiduiReparto: number;
  readonly budgetRepartoResiduo: number;
  readonly pesi: PesiValutazione;
}

/**
 * Calcola una percentuale intera di convenienza con sola aritmetica intera.
 * Il punteggio combina margine sul mercato, rendimento e accessibilita' sul
 * budget di reparto secondo le utilita' definite nel design.
 */
export function indiceConvenienza(
  ingresso: IngressoIndiceConvenienza,
): number {
  if (ingresso.slotResiduiReparto === 0) {
    return INDICE_MINIMO;
  }

  const quotaSlot = Math.max(
    1,
    Math.trunc(
      Math.max(0, ingresso.budgetRepartoResiduo) /
        ingresso.slotResiduiReparto,
    ),
  );

  const rapportoMercato = Math.trunc(
    (ingresso.prezzoMassimoConsigliato * MILLESIMI) /
      Math.max(1, ingresso.quotazione),
  );
  const componenteMargine =
    Math.min(
      RAPPORTO_MERCATO_MASSIMO,
      Math.max(RAPPORTO_MERCATO_MINIMO, rapportoMercato),
    ) - RAPPORTO_MERCATO_MINIMO;

  const componenteRendimento = calcolaPunteggioRendimento(
    ingresso.statFantacalcio,
  ).punteggio;

  const rapportoQuota = Math.trunc(
    (ingresso.prezzoMassimoConsigliato * MILLESIMI) / quotaSlot,
  );
  const componenteAccessibilita =
    RAPPORTO_QUOTA_MASSIMO -
    Math.min(RAPPORTO_QUOTA_MASSIMO, rapportoQuota);

  const utilitaMargine = ingresso.pesi.quotazione;
  const utilitaRendimento = ingresso.pesi.statistiche;
  const utilitaAccessibilita =
    ingresso.pesi.budgetReparto + ingresso.pesi.slotResidui;
  const utilitaTotale =
    utilitaMargine + utilitaRendimento + utilitaAccessibilita;

  const numeratore =
    utilitaMargine * componenteMargine +
    utilitaRendimento * componenteRendimento +
    utilitaAccessibilita * componenteAccessibilita;

  const indiceNonLimitato =
    utilitaTotale > 0
      ? Math.trunc(
          (2 * numeratore + 10 * utilitaTotale) /
            (20 * utilitaTotale),
        )
      : Math.trunc((2 * componenteMargine + 10) / 20);

  return Math.min(
    INDICE_MASSIMO,
    Math.max(INDICE_MINIMO, indiceNonLimitato),
  );
}
