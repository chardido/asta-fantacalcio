import type {
  RispostaListoneGrezza,
  RispostaStatisticheGrezza,
  VoceListoneGrezza,
} from "@asta/contracts";
import { describe, expect, it } from "vitest";

import {
  normalizzaDati,
  normalizzaNomeRicerca,
} from "./normalizzatore.js";

function creaListone(
  giocatori: readonly VoceListoneGrezza[] = [
    {
      identificativoGiocatore: "calciatore-1",
      nome: "Álvaro Moràta",
      squadra: "Mílan",
      ruoloClassic: "A",
      ruoliMantra: ["Pc"],
      quotazione: 35,
    },
  ],
): RispostaListoneGrezza {
  return {
    nomeSorgente: "Listone ufficiale",
    stagione: "2026/2027",
    giocatori: [...giocatori],
  };
}

function creaStatistiche(): RispostaStatisticheGrezza {
  return {
    nomeSorgente: "Statistiche provider",
    stagione: "2025/2026",
    giocatori: [
      {
        nome: "alvaro morata",
        squadra: "milan",
        statFantacalcio: {
          mediaVotoMilli: 6120,
          presenze: 31,
          gol: 12,
          assist: 6,
        },
        statTattiche: {
          tiri: 68,
          tiriNelloSpecchio: 30,
        },
      },
    ],
  };
}

function normalizzaConSuccesso(
  listone: RispostaListoneGrezza = creaListone(),
  statistiche: RispostaStatisticheGrezza = creaStatistiche(),
) {
  const risultato = normalizzaDati(listone, statistiche);
  expect(risultato.ok).toBe(true);
  if (!risultato.ok) {
    throw new Error(
      `Normalizzazione fallita: ${risultato.errore.campo}/${risultato.errore.motivo}`,
    );
  }
  return risultato.valore;
}

function voceNonVerificata(
  modifiche: Record<string, unknown>,
): VoceListoneGrezza {
  return {
    ...creaListone().giocatori[0],
    ...modifiche,
  } as VoceListoneGrezza;
}

describe("normalizzaNomeRicerca", () => {
  it("converte in minuscolo e rimuove i segni diacritici", () => {
    expect(normalizzaNomeRicerca("Álvaro Moràta Çalhanoğlu")).toBe(
      "alvaro morata calhanoglu",
    );
  });
});

describe("normalizzaDati", () => {
  it("costruisce lo snapshot preservando i metadati e associando le statistiche", () => {
    const snapshot = normalizzaConSuccesso();

    expect(snapshot).toMatchObject({
      stagioneListone: "2026/2027",
      stagioneStatistiche: "2025/2026",
      nomeSorgenteListone: "Listone ufficiale",
      nomeSorgenteStatistiche: "Statistiche provider",
    });
    expect(snapshot.giocatori).toHaveLength(1);
    expect(snapshot.giocatori[0]).toEqual({
      identificativoGiocatore: "calciatore-1",
      nome: "Álvaro Moràta",
      nomeRicerca: "alvaro morata",
      squadra: "Mílan",
      ruoloClassic: "A",
      ruoliMantra: ["Pc"],
      quotazione: 35,
      statFantacalcio: {
        mediaVotoMilli: 6120,
        fantamediaMilli: null,
        presenze: 31,
        gol: 12,
        assist: 6,
        ammonizioni: null,
        espulsioni: null,
        rigoriParati: null,
        rigoriSbagliati: null,
        autogol: null,
        stagione: "2025/2026",
      },
      statTattiche: [
        {
          macroReparto: "ATT",
          gol: 12,
          tiri: 68,
          tiriNelloSpecchio: 30,
          golAttesiMilli: null,
          stagione: "2025/2026",
        },
      ],
    });
  });

  it("converte in null ogni statistica assente senza interrompere la costruzione", () => {
    const snapshot = normalizzaConSuccesso(creaListone(), {
      ...creaStatistiche(),
      giocatori: [],
    });
    const giocatore = snapshot.giocatori[0];

    expect(giocatore?.statFantacalcio).toEqual({
      mediaVotoMilli: null,
      fantamediaMilli: null,
      presenze: null,
      gol: null,
      assist: null,
      ammonizioni: null,
      espulsioni: null,
      rigoriParati: null,
      rigoriSbagliati: null,
      autogol: null,
      stagione: "2025/2026",
    });
    expect(giocatore?.statTattiche).toEqual([
      {
        macroReparto: "ATT",
        gol: null,
        tiri: null,
        tiriNelloSpecchio: null,
        golAttesiMilli: null,
        stagione: "2025/2026",
      },
    ]);
  });

  it("produce le sole statistiche tattiche pertinenti ai macro-reparti dei ruoli", () => {
    const listone = creaListone([
      {
        identificativoGiocatore: "multi-ruolo",
        nome: "Giocatore Multi Ruolo",
        squadra: "Squadra",
        ruoloClassic: null,
        ruoliMantra: ["Por", "Dc", "C", "Pc"],
        quotazione: 1,
      },
    ]);
    const snapshot = normalizzaConSuccesso(listone, {
      ...creaStatistiche(),
      giocatori: [],
    });

    expect(
      snapshot.giocatori[0]?.statTattiche.map(
        (statistica) => statistica.macroReparto,
      ),
    ).toEqual(["POR", "DIF", "CEN", "ATT"]);
  });

  it.each([1, 999])("accetta la quotazione limite %s", (quotazione) => {
    const snapshot = normalizzaConSuccesso(
      creaListone([voceNonVerificata({ quotazione })]),
    );

    expect(snapshot.giocatori[0]?.quotazione).toBe(quotazione);
  });

  it.each([
    [1.5, "quotazione_non_intera"],
    [0, "quotazione_fuori_intervallo"],
    [1000, "quotazione_fuori_intervallo"],
  ] as const)(
    "rifiuta la quotazione %s indicando campo, giocatore e motivo",
    (quotazione, motivo) => {
      const risultato = normalizzaDati(
        creaListone([voceNonVerificata({ quotazione })]),
        creaStatistiche(),
      );

      expect(risultato).toMatchObject({
        ok: false,
        errore: {
          campo: "quotazione",
          identificativoGiocatore: "calciatore-1",
          motivo,
          vincolo: "intero_compreso_tra_1_e_999",
          valoreRifiutato: quotazione,
        },
      });
    },
  );

  it.each([
    ["identificativoGiocatore", { identificativoGiocatore: undefined }],
    ["nome", { nome: undefined }],
    ["squadra", { squadra: undefined }],
    ["quotazione", { quotazione: undefined }],
    ["ruolo", { ruoloClassic: null, ruoliMantra: [] }],
  ] as const)("rifiuta il campo obbligatorio assente %s", (campo, modifiche) => {
    const risultato = normalizzaDati(
      creaListone([voceNonVerificata(modifiche)]),
      creaStatistiche(),
    );

    expect(risultato).toMatchObject({
      ok: false,
      errore: {
        campo,
        motivo: "campo_obbligatorio_assente",
      },
    });
  });

  it("rifiuta un nome oltre 100 caratteri", () => {
    const risultato = normalizzaDati(
      creaListone([voceNonVerificata({ nome: "x".repeat(101) })]),
      creaStatistiche(),
    );

    expect(risultato).toMatchObject({
      ok: false,
      errore: {
        campo: "nome",
        identificativoGiocatore: "calciatore-1",
        motivo: "nome_troppo_lungo",
        vincolo: "lunghezza_massima_100",
      },
    });
  });

  it.each([
    ["ruoloClassic", { ruoloClassic: "X" }],
    ["ruoliMantra[0]", { ruoloClassic: null, ruoliMantra: ["X"] }],
  ] as const)("rifiuta il ruolo estraneo nel campo %s", (campo, modifiche) => {
    const risultato = normalizzaDati(
      creaListone([voceNonVerificata(modifiche)]),
      creaStatistiche(),
    );

    expect(risultato).toMatchObject({
      ok: false,
      errore: {
        campo,
        identificativoGiocatore: "calciatore-1",
        motivo: "ruolo_non_ammesso",
      },
    });
  });

  it("rifiuta un identificativo duplicato senza restituire uno snapshot parziale", () => {
    const prima = creaListone().giocatori[0];
    if (prima === undefined) throw new Error("Fixture listone non valida");

    const risultato = normalizzaDati(
      creaListone([
        prima,
        {
          ...prima,
          nome: "Secondo Giocatore",
        },
      ]),
      creaStatistiche(),
    );

    expect(risultato).toEqual({
      ok: false,
      errore: {
        codice: "risposta_non_valida",
        campo: "identificativoGiocatore",
        identificativoGiocatore: "calciatore-1",
        motivo: "identificativo_duplicato",
        vincolo: "univoco_nella_risposta",
        valoreRifiutato: "calciatore-1",
      },
    });
    expect("valore" in risultato).toBe(false);
  });
});
