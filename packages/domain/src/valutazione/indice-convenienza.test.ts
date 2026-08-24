import type {
  PesiValutazione,
  StatFantacalcio,
} from "@asta/contracts";
import { describe, expect, it } from "vitest";

import {
  indiceConvenienza,
  type IngressoIndiceConvenienza,
} from "./indice-convenienza.js";

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
    mediaVotoMilli: 6_310,
    fantamediaMilli: 7_420,
    presenze: 33,
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
  modifiche: Partial<IngressoIndiceConvenienza> = {},
): IngressoIndiceConvenienza {
  return {
    prezzoMassimoConsigliato: 28,
    quotazione: 24,
    statFantacalcio: creaStatistiche(),
    slotResiduiReparto: 6,
    budgetRepartoResiduo: 200,
    pesi: PESI_PREDEFINITI,
    ...modifiche,
  };
}

describe("indiceConvenienza", () => {
  it("applica componenti e utilita' all'esempio numerico del design", () => {
    expect(indiceConvenienza(creaIngresso())).toBe(89);
  });

  it("restituisce 0 con precedenza assoluta quando il reparto e' completo", () => {
    expect(
      indiceConvenienza(
        creaIngresso({
          prezzoMassimoConsigliato: 0,
          slotResiduiReparto: 0,
          budgetRepartoResiduo: 0,
          statFantacalcio: null,
        }),
      ),
    ).toBe(0);
  });

  it("combina separatamente margine, rendimento e accessibilita'", () => {
    const soloMargine = indiceConvenienza(
      creaIngresso({
        prezzoMassimoConsigliato: 10,
        quotazione: 10,
        pesi: {
          ...PESI_PREDEFINITI,
          quotazione: 100,
          budgetReparto: 0,
          slotResidui: 0,
          statistiche: 0,
        },
      }),
    );
    const soloRendimento = indiceConvenienza(
      creaIngresso({
        statFantacalcio: null,
        pesi: {
          ...PESI_PREDEFINITI,
          quotazione: 0,
          budgetReparto: 0,
          slotResidui: 0,
          statistiche: 100,
        },
      }),
    );
    const soloAccessibilita = indiceConvenienza(
      creaIngresso({
        prezzoMassimoConsigliato: 10,
        budgetRepartoResiduo: 10,
        slotResiduiReparto: 1,
        pesi: {
          ...PESI_PREDEFINITI,
          quotazione: 0,
          budgetReparto: 100,
          slotResidui: 0,
          statistiche: 0,
        },
      }),
    );

    expect({ soloMargine, soloRendimento, soloAccessibilita }).toEqual({
      soloMargine: 50,
      soloRendimento: 50,
      soloAccessibilita: 100,
    });
  });

  it("usa il margine come ripiego e arrotonda le meta' per eccesso", () => {
    expect(
      indiceConvenienza(
        creaIngresso({
          prezzoMassimoConsigliato: 201,
          quotazione: 200,
          pesi: {
            quotazione: 0,
            budgetReparto: 0,
            budgetTotale: 100,
            slotResidui: 0,
            statistiche: 0,
            audacia: 100,
          },
        }),
      ),
    ).toBe(51);
  });

  it("applica il clamp finale agli estremi 0 e 100", () => {
    const indiceMinimo = indiceConvenienza(
      creaIngresso({
        prezzoMassimoConsigliato: 1,
        quotazione: 3,
        pesi: {
          ...PESI_PREDEFINITI,
          quotazione: 100,
          budgetReparto: 0,
          slotResidui: 0,
          statistiche: 0,
        },
      }),
    );
    const indiceMassimo = indiceConvenienza(
      creaIngresso({
        prezzoMassimoConsigliato: 1,
        budgetRepartoResiduo: 1_000,
        slotResiduiReparto: 1,
        pesi: {
          ...PESI_PREDEFINITI,
          quotazione: 0,
          budgetReparto: 100,
          slotResidui: 0,
          statistiche: 0,
        },
      }),
    );

    expect(indiceMinimo).toBe(0);
    expect(indiceMassimo).toBe(100);
  });
});
