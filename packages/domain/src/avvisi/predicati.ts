import type { MacroReparto, Reparto, VoceRosa } from "@asta/contracts";

export type LivelloAvviso = "informativo" | "attenzione" | "critico";
export type CriterioAvviso = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 11.6;
export type ValoriAvviso = Readonly<Record<string, number | string>>;

/**
 * Dato di dominio privo di testo di presentazione. `chiaveMessaggio` identifica
 * il template nello strato UI; `valori` contiene esclusivamente i parametri da
 * interpolare nel template.
 */
export interface Avviso {
  readonly criterio: CriterioAvviso;
  readonly livello: LivelloAvviso;
  readonly valori: ValoriAvviso;
  readonly chiaveMessaggio: string;
}

type GiocatoreRosaPerAvvisi = Pick<
  VoceRosa,
  "nomeGiocatore" | "squadra" | "macroReparto" | "prezzoAcquisto"
>;

export interface IngressoRepartoCompleto {
  readonly reparto: Reparto;
  readonly slotResiduiReparto: number;
}

/** Criterio 9.2: il reparto consultato non ha slot residui. */
export function avvisoRepartoCompleto(
  ingresso: IngressoRepartoCompleto,
): Avviso | null {
  if (ingresso.slotResiduiReparto !== 0) {
    return null;
  }

  return {
    criterio: 2,
    livello: "critico",
    valori: {
      reparto: ingresso.reparto,
      slotResidui: ingresso.slotResiduiReparto,
    },
    chiaveMessaggio: "avvisi.repartoCompleto",
  };
}

export interface IngressoPortiereCostosoGiaInRosa {
  readonly macroReparto: MacroReparto;
  readonly creditiIniziali: number;
  readonly rosa: readonly GiocatoreRosaPerAvvisi[];
}

/**
 * Criterio 9.3: per un portiere consultato, segnala il primo portiere in ordine
 * di rosa acquistato almeno alla soglia del 5% dei crediti iniziali.
 */
export function avvisoPortiereCostosoGiaInRosa(
  ingresso: IngressoPortiereCostosoGiaInRosa,
): Avviso | null {
  if (ingresso.macroReparto !== "POR") {
    return null;
  }

  const sogliaPrezzo = Math.max(
    1,
    Math.trunc((ingresso.creditiIniziali * 5) / 100),
  );
  const portiere = ingresso.rosa.find(
    (giocatore) =>
      giocatore.macroReparto === "POR" &&
      giocatore.prezzoAcquisto >= sogliaPrezzo,
  );

  if (portiere === undefined) {
    return null;
  }

  return {
    criterio: 3,
    livello: "attenzione",
    valori: {
      nomePortiere: portiere.nomeGiocatore,
      prezzoAcquisto: portiere.prezzoAcquisto,
      sogliaPrezzo,
    },
    chiaveMessaggio: "avvisi.portiereCostosoGiaInRosa",
  };
}

export interface IngressoQuotazioneOltrePrezzoConsigliato {
  readonly quotazione: number;
  readonly prezzoMassimoConsigliato: number;
}

/** Criterio 9.4: la quotazione supera il prezzo massimo consigliato. */
export function avvisoQuotazioneOltrePrezzoConsigliato(
  ingresso: IngressoQuotazioneOltrePrezzoConsigliato,
): Avviso | null {
  const differenzaCrediti =
    ingresso.quotazione - ingresso.prezzoMassimoConsigliato;
  if (differenzaCrediti <= 0) {
    return null;
  }

  return {
    criterio: 4,
    livello: "attenzione",
    valori: {
      quotazione: ingresso.quotazione,
      prezzoMassimoConsigliato: ingresso.prezzoMassimoConsigliato,
      differenzaCrediti,
    },
    chiaveMessaggio: "avvisi.quotazioneOltrePrezzoConsigliato",
  };
}

export interface IngressoQuotazioneOltreBudgetReparto {
  readonly quotazione: number;
  readonly budgetRepartoResiduo: number;
}

/** Criterio 9.5: la quotazione supera il budget residuo del reparto. */
export function avvisoQuotazioneOltreBudgetReparto(
  ingresso: IngressoQuotazioneOltreBudgetReparto,
): Avviso | null {
  const differenzaCrediti =
    ingresso.quotazione - ingresso.budgetRepartoResiduo;
  if (differenzaCrediti <= 0) {
    return null;
  }

  return {
    criterio: 5,
    livello: "attenzione",
    valori: {
      quotazione: ingresso.quotazione,
      budgetRepartoResiduo: ingresso.budgetRepartoResiduo,
      differenzaCrediti,
    },
    chiaveMessaggio: "avvisi.quotazioneOltreBudgetReparto",
  };
}

export interface IngressoRiservaMinimaInsufficiente {
  readonly budgetResiduo: number;
  readonly quotazione: number;
  readonly riservaMinima: number;
}

/**
 * Criterio 9.6: dopo una spesa pari alla quotazione non rimarrebbe un credito
 * per ciascuno degli slot che restano da riempire, escluso quello consultato.
 */
export function avvisoRiservaMinimaInsufficiente(
  ingresso: IngressoRiservaMinimaInsufficiente,
): Avviso | null {
  const budgetDopoAcquisto = ingresso.budgetResiduo - ingresso.quotazione;
  const creditiMancanti = ingresso.riservaMinima - budgetDopoAcquisto;
  if (creditiMancanti <= 0) {
    return null;
  }

  return {
    criterio: 6,
    livello: "critico",
    valori: {
      budgetResiduo: ingresso.budgetResiduo,
      quotazione: ingresso.quotazione,
      riservaMinima: ingresso.riservaMinima,
      slotDaRiempire: ingresso.riservaMinima,
      creditiMancanti,
    },
    chiaveMessaggio: "avvisi.riservaMinimaInsufficiente",
  };
}

export interface IngressoConcentrazioneSquadra {
  readonly squadra: string;
  readonly rosa: readonly GiocatoreRosaPerAvvisi[];
}

/** Criterio 9.7: almeno tre giocatori della stessa squadra sono già in rosa. */
export function avvisoConcentrazioneSquadra(
  ingresso: IngressoConcentrazioneSquadra,
): Avviso | null {
  const giocatoriStessaSquadra = ingresso.rosa.filter(
    (giocatore) => giocatore.squadra === ingresso.squadra,
  ).length;
  if (giocatoriStessaSquadra < 3) {
    return null;
  }

  return {
    criterio: 7,
    livello: "informativo",
    valori: {
      squadra: ingresso.squadra,
      giocatoriStessaSquadra,
    },
    chiaveMessaggio: "avvisi.concentrazioneSquadra",
  };
}

export interface IngressoBloccoDifensivo {
  readonly modificatoreDifesa: boolean;
  readonly macroReparto: MacroReparto;
  readonly squadra: string;
  readonly rosa: readonly GiocatoreRosaPerAvvisi[];
}

/**
 * Criterio 9.8: con modificatore attivo, da uno a tre difensori della squadra
 * consultata formano un blocco difensivo ancora incompleto.
 */
export function avvisoBloccoDifensivo(
  ingresso: IngressoBloccoDifensivo,
): Avviso | null {
  if (!ingresso.modificatoreDifesa || ingresso.macroReparto !== "DIF") {
    return null;
  }

  const difensoriStessaSquadra = ingresso.rosa.filter(
    (giocatore) =>
      giocatore.macroReparto === "DIF" &&
      giocatore.squadra === ingresso.squadra,
  ).length;
  if (difensoriStessaSquadra < 1 || difensoriStessaSquadra > 3) {
    return null;
  }

  return {
    criterio: 8,
    livello: "informativo",
    valori: {
      squadra: ingresso.squadra,
      difensoriStessaSquadra,
      difensoriMancanti: 4 - difensoriStessaSquadra,
    },
    chiaveMessaggio: "avvisi.bloccoDifensivo",
  };
}

export interface IngressoPrezzoPersonaleOltreConsigliato {
  readonly prezzoMassimoPersonale: number | null;
  readonly prezzoMassimoConsigliato: number;
}

function arrotondaPercentuale(
  scostamentoCrediti: number,
  prezzoMassimoConsigliato: number,
): number {
  // Il motore di valutazione può restituire zero soltanto per un reparto
  // completo. Un denominatore minimo di un credito mantiene il dato finito e
  // coerente con il prezzo minimo di acquisto previsto dal dominio.
  const denominatore = Math.max(1, prezzoMassimoConsigliato);
  return Math.trunc(
    (scostamentoCrediti * 100 + Math.trunc(denominatore / 2)) /
      denominatore,
  );
}

/** Criterio 11.6: il tetto personale supera di almeno un credito il consiglio. */
export function avvisoPrezzoPersonaleOltreConsigliato(
  ingresso: IngressoPrezzoPersonaleOltreConsigliato,
): Avviso | null {
  if (ingresso.prezzoMassimoPersonale === null) {
    return null;
  }

  const scostamentoCrediti =
    ingresso.prezzoMassimoPersonale - ingresso.prezzoMassimoConsigliato;
  if (scostamentoCrediti < 1) {
    return null;
  }

  return {
    criterio: 11.6,
    livello: "informativo",
    valori: {
      prezzoMassimoPersonale: ingresso.prezzoMassimoPersonale,
      prezzoMassimoConsigliato: ingresso.prezzoMassimoConsigliato,
      scostamentoCrediti,
      scostamentoPercentuale: arrotondaPercentuale(
        scostamentoCrediti,
        ingresso.prezzoMassimoConsigliato,
      ),
    },
    chiaveMessaggio: "avvisi.prezzoPersonaleOltreConsigliato",
  };
}
