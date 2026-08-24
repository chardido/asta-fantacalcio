import {
  MACRO_REPARTO_PER_RUOLO_MANTRA,
  PESI_VALUTAZIONE_PREDEFINITI,
  type ConfigurazioneAsta,
  type VoceRegistro,
} from "@asta/contracts";
import type { SessioneAstaPersistita } from "@asta/db";
import {
  PESI_PROFILO_AGGRESSIVO,
  PESI_PROFILO_CONSERVATIVO,
} from "@asta/domain";
import { describe, expect, it, vi } from "vitest";

import { ErroreApplicativo } from "../trpc/errori.js";
import {
  ServizioConfigurazione,
  type DipendenzeServizioConfigurazione,
} from "./servizio-configurazione.js";

const configurazione: ConfigurazioneAsta = {
  nome: "Asta principale",
  tipoAsta: "chiamata",
  modalitaGioco: "classic",
  numeroPartecipanti: 8,
  creditiIniziali: 500,
  modificatoreDifesa: false,
  composizioneRosa: { P: 3, D: 8, C: 8, A: 6 },
  quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
  pesiValutazione: { ...PESI_VALUTAZIONE_PREDEFINITI },
};

function creaSessione(
  configurazioneSessione: ConfigurazioneAsta = configurazione,
): SessioneAstaPersistita {
  return {
    id: "sessione-1",
    utenteId: "utente-1",
    stagioneListone: "2025-26",
    stato: "in_corso",
    configurazione: configurazioneSessione,
    avvisiInformativiAttivi: true,
    creatoIl: new Date("2026-01-01T10:00:00.000Z"),
    aggiornatoIl: new Date("2026-01-02T10:00:00.000Z"),
  };
}

function voceUtente(
  id: string,
  repartoAssegnato: "P" | "D" | "C" | "A",
  prezzoAcquisto: number,
  opzioni: Partial<VoceRegistro> = {},
): VoceRegistro {
  const macroReparto = {
    P: "POR",
    D: "DIF",
    C: "CEN",
    A: "ATT",
  } as const;

  return {
    id,
    sessioneAstaId: "sessione-1",
    ordinale: Number(id),
    identificativoGiocatore: `giocatore-${id}`,
    nomeGiocatore: `Giocatore ${id}`,
    ruolo: repartoAssegnato,
    squadra: "Roma",
    repartoAssegnato,
    macroReparto: macroReparto[repartoAssegnato],
    prezzoAcquisto,
    assegnatarioTipo: "utente",
    avversarioId: null,
    annullataIl: null,
    chiaveIdempotenza: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
    giocatoreAssenteDatiCorrenti: false,
    ...opzioni,
  } as VoceRegistro;
}

function creaScenario(input: {
  readonly configurazioneIniziale?: ConfigurazioneAsta;
  readonly registro?: readonly VoceRegistro[];
} = {}) {
  let sessioneCorrente = creaSessione(input.configurazioneIniziale);
  const caricaSessionePropria = vi
    .fn()
    .mockImplementation(() => Promise.resolve(sessioneCorrente));
  const elencaPerSessione = vi
    .fn()
    .mockResolvedValue(input.registro ?? []);
  const aggiornaConfigurazione = vi
    .fn()
    .mockImplementation(
      (id: string, configurazioneAggiornata: ConfigurazioneAsta) => {
        sessioneCorrente = {
          ...sessioneCorrente,
          id,
          configurazione: configurazioneAggiornata,
          aggiornatoIl: new Date("2026-01-03T10:00:00.000Z"),
        };
        return Promise.resolve(sessioneCorrente);
      },
    );
  const dipendenze: DipendenzeServizioConfigurazione = {
    sessioniAsta: { aggiornaConfigurazione },
    registro: { elencaPerSessione },
    caricaSessionePropria,
  };

  return {
    servizio: new ServizioConfigurazione(dipendenze),
    caricaSessionePropria,
    elencaPerSessione,
    aggiornaConfigurazione,
    configurazioneCorrente: () => sessioneCorrente.configurazione,
  };
}

// **Validates: Requirements 3.11, 3.13, 3.21, 3.23**
describe("ServizioConfigurazione.modifica", () => {
  it("salva una configurazione valida e ricalcola budget, budget di reparto e slot dal registro non vuoto", async () => {
    const registro = [
      voceUtente("1", "A", 100),
      voceUtente("2", "D", 50),
      voceUtente("3", "C", 90, {
        assegnatarioTipo: "avversario",
        avversarioId: null,
      }),
      voceUtente("4", "P", 20, {
        annullataIl: "2026-01-02T11:00:00.000Z",
      }),
    ];
    const nuovaConfigurazione: ConfigurazioneAsta = {
      ...configurazione,
      nome: "Asta aggiornata",
      tipoAsta: "riparazione",
      creditiIniziali: 600,
      composizioneRosa: { P: 2, D: 4, C: 5, A: 2 },
      quoteReparto: { POR: 10, DIF: 20, CEN: 30, ATT: 40 },
    };
    const scenario = creaScenario({ registro });

    const risultato = await scenario.servizio.modifica(
      "sessione-1",
      nuovaConfigurazione,
    );

    expect(risultato).toMatchObject({
      id: "sessione-1",
      configurazione: nuovaConfigurazione,
      creditiIniziali: 600,
      budgetResiduo: 450,
      slotResiduiTotali: 11,
      riservaMinima: 10,
    });
    expect(risultato.budgetRepartoResiduo).toEqual(
      new Map([
        ["POR", 60],
        ["DIF", 70],
        ["CEN", 180],
        ["ATT", 140],
      ]),
    );
    expect(risultato.slotResidui).toEqual(
      new Map([
        ["P", 2],
        ["D", 3],
        ["C", 5],
        ["A", 1],
      ]),
    );
    expect(risultato.rosa).toHaveLength(2);
    expect(scenario.caricaSessionePropria).toHaveBeenCalledWith("sessione-1");
    expect(scenario.elencaPerSessione).toHaveBeenCalledWith("sessione-1");
    expect(scenario.aggiornaConfigurazione).toHaveBeenCalledWith(
      "sessione-1",
      nuovaConfigurazione,
    );
  });
});

// **Validates: Requirements 3.12**
describe("compatibilità della rosa", () => {
  it("rifiuta senza scrivere e indica l'esubero di ogni reparto incompatibile", async () => {
    const registro = [
      voceUtente("1", "A", 10),
      voceUtente("2", "A", 10),
      voceUtente("3", "A", 10),
      voceUtente("4", "D", 10),
      voceUtente("5", "D", 10),
      voceUtente("6", "C", 10, {
        annullataIl: "2026-01-02T11:00:00.000Z",
      }),
      voceUtente("7", "P", 10, {
        assegnatarioTipo: "avversario",
        avversarioId: null,
      }),
    ];
    const scenario = creaScenario({ registro });
    const incompatibile: ConfigurazioneAsta = {
      ...configurazione,
      composizioneRosa: { P: 1, D: 1, C: 1, A: 1 },
    };

    await expect(
      scenario.servizio.modifica("sessione-1", incompatibile),
    ).rejects.toMatchObject({
      status: 409,
      dati: {
        codice: "rosa_incompatibile_con_configurazione",
        campo: "configurazione.composizioneRosa",
        dettagli: {
          esuberiPerReparto: { A: 2, D: 1 },
        },
      },
    });
    expect(scenario.aggiornaConfigurazione).not.toHaveBeenCalled();
    expect(scenario.configurazioneCorrente()).toEqual(configurazione);
  });
});

// **Validates: Requirements 3.17, 3.18, 3.19**
describe("pesi e profili strategia", () => {
  it("applica entrambi i profili e mantiene i pesi successivamente modificabili", async () => {
    const scenario = creaScenario();

    await scenario.servizio.applicaProfilo("sessione-1", "conservativo");
    expect(scenario.configurazioneCorrente().pesiValutazione).toEqual(
      PESI_PROFILO_CONSERVATIVO,
    );

    await scenario.servizio.applicaProfilo("sessione-1", "aggressivo");
    expect(scenario.configurazioneCorrente().pesiValutazione).toEqual(
      PESI_PROFILO_AGGRESSIVO,
    );

    const personalizzati = {
      quotazione: 5,
      budgetReparto: 10,
      budgetTotale: 15,
      slotResidui: 20,
      statistiche: 25,
      audacia: 30,
    };
    await scenario.servizio.modificaPesi("sessione-1", personalizzati);
    expect(scenario.configurazioneCorrente().pesiValutazione).toEqual(
      personalizzati,
    );
  });

  it("ripristina i pesi predefiniti di sistema", async () => {
    const scenario = creaScenario({
      configurazioneIniziale: {
        ...configurazione,
        pesiValutazione: { ...PESI_PROFILO_AGGRESSIVO },
      },
    });

    const risultato = await scenario.servizio.ripristinaPesi("sessione-1");

    expect(risultato.configurazione.pesiValutazione).toEqual(
      PESI_VALUTAZIONE_PREDEFINITI,
    );
    expect(scenario.configurazioneCorrente().pesiValutazione).toEqual(
      PESI_VALUTAZIONE_PREDEFINITI,
    );
  });

  it("rifiuta pesi non validi conservando quelli precedenti", async () => {
    const scenario = creaScenario();

    await expect(
      scenario.servizio.modificaPesi("sessione-1", {
        quotazione: 0,
        budgetReparto: 0,
        budgetTotale: 0,
        slotResidui: 0,
        statistiche: 0,
        audacia: 0,
      }),
    ).rejects.toMatchObject({
      status: 400,
      dati: {
        codice: "pesi_valutazione_non_validi",
        campo: "pesiValutazione",
      },
    });
    expect(scenario.elencaPerSessione).not.toHaveBeenCalled();
    expect(scenario.aggiornaConfigurazione).not.toHaveBeenCalled();
    expect(scenario.configurazioneCorrente().pesiValutazione).toEqual(
      PESI_VALUTAZIONE_PREDEFINITI,
    );
  });

  it("accetta esclusivamente i due profili previsti", async () => {
    const scenario = creaScenario();

    await expect(
      scenario.servizio.applicaProfilo("sessione-1", "bilanciato"),
    ).rejects.toMatchObject({
      status: 400,
      dati: {
        codice: "profilo_strategia_non_valido",
        campo: "profiloStrategia",
      },
    });
    expect(scenario.elencaPerSessione).not.toHaveBeenCalled();
    expect(scenario.aggiornaConfigurazione).not.toHaveBeenCalled();
  });
});

// **Validates: Requirements 3.20**
describe("mappa dei ruoli Mantra", () => {
  it("rende consultabile una mappa completa e non modificabile", () => {
    const scenario = creaScenario();

    const mappa = scenario.servizio.consultaMappaRuoliMantra();

    expect(mappa).toEqual(MACRO_REPARTO_PER_RUOLO_MANTRA);
    expect(Object.isFrozen(mappa)).toBe(true);
  });
});

// **Validates: Requirements 1.11, 3.23**
describe("controllo di accesso", () => {
  it("non legge il registro e non salva quando la guardia nega la sessione", async () => {
    const scenario = creaScenario();
    scenario.caricaSessionePropria.mockRejectedValue(
      new ErroreApplicativo(
        404,
        { codice: "sessione_non_disponibile" },
        "Sessione d'asta non disponibile.",
      ),
    );

    await expect(
      scenario.servizio.modifica("sessione-altrui", configurazione),
    ).rejects.toMatchObject({ status: 404 });
    expect(scenario.elencaPerSessione).not.toHaveBeenCalled();
    expect(scenario.aggiornaConfigurazione).not.toHaveBeenCalled();
  });
});
