import type { PesiValutazione, StatFantacalcio } from "@asta/contracts";

import {
  BONUS_SCARSITA,
  calcolaPunteggioRendimento,
  MR_MAX,
  MR_MIN,
  PASSO_AUDACIA,
  type EsitoPunteggioRendimento,
} from "./rendimento.js";

const MILLESIMI = 1_000;
const PREZZO_MINIMO = 1;

/**
 * Contiene esclusivamente i dati ammessi dal requisito 6.2.
 * La riserva minima viene derivata dagli slot residui totali.
 */
export interface IngressoValutazione {
  readonly budgetResiduo: number;
  readonly budgetRepartoResiduo: number;
  readonly slotResiduiReparto: number;
  readonly slotResiduiTotali: number;
  readonly quotazione: number;
  readonly statFantacalcio: StatFantacalcio | null;
  readonly pesi: PesiValutazione;
}

export type VincoloValutazione =
  | "nessuno"
  | "reparto_completo"
  | "budget_minimo"
  | "tetto_globale"
  | "tetto_reparto"
  | "budget_reparto_esaurito";

export type FattoreValutazione =
  | "budgetResiduo"
  | "budgetRepartoResiduo"
  | "slotResidui"
  | "quotazione"
  | "statisticheFantacalcio";

export interface ValoreStatisticheUsato {
  readonly fantamediaMilli: number | null;
  readonly mediaVotoMilli: number | null;
  readonly presenze: number | null;
  readonly punteggioRendimento: number;
}

/**
 * Voce additiva della spiegazione. Il contributo e l'ancora sono espressi in
 * crediti; per le statistiche il valore usato include sia i tre dati ammessi
 * dall'algoritmo sia il punteggio normalizzato che ne deriva.
 */
export interface ContributoFattore {
  readonly fattore: FattoreValutazione;
  readonly valoreUsato: number | ValoreStatisticheUsato;
  readonly ancoraCrediti: number;
  readonly peso: number;
  readonly contributoCrediti: number;
}

export interface ContributoAudacia {
  readonly peso: number;
  readonly moltiplicatoreMilli: number;
  readonly contributoCrediti: number;
}

export interface EsitoValutazione {
  readonly prezzoMassimoConsigliato: number;
  readonly vincoloAttivo: VincoloValutazione;
  readonly datiIncompleti: boolean;
  readonly spiegazione: readonly ContributoFattore[];
  readonly audacia: ContributoAudacia;
  readonly rettificaArrotondamento: number;
  /** Differenza applicata dal vincolo attivo al prezzo grezzo. */
  readonly rettificaVincolo: number;
}

interface DatiSpiegazione {
  readonly ancoraBudgetTotale: number;
  readonly ancoraBudgetReparto: number;
  readonly ancoraSlotResidui: number;
  readonly ancoraQuotazione: number;
  readonly ancoraStatistiche: number;
  readonly contributoBudgetTotale: number;
  readonly contributoBudgetReparto: number;
  readonly contributoSlotResidui: number;
  readonly contributoQuotazione: number;
  readonly contributoStatistiche: number;
  readonly contributoAudacia: number;
  readonly moltiplicatoreAudacia: number;
  readonly rettificaArrotondamento: number;
  readonly prezzoGrezzo: number;
}

function creaValoreStatisticheUsato(
  statistiche: StatFantacalcio | null,
  rendimento: EsitoPunteggioRendimento,
): ValoreStatisticheUsato {
  return {
    fantamediaMilli: statistiche?.fantamediaMilli ?? null,
    mediaVotoMilli: statistiche?.mediaVotoMilli ?? null,
    presenze: statistiche?.presenze ?? null,
    punteggioRendimento: rendimento.punteggio,
  };
}

function creaSpiegazione(
  ingresso: IngressoValutazione,
  rendimento: EsitoPunteggioRendimento,
  dati: DatiSpiegazione,
): readonly ContributoFattore[] {
  return [
    {
      fattore: "budgetResiduo",
      valoreUsato: ingresso.budgetResiduo,
      ancoraCrediti: dati.ancoraBudgetTotale,
      peso: ingresso.pesi.budgetTotale,
      contributoCrediti: dati.contributoBudgetTotale,
    },
    {
      fattore: "budgetRepartoResiduo",
      valoreUsato: ingresso.budgetRepartoResiduo,
      ancoraCrediti: dati.ancoraBudgetReparto,
      peso: ingresso.pesi.budgetReparto,
      contributoCrediti: dati.contributoBudgetReparto,
    },
    {
      fattore: "slotResidui",
      valoreUsato: ingresso.slotResiduiReparto,
      ancoraCrediti: dati.ancoraSlotResidui,
      peso: ingresso.pesi.slotResidui,
      contributoCrediti: dati.contributoSlotResidui,
    },
    {
      fattore: "quotazione",
      valoreUsato: ingresso.quotazione,
      ancoraCrediti: dati.ancoraQuotazione,
      peso: ingresso.pesi.quotazione,
      contributoCrediti: dati.contributoQuotazione,
    },
    {
      fattore: "statisticheFantacalcio",
      valoreUsato: creaValoreStatisticheUsato(
        ingresso.statFantacalcio,
        rendimento,
      ),
      ancoraCrediti: dati.ancoraStatistiche,
      peso: ingresso.pesi.statistiche,
      contributoCrediti: dati.contributoStatistiche,
    },
  ];
}

function creaEsito(
  ingresso: IngressoValutazione,
  rendimento: EsitoPunteggioRendimento,
  dati: DatiSpiegazione,
  prezzoMassimoConsigliato: number,
  vincoloAttivo: VincoloValutazione,
): EsitoValutazione {
  return {
    prezzoMassimoConsigliato,
    vincoloAttivo,
    datiIncompleti: rendimento.datiIncompleti,
    spiegazione: creaSpiegazione(ingresso, rendimento, dati),
    audacia: {
      peso: ingresso.pesi.audacia,
      moltiplicatoreMilli: dati.moltiplicatoreAudacia,
      contributoCrediti: dati.contributoAudacia,
    },
    rettificaArrotondamento: dati.rettificaArrotondamento,
    rettificaVincolo: prezzoMassimoConsigliato - dati.prezzoGrezzo,
  };
}

/**
 * Calcola il prezzo massimo consigliato con sola aritmetica intera.
 *
 * Il tetto di reparto viene trattato come pianificazione quando è inferiore a
 * un credito: in quel caso prevale il prezzo minimo richiesto dal requisito
 * 6.3 e l'esito segnala esplicitamente `budget_reparto_esaurito`.
 */
export function valuta(ingresso: IngressoValutazione): EsitoValutazione {
  // Passo 0: riserva e tetti.
  const riserva = Math.max(0, ingresso.slotResiduiTotali - 1);
  const capGlobale = ingresso.budgetResiduo - riserva;
  const capReparto =
    ingresso.budgetRepartoResiduo - (ingresso.slotResiduiReparto - 1);

  const rendimento = calcolaPunteggioRendimento(
    ingresso.statFantacalcio,
  );
  const moltiplicatoreRendimento =
    MR_MIN +
    Math.trunc(
      (rendimento.punteggio * (MR_MAX - MR_MIN)) / MILLESIMI,
    );
  const moltiplicatoreAudacia =
    MILLESIMI + PASSO_AUDACIA * ingresso.pesi.audacia;

  // Passo 1: il reparto completo ha precedenza assoluta. Le ancore non
  // applicabili sono esposte a zero e tutti i contributi riconciliano con 0.
  if (ingresso.slotResiduiReparto === 0) {
    return creaEsito(
      ingresso,
      rendimento,
      {
        ancoraBudgetTotale: Math.trunc(
          Math.max(0, capGlobale) /
            Math.max(1, ingresso.slotResiduiTotali),
        ),
        ancoraBudgetReparto: 0,
        ancoraSlotResidui: 0,
        ancoraQuotazione: ingresso.quotazione,
        ancoraStatistiche: 0,
        contributoBudgetTotale: 0,
        contributoBudgetReparto: 0,
        contributoSlotResidui: 0,
        contributoQuotazione: 0,
        contributoStatistiche: 0,
        contributoAudacia: 0,
        moltiplicatoreAudacia,
        rettificaArrotondamento: 0,
        prezzoGrezzo: 0,
      },
      0,
      "reparto_completo",
    );
  }

  // Passo 3: quattro ancore omogenee espresse in crediti.
  const ancoraQuotazione = ingresso.quotazione;
  const ancoraBudgetReparto = Math.trunc(
    Math.max(0, ingresso.budgetRepartoResiduo) /
      ingresso.slotResiduiReparto,
  );
  const ancoraBudgetTotale = Math.trunc(
    Math.max(0, capGlobale) / Math.max(1, ingresso.slotResiduiTotali),
  );
  const ancoraSlotResidui = Math.trunc(
    (ingresso.quotazione *
      (MILLESIMI +
        Math.trunc(BONUS_SCARSITA / ingresso.slotResiduiReparto))) /
      MILLESIMI,
  );

  // Passo 4: media pesata delle ancore; il mercato è il ripiego neutro.
  const pesoAncore =
    ingresso.pesi.quotazione +
    ingresso.pesi.budgetReparto +
    ingresso.pesi.budgetTotale +
    ingresso.pesi.slotResidui;
  const valoreBase =
    pesoAncore > 0
      ? Math.trunc(
          (ingresso.pesi.quotazione * ancoraQuotazione +
            ingresso.pesi.budgetReparto * ancoraBudgetReparto +
            ingresso.pesi.budgetTotale * ancoraBudgetTotale +
            ingresso.pesi.slotResidui * ancoraSlotResidui) /
            pesoAncore,
        )
      : ingresso.quotazione;

  const contributoQuotazione =
    pesoAncore > 0
      ? Math.trunc(
          (ingresso.pesi.quotazione * ancoraQuotazione) / pesoAncore,
        )
      : valoreBase;
  const contributoBudgetReparto =
    pesoAncore > 0
      ? Math.trunc(
          (ingresso.pesi.budgetReparto * ancoraBudgetReparto) /
            pesoAncore,
        )
      : 0;
  const contributoBudgetTotale =
    pesoAncore > 0
      ? Math.trunc(
          (ingresso.pesi.budgetTotale * ancoraBudgetTotale) /
            pesoAncore,
        )
      : 0;
  const contributoSlotResidui =
    pesoAncore > 0
      ? Math.trunc(
          (ingresso.pesi.slotResidui * ancoraSlotResidui) / pesoAncore,
        )
      : 0;
  const sommaContributiAncore =
    contributoQuotazione +
    contributoBudgetReparto +
    contributoBudgetTotale +
    contributoSlotResidui;

  // Passo 5: moltiplicatori di rendimento e audacia.
  const pesoConStatistiche = pesoAncore + ingresso.pesi.statistiche;
  const moltiplicatoreStatistiche =
    pesoConStatistiche > 0
      ? Math.trunc(
          (MILLESIMI * pesoAncore +
            moltiplicatoreRendimento * ingresso.pesi.statistiche) /
            pesoConStatistiche,
        )
      : MILLESIMI;
  const prezzoDopoRendimento = Math.trunc(
    (valoreBase * moltiplicatoreStatistiche) / MILLESIMI,
  );
  const prezzoGrezzo = Math.trunc(
    (prezzoDopoRendimento * moltiplicatoreAudacia) / MILLESIMI,
  );
  const datiSpiegazione: DatiSpiegazione = {
    ancoraBudgetTotale,
    ancoraBudgetReparto,
    ancoraSlotResidui,
    ancoraQuotazione,
    ancoraStatistiche: Math.trunc(
      (valoreBase * moltiplicatoreRendimento) / MILLESIMI,
    ),
    contributoBudgetTotale,
    contributoBudgetReparto,
    contributoSlotResidui,
    contributoQuotazione,
    contributoStatistiche: prezzoDopoRendimento - valoreBase,
    contributoAudacia: prezzoGrezzo - prezzoDopoRendimento,
    moltiplicatoreAudacia,
    rettificaArrotondamento: valoreBase - sommaContributiAncore,
    prezzoGrezzo,
  };

  // Passo 1: il budget minimo prevale sul prezzo calcolato. Il calcolo viene
  // comunque spiegato e la rettifica del vincolo lo riconcilia con 1 credito.
  if (capGlobale < PREZZO_MINIMO) {
    return creaEsito(
      ingresso,
      rendimento,
      datiSpiegazione,
      PREZZO_MINIMO,
      "budget_minimo",
    );
  }

  // Passo 6: applicazione dei tetti di bilancio.
  if (capReparto < PREZZO_MINIMO) {
    return creaEsito(
      ingresso,
      rendimento,
      datiSpiegazione,
      Math.min(
        capGlobale,
        Math.max(PREZZO_MINIMO, prezzoGrezzo),
      ),
      "budget_reparto_esaurito",
    );
  }

  const prezzoLimitatoDalReparto = Math.min(prezzoGrezzo, capReparto);
  const prezzoConMinimo = Math.max(
    PREZZO_MINIMO,
    prezzoLimitatoDalReparto,
  );
  const prezzoMassimoConsigliato = Math.min(capGlobale, prezzoConMinimo);

  let vincoloAttivo: VincoloValutazione = "nessuno";
  if (prezzoConMinimo > capGlobale) {
    vincoloAttivo = "tetto_globale";
  } else if (prezzoGrezzo > capReparto) {
    vincoloAttivo = "tetto_reparto";
  }

  return creaEsito(
    ingresso,
    rendimento,
    datiSpiegazione,
    prezzoMassimoConsigliato,
    vincoloAttivo,
  );
}
