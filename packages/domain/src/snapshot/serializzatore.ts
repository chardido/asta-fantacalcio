import type {
  RepartoClassic,
  RepartoMantra,
  StatFantacalcio,
  StatTattiche,
} from "@asta/contracts";

import type { GiocatoreSnapshot, SnapshotDati } from "./normalizzatore.js";

/**
 * Forma priva di riferimenti al modello in memoria, adatta al confine con la
 * persistenza. I `null` sono conservati perché distinguono una statistica non
 * disponibile da un valore realmente uguale a zero.
 */
export interface GiocatorePersistente {
  readonly identificativoGiocatore: string;
  readonly nome: string;
  readonly nomeRicerca: string;
  readonly squadra: string;
  readonly ruoloClassic: RepartoClassic | null;
  readonly ruoliMantra: readonly RepartoMantra[];
  readonly quotazione: number;
  readonly statFantacalcio: StatFantacalcio;
  readonly statTattiche: readonly StatTattiche[];
}

export interface RappresentazionePersistente {
  readonly stagioneListone: string;
  readonly stagioneStatistiche: string;
  readonly nomeSorgenteListone: string;
  readonly nomeSorgenteStatistiche: string;
  readonly giocatori: readonly GiocatorePersistente[];
}

function copiaStatFantacalcio(
  statistiche: StatFantacalcio,
): StatFantacalcio {
  return { ...statistiche };
}

function copiaStatTattiche(statistiche: StatTattiche): StatTattiche {
  return { ...statistiche };
}

function copiaGiocatore(
  giocatore: GiocatoreSnapshot | GiocatorePersistente,
): GiocatorePersistente {
  return {
    identificativoGiocatore: giocatore.identificativoGiocatore,
    nome: giocatore.nome,
    nomeRicerca: giocatore.nomeRicerca,
    squadra: giocatore.squadra,
    ruoloClassic: giocatore.ruoloClassic,
    ruoliMantra: [...giocatore.ruoliMantra],
    quotazione: giocatore.quotazione,
    statFantacalcio: copiaStatFantacalcio(giocatore.statFantacalcio),
    statTattiche: giocatore.statTattiche.map(copiaStatTattiche),
  };
}

/** Trasforma lo snapshot in una rappresentazione persistente indipendente. */
export function serializza(
  snapshot: SnapshotDati,
): RappresentazionePersistente {
  return {
    stagioneListone: snapshot.stagioneListone,
    stagioneStatistiche: snapshot.stagioneStatistiche,
    nomeSorgenteListone: snapshot.nomeSorgenteListone,
    nomeSorgenteStatistiche: snapshot.nomeSorgenteStatistiche,
    giocatori: snapshot.giocatori.map(copiaGiocatore),
  };
}

/** Ricostruisce uno snapshot senza condividere strutture mutabili con l'input. */
export function deserializza(
  rappresentazione: RappresentazionePersistente,
): SnapshotDati {
  return {
    stagioneListone: rappresentazione.stagioneListone,
    stagioneStatistiche: rappresentazione.stagioneStatistiche,
    nomeSorgenteListone: rappresentazione.nomeSorgenteListone,
    nomeSorgenteStatistiche: rappresentazione.nomeSorgenteStatistiche,
    giocatori: rappresentazione.giocatori.map(copiaGiocatore),
  };
}

function statFantacalcioEquivalenti(
  sinistra: StatFantacalcio,
  destra: StatFantacalcio,
): boolean {
  return (
    sinistra.mediaVotoMilli === destra.mediaVotoMilli &&
    sinistra.fantamediaMilli === destra.fantamediaMilli &&
    sinistra.presenze === destra.presenze &&
    sinistra.gol === destra.gol &&
    sinistra.assist === destra.assist &&
    sinistra.ammonizioni === destra.ammonizioni &&
    sinistra.espulsioni === destra.espulsioni &&
    sinistra.rigoriParati === destra.rigoriParati &&
    sinistra.rigoriSbagliati === destra.rigoriSbagliati &&
    sinistra.autogol === destra.autogol &&
    sinistra.stagione === destra.stagione
  );
}

function statTatticheEquivalenti(
  sinistra: StatTattiche,
  destra: StatTattiche,
): boolean {
  if (
    sinistra.macroReparto !== destra.macroReparto ||
    sinistra.stagione !== destra.stagione
  ) {
    return false;
  }

  switch (sinistra.macroReparto) {
    case "POR": {
      const altra = destra as Extract<StatTattiche, { macroReparto: "POR" }>;
      return (
        sinistra.parate === altra.parate &&
        sinistra.golSubiti === altra.golSubiti &&
        sinistra.cleanSheet === altra.cleanSheet &&
        sinistra.rigoriParati === altra.rigoriParati
      );
    }
    case "DIF": {
      const altra = destra as Extract<StatTattiche, { macroReparto: "DIF" }>;
      return (
        sinistra.cleanSheetSquadra === altra.cleanSheetSquadra &&
        sinistra.duelliDifensiviVinti === altra.duelliDifensiviVinti &&
        sinistra.contrasti === altra.contrasti &&
        sinistra.precisionePassaggiMilli === altra.precisionePassaggiMilli
      );
    }
    case "CEN": {
      const altra = destra as Extract<StatTattiche, { macroReparto: "CEN" }>;
      return (
        sinistra.assist === altra.assist &&
        sinistra.passaggiChiave === altra.passaggiChiave &&
        sinistra.precisionePassaggiMilli === altra.precisionePassaggiMilli &&
        sinistra.tiri === altra.tiri
      );
    }
    case "ATT": {
      const altra = destra as Extract<StatTattiche, { macroReparto: "ATT" }>;
      return (
        sinistra.gol === altra.gol &&
        sinistra.tiri === altra.tiri &&
        sinistra.tiriNelloSpecchio === altra.tiriNelloSpecchio &&
        sinistra.golAttesiMilli === altra.golAttesiMilli
      );
    }
  }
}

function collezioniTatticheEquivalenti(
  sinistra: readonly StatTattiche[],
  destra: readonly StatTattiche[],
): boolean {
  if (sinistra.length !== destra.length) return false;

  const perMacroReparto = new Map(
    destra.map((statistiche) => [statistiche.macroReparto, statistiche]),
  );
  if (perMacroReparto.size !== destra.length) return false;

  const macroRepartiSinistra = new Set<string>();
  for (const statistiche of sinistra) {
    if (macroRepartiSinistra.has(statistiche.macroReparto)) return false;
    macroRepartiSinistra.add(statistiche.macroReparto);

    const corrispondenti = perMacroReparto.get(statistiche.macroReparto);
    if (
      corrispondenti === undefined ||
      !statTatticheEquivalenti(statistiche, corrispondenti)
    ) {
      return false;
    }
  }

  return true;
}

function giocatoriEquivalenti(
  sinistra: GiocatoreSnapshot,
  destra: GiocatoreSnapshot,
): boolean {
  return (
    sinistra.identificativoGiocatore === destra.identificativoGiocatore &&
    sinistra.nome === destra.nome &&
    sinistra.squadra === destra.squadra &&
    sinistra.ruoloClassic === destra.ruoloClassic &&
    sinistra.ruoliMantra.length === destra.ruoliMantra.length &&
    sinistra.ruoliMantra.every(
      (ruolo, indice) => ruolo === destra.ruoliMantra[indice],
    ) &&
    sinistra.quotazione === destra.quotazione &&
    statFantacalcioEquivalenti(
      sinistra.statFantacalcio,
      destra.statFantacalcio,
    ) &&
    collezioniTatticheEquivalenti(
      sinistra.statTattiche,
      destra.statTattiche,
    )
  );
}

function indicizzaGiocatori(
  giocatori: readonly GiocatoreSnapshot[],
): ReadonlyMap<string, GiocatoreSnapshot> | null {
  const indice = new Map<string, GiocatoreSnapshot>();
  for (const giocatore of giocatori) {
    if (indice.has(giocatore.identificativoGiocatore)) return null;
    indice.set(giocatore.identificativoGiocatore, giocatore);
  }
  return indice;
}

/**
 * Relazione di equivalenza del requisito 4.21.
 *
 * Metadati dello snapshot e `nomeRicerca` non partecipano alla relazione,
 * perché il criterio la definisce esclusivamente sui campi sorgente di ogni
 * giocatore. L'ordine dei giocatori (e delle statistiche tattiche per
 * macro-reparto) non influenza il risultato.
 */
export function snapshotEquivalenti(
  sinistra: SnapshotDati,
  destra: SnapshotDati,
): boolean {
  if (sinistra.giocatori.length !== destra.giocatori.length) return false;

  const indiceSinistra = indicizzaGiocatori(sinistra.giocatori);
  const indiceDestra = indicizzaGiocatori(destra.giocatori);
  if (indiceSinistra === null || indiceDestra === null) return false;

  for (const [identificativo, giocatore] of indiceSinistra) {
    const corrispondente = indiceDestra.get(identificativo);
    if (
      corrispondente === undefined ||
      !giocatoriEquivalenti(giocatore, corrispondente)
    ) {
      return false;
    }
  }

  return true;
}
