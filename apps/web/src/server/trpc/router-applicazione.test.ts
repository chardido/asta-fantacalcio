import {
  PESI_VALUTAZIONE_PREDEFINITI,
  type ConfigurazioneAsta,
} from "@asta/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ContestoTrpc } from "./contesto";
import { creaRouterApplicazione } from "./router-applicazione";

const ID_SESSIONE = "00000000-0000-4000-8000-000000000001";
const configurazione: ConfigurazioneAsta = {
  nome: "Asta recente",
  tipoAsta: "random",
  modalitaGioco: "classic",
  numeroPartecipanti: 8,
  creditiIniziali: 500,
  modificatoreDifesa: false,
  composizioneRosa: { P: 3, D: 8, C: 8, A: 6 },
  quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
  pesiValutazione: { ...PESI_VALUTAZIONE_PREDEFINITI },
};

function contesto(autenticato = true): ContestoTrpc {
  return {
    tokenSessione: autenticato ? "token-sessione" : null,
    utente: autenticato
      ? {
          id: "utente-1",
          email: "utente@example.com",
          creatoIl: new Date("2026-01-01T00:00:00.000Z"),
        }
      : null,
    autenticazione: { risolvi: vi.fn() },
  };
}

function scenario() {
  const crea = vi.fn().mockResolvedValue({ id: ID_SESSIONE });
  const elenca = vi.fn().mockResolvedValue([
    {
      id: ID_SESSIONE,
      nome: "Asta recente",
      creatoIl: new Date("2026-01-02T10:00:00.000Z"),
      aggiornatoIl: new Date("2026-01-04T10:00:00.000Z"),
      tipoAsta: "random" as const,
      budgetResiduo: 430,
      numeroGiocatoriRosa: 1,
    },
  ]);
  const ripristina = vi.fn().mockResolvedValue({
    id: ID_SESSIONE,
    utenteId: "utente-1",
    stagioneListone: "2026-27",
    stato: "in_corso" as const,
    configurazione,
    avvisiInformativiAttivi: true,
    creatoIl: new Date("2026-01-02T10:00:00.000Z"),
    aggiornatoIl: new Date("2026-01-04T10:00:00.000Z"),
    creditiIniziali: 500,
    budgetResiduo: 350,
    budgetRepartoResiduo: new Map([
      ["POR", 20],
      ["DIF", 80],
      ["CEN", 120],
      ["ATT", 130],
    ]),
    slotResidui: new Map([
      ["P", 2],
      ["D", 7],
      ["C", 8],
      ["A", 5],
    ]),
    slotResiduiTotali: 22,
    riservaMinima: 21,
    rosa: [],
    registro: [],
  });
  const duplica = vi.fn().mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000002",
    nome: "Asta recente - copia",
  });
  const elimina = vi.fn().mockResolvedValue(undefined);
  const creaServizioSessioni = vi.fn(() => ({
    crea,
    elenca,
    ripristina,
    duplica,
    elimina,
  }));
  const aggiungiRegistro = vi.fn().mockResolvedValue({
    voce: {
      id: "registro-1",
      sessioneAstaId: ID_SESSIONE,
      ordinale: 1,
      identificativoGiocatore: "player-1",
      nomeGiocatore: "Giocatore",
      ruolo: "A",
      squadra: "Roma",
      repartoAssegnato: "A",
      macroReparto: "ATT",
      prezzoAcquisto: 20,
      assegnatarioTipo: "utente",
      avversarioId: null,
      annullataIl: null,
      chiaveIdempotenza: "00000000-0000-4000-8000-000000000099",
      giocatoreAssenteDatiCorrenti: false,
    },
    budgetResiduo: 480,
    budgetRepartoResiduo: new Map([["ATT", 180]]),
    slotResidui: new Map([["A", 5]]),
    slotResiduiTotali: 24,
    riservaMinima: 23,
    rosa: [],
  });
  const annotaAcquistoAltrui = vi.fn().mockResolvedValue(aggiungiRegistro());
  const annullaRegistro = vi.fn().mockResolvedValue(aggiungiRegistro());
  const risolviConflittoRegistro = vi.fn().mockResolvedValue(aggiungiRegistro());
  const creaServizioRegistro = vi.fn(() => ({
    aggiungi: aggiungiRegistro,
    annotaAcquistoAltrui,
    annulla: annullaRegistro,
    risolviConflitto: risolviConflittoRegistro,
  }));
  const creaServizioAvversari = vi.fn(() => ({
    crea: vi.fn().mockResolvedValue({ id: "avversario-1", nome: "Luca" }),
    elenca: vi.fn().mockResolvedValue([]),
    elencaAnnotazioni: vi.fn().mockResolvedValue([]),
  }));

  const esitoConfigurazione = {
    id: ID_SESSIONE,
    configurazione,
    creditiIniziali: 500,
    budgetResiduo: 500,
    budgetRepartoResiduo: new Map(),
    slotResidui: new Map(),
    slotResiduiTotali: 25,
    riservaMinima: 24,
    rosa: [],
  };
  const modifica = vi.fn().mockResolvedValue(esitoConfigurazione);
  const modificaPesi = vi.fn().mockResolvedValue(esitoConfigurazione);
  const applicaProfilo = vi.fn().mockResolvedValue(esitoConfigurazione);
  const ripristinaPesi = vi.fn().mockResolvedValue(esitoConfigurazione);
  const consultaMappaRuoliMantra = vi.fn(() => ({
    Por: "POR" as const,
    Dc: "DIF" as const,
    Dd: "DIF" as const,
    Ds: "DIF" as const,
    E: "CEN" as const,
    M: "CEN" as const,
    C: "CEN" as const,
    W: "CEN" as const,
    T: "CEN" as const,
    A: "ATT" as const,
    Pc: "ATT" as const,
  }));
  const creaServizioConfigurazione = vi.fn(() => ({
    modifica,
    modificaPesi,
    applicaProfilo,
    ripristinaPesi,
    consultaMappaRuoliMantra,
  }));
  const caricaFreschezzaConfigurazione = vi.fn().mockResolvedValue([
    {
      nomeSorgente: "api-football",
      ultimoSuccessoIl: "2026-08-01T05:00:00.000Z",
      ultimoTentativoIl: "2026-08-01T05:00:00.000Z",
      ultimoEsito: "successo" as const,
    },
  ]);
  const voceObiettivo = {
    id: "obiettivo-1",
    sessioneAstaId: ID_SESSIONE,
    identificativoGiocatore: "player-1",
    nomeGiocatore: "Mario Rossi",
    reparto: "A" as const,
    prezzoMassimoPersonale: 40,
    priorita: 2,
    nonRaggiungibile: false,
    creatoIl: new Date("2026-01-01T00:00:00.000Z"),
    aggiornatoIl: new Date("2026-01-01T00:00:00.000Z"),
  };
  const elencaObiettivi = vi.fn().mockResolvedValue({
    voci: [voceObiettivo],
    conteggiPerReparto: { P: 0, D: 0, C: 0, A: 1 },
  });
  const aggiungiObiettivo = vi.fn().mockResolvedValue(voceObiettivo);
  const aggiornaPrezzoObiettivo = vi.fn().mockResolvedValue(voceObiettivo);
  const aggiornaPrioritaObiettivo = vi.fn().mockResolvedValue(voceObiettivo);
  const creaServizioObiettivi = vi.fn(() => ({
    aggiungi: aggiungiObiettivo,
    aggiornaPrezzoMassimoPersonale: aggiornaPrezzoObiettivo,
    aggiornaPriorita: aggiornaPrioritaObiettivo,
    elenca: elencaObiettivi,
  }));
  const router = creaRouterApplicazione({
    creaServizioSessioni,
    creaServizioRegistro,
    creaServizioAvversari,
    creaServizioObiettivi,
    creaServizioConfigurazione,
    caricaFreschezzaConfigurazione,
  });

  return {
    router,
    crea,
    elenca,
    ripristina,
    aggiungiRegistro,
    risolviConflittoRegistro,
    duplica,
    elimina,
    modifica,
    applicaProfilo,
    ripristinaPesi,
    consultaMappaRuoliMantra,
    caricaFreschezzaConfigurazione,
    elencaObiettivi,
    aggiungiObiettivo,
    aggiornaPrezzoObiettivo,
    aggiornaPrioritaObiettivo,
  };
}

// **Validates: Requirements 2.3, 2.7, 2.10, 3.1, 3.13, 3.18-3.21, 3.23, 4.13**
describe("router applicativo delle sessioni e della configurazione", () => {
  it("espone all'utente autenticato l'elenco serializzabile già ordinato dal servizio", async () => {
    const test = scenario();

    await expect(
      test.router.createCaller(contesto()).sessioni.elenca(),
    ).resolves.toEqual([
      {
        id: ID_SESSIONE,
        nome: "Asta recente",
        creatoIl: "2026-01-02T10:00:00.000Z",
        aggiornatoIl: "2026-01-04T10:00:00.000Z",
        tipoAsta: "random",
        budgetResiduo: 430,
        numeroGiocatoriRosa: 1,
      },
    ]);
    expect(test.elenca).toHaveBeenCalledOnce();
  });

  it("inoltra creazione e ripristino restituendo solo i dati necessari alla schermata", async () => {
    const test = scenario();
    const caller = test.router.createCaller(contesto());

    await expect(
      caller.sessioni.crea({ stagioneListone: "2026-27", configurazione }),
    ).resolves.toEqual({ id: ID_SESSIONE });
    await expect(
      caller.sessioni.ripristina({ sessioneAstaId: ID_SESSIONE }),
    ).resolves.toEqual({
      id: ID_SESSIONE,
      stagioneListone: "2026-27",
      configurazione,
      stato: {
        budgetResiduo: 350,
        budgetRepartoResiduo: {
          POR: 20,
          DIF: 80,
          CEN: 120,
          ATT: 130,
        },
        slotResidui: { P: 2, D: 7, C: 8, A: 5 },
        slotResiduiTotali: 22,
        riservaMinima: 21,
        rosa: [],
        identificativiNonDisponibili: [],
      },
      avvisiInformativiAttivi: true,
    });
  });

  it("inoltra modifica, profilo, ripristino pesi, mappa Mantra e freschezza", async () => {
    const test = scenario();
    const caller = test.router.createCaller(contesto());

    await caller.configurazione.modifica({
      sessioneAstaId: ID_SESSIONE,
      configurazione,
    });
    await caller.configurazione.applicaProfilo({
      sessioneAstaId: ID_SESSIONE,
      profiloStrategia: "aggressivo",
    });
    await caller.configurazione.ripristinaPesi({
      sessioneAstaId: ID_SESSIONE,
    });
    await expect(caller.configurazione.mappaRuoliMantra()).resolves.toMatchObject({
      Por: "POR",
      Pc: "ATT",
    });
    await expect(
      caller.configurazione.freschezza({ sessioneAstaId: ID_SESSIONE }),
    ).resolves.toMatchObject([{ nomeSorgente: "api-football" }]);

    expect(test.modifica).toHaveBeenCalledWith(ID_SESSIONE, configurazione);
    expect(test.applicaProfilo).toHaveBeenCalledWith(ID_SESSIONE, "aggressivo");
    expect(test.ripristinaPesi).toHaveBeenCalledWith(ID_SESSIONE);
    expect(test.caricaFreschezzaConfigurazione).toHaveBeenCalledWith(
      expect.objectContaining({ utente: expect.objectContaining({ id: "utente-1" }) }),
      ID_SESSIONE,
    );
  });

  it("inoltra la registrazione di un acquisto e serializza lo stato derivato", async () => {
    const test = scenario();
    const caller = test.router.createCaller(contesto());
    const input = {
      sessioneAstaId: ID_SESSIONE,
      identificativoGiocatore: "player-1",
      prezzoAcquisto: 20,
      repartoAssegnato: "A" as const,
      chiaveIdempotenza: "00000000-0000-4000-8000-000000000099",
    };

    await expect(caller.registro.aggiungi(input)).resolves.toMatchObject({
      voce: { identificativoGiocatore: "player-1", prezzoAcquisto: 20 },
      stato: {
        budgetResiduo: 480,
        budgetRepartoResiduo: { ATT: 180 },
        slotResidui: { A: 5 },
      },
    });
    expect(test.aggiungiRegistro).toHaveBeenCalledWith(
      ID_SESSIONE,
      expect.objectContaining({ identificativoGiocatore: "player-1" }),
    );

    await expect(
      caller.registro.risolviConflitto({
        ...input,
        voceServerId: "voce-server",
        risoluzione: "locale",
      }),
    ).resolves.toMatchObject({ stato: { budgetResiduo: 480 } });
    expect(test.risolviConflittoRegistro).toHaveBeenCalledWith(
      ID_SESSIONE,
      expect.objectContaining({
        voceServerId: "voce-server",
        risoluzione: "locale",
      }),
    );
  });

  it("inoltra duplicazione ed eliminazione al servizio protetto", async () => {
    const test = scenario();
    const caller = test.router.createCaller(contesto());

    await expect(
      caller.sessioni.duplica({ sessioneAstaId: ID_SESSIONE }),
    ).resolves.toMatchObject({ nome: "Asta recente - copia" });
    await expect(
      caller.sessioni.elimina({ sessioneAstaId: ID_SESSIONE }),
    ).resolves.toEqual({ eliminata: true });
    expect(test.duplica).toHaveBeenCalledWith(ID_SESSIONE);
    expect(test.elimina).toHaveBeenCalledWith(ID_SESSIONE);
  });

  it("espone elenco, inserimento e aggiornamenti della lista obiettivi", async () => {
    const test = scenario();
    const caller = test.router.createCaller(contesto());

    await expect(
      caller.obiettivi.elenca({
        sessioneAstaId: ID_SESSIONE,
        ordinamento: "priorita",
      }),
    ).resolves.toEqual({
      voci: [
        {
          id: "obiettivo-1",
          identificativoGiocatore: "player-1",
          nomeGiocatore: "Mario Rossi",
          reparto: "A",
          prezzoMassimoPersonale: 40,
          priorita: 2,
          nonRaggiungibile: false,
        },
      ],
      conteggiPerReparto: { P: 0, D: 0, C: 0, A: 1 },
    });
    await caller.obiettivi.aggiungi({
      sessioneAstaId: ID_SESSIONE,
      identificativoGiocatore: "player-1",
      prezzoMassimoPersonale: 40,
      priorita: 2,
      reparto: "A",
    });
    await caller.obiettivi.aggiornaPrezzo({
      sessioneAstaId: ID_SESSIONE,
      obiettivoId: "obiettivo-1",
      prezzoMassimoPersonale: null,
    });
    await caller.obiettivi.aggiornaPriorita({
      sessioneAstaId: ID_SESSIONE,
      obiettivoId: "obiettivo-1",
      priorita: 1,
    });

    expect(test.elencaObiettivi).toHaveBeenCalledWith(ID_SESSIONE, "priorita");
    expect(test.aggiungiObiettivo).toHaveBeenCalledWith(
      ID_SESSIONE,
      expect.objectContaining({ identificativoGiocatore: "player-1" }),
    );
    expect(test.aggiornaPrezzoObiettivo).toHaveBeenCalledWith(
      ID_SESSIONE,
      "obiettivo-1",
      null,
    );
    expect(test.aggiornaPrioritaObiettivo).toHaveBeenCalledWith(
      ID_SESSIONE,
      "obiettivo-1",
      1,
    );
  });

  it("nega l'accesso senza autenticazione e rifiuta identificativi non validi", async () => {
    const test = scenario();

    await expect(
      test.router.createCaller(contesto(false)).sessioni.elenca(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      test.router
        .createCaller(contesto())
        .sessioni.duplica({ sessioneAstaId: "non-un-uuid" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
