import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  COMPOSIZIONE_ROSA_CLASSIC_PREDEFINITA,
  MACRO_REPARTO_PER_RUOLO_MANTRA,
  MACRO_REPARTI,
  PESI_VALUTAZIONE_PREDEFINITI,
  QUOTE_REPARTO_PREDEFINITE,
  REPARTI,
  REPARTI_MANTRA,
  configurazioneAstaSchema,
  macroRepartoSchema,
  repartoSchema,
  statFantacalcioSchema,
  statTatticheSchema,
  voceRegistroSchema,
  voceRosaSchema,
} from "./domain.js";

const voceRegistroBase = {
  id: "registro-1",
  sessioneAstaId: "sessione-1",
  ordinale: 1,
  identificativoGiocatore: "giocatore-1",
  nomeGiocatore: "Mario Rossi",
  ruolo: "A" as const,
  squadra: "Squadra",
  repartoAssegnato: "A" as const,
  macroReparto: "ATT" as const,
  annullataIl: null,
  chiaveIdempotenza: "550e8400-e29b-41d4-a716-446655440000",
  giocatoreAssenteDatiCorrenti: false,
};

const statFantacalcioCompleta = {
  mediaVotoMilli: 6250,
  fantamediaMilli: 7100,
  presenze: 30,
  gol: 12,
  assist: 5,
  ammonizioni: 3,
  espulsioni: 0,
  rigoriParati: 0,
  rigoriSbagliati: 1,
  autogol: 0,
  stagione: "2025/2026",
};

const configurazioneClassicValida = {
  nome: "Asta principale",
  tipoAsta: "chiamata" as const,
  modalitaGioco: "classic" as const,
  numeroPartecipanti: 8,
  creditiIniziali: 500,
  modificatoreDifesa: false,
  composizioneRosa: COMPOSIZIONE_ROSA_CLASSIC_PREDEFINITA,
  quoteReparto: QUOTE_REPARTO_PREDEFINITE,
  pesiValutazione: PESI_VALUTAZIONE_PREDEFINITI,
};

const configurazioneMantraValida = {
  ...configurazioneClassicValida,
  modalitaGioco: "mantra" as const,
  composizioneRosa: {
    Por: 2,
    Dc: 3,
    Dd: 2,
    Ds: 2,
    E: 2,
    M: 2,
    C: 3,
    W: 2,
    T: 2,
    A: 2,
    Pc: 2,
  },
};

// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.22**
describe("campi base della Configurazione_Asta", () => {
  it("accetta i confini inclusivi di nome, partecipanti e crediti", () => {
    expect(
      configurazioneAstaSchema.safeParse({
        ...configurazioneClassicValida,
        nome: "A",
        numeroPartecipanti: 2,
        creditiIniziali: 1,
      }).success,
    ).toBe(true);
    expect(
      configurazioneAstaSchema.safeParse({
        ...configurazioneClassicValida,
        nome: "A".repeat(60),
        numeroPartecipanti: 20,
        creditiIniziali: 100_000,
      }).success,
    ).toBe(true);
  });

  it("rifiuta i valori appena fuori dai confini e i numeri non interi", () => {
    for (const modifica of [
      { nome: "" },
      { nome: " ".repeat(60) },
      { nome: "A".repeat(61) },
      { numeroPartecipanti: 1 },
      { numeroPartecipanti: 21 },
      { numeroPartecipanti: 2.5 },
      { creditiIniziali: 0 },
      { creditiIniziali: 100_001 },
      { creditiIniziali: 1.5 },
    ]) {
      expect(
        configurazioneAstaSchema.safeParse({
          ...configurazioneClassicValida,
          ...modifica,
        }).success,
      ).toBe(false);
    }
  });

  it("accetta esclusivamente i valori documentati di tipo e modalità", () => {
    expect(
      configurazioneAstaSchema.safeParse({
        ...configurazioneClassicValida,
        tipoAsta: "riparazione",
      }).success,
    ).toBe(true);
    expect(
      configurazioneAstaSchema.safeParse({
        ...configurazioneClassicValida,
        tipoAsta: "inglese",
      }).success,
    ).toBe(false);
    expect(
      configurazioneAstaSchema.safeParse({
        ...configurazioneClassicValida,
        modalitaGioco: "legacy",
      }).success,
    ).toBe(false);
  });
});

// **Validates: Requirements 3.5, 3.6, 3.22**
describe("composizione della rosa", () => {
  it("accetta in Classic slot 1-25 e totale 4-50 inclusi", () => {
    expect(
      configurazioneAstaSchema.safeParse({
        ...configurazioneClassicValida,
        composizioneRosa: { P: 1, D: 1, C: 1, A: 1 },
      }).success,
    ).toBe(true);
    expect(
      configurazioneAstaSchema.safeParse({
        ...configurazioneClassicValida,
        composizioneRosa: { P: 25, D: 23, C: 1, A: 1 },
      }).success,
    ).toBe(true);
  });

  it("rifiuta in Classic slot fuori intervallo, frazionari o totale oltre 50", () => {
    for (const composizioneRosa of [
      { P: 0, D: 1, C: 1, A: 1 },
      { P: 26, D: 1, C: 1, A: 1 },
      { P: 1.5, D: 1, C: 1, A: 1 },
      { P: 25, D: 24, C: 1, A: 1 },
    ]) {
      expect(
        configurazioneAstaSchema.safeParse({
          ...configurazioneClassicValida,
          composizioneRosa,
        }).success,
      ).toBe(false);
    }
  });

  it("accetta in Mantra zero per i ruoli non portiere e i totali 4-50", () => {
    expect(
      configurazioneAstaSchema.safeParse({
        ...configurazioneMantraValida,
        composizioneRosa: {
          Por: 1,
          Dc: 3,
          Dd: 0,
          Ds: 0,
          E: 0,
          M: 0,
          C: 0,
          W: 0,
          T: 0,
          A: 0,
          Pc: 0,
        },
      }).success,
    ).toBe(true);
    expect(
      configurazioneAstaSchema.safeParse({
        ...configurazioneMantraValida,
        composizioneRosa: {
          Por: 25,
          Dc: 25,
          Dd: 0,
          Ds: 0,
          E: 0,
          M: 0,
          C: 0,
          W: 0,
          T: 0,
          A: 0,
          Pc: 0,
        },
      }).success,
    ).toBe(true);
  });

  it("rifiuta in Mantra il portiere assente, i limiti esterni e i totali 3 o 51", () => {
    const base = configurazioneMantraValida.composizioneRosa;
    for (const composizioneRosa of [
      { ...base, Por: 0 },
      { ...base, Dc: -1 },
      { ...base, Dc: 26 },
      { ...base, Dc: 2.5 },
      {
        Por: 1,
        Dc: 2,
        Dd: 0,
        Ds: 0,
        E: 0,
        M: 0,
        C: 0,
        W: 0,
        T: 0,
        A: 0,
        Pc: 0,
      },
      {
        Por: 25,
        Dc: 25,
        Dd: 1,
        Ds: 0,
        E: 0,
        M: 0,
        C: 0,
        W: 0,
        T: 0,
        A: 0,
        Pc: 0,
      },
    ]) {
      expect(
        configurazioneAstaSchema.safeParse({
          ...configurazioneMantraValida,
          composizioneRosa,
        }).success,
      ).toBe(false);
    }
  });

  it("rifiuta una composizione appartenente alla modalità diversa", () => {
    expect(
      configurazioneAstaSchema.safeParse({
        ...configurazioneClassicValida,
        composizioneRosa: configurazioneMantraValida.composizioneRosa,
      }).success,
    ).toBe(false);
  });
});

// **Validates: Requirements 3.8, 3.9, 3.16, 3.17**
describe("quote di reparto e pesi di valutazione", () => {
  it("accetta percentuali intere 0-100 con somma esattamente 100", () => {
    expect(
      configurazioneAstaSchema.safeParse({
        ...configurazioneClassicValida,
        quoteReparto: { POR: 0, DIF: 0, CEN: 0, ATT: 100 },
      }).success,
    ).toBe(true);
  });

  it("rifiuta quote fuori intervallo, frazionarie o con somma diversa da 100", () => {
    for (const quoteReparto of [
      { POR: -1, DIF: 21, CEN: 40, ATT: 40 },
      { POR: 101, DIF: 0, CEN: 0, ATT: 0 },
      { POR: 7.5, DIF: 20.5, CEN: 32, ATT: 40 },
      { POR: 8, DIF: 20, CEN: 32, ATT: 39 },
      { POR: 8, DIF: 20, CEN: 32, ATT: 41 },
    ]) {
      expect(
        configurazioneAstaSchema.safeParse({
          ...configurazioneClassicValida,
          quoteReparto,
        }).success,
      ).toBe(false);
    }
  });

  it("accetta pesi interi 0-100 quando almeno uno è positivo", () => {
    expect(
      configurazioneAstaSchema.safeParse({
        ...configurazioneClassicValida,
        pesiValutazione: {
          quotazione: 100,
          budgetReparto: 0,
          budgetTotale: 0,
          slotResidui: 0,
          statistiche: 0,
          audacia: 0,
        },
      }).success,
    ).toBe(true);
  });

  it("rifiuta pesi fuori intervallo, frazionari o tutti nulli", () => {
    const pesi = { ...PESI_VALUTAZIONE_PREDEFINITI };
    for (const pesiValutazione of [
      { ...pesi, quotazione: -1 },
      { ...pesi, quotazione: 101 },
      { ...pesi, quotazione: 0.5 },
      {
        quotazione: 0,
        budgetReparto: 0,
        budgetTotale: 0,
        slotResidui: 0,
        statistiche: 0,
        audacia: 0,
      },
    ]) {
      expect(
        configurazioneAstaSchema.safeParse({
          ...configurazioneClassicValida,
          pesiValutazione,
        }).success,
      ).toBe(false);
    }
  });
});

// **Validates: Requirements 3.7, 3.10, 3.15**
describe("valori predefiniti della Configurazione_Asta", () => {
  it("applica modificatore difesa, quote e pesi predefiniti quando omessi", () => {
    const {
      modificatoreDifesa: _modificatoreDifesa,
      quoteReparto: _quoteReparto,
      pesiValutazione: _pesiValutazione,
      ...senzaOpzionali
    } = configurazioneClassicValida;

    const risultato = configurazioneAstaSchema.parse(senzaOpzionali);

    expect(risultato.modificatoreDifesa).toBe(false);
    expect(risultato.quoteReparto).toEqual(QUOTE_REPARTO_PREDEFINITE);
    expect(risultato.pesiValutazione).toEqual(PESI_VALUTAZIONE_PREDEFINITI);
  });
});

describe("schemi dei reparti", () => {
  it("accetta esattamente i reparti Classic e Mantra previsti", () => {
    for (const reparto of REPARTI) {
      expect(repartoSchema.parse(reparto)).toBe(reparto);
    }

    expect(repartoSchema.safeParse("GK").success).toBe(false);
    expect(macroRepartoSchema.safeParse("POR").success).toBe(true);
    expect(macroRepartoSchema.safeParse("PORTIERI").success).toBe(false);
  });

  it("mappa ogni ruolo Mantra in un solo macro-reparto", () => {
    expect(Object.keys(MACRO_REPARTO_PER_RUOLO_MANTRA)).toEqual(REPARTI_MANTRA);
    expect(
      REPARTI_MANTRA.map((ruolo) => MACRO_REPARTO_PER_RUOLO_MANTRA[ruolo]),
    ).toEqual([
      "POR",
      "DIF",
      "DIF",
      "DIF",
      "CEN",
      "CEN",
      "CEN",
      "CEN",
      "CEN",
      "ATT",
      "ATT",
    ]);

    for (const macroReparto of Object.values(
      MACRO_REPARTO_PER_RUOLO_MANTRA,
    )) {
      expect(MACRO_REPARTI).toContain(macroReparto);
    }
  });
});

describe("schemi delle statistiche", () => {
  it("mantiene zero distinto da una statistica non disponibile", () => {
    const risultato = statFantacalcioSchema.parse({
      ...statFantacalcioCompleta,
      mediaVotoMilli: null,
      gol: 0,
    });

    expect(risultato.mediaVotoMilli).toBeNull();
    expect(risultato.gol).toBe(0);
  });

  it("accetta solo le statistiche tattiche pertinenti al macro-reparto", () => {
    expect(
      statTatticheSchema.parse({
        macroReparto: "POR",
        parate: 87,
        golSubiti: 23,
        cleanSheet: null,
        rigoriParati: 2,
        stagione: "2025/2026",
      }),
    ).toMatchObject({ macroReparto: "POR", cleanSheet: null });

    expect(
      statTatticheSchema.safeParse({
        macroReparto: "POR",
        parate: 87,
        golSubiti: 23,
        cleanSheet: 10,
        rigoriParati: 2,
        gol: 1,
        stagione: "2025/2026",
      }).success,
    ).toBe(false);
  });
});

describe("schemi del registro e della rosa", () => {
  it("richiede il prezzo per l'utente e lo consente assente per un avversario", () => {
    expect(
      voceRegistroSchema.safeParse({
        ...voceRegistroBase,
        assegnatarioTipo: "utente",
        avversarioId: null,
        prezzoAcquisto: 35,
      }).success,
    ).toBe(true);

    expect(
      voceRegistroSchema.safeParse({
        ...voceRegistroBase,
        assegnatarioTipo: "avversario",
        avversarioId: null,
        prezzoAcquisto: null,
      }).success,
    ).toBe(true);

    expect(
      voceRegistroSchema.safeParse({
        ...voceRegistroBase,
        assegnatarioTipo: "utente",
        avversarioId: null,
        prezzoAcquisto: null,
      }).success,
    ).toBe(false);
  });

  it("valida una proiezione della rosa con prezzo intero positivo", () => {
    expect(
      voceRosaSchema.safeParse({
        voceRegistroId: "registro-1",
        identificativoGiocatore: "giocatore-1",
        nomeGiocatore: "Mario Rossi",
        ruolo: "A",
        squadra: "Squadra",
        repartoAssegnato: "A",
        macroReparto: "ATT",
        prezzoAcquisto: 35,
        giocatoreAssenteDatiCorrenti: false,
      }).success,
    ).toBe(true);
  });
});

describe("vincolo di aritmetica intera", () => {
  // **Validates: Requirements 3.20, 4.21, 5.16**
  it("accetta valori interi in millesimi e rifiuta valori frazionari", () => {
    fc.assert(
      fc.property(fc.nat({ max: 100_000 }), (millesimi) => {
        expect(
          statFantacalcioSchema.safeParse({
            ...statFantacalcioCompleta,
            mediaVotoMilli: millesimi,
            fantamediaMilli: millesimi,
          }).success,
        ).toBe(true);

        expect(
          statFantacalcioSchema.safeParse({
            ...statFantacalcioCompleta,
            mediaVotoMilli: millesimi + 0.5,
          }).success,
        ).toBe(false);
      }),
      { numRuns: 100, seed: 424242 },
    );
  });

  // **Validates: Requirements 4.21, 5.16**
  it("rifiuta campi numerici frazionari in statistiche tattiche, registro e rosa", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (intero) => {
        expect(
          statTatticheSchema.safeParse({
            macroReparto: "ATT",
            gol: intero,
            tiri: intero,
            tiriNelloSpecchio: intero,
            golAttesiMilli: intero + 0.25,
            stagione: "2025/2026",
          }).success,
        ).toBe(false);

        expect(
          voceRegistroSchema.safeParse({
            ...voceRegistroBase,
            assegnatarioTipo: "utente",
            avversarioId: null,
            prezzoAcquisto: intero + 0.25,
          }).success,
        ).toBe(false);

        expect(
          voceRosaSchema.safeParse({
            voceRegistroId: "registro-1",
            identificativoGiocatore: "giocatore-1",
            nomeGiocatore: "Mario Rossi",
            ruolo: "A",
            squadra: "Squadra",
            repartoAssegnato: "A",
            macroReparto: "ATT",
            prezzoAcquisto: intero + 0.25,
            giocatoreAssenteDatiCorrenti: false,
          }).success,
        ).toBe(false);
      }),
      { numRuns: 100, seed: 424242 },
    );
  });
});
