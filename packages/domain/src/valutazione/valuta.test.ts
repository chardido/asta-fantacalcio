import type {
  PesiValutazione,
  StatFantacalcio,
} from "@asta/contracts";
import { describe, expect, it } from "vitest";

import {
  valuta,
  type EsitoValutazione,
  type IngressoValutazione,
} from "./valuta.js";

const PESI_PREDEFINITI: PesiValutazione = {
  quotazione: 30,
  budgetReparto: 25,
  budgetTotale: 15,
  slotResidui: 10,
  statistiche: 20,
  audacia: 20,
};

function creaStatistiche(
  modifiche: Partial<StatFantacalcio> = {},
): StatFantacalcio {
  return {
    mediaVotoMilli: 6_250,
    fantamediaMilli: 6_500,
    presenze: 15,
    gol: 8,
    assist: 5,
    ammonizioni: 3,
    espulsioni: 0,
    rigoriParati: 0,
    rigoriSbagliati: 0,
    autogol: 0,
    stagione: "2025/2026",
    ...modifiche,
  };
}

function creaIngresso(
  modifiche: Partial<IngressoValutazione> = {},
): IngressoValutazione {
  return {
    budgetResiduo: 500,
    budgetRepartoResiduo: 200,
    slotResiduiReparto: 6,
    slotResiduiTotali: 25,
    quotazione: 24,
    statFantacalcio: creaStatistiche({
      fantamediaMilli: 7_420,
      mediaVotoMilli: 6_310,
      presenze: 33,
    }),
    pesi: PESI_PREDEFINITI,
    ...modifiche,
  };
}

function totaleSpiegato(esito: EsitoValutazione): number {
  return (
    esito.spiegazione.reduce(
      (totale, fattore) => totale + fattore.contributoCrediti,
      0,
    ) +
    esito.audacia.contributoCrediti +
    esito.rettificaArrotondamento +
    esito.rettificaVincolo
  );
}

describe("valuta", () => {
  it("applica i sei passi dell'algoritmo all'esempio numerico del design", () => {
    expect(valuta(creaIngresso())).toMatchObject({
      prezzoMassimoConsigliato: 28,
      vincoloAttivo: "nessuno",
      datiIncompleti: false,
    });
  });

  it("spiega valore, ancora, peso e contributo dei cinque fattori", () => {
    const esito = valuta(creaIngresso());

    expect(esito.spiegazione).toEqual([
      {
        fattore: "budgetResiduo",
        valoreUsato: 500,
        ancoraCrediti: 19,
        peso: 15,
        contributoCrediti: 3,
      },
      {
        fattore: "budgetRepartoResiduo",
        valoreUsato: 200,
        ancoraCrediti: 33,
        peso: 25,
        contributoCrediti: 10,
      },
      {
        fattore: "slotResidui",
        valoreUsato: 6,
        ancoraCrediti: 26,
        peso: 10,
        contributoCrediti: 3,
      },
      {
        fattore: "quotazione",
        valoreUsato: 24,
        ancoraCrediti: 24,
        peso: 30,
        contributoCrediti: 9,
      },
      {
        fattore: "statisticheFantacalcio",
        valoreUsato: {
          fantamediaMilli: 7_420,
          mediaVotoMilli: 6_310,
          presenze: 33,
          punteggioRendimento: 788,
        },
        ancoraCrediti: 30,
        peso: 20,
        contributoCrediti: 0,
      },
    ]);
    expect(esito.audacia).toEqual({
      peso: 20,
      moltiplicatoreMilli: 1_100,
      contributoCrediti: 2,
    });
    expect(esito.rettificaArrotondamento).toBe(1);
    expect(esito.rettificaVincolo).toBe(0);
    expect(totaleSpiegato(esito)).toBe(esito.prezzoMassimoConsigliato);
  });

  it("riconcilia la spiegazione con il prezzo anche quando interviene un vincolo", () => {
    const ingressi = [
      creaIngresso({
        budgetResiduo: 0,
        slotResiduiReparto: 0,
        slotResiduiTotali: 0,
        statFantacalcio: null,
      }),
      creaIngresso({
        budgetResiduo: 8,
        slotResiduiReparto: 2,
        slotResiduiTotali: 10,
      }),
      creaIngresso({
        budgetResiduo: 10,
        budgetRepartoResiduo: 100,
        slotResiduiReparto: 2,
        slotResiduiTotali: 10,
        quotazione: 100,
      }),
      creaIngresso({
        budgetRepartoResiduo: 20,
        slotResiduiReparto: 2,
        quotazione: 100,
      }),
      creaIngresso({
        budgetRepartoResiduo: 0,
        slotResiduiReparto: 2,
        quotazione: 10,
      }),
    ];

    for (const ingresso of ingressi) {
      const esito = valuta(ingresso);
      expect(totaleSpiegato(esito)).toBe(esito.prezzoMassimoConsigliato);
    }
  });

  it("assegna precedenza assoluta al reparto completo", () => {
    expect(
      valuta(
        creaIngresso({
          budgetResiduo: 0,
          slotResiduiReparto: 0,
          slotResiduiTotali: 0,
          statFantacalcio: null,
        }),
      ),
    ).toMatchObject({
      prezzoMassimoConsigliato: 0,
      vincoloAttivo: "reparto_completo",
      datiIncompleti: true,
    });
  });

  it("restituisce il prezzo minimo quando la riserva esaurisce il budget globale", () => {
    expect(
      valuta(
        creaIngresso({
          budgetResiduo: 8,
          slotResiduiReparto: 2,
          slotResiduiTotali: 10,
        }),
      ),
    ).toMatchObject({
      prezzoMassimoConsigliato: 1,
      vincoloAttivo: "budget_minimo",
    });
  });

  it("applica e identifica il tetto globale", () => {
    expect(
      valuta(
        creaIngresso({
          budgetResiduo: 10,
          budgetRepartoResiduo: 100,
          slotResiduiReparto: 2,
          slotResiduiTotali: 10,
          quotazione: 100,
        }),
      ),
    ).toMatchObject({
      prezzoMassimoConsigliato: 1,
      vincoloAttivo: "tetto_globale",
    });
  });

  it("applica e identifica il tetto di reparto", () => {
    expect(
      valuta(
        creaIngresso({
          budgetRepartoResiduo: 20,
          slotResiduiReparto: 2,
          quotazione: 100,
        }),
      ),
    ).toMatchObject({
      prezzoMassimoConsigliato: 19,
      vincoloAttivo: "tetto_reparto",
    });
  });

  it("mantiene il prezzo minimo e segnala il budget di reparto esaurito", () => {
    expect(
      valuta(
        creaIngresso({
          budgetRepartoResiduo: 0,
          slotResiduiReparto: 2,
          quotazione: 10,
          pesi: {
            ...PESI_PREDEFINITI,
            quotazione: 100,
            budgetReparto: 0,
            budgetTotale: 0,
            slotResidui: 0,
            statistiche: 0,
            audacia: 0,
          },
        }),
      ),
    ).toMatchObject({
      prezzoMassimoConsigliato: 10,
      vincoloAttivo: "budget_reparto_esaurito",
      datiIncompleti: false,
    });
  });

  it("usa la quotazione come valore base quando tutti i pesi delle ancore sono zero", () => {
    const esito = valuta(
      creaIngresso({
        quotazione: 10,
        statFantacalcio: creaStatistiche({
          fantamediaMilli: 8_000,
          mediaVotoMilli: 7_000,
          presenze: 30,
        }),
        pesi: {
          quotazione: 0,
          budgetReparto: 0,
          budgetTotale: 0,
          slotResidui: 0,
          statistiche: 100,
          audacia: 0,
        },
      }),
    );

    expect(esito).toMatchObject({
      prezzoMassimoConsigliato: 13,
      vincoloAttivo: "nessuno",
      datiIncompleti: false,
    });
    expect(esito.spiegazione.find(({ fattore }) => fattore === "quotazione"))
      .toMatchObject({ contributoCrediti: 10 });
    expect(totaleSpiegato(esito)).toBe(13);
  });

  it("espone i dati statistici assenti e usa il rendimento neutro", () => {
    const esito = valuta(
      creaIngresso({
        quotazione: 10,
        statFantacalcio: null,
        pesi: {
          quotazione: 100,
          budgetReparto: 0,
          budgetTotale: 0,
          slotResidui: 0,
          statistiche: 100,
          audacia: 0,
        },
      }),
    );

    expect(esito).toMatchObject({
      prezzoMassimoConsigliato: 10,
      vincoloAttivo: "nessuno",
      datiIncompleti: true,
    });
    expect(
      esito.spiegazione.find(
        ({ fattore }) => fattore === "statisticheFantacalcio",
      ),
    ).toMatchObject({
      valoreUsato: {
        fantamediaMilli: null,
        mediaVotoMilli: null,
        presenze: null,
        punteggioRendimento: 500,
      },
      ancoraCrediti: 10,
      contributoCrediti: 0,
    });
  });
});
