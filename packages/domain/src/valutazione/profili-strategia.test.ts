import type { IngressoValutazione } from "./valuta.js";
import { describe, expect, it } from "vitest";

import {
  applicaProfiloStrategia,
  PESI_PROFILO_AGGRESSIVO,
  PESI_PROFILO_CONSERVATIVO,
  PESI_VALUTAZIONE_PREDEFINITI,
  PREIMPOSTAZIONI_PROFILO_STRATEGIA,
  PROFILI_STRATEGIA,
  ripristinaPesiPredefiniti,
  type ProfiloStrategia,
} from "./profili-strategia.js";
import { valuta } from "./valuta.js";

describe("preimpostazioni dei pesi", () => {
  it("espone i valori predefiniti di sistema stabiliti dal design", () => {
    expect(PESI_VALUTAZIONE_PREDEFINITI).toEqual({
      quotazione: 30,
      budgetReparto: 25,
      budgetTotale: 15,
      slotResidui: 10,
      statistiche: 20,
      audacia: 20,
    });
  });

  it("espone esattamente i profili conservativo e aggressivo", () => {
    expect(PROFILI_STRATEGIA).toEqual(["conservativo", "aggressivo"]);
    expect(Object.keys(PREIMPOSTAZIONI_PROFILO_STRATEGIA)).toEqual([
      "conservativo",
      "aggressivo",
    ]);
  });

  it("differenzia i due profili esclusivamente per il peso audacia", () => {
    expect(PESI_PROFILO_CONSERVATIVO).toEqual({
      ...PESI_VALUTAZIONE_PREDEFINITI,
      audacia: 0,
    });
    expect(PESI_PROFILO_AGGRESSIVO).toEqual({
      ...PESI_VALUTAZIONE_PREDEFINITI,
      audacia: 80,
    });

    const { audacia: audaciaConservativa, ...baseConservativa } =
      PESI_PROFILO_CONSERVATIVO;
    const { audacia: audaciaAggressiva, ...baseAggressiva } =
      PESI_PROFILO_AGGRESSIVO;

    expect(baseAggressiva).toEqual(baseConservativa);
    expect(audaciaConservativa).toBe(0);
    expect(audaciaAggressiva).toBe(80);
  });
});

describe("applicaProfiloStrategia", () => {
  it.each([
    ["conservativo", PESI_PROFILO_CONSERVATIVO],
    ["aggressivo", PESI_PROFILO_AGGRESSIVO],
  ] as const)("applica il profilo %s", (profilo, attesi) => {
    expect(applicaProfiloStrategia(profilo)).toEqual(attesi);
  });

  it("restituisce copie personalizzabili senza modificare le preimpostazioni", () => {
    const primaCopia = applicaProfiloStrategia("conservativo");
    const secondaCopia = applicaProfiloStrategia("conservativo");

    primaCopia.audacia = 47;

    expect(primaCopia).not.toBe(secondaCopia);
    expect(secondaCopia).toEqual(PESI_PROFILO_CONSERVATIVO);
    expect(PESI_PROFILO_CONSERVATIVO.audacia).toBe(0);
  });

  it("rifiuta un profilo diverso dai due valori ammessi", () => {
    expect(() =>
      applicaProfiloStrategia("bilanciato" as ProfiloStrategia),
    ).toThrowError(
      "Profilo strategia non valido: bilanciato. Valori ammessi: conservativo, aggressivo",
    );
  });

  it("produce il prezzo atteso per entrambi i profili nell'esempio del design", () => {
    const ingresso: Omit<IngressoValutazione, "pesi"> = {
      budgetResiduo: 500,
      budgetRepartoResiduo: 200,
      slotResiduiReparto: 6,
      slotResiduiTotali: 25,
      quotazione: 24,
      statFantacalcio: {
        mediaVotoMilli: 6_310,
        fantamediaMilli: 7_420,
        presenze: 33,
        gol: 0,
        assist: 0,
        ammonizioni: 0,
        espulsioni: 0,
        rigoriParati: 0,
        rigoriSbagliati: 0,
        autogol: 0,
        stagione: "2025/2026",
      },
    };

    const conservativo = valuta({
      ...ingresso,
      pesi: applicaProfiloStrategia("conservativo"),
    });
    const aggressivo = valuta({
      ...ingresso,
      pesi: applicaProfiloStrategia("aggressivo"),
    });

    expect(conservativo.prezzoMassimoConsigliato).toBe(26);
    expect(aggressivo.prezzoMassimoConsigliato).toBe(36);
    expect(aggressivo.prezzoMassimoConsigliato).toBeGreaterThanOrEqual(
      conservativo.prezzoMassimoConsigliato,
    );
  });
});

describe("ripristinaPesiPredefiniti", () => {
  it("ripristina una nuova copia dei valori predefiniti di sistema", () => {
    const ripristinati = ripristinaPesiPredefiniti();
    const secondoRipristino = ripristinaPesiPredefiniti();

    expect(ripristinati).toEqual(PESI_VALUTAZIONE_PREDEFINITI);
    expect(ripristinati).not.toBe(PESI_VALUTAZIONE_PREDEFINITI);
    expect(ripristinati).not.toBe(secondoRipristino);
  });
});
