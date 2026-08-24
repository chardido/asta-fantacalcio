import type {
  ConfigurazioneAsta,
  VoceRegistro,
  VoceRegistroEsportata,
  VoceRosa,
} from "@asta/contracts";
import type {
  AvversarioPersistito,
  GestoreTransazioniRegistro,
  RegistroTransazionale,
  SessioneAstaPersistita,
  VoceRegistroDaImportare,
} from "@asta/db";
import { esporta as esportaDominio } from "@asta/domain";
import { describe, expect, it, vi } from "vitest";

import { ErroreApplicativo } from "../trpc/errori";
import {
  ServizioEsportazione,
  type DipendenzeServizioEsportazione,
} from "./servizio-esportazione";

const ID_SESSIONE = "00000000-0000-4000-8000-000000000001";
const configurazione: ConfigurazioneAsta = {
  nome: "Asta principale",
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
};
const sessione: SessioneAstaPersistita = {
  id: ID_SESSIONE,
  utenteId: "00000000-0000-4000-8000-000000000010",
  stagioneListone: "2026-27",
  stato: "in_corso",
  configurazione,
  avvisiInformativiAttivi: true,
  creatoIl: new Date("2026-08-01T09:00:00.000Z"),
  aggiornatoIl: new Date("2026-08-01T09:00:00.000Z"),
};
const voceUtente: VoceRegistro = {
  id: "00000000-0000-4000-8000-000000000002",
  sessioneAstaId: ID_SESSIONE,
  ordinale: 1,
  identificativoGiocatore: "player-1",
  nomeGiocatore: "Mario Rossi",
  ruolo: "A",
  squadra: "Roma",
  repartoAssegnato: "A",
  macroReparto: "ATT",
  prezzoAcquisto: 35,
  assegnatarioTipo: "utente",
  avversarioId: null,
  annullataIl: null,
  chiaveIdempotenza: "00000000-0000-4000-8000-000000000003",
  giocatoreAssenteDatiCorrenti: false,
};
const avversario: AvversarioPersistito = {
  id: "00000000-0000-4000-8000-000000000004",
  sessioneAstaId: ID_SESSIONE,
  nome: "Rivale",
  creatoIl: new Date("2026-08-01T09:00:00.000Z"),
  aggiornatoIl: new Date("2026-08-01T09:00:00.000Z"),
};
const voceAvversario: VoceRegistro = {
  ...voceUtente,
  id: "00000000-0000-4000-8000-000000000005",
  ordinale: 2,
  identificativoGiocatore: "player-2",
  nomeGiocatore: "Luca Bianchi",
  ruolo: "D",
  repartoAssegnato: "D",
  macroReparto: "DIF",
  prezzoAcquisto: 12,
  assegnatarioTipo: "avversario",
  avversarioId: avversario.id,
  chiaveIdempotenza: "00000000-0000-4000-8000-000000000006",
};

function scenario(registro: readonly VoceRegistro[] = [voceUtente, voceAvversario]) {
  const sostituisciDaImportazione = vi.fn(
    async (voci: readonly VoceRegistroDaImportare[]) =>
      voci.map(({ avversarioNome: _nome, ...voce }) => ({
        ...voce,
        avversarioId: null,
      })),
  );
  const notificaMutazione = vi.fn().mockResolvedValue(undefined);
  const transazione = {
    sostituisciDaImportazione,
    notificaMutazione,
  } as unknown as RegistroTransazionale;
  const esegui = vi.fn(
    async <T>(
      _sessioneAstaId: string,
      operazione: (repository: RegistroTransazionale) => Promise<T>,
      _timeoutMs: number,
    ) => operazione(transazione),
  );
  let prossimoId = 100;
  const dipendenze: DipendenzeServizioEsportazione = {
    registro: { elencaPerSessione: vi.fn().mockResolvedValue(registro) },
    avversari: { elencaPerSessione: vi.fn().mockResolvedValue([avversario]) },
    transazioniRegistro: { esegui } as GestoreTransazioniRegistro,
    caricaSessionePropria: vi.fn().mockResolvedValue(sessione),
    ora: () => new Date("2026-08-01T10:30:00.000Z"),
    generaId: () =>
      `00000000-0000-4000-8000-${String(prossimoId++).padStart(12, "0")}`,
  };
  return {
    servizio: new ServizioEsportazione(dipendenze),
    dipendenze,
    esegui,
    sostituisciDaImportazione,
    notificaMutazione,
  };
}

function fileImportabile(): string {
  const rosa: readonly VoceRosa[] = [
    {
      voceRegistroId: voceUtente.id,
      identificativoGiocatore: voceUtente.identificativoGiocatore,
      nomeGiocatore: voceUtente.nomeGiocatore,
      ruolo: voceUtente.ruolo,
      squadra: voceUtente.squadra,
      repartoAssegnato: voceUtente.repartoAssegnato,
      macroReparto: voceUtente.macroReparto,
      prezzoAcquisto: 35,
      giocatoreAssenteDatiCorrenti: false,
    },
  ];
  const registro: readonly VoceRegistroEsportata[] = [
    {
      ordinale: 1,
      identificativoGiocatore: "player-1",
      nomeGiocatore: "Mario Rossi",
      ruolo: "A",
      squadra: "Roma",
      repartoAssegnato: "A",
      macroReparto: "ATT",
      prezzoAcquisto: 35,
      assegnatarioTipo: "utente",
      avversarioNome: null,
      annullataIl: null,
      giocatoreAssenteDatiCorrenti: false,
    },
  ];
  return JSON.stringify(
    esportaDominio({
      esportatoIl: "2026-08-01T10:30:00.000Z",
      configurazione,
      rosa,
      registro,
    }),
  );
}

// **Validates: Requirements 10.5, 10.8**
describe("ServizioEsportazione.esporta", () => {
  it("produce il file firmato con rosa derivata, registro cronologico e nomi degli avversari", async () => {
    const contesto = scenario([voceAvversario, voceUtente]);

    const file = await contesto.servizio.esporta(ID_SESSIONE);

    expect(file.esportatoIl).toBe("2026-08-01T10:30:00.000Z");
    expect(file.rosa).toEqual([
      {
        identificativoGiocatore: "player-1",
        nome: "Mario Rossi",
        reparto: "A",
        prezzoAcquisto: 35,
      },
    ]);
    expect(file.registro.map((voce) => voce.ordinale)).toEqual([1, 2]);
    expect(file.registro[1]).toMatchObject({ avversarioNome: "Rivale" });
    expect(file.firma).toMatch(/^[a-f0-9]{64}$/);
  });

  it("restituisce un errore ritentabile senza mutazioni quando la lettura fallisce", async () => {
    const contesto = scenario();
    vi.mocked(contesto.dipendenze.registro.elencaPerSessione).mockRejectedValueOnce(
      new Error("database non disponibile"),
    );

    await expect(contesto.servizio.esporta(ID_SESSIONE)).rejects.toMatchObject({
      status: 503,
      dati: { codice: "esportazione_non_completata" },
    });
    expect(contesto.esegui).not.toHaveBeenCalled();
  });
});

// **Validates: Requirements 10.9**
describe("ServizioEsportazione.importa", () => {
  it("sostituisce tutto il registro in una sola transazione e notifica il nuovo ordinale", async () => {
    const contesto = scenario([]);

    const esito = await contesto.servizio.importa(ID_SESSIONE, fileImportabile());

    expect(contesto.esegui).toHaveBeenCalledWith(
      ID_SESSIONE,
      expect.any(Function),
      5_000,
    );
    expect(contesto.sostituisciDaImportazione).toHaveBeenCalledOnce();
    expect(contesto.notificaMutazione).toHaveBeenCalledWith(1);
    expect(esito).toMatchObject({
      numeroVociImportate: 1,
      budgetResiduo: 465,
      slotResiduiTotali: 24,
    });
  });

  it("rifiuta descrittivamente un file non leggibile prima di aprire la transazione", async () => {
    const contesto = scenario();

    await expect(contesto.servizio.importa(ID_SESSIONE, "{")).rejects.toEqual(
      expect.objectContaining<Partial<ErroreApplicativo>>({
        status: 400,
        dati: expect.objectContaining({ codice: "file_illeggibile", campo: "file" }),
      }),
    );
    expect(contesto.esegui).not.toHaveBeenCalled();
  });

  it("rifiuta una rosa incoerente col registro lasciando la destinazione invariata", async () => {
    const contesto = scenario();
    const file = JSON.parse(fileImportabile()) as Record<string, unknown>;
    const fileRifirmato = esportaDominio({
      esportatoIl: file.esportatoIl as string,
      configurazione,
      rosa: [],
      registro: (file.registro as VoceRegistroEsportata[]),
    });

    await expect(
      contesto.servizio.importa(ID_SESSIONE, JSON.stringify(fileRifirmato)),
    ).rejects.toMatchObject({
      status: 400,
      dati: { codice: "file_incompleto", campo: "rosa" },
    });
    expect(contesto.esegui).not.toHaveBeenCalled();
  });

  it("traduce il rollback della transazione in errore 503 senza confermare l'importazione", async () => {
    const contesto = scenario();
    contesto.esegui.mockRejectedValueOnce(new Error("rollback"));

    await expect(
      contesto.servizio.importa(ID_SESSIONE, fileImportabile()),
    ).rejects.toMatchObject({
      status: 503,
      dati: { codice: "importazione_non_completata" },
    });
    expect(contesto.notificaMutazione).not.toHaveBeenCalled();
  });
});
