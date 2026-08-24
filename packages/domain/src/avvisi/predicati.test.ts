import type { MacroReparto, VoceRosa } from "@asta/contracts";
import { describe, expect, it } from "vitest";

import {
  avvisoBloccoDifensivo,
  avvisoConcentrazioneSquadra,
  avvisoPortiereCostosoGiaInRosa,
  avvisoPrezzoPersonaleOltreConsigliato,
  avvisoQuotazioneOltreBudgetReparto,
  avvisoQuotazioneOltrePrezzoConsigliato,
  avvisoRepartoCompleto,
  avvisoRiservaMinimaInsufficiente,
  type Avviso,
} from "./predicati.js";

function giocatoreRosa(
  id: string,
  macroReparto: MacroReparto,
  squadra: string,
  prezzoAcquisto = 10,
): VoceRosa {
  const repartoAssegnato =
    macroReparto === "POR"
      ? "P"
      : macroReparto === "DIF"
        ? "D"
        : macroReparto === "CEN"
          ? "C"
          : "A";

  return {
    voceRegistroId: `voce-${id}`,
    identificativoGiocatore: `giocatore-${id}`,
    nomeGiocatore: `Giocatore ${id}`,
    ruolo: repartoAssegnato,
    squadra,
    repartoAssegnato,
    macroReparto,
    prezzoAcquisto,
    giocatoreAssenteDatiCorrenti: false,
  };
}

function verificaStrutturaSenzaMessaggio(avviso: Avviso): void {
  expect(avviso).toEqual(
    expect.objectContaining({
      criterio: expect.any(Number),
      livello: expect.stringMatching(/^(informativo|attenzione|critico)$/),
      valori: expect.any(Object),
      chiaveMessaggio: expect.any(String),
    }),
  );
  expect(avviso).not.toHaveProperty("messaggio");
}

describe("predicati puri del Motore Avvisi", () => {
  it("9.2 genera un solo avviso critico soltanto a reparto completo", () => {
    const avviso = avvisoRepartoCompleto({
      reparto: "D",
      slotResiduiReparto: 0,
    });

    expect(avviso).toEqual({
      criterio: 2,
      livello: "critico",
      valori: { reparto: "D", slotResidui: 0 },
      chiaveMessaggio: "avvisi.repartoCompleto",
    });
    verificaStrutturaSenzaMessaggio(avviso!);
    expect(
      avvisoRepartoCompleto({ reparto: "D", slotResiduiReparto: 1 }),
    ).toBeNull();
  });

  it("9.3 applica la soglia inclusiva del 5% arrotondata in difetto con minimo uno", () => {
    const portiereSottoSoglia = giocatoreRosa("1", "POR", "Roma", 24);
    const portiereAllaSoglia = giocatoreRosa("2", "POR", "Inter", 25);

    const avviso = avvisoPortiereCostosoGiaInRosa({
      macroReparto: "POR",
      creditiIniziali: 500,
      rosa: [portiereSottoSoglia, portiereAllaSoglia],
    });

    expect(avviso).toEqual({
      criterio: 3,
      livello: "attenzione",
      valori: {
        nomePortiere: "Giocatore 2",
        prezzoAcquisto: 25,
        sogliaPrezzo: 25,
      },
      chiaveMessaggio: "avvisi.portiereCostosoGiaInRosa",
    });
    expect(
      avvisoPortiereCostosoGiaInRosa({
        macroReparto: "POR",
        creditiIniziali: 19,
        rosa: [giocatoreRosa("3", "POR", "Milan", 1)],
      })?.valori.sogliaPrezzo,
    ).toBe(1);
    expect(
      avvisoPortiereCostosoGiaInRosa({
        macroReparto: "DIF",
        creditiIniziali: 500,
        rosa: [portiereAllaSoglia],
      }),
    ).toBeNull();
  });

  it("9.4 segnala soltanto la quotazione strettamente superiore al prezzo consigliato", () => {
    expect(
      avvisoQuotazioneOltrePrezzoConsigliato({
        quotazione: 31,
        prezzoMassimoConsigliato: 24,
      }),
    ).toEqual({
      criterio: 4,
      livello: "attenzione",
      valori: {
        quotazione: 31,
        prezzoMassimoConsigliato: 24,
        differenzaCrediti: 7,
      },
      chiaveMessaggio: "avvisi.quotazioneOltrePrezzoConsigliato",
    });
    expect(
      avvisoQuotazioneOltrePrezzoConsigliato({
        quotazione: 24,
        prezzoMassimoConsigliato: 24,
      }),
    ).toBeNull();
  });

  it("9.5 segnala soltanto la quotazione strettamente superiore al budget di reparto", () => {
    expect(
      avvisoQuotazioneOltreBudgetReparto({
        quotazione: 40,
        budgetRepartoResiduo: 33,
      }),
    ).toEqual({
      criterio: 5,
      livello: "attenzione",
      valori: {
        quotazione: 40,
        budgetRepartoResiduo: 33,
        differenzaCrediti: 7,
      },
      chiaveMessaggio: "avvisi.quotazioneOltreBudgetReparto",
    });
    expect(
      avvisoQuotazioneOltreBudgetReparto({
        quotazione: 33,
        budgetRepartoResiduo: 33,
      }),
    ).toBeNull();
  });

  it("9.6 calcola i crediti mancanti rispetto alla riserva minima escluso lo slot consultato", () => {
    expect(
      avvisoRiservaMinimaInsufficiente({
        budgetResiduo: 40,
        quotazione: 30,
        riservaMinima: 12,
      }),
    ).toEqual({
      criterio: 6,
      livello: "critico",
      valori: {
        budgetResiduo: 40,
        quotazione: 30,
        riservaMinima: 12,
        slotDaRiempire: 12,
        creditiMancanti: 2,
      },
      chiaveMessaggio: "avvisi.riservaMinimaInsufficiente",
    });
    expect(
      avvisoRiservaMinimaInsufficiente({
        budgetResiduo: 42,
        quotazione: 30,
        riservaMinima: 12,
      }),
    ).toBeNull();
  });

  it("9.7 conta tutti i giocatori già in rosa della stessa squadra", () => {
    const rosa = [
      giocatoreRosa("1", "POR", "Roma"),
      giocatoreRosa("2", "DIF", "Roma"),
      giocatoreRosa("3", "ATT", "Roma"),
      giocatoreRosa("4", "CEN", "Inter"),
    ];

    expect(avvisoConcentrazioneSquadra({ squadra: "Roma", rosa })).toEqual({
      criterio: 7,
      livello: "informativo",
      valori: { squadra: "Roma", giocatoriStessaSquadra: 3 },
      chiaveMessaggio: "avvisi.concentrazioneSquadra",
    });
    expect(
      avvisoConcentrazioneSquadra({ squadra: "Inter", rosa }),
    ).toBeNull();
  });

  it("9.8 richiede modificatore attivo, giocatore difensore e da uno a tre difensori della squadra", () => {
    const rosa = [
      giocatoreRosa("1", "DIF", "Inter"),
      giocatoreRosa("2", "DIF", "Inter"),
      giocatoreRosa("3", "CEN", "Inter"),
    ];

    expect(
      avvisoBloccoDifensivo({
        modificatoreDifesa: true,
        macroReparto: "DIF",
        squadra: "Inter",
        rosa,
      }),
    ).toEqual({
      criterio: 8,
      livello: "informativo",
      valori: {
        squadra: "Inter",
        difensoriStessaSquadra: 2,
        difensoriMancanti: 2,
      },
      chiaveMessaggio: "avvisi.bloccoDifensivo",
    });
    expect(
      avvisoBloccoDifensivo({
        modificatoreDifesa: false,
        macroReparto: "DIF",
        squadra: "Inter",
        rosa,
      }),
    ).toBeNull();
    expect(
      avvisoBloccoDifensivo({
        modificatoreDifesa: true,
        macroReparto: "ATT",
        squadra: "Inter",
        rosa,
      }),
    ).toBeNull();
    expect(
      avvisoBloccoDifensivo({
        modificatoreDifesa: true,
        macroReparto: "DIF",
        squadra: "Roma",
        rosa,
      }),
    ).toBeNull();
  });

  it("11.6 calcola scostamento e percentuale arrotondata all'intero", () => {
    expect(
      avvisoPrezzoPersonaleOltreConsigliato({
        prezzoMassimoPersonale: 14,
        prezzoMassimoConsigliato: 11,
      }),
    ).toEqual({
      criterio: 11.6,
      livello: "informativo",
      valori: {
        prezzoMassimoPersonale: 14,
        prezzoMassimoConsigliato: 11,
        scostamentoCrediti: 3,
        scostamentoPercentuale: 27,
      },
      chiaveMessaggio: "avvisi.prezzoPersonaleOltreConsigliato",
    });
    expect(
      avvisoPrezzoPersonaleOltreConsigliato({
        prezzoMassimoPersonale: 1,
        prezzoMassimoConsigliato: 0,
      })?.valori.scostamentoPercentuale,
    ).toBe(100);
    expect(
      avvisoPrezzoPersonaleOltreConsigliato({
        prezzoMassimoPersonale: null,
        prezzoMassimoConsigliato: 11,
      }),
    ).toBeNull();
    expect(
      avvisoPrezzoPersonaleOltreConsigliato({
        prezzoMassimoPersonale: 11,
        prezzoMassimoConsigliato: 11,
      }),
    ).toBeNull();
  });
});
