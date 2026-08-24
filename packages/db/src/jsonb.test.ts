import { describe, expect, it } from "vitest";

import {
  leggiComposizioneRosaJson,
  leggiPesiValutazioneJson,
  leggiQuoteRepartoJson,
  leggiStatFantacalcioJson,
  leggiStatTatticheJson,
  scriviComposizioneRosaJson,
  scriviPesiValutazioneJson,
  scriviQuoteRepartoJson,
  scriviStatFantacalcioJson,
  scriviStatTatticheJson,
} from "./jsonb.js";

const composizioneClassic = { P: 3, D: 8, C: 8, A: 6 } as const;
const quote = { POR: 8, DIF: 20, CEN: 32, ATT: 40 } as const;
const pesi = {
  quotazione: 30,
  budgetReparto: 25,
  budgetTotale: 15,
  slotResidui: 10,
  statistiche: 20,
  audacia: 20,
} as const;
const statFantacalcio = {
  mediaVotoMilli: 6250,
  fantamediaMilli: 7100,
  presenze: 30,
  gol: 8,
  assist: 5,
  ammonizioni: 3,
  espulsioni: 0,
  rigoriParati: 0,
  rigoriSbagliati: 1,
  autogol: 0,
  stagione: "2025-26",
} as const;
const statTattiche = {
  macroReparto: "ATT",
  gol: 8,
  tiri: 52,
  tiriNelloSpecchio: 26,
  golAttesiMilli: null,
  stagione: "2024-25",
} as const;

describe("confine JSONB validato con Zod", () => {
  it("valida composizione, quote e pesi sia in lettura sia in scrittura", () => {
    expect(leggiComposizioneRosaJson("classic", composizioneClassic)).toEqual(
      composizioneClassic,
    );
    expect(scriviComposizioneRosaJson("classic", composizioneClassic)).toEqual(
      composizioneClassic,
    );
    expect(leggiQuoteRepartoJson(quote)).toEqual(quote);
    expect(scriviQuoteRepartoJson(quote)).toEqual(quote);
    expect(leggiPesiValutazioneJson(pesi)).toEqual(pesi);
    expect(scriviPesiValutazioneJson(pesi)).toEqual(pesi);
  });

  it("rifiuta JSONB di configurazione semanticamente non validi su entrambi i confini", () => {
    expect(() =>
      leggiComposizioneRosaJson("classic", { ...composizioneClassic, P: 0 }),
    ).toThrow();
    expect(() =>
      scriviComposizioneRosaJson("classic", {
        ...composizioneClassic,
        P: 0,
      }),
    ).toThrow();
    expect(() => leggiQuoteRepartoJson({ ...quote, ATT: 39 })).toThrow();
    expect(() =>
      scriviQuoteRepartoJson({ ...quote, ATT: 39 }),
    ).toThrow();
    expect(() =>
      leggiPesiValutazioneJson({
        quotazione: 0,
        budgetReparto: 0,
        budgetTotale: 0,
        slotResidui: 0,
        statistiche: 0,
        audacia: 0,
      }),
    ).toThrow();
    expect(() =>
      scriviPesiValutazioneJson({
        quotazione: 0,
        budgetReparto: 0,
        budgetTotale: 0,
        slotResidui: 0,
        statistiche: 0,
        audacia: 0,
      }),
    ).toThrow();
  });

  it("valida entrambe le statistiche JSONB in lettura e scrittura", () => {
    expect(leggiStatFantacalcioJson(statFantacalcio)).toEqual(
      statFantacalcio,
    );
    expect(scriviStatFantacalcioJson(statFantacalcio)).toEqual(
      statFantacalcio,
    );
    expect(leggiStatTatticheJson(statTattiche)).toEqual(statTattiche);
    expect(scriviStatTatticheJson(statTattiche)).toEqual(statTattiche);

    expect(() =>
      leggiStatFantacalcioJson({ ...statFantacalcio, presenze: 1.5 }),
    ).toThrow();
    expect(() =>
      scriviStatTatticheJson({ ...statTattiche, tiri: -1 }),
    ).toThrow();
  });

  it("mantiene la proprietà di round-trip JSON per statistiche valide generate", () => {
    for (let indice = 0; indice < 100; indice += 1) {
      const generata = {
        ...statFantacalcio,
        mediaVotoMilli: indice % 4 === 0 ? null : 5000 + indice * 10,
        fantamediaMilli: indice % 5 === 0 ? null : 6000 + indice * 10,
        presenze: indice % 39,
        gol: indice % 31,
        assist: indice % 20,
      };
      const persistita = JSON.parse(
        JSON.stringify(scriviStatFantacalcioJson(generata)),
      ) as unknown;

      expect(leggiStatFantacalcioJson(persistita)).toEqual(generata);
    }
  });
});
