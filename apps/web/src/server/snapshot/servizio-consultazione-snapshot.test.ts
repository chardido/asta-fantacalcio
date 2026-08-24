import type {
  SessioneAstaPersistita,
  SnapshotPersistito,
} from "@asta/db";
import { describe, expect, it, vi } from "vitest";

import {
  ErroreConsultazioneSnapshot,
  ServizioConsultazioneSnapshot,
} from "./servizio-consultazione-snapshot";

const ISTANTE = new Date("2026-08-20T10:30:00.000Z");

const sessione: SessioneAstaPersistita = {
  id: "00000000-0000-4000-8000-000000000001",
  utenteId: "00000000-0000-4000-8000-000000000002",
  stagioneListone: "2026-27",
  stato: "in_corso",
  configurazione: {
    nome: "Asta",
    tipoAsta: "chiamata",
    modalitaGioco: "classic",
    numeroPartecipanti: 8,
    creditiIniziali: 500,
    modificatoreDifesa: false,
    composizioneRosa: { P: 3, D: 8, C: 8, A: 6 },
    quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
    pesiValutazione: {
      quotazione: 30,
      budgetReparto: 25,
      budgetTotale: 15,
      slotResidui: 10,
      statistiche: 20,
      audacia: 20,
    },
  },
  avvisiInformativiAttivi: true,
  creatoIl: ISTANTE,
  aggiornatoIl: ISTANTE,
};

const snapshot: SnapshotPersistito = {
  id: "00000000-0000-4000-8000-000000000010",
  stagioneListone: "2026-27",
  stagioneStatistiche: "2025-26",
  stato: "consultabile",
  creatoIl: ISTANTE,
  numGiocatori: 1,
  nomeSorgenteListone: "Listone",
  nomeSorgenteStatistiche: "Statistiche",
  hashContenuto: "a".repeat(64),
  giocatori: [
    {
      snapshotId: "00000000-0000-4000-8000-000000000010",
      identificativoGiocatore: "player-1",
      nome: "Álvaro Rossi",
      nomeRicerca: "alvaro rossi",
      squadra: "Roma",
      ruoloClassic: "A",
      ruoliMantra: ["A", "Pc"],
      quotazione: 30,
      statFantacalcio: {
        mediaVotoMilli: 6250,
        fantamediaMilli: 7300,
        presenze: 28,
        gol: 12,
        assist: 4,
        ammonizioni: 3,
        espulsioni: null,
        rigoriParati: null,
        rigoriSbagliati: 1,
        autogol: 0,
        stagione: "2025-26",
      },
      statTattiche: {
        macroReparto: "ATT",
        gol: 12,
        tiri: 70,
        tiriNelloSpecchio: 35,
        golAttesiMilli: null,
        stagione: "2025-26",
      },
    },
  ],
};

function creaScenario(snapshotCorrente: SnapshotPersistito | null = snapshot) {
  const caricaSessionePropria = vi.fn().mockResolvedValue(sessione);
  const trovaPubblicato = vi.fn().mockResolvedValue(snapshotCorrente);
  const trovaAttivaPerGiocatore = vi.fn().mockResolvedValue(null);
  const elencaObiettivi = vi.fn().mockResolvedValue([]);
  const trovaAvversario = vi.fn().mockResolvedValue(null);
  const registra = vi.fn().mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000099",
    sessioneAstaId: sessione.id,
    identificativoGiocatore: "player-1",
    istante: ISTANTE,
  });
  return {
    servizio: new ServizioConsultazioneSnapshot({
      caricaSessionePropria,
      snapshot: { trovaPubblicato },
      registro: { trovaAttivaPerGiocatore },
      obiettivi: { elencaPerSessione: elencaObiettivi },
      avversari: { trovaPerId: trovaAvversario },
      consultazioniScheda: { registra },
      ora: () => ISTANTE,
    }),
    caricaSessionePropria,
    trovaPubblicato,
    trovaAttivaPerGiocatore,
    elencaObiettivi,
    trovaAvversario,
    registra,
  };
}

// **Validates: Requirements 4.2, 4.6, 4.10**
describe("ServizioConsultazioneSnapshot.indice", () => {
  it("restituisce il solo indice compatto dello snapshot raggiunto dal puntatore pubblicato", async () => {
    const scenario = creaScenario();

    await expect(scenario.servizio.indice(sessione.id)).resolves.toEqual({
      snapshotId: snapshot.id,
      hashContenuto: snapshot.hashContenuto,
      giocatori: [
        {
          id: "player-1",
          nome: "Álvaro Rossi",
          nomeRicerca: "alvaro rossi",
          squadra: "Roma",
          ruoli: ["A"],
          quotazione: 30,
        },
      ],
    });
    expect(scenario.caricaSessionePropria).toHaveBeenCalledWith(sessione.id);
    expect(scenario.trovaPubblicato).toHaveBeenCalledWith("2026-27");
    expect(scenario.registra).not.toHaveBeenCalled();
  });

  it("espone i ruoli Mantra della sessione senza caricare uno snapshot per identificativo", async () => {
    const scenario = creaScenario();
    scenario.caricaSessionePropria.mockResolvedValueOnce({
      ...sessione,
      configurazione: {
        ...sessione.configurazione,
        modalitaGioco: "mantra",
        composizioneRosa: {
          Por: 3,
          Dc: 2,
          Dd: 2,
          Ds: 2,
          E: 2,
          M: 2,
          C: 2,
          W: 2,
          T: 2,
          A: 2,
          Pc: 4,
        },
      },
    });

    const indice = await scenario.servizio.indice(sessione.id);
    expect(indice.giocatori[0]?.ruoli).toEqual(["A", "Pc"]);
  });
});

// **Validates: Requirements 13.1, 13.3**
describe("ServizioConsultazioneSnapshot.dashboard", () => {
  it("espone i dati necessari ai calcoli client senza registrare una consultazione", async () => {
    const scenario = creaScenario();

    await expect(scenario.servizio.dashboard(sessione.id)).resolves.toEqual({
      snapshotId: snapshot.id,
      hashContenuto: snapshot.hashContenuto,
      giocatori: [
        {
          id: "player-1",
          nome: "Álvaro Rossi",
          squadra: "Roma",
          ruoli: ["A"],
          quotazione: 30,
          statFantacalcio: snapshot.giocatori[0]?.statFantacalcio,
        },
      ],
    });
    expect(scenario.registra).not.toHaveBeenCalled();
  });

  it("se non esiste uno snapshot pubblicato segnala dati non disponibili", async () => {
    const scenario = creaScenario(null);

    await expect(scenario.servizio.dashboard(sessione.id)).rejects.toMatchObject({
      status: 503,
      codice: "snapshot_non_disponibile",
    });
  });
});

// **Validates: Requirements 5.8, 5.17, 5.18**
describe("ServizioConsultazioneSnapshot.scheda", () => {
  it("restituisce statistiche con stagione per valore, preserva null e registra la consultazione", async () => {
    const scenario = creaScenario();

    const risultato = await scenario.servizio.scheda(sessione.id, "player-1");

    expect(risultato.giocatore.statisticheFantacalcio).toMatchObject({
      mediaVotoMilli: { valore: 6250, stagione: "2025-26" },
      espulsioni: { valore: null, stagione: "2025-26" },
      autogol: { valore: 0, stagione: "2025-26" },
    });
    expect(risultato.giocatore.statisticheTattiche).toEqual({
      macroReparto: "ATT",
      gol: { valore: 12, stagione: "2025-26" },
      tiri: { valore: 70, stagione: "2025-26" },
      tiriNelloSpecchio: { valore: 35, stagione: "2025-26" },
      golAttesiMilli: { valore: null, stagione: "2025-26" },
    });
    expect(risultato.giocatore.statisticheTattiche).not.toHaveProperty(
      "parate",
    );
    expect(scenario.registra).toHaveBeenCalledWith({
      sessioneAstaId: sessione.id,
      identificativoGiocatore: "player-1",
      istante: ISTANTE,
    });
  });

  it("restituisce prezzo personale e assegnatario della voce attiva", async () => {
    const scenario = creaScenario();
    scenario.elencaObiettivi.mockResolvedValueOnce([
      {
        id: "obiettivo-1",
        sessioneAstaId: sessione.id,
        identificativoGiocatore: "player-1",
        nomeGiocatore: "Álvaro Rossi",
        reparto: "A",
        prezzoMassimoPersonale: 42,
        priorita: 1,
        nonRaggiungibile: true,
        creatoIl: ISTANTE,
        aggiornatoIl: ISTANTE,
      },
    ]);
    scenario.trovaAttivaPerGiocatore.mockResolvedValueOnce({
      id: "registro-1",
      sessioneAstaId: sessione.id,
      ordinale: 1,
      identificativoGiocatore: "player-1",
      nomeGiocatore: "Álvaro Rossi",
      ruolo: "A",
      squadra: "Roma",
      repartoAssegnato: "A",
      macroReparto: "ATT",
      prezzoAcquisto: 35,
      assegnatarioTipo: "avversario",
      avversarioId: "avversario-1",
      annullataIl: null,
      chiaveIdempotenza: "00000000-0000-4000-8000-000000000099",
      giocatoreAssenteDatiCorrenti: false,
    });
    scenario.trovaAvversario.mockResolvedValueOnce({
      id: "avversario-1",
      sessioneAstaId: sessione.id,
      nome: "Luca",
      creatoIl: ISTANTE,
      aggiornatoIl: ISTANTE,
    });

    const risultato = await scenario.servizio.scheda(sessione.id, "player-1");

    expect(risultato).toMatchObject({
      inListaObiettivi: true,
      prezzoMassimoPersonale: 42,
      assegnazione: {
        tipo: "avversario",
        nome: "Luca",
        prezzoAcquisto: 35,
      },
    });
  });

  it("non registra consultazioni per un giocatore assente dallo snapshot pubblicato", async () => {
    const scenario = creaScenario();

    await expect(
      scenario.servizio.scheda(sessione.id, "assente"),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ErroreConsultazioneSnapshot>>({
        status: 404,
        codice: "giocatore_non_disponibile",
      }),
    );
    expect(scenario.registra).not.toHaveBeenCalled();
  });

  it("se non esiste un puntatore pubblicato segnala dati non disponibili senza registrare", async () => {
    const scenario = creaScenario(null);

    await expect(scenario.servizio.scheda(sessione.id, "player-1")).rejects.toEqual(
      expect.objectContaining<Partial<ErroreConsultazioneSnapshot>>({
        status: 503,
        codice: "snapshot_non_disponibile",
      }),
    );
    expect(scenario.registra).not.toHaveBeenCalled();
  });
});
