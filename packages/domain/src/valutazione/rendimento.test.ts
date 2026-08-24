import type { StatFantacalcio } from "@asta/contracts";
import { describe, expect, it } from "vitest";

import {
  BONUS_SCARSITA,
  calcolaPunteggioRendimento,
  FM_BASE,
  FM_ESCURSIONE,
  K_FM,
  K_MV,
  K_PRES,
  MR_MAX,
  MR_MIN,
  MV_BASE,
  MV_ESCURSIONE,
  PASSO_AUDACIA,
  PRESENZE_RIF,
} from "./rendimento.js";

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

describe("costanti del motore di valutazione", () => {
  it("espone i valori non configurabili definiti dal design", () => {
    expect({
      FM_BASE,
      FM_ESCURSIONE,
      MV_BASE,
      MV_ESCURSIONE,
      PRESENZE_RIF,
      K_FM,
      K_MV,
      K_PRES,
      MR_MIN,
      MR_MAX,
      BONUS_SCARSITA,
      PASSO_AUDACIA,
    }).toEqual({
      FM_BASE: 5_000,
      FM_ESCURSIONE: 3_000,
      MV_BASE: 5_500,
      MV_ESCURSIONE: 1_500,
      PRESENZE_RIF: 30,
      K_FM: 50,
      K_MV: 25,
      K_PRES: 25,
      MR_MIN: 700,
      MR_MAX: 1_300,
      BONUS_SCARSITA: 600,
      PASSO_AUDACIA: 5,
    });
  });
});

describe("calcolaPunteggioRendimento", () => {
  it("restituisce il punteggio neutro e segnala dati incompleti senza statistiche", () => {
    expect(calcolaPunteggioRendimento(null)).toEqual({
      punteggio: 500,
      datiIncompleti: true,
    });

    expect(
      calcolaPunteggioRendimento(
        creaStatistiche({
          fantamediaMilli: null,
          mediaVotoMilli: null,
          presenze: null,
        }),
      ),
    ).toEqual({ punteggio: 500, datiIncompleti: true });
  });

  it("mappa i limiti inferiori a 0 e quelli superiori a 1000", () => {
    expect(
      calcolaPunteggioRendimento(
        creaStatistiche({
          fantamediaMilli: FM_BASE,
          mediaVotoMilli: MV_BASE,
          presenze: 0,
        }),
      ),
    ).toEqual({ punteggio: 0, datiIncompleti: false });

    expect(
      calcolaPunteggioRendimento(
        creaStatistiche({
          fantamediaMilli: FM_BASE + FM_ESCURSIONE + 1_000,
          mediaVotoMilli: MV_BASE + MV_ESCURSIONE + 1_000,
          presenze: PRESENZE_RIF + 10,
        }),
      ),
    ).toEqual({ punteggio: 1_000, datiIncompleti: false });
  });

  it("rinormalizza i pesi sui soli termini disponibili e tronca la divisione", () => {
    const esito = calcolaPunteggioRendimento(
      creaStatistiche({
        fantamediaMilli: 6_500,
        mediaVotoMilli: 7_000,
        presenze: null,
      }),
    );

    expect(esito).toEqual({
      punteggio: 666,
      datiIncompleti: true,
    });
  });

  it("usa tutti e tre i termini disponibili senza marcare i dati incompleti", () => {
    expect(calcolaPunteggioRendimento(creaStatistiche())).toEqual({
      punteggio: 500,
      datiIncompleti: false,
    });
  });

  it("ignora le statistiche fantacalcio estranee al rendimento", () => {
    const riferimento = calcolaPunteggioRendimento(creaStatistiche());
    const conAltriValori = calcolaPunteggioRendimento(
      creaStatistiche({
        gol: 99,
        assist: 99,
        ammonizioni: 99,
        espulsioni: 99,
        rigoriParati: 99,
        rigoriSbagliati: 99,
        autogol: 99,
        stagione: "2030/2031",
      }),
    );

    expect(conAltriValori).toEqual(riferimento);
  });
});
