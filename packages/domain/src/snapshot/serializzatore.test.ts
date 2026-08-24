import { describe, expect, it } from "vitest";

import type { GiocatoreSnapshot, SnapshotDati } from "./normalizzatore.js";
import {
  deserializza,
  serializza,
  snapshotEquivalenti,
} from "./serializzatore.js";

function creaGiocatore(
  modifiche: Partial<GiocatoreSnapshot> = {},
): GiocatoreSnapshot {
  return {
    identificativoGiocatore: "giocatore-1",
    nome: "Mario Rossi",
    nomeRicerca: "mario rossi",
    squadra: "Milano",
    ruoloClassic: "C",
    ruoliMantra: ["C", "T"],
    quotazione: 21,
    statFantacalcio: {
      mediaVotoMilli: 6120,
      fantamediaMilli: null,
      presenze: 30,
      gol: 5,
      assist: 7,
      ammonizioni: 4,
      espulsioni: 0,
      rigoriParati: null,
      rigoriSbagliati: 1,
      autogol: 0,
      stagione: "2025/2026",
    },
    statTattiche: [
      {
        macroReparto: "CEN",
        assist: 7,
        passaggiChiave: 42,
        precisionePassaggiMilli: 873,
        tiri: null,
        stagione: "2025/2026",
      },
      {
        macroReparto: "ATT",
        gol: 5,
        tiri: null,
        tiriNelloSpecchio: 19,
        golAttesiMilli: null,
        stagione: "2025/2026",
      },
    ],
    ...modifiche,
  };
}

function creaSnapshot(
  giocatori: readonly GiocatoreSnapshot[] = [creaGiocatore()],
): SnapshotDati {
  return {
    stagioneListone: "2026/2027",
    stagioneStatistiche: "2025/2026",
    nomeSorgenteListone: "Listone ufficiale",
    nomeSorgenteStatistiche: "Statistiche provider",
    giocatori,
  };
}

function sostituisciPrimoGiocatore(
  snapshot: SnapshotDati,
  modifiche: Partial<GiocatoreSnapshot>,
): SnapshotDati {
  const primo = snapshot.giocatori[0];
  if (primo === undefined) throw new Error("Fixture priva di giocatori");
  return {
    ...snapshot,
    giocatori: [{ ...primo, ...modifiche }, ...snapshot.giocatori.slice(1)],
  };
}

describe("Serializzatore_Dati", () => {
  it("ricostruisce tutti i campi e i contrassegni di non disponibilità", () => {
    const originale = creaSnapshot();

    const rappresentazione = serializza(originale);
    const ricostruito = deserializza(rappresentazione);

    expect(ricostruito).toEqual(originale);
    expect(ricostruito.giocatori[0]?.statFantacalcio.fantamediaMilli).toBeNull();
    expect(ricostruito.giocatori[0]?.statTattiche[0]).toMatchObject({
      macroReparto: "CEN",
      tiri: null,
    });
  });

  it("produce copie profonde che non condividono array o statistiche", () => {
    const originale = creaSnapshot();
    const rappresentazione = serializza(originale);
    const ricostruito = deserializza(rappresentazione);

    expect(rappresentazione.giocatori).not.toBe(originale.giocatori);
    expect(rappresentazione.giocatori[0]).not.toBe(originale.giocatori[0]);
    expect(rappresentazione.giocatori[0]?.ruoliMantra).not.toBe(
      originale.giocatori[0]?.ruoliMantra,
    );
    expect(rappresentazione.giocatori[0]?.statFantacalcio).not.toBe(
      originale.giocatori[0]?.statFantacalcio,
    );
    expect(rappresentazione.giocatori[0]?.statTattiche[0]).not.toBe(
      originale.giocatori[0]?.statTattiche[0],
    );
    expect(ricostruito.giocatori).not.toBe(rappresentazione.giocatori);
    expect(ricostruito.giocatori[0]?.statFantacalcio).not.toBe(
      rappresentazione.giocatori[0]?.statFantacalcio,
    );
  });
});

describe("snapshotEquivalenti", () => {
  it("confronta i giocatori per identificativo indipendentemente dall'ordine", () => {
    const primo = creaGiocatore();
    const secondo = creaGiocatore({
      identificativoGiocatore: "giocatore-2",
      nome: "Luca Verdi",
      nomeRicerca: "luca verdi",
      ruoloClassic: "P",
      ruoliMantra: ["Por"],
      quotazione: 8,
      statTattiche: [
        {
          macroReparto: "POR",
          parate: 91,
          golSubiti: 28,
          cleanSheet: 12,
          rigoriParati: null,
          stagione: "2025/2026",
        },
      ],
    });

    expect(
      snapshotEquivalenti(
        creaSnapshot([primo, secondo]),
        creaSnapshot([secondo, primo]),
      ),
    ).toBe(true);
  });

  it("confronta le statistiche tattiche per macro-reparto e non per posizione", () => {
    const giocatore = creaGiocatore();
    const invertite = creaGiocatore({
      statTattiche: [...giocatore.statTattiche].reverse(),
    });

    expect(
      snapshotEquivalenti(creaSnapshot([giocatore]), creaSnapshot([invertite])),
    ).toBe(true);
  });

  it("ignora solo i metadati esclusi dalla definizione di equivalenza", () => {
    const sinistra = creaSnapshot();
    const destra = sostituisciPrimoGiocatore(
      {
        ...sinistra,
        stagioneListone: "altra stagione",
        stagioneStatistiche: "altra stagione statistiche",
        nomeSorgenteListone: "altra sorgente",
        nomeSorgenteStatistiche: "altra sorgente statistiche",
      },
      { nomeRicerca: "indice ricalcolato" },
    );

    expect(snapshotEquivalenti(sinistra, destra)).toBe(true);
  });

  it.each([
    ["nome", { nome: "Nome differente" }],
    ["squadra", { squadra: "Roma" }],
    ["ruolo classic", { ruoloClassic: "A" }],
    ["ruoli mantra", { ruoliMantra: ["C"] }],
    ["quotazione", { quotazione: 22 }],
  ] satisfies ReadonlyArray<[string, Partial<GiocatoreSnapshot>]>) (
    "rileva una differenza nel campo %s",
    (_campo, modifiche) => {
      const originale = creaSnapshot();
      const modificato = sostituisciPrimoGiocatore(originale, modifiche);

      expect(snapshotEquivalenti(originale, modificato)).toBe(false);
    },
  );

  it("distingue una statistica non disponibile dal valore zero", () => {
    const originale = creaSnapshot();
    const primo = originale.giocatori[0];
    if (primo === undefined) throw new Error("Fixture priva di giocatori");

    const modificato = sostituisciPrimoGiocatore(originale, {
      statFantacalcio: {
        ...primo.statFantacalcio,
        fantamediaMilli: 0,
      },
    });

    expect(snapshotEquivalenti(originale, modificato)).toBe(false);
  });

  it("rileva differenze nelle statistiche tattiche", () => {
    const originale = creaSnapshot();
    const primo = originale.giocatori[0];
    const primaStatistica = primo?.statTattiche[0];
    if (primo === undefined || primaStatistica?.macroReparto !== "CEN") {
      throw new Error("Fixture tattica non valida");
    }

    const modificato = sostituisciPrimoGiocatore(originale, {
      statTattiche: [
        { ...primaStatistica, tiri: 0 },
        ...primo.statTattiche.slice(1),
      ],
    });

    expect(snapshotEquivalenti(originale, modificato)).toBe(false);
  });

  it("richiede lo stesso insieme di identificativi e rifiuta duplicati", () => {
    const giocatore = creaGiocatore();
    const altroIdentificativo = creaGiocatore({
      identificativoGiocatore: "altro",
    });

    expect(
      snapshotEquivalenti(
        creaSnapshot([giocatore]),
        creaSnapshot([altroIdentificativo]),
      ),
    ).toBe(false);
    expect(
      snapshotEquivalenti(
        creaSnapshot([giocatore, giocatore]),
        creaSnapshot([giocatore, giocatore]),
      ),
    ).toBe(false);
  });
});
