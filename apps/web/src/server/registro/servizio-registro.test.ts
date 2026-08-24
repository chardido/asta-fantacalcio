import {
  PESI_VALUTAZIONE_PREDEFINITI,
  type ConfigurazioneAsta,
  type VoceRegistro,
} from "@asta/contracts";
import {
  ErroreUnicitaRegistro,
  type GestoreTransazioniRegistro,
  type RegistroTransazionale,
  type SessioneAstaPersistita,
  type SnapshotPersistito,
  type VoceRegistroDaImportare,
} from "@asta/db";
import { describe, expect, it, vi } from "vitest";

import { ErroreApplicativo } from "../trpc/errori.js";
import {
  ServizioRegistro,
  type DipendenzeServizioRegistro,
} from "./servizio-registro.js";

const ID_SESSIONE = "00000000-0000-4000-8000-000000000001";
const ID_VOCE_NUOVA = "00000000-0000-4000-8000-000000000002";
const CHIAVE_IDEMPOTENZA = "00000000-0000-4000-8000-000000000003";
const ISTANTE = new Date("2026-03-12T10:00:00.000Z");

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

const sessione: SessioneAstaPersistita = {
  id: ID_SESSIONE,
  utenteId: "utente-1",
  stagioneListone: "2025-26",
  stato: "in_corso",
  configurazione,
  avvisiInformativiAttivi: true,
  creatoIl: new Date("2026-03-10T10:00:00.000Z"),
  aggiornatoIl: new Date("2026-03-11T10:00:00.000Z"),
};

const snapshot: SnapshotPersistito = {
  id: "snapshot-1",
  stagioneListone: "2025-26",
  stagioneStatistiche: "2024-25",
  stato: "consultabile",
  creatoIl: ISTANTE,
  numGiocatori: 1,
  nomeSorgenteListone: "Listone",
  nomeSorgenteStatistiche: "Statistiche",
  hashContenuto: "a".repeat(64),
  giocatori: [
    {
      snapshotId: "snapshot-1",
      identificativoGiocatore: "player-1",
      nome: "Mario Rossi",
      nomeRicerca: "mario rossi",
      squadra: "Roma",
      ruoloClassic: "A",
      ruoliMantra: ["Pc"],
      quotazione: 25,
      statFantacalcio: {
        mediaVotoMilli: 6250,
        fantamediaMilli: 7100,
        presenze: 30,
        gol: 8,
        assist: 5,
        ammonizioni: 3,
        espulsioni: 0,
        rigoriParati: 0,
        rigoriSbagliati: 1,
        autogol: 0,
        stagione: "2024-25",
      },
      statTattiche: {
        macroReparto: "ATT",
        gol: 8,
        tiri: 52,
        tiriNelloSpecchio: 26,
        golAttesiMilli: null,
        stagione: "2024-25",
      },
    },
  ],
};

function voce(
  opzioni: Partial<VoceRegistro> = {},
): VoceRegistro {
  return {
    id: "voce-1",
    sessioneAstaId: ID_SESSIONE,
    ordinale: 1,
    identificativoGiocatore: "player-esistente",
    nomeGiocatore: "Giocatore Esistente",
    ruolo: "D",
    squadra: "Milan",
    repartoAssegnato: "D",
    macroReparto: "DIF",
    prezzoAcquisto: 20,
    assegnatarioTipo: "utente",
    avversarioId: null,
    annullataIl: null,
    chiaveIdempotenza: "10000000-0000-4000-8000-000000000001",
    giocatoreAssenteDatiCorrenti: false,
    ...opzioni,
  } as VoceRegistro;
}

class RepositoryRegistroMemoria implements RegistroTransazionale {
  constructor(
    readonly voci: VoceRegistro[],
    readonly notifiche: number[] = [],
  ) {}

  async crea(nuova: VoceRegistro): Promise<VoceRegistro> {
    this.voci.push(nuova);
    return nuova;
  }

  async trovaPerId(id: string): Promise<VoceRegistro | null> {
    return this.voci.find((elemento) => elemento.id === id) ?? null;
  }

  async trovaAttivaPerGiocatore(
    sessioneAstaId: string,
    identificativoGiocatore: string,
  ): Promise<VoceRegistro | null> {
    return (
      this.voci.find(
        (elemento) =>
          elemento.sessioneAstaId === sessioneAstaId &&
          elemento.identificativoGiocatore === identificativoGiocatore &&
          elemento.annullataIl === null,
      ) ?? null
    );
  }

  async elencaPerSessione(
    sessioneAstaId: string,
  ): Promise<readonly VoceRegistro[]> {
    return this.voci
      .filter((elemento) => elemento.sessioneAstaId === sessioneAstaId)
      .sort((sinistra, destra) => sinistra.ordinale - destra.ordinale);
  }

  async aggiornaPrezzo(
    id: string,
    prezzoAcquisto: number | null,
  ): Promise<VoceRegistro> {
    const indice = this.voci.findIndex((elemento) => elemento.id === id);
    const corrente = this.voci[indice];
    if (corrente === undefined || prezzoAcquisto === null) {
      throw new Error("Voce non aggiornabile");
    }
    const aggiornata = { ...corrente, prezzoAcquisto } as VoceRegistro;
    this.voci[indice] = aggiornata;
    return aggiornata;
  }

  async annulla(id: string, istante: Date): Promise<VoceRegistro> {
    const indice = this.voci.findIndex((elemento) => elemento.id === id);
    const corrente = this.voci[indice];
    if (corrente === undefined) {
      throw new Error("Voce non annullabile");
    }
    const annullata = {
      ...corrente,
      annullataIl: istante.toISOString(),
    } as VoceRegistro;
    this.voci[indice] = annullata;
    return annullata;
  }

  async sostituisciDaImportazione(
    voci: readonly VoceRegistroDaImportare[],
  ): Promise<readonly VoceRegistro[]> {
    const importate = voci.map(({ avversarioNome: _nome, ...voce }) => ({
      ...voce,
      avversarioId: null,
    }) as VoceRegistro);
    this.voci.splice(0, this.voci.length, ...importate);
    return this.voci;
  }

  async notificaMutazione(ordinale: number): Promise<void> {
    this.notifiche.push(ordinale);
  }
}

function creaScenario(
  vociIniziali: readonly VoceRegistro[] = [],
  personalizza: Partial<DipendenzeServizioRegistro> = {},
) {
  let vociPersistite = [...vociIniziali];
  const notifiche: number[] = [];
  const esegui = vi.fn<GestoreTransazioniRegistro["esegui"]>(
    async (_sessioneAstaId, operazione) => {
      const transazione = new RepositoryRegistroMemoria(
        [...vociPersistite],
        notifiche,
      );
      const risultato = await operazione(transazione);
      vociPersistite = [...transazione.voci];
      return risultato;
    },
  );
  const repositoryLettura = new RepositoryRegistroMemoria(vociPersistite);
  const dipendenze: DipendenzeServizioRegistro = {
    transazioniRegistro: {
      esegui: esegui as unknown as GestoreTransazioniRegistro["esegui"],
    },
    registro: {
      trovaAttivaPerGiocatore: (...argomenti) =>
        repositoryLettura.trovaAttivaPerGiocatore(...argomenti),
    },
    avversari: { trovaPerId: vi.fn().mockResolvedValue(null) },
    snapshot: { trovaPubblicato: vi.fn().mockResolvedValue(snapshot) },
    caricaSessionePropria: vi.fn().mockResolvedValue(sessione),
    generaId: () => ID_VOCE_NUOVA,
    ora: () => ISTANTE,
    ...personalizza,
  };

  return {
    servizio: new ServizioRegistro(dipendenze),
    esegui,
    notifiche,
    vociPersistite: () => vociPersistite,
  };
}

// **Validates: Requirements 7.1, 7.3, 7.4, 7.5, 7.12**
describe("ServizioRegistro.aggiungi", () => {
  it("copia il giocatore dallo snapshot, assegna l'ordinale successivo e restituisce lo stato solo dopo il commit", async () => {
    const precedente = voce({
      ordinale: 4,
      annullataIl: "2026-03-11T10:00:00.000Z",
    });
    let confermaCommit: (() => void) | undefined;
    const commit = new Promise<void>((resolve) => {
      confermaCommit = resolve;
    });
    const scenario = creaScenario([precedente]);
    scenario.esegui.mockImplementationOnce(
      async (_sessioneAstaId, operazione, timeoutMs) => {
        expect(timeoutMs).toBe(5_000);
        const transazione = new RepositoryRegistroMemoria(
          [precedente],
          scenario.notifiche,
        );
        const risultato = await operazione(transazione);
        await commit;
        return risultato;
      },
    );

    let completata = false;
    const promessa = scenario.servizio
      .aggiungi(ID_SESSIONE, {
        identificativoGiocatore: "player-1",
        prezzoAcquisto: 30,
        chiaveIdempotenza: CHIAVE_IDEMPOTENZA,
      })
      .then((risultato) => {
        completata = true;
        return risultato;
      });
    await Promise.resolve();
    expect(completata).toBe(false);
    confermaCommit?.();

    const risultato = await promessa;
    expect(risultato.voce).toMatchObject({
      id: ID_VOCE_NUOVA,
      ordinale: 5,
      identificativoGiocatore: "player-1",
      nomeGiocatore: "Mario Rossi",
      ruolo: "A",
      squadra: "Roma",
      repartoAssegnato: "A",
      macroReparto: "ATT",
      prezzoAcquisto: 30,
    });
    expect(risultato).toMatchObject({
      budgetResiduo: 470,
      slotResiduiTotali: 24,
    });
    expect(scenario.notifiche).toEqual([5]);
  });

  it("traduce il conflitto dell'indice unico in 409 con voce e assegnatario", async () => {
    const esistente = voce({
      identificativoGiocatore: "player-1",
      assegnatarioTipo: "avversario",
      avversarioId: "avversario-1",
      prezzoAcquisto: 15,
    });
    const trovaAttivaPerGiocatore = vi.fn().mockResolvedValue(esistente);
    const esegui = vi
      .fn<GestoreTransazioniRegistro["esegui"]>()
      .mockRejectedValue(new ErroreUnicitaRegistro(new Error("P2002")));
    const scenario = creaScenario([], {
      transazioniRegistro: {
      esegui: esegui as unknown as GestoreTransazioniRegistro["esegui"],
    },
      registro: { trovaAttivaPerGiocatore },
    });

    const errore = await scenario.servizio
      .aggiungi(ID_SESSIONE, {
        identificativoGiocatore: "player-1",
        prezzoAcquisto: 30,
        chiaveIdempotenza: CHIAVE_IDEMPOTENZA,
      })
      .catch((causa: unknown) => causa);

    expect(errore).toBeInstanceOf(ErroreApplicativo);
    expect(errore).toMatchObject({
      status: 409,
      dati: {
        codice: "giocatore_gia_assegnato",
        dettagli: {
          voceEsistente: esistente,
          assegnatario: {
            tipo: "avversario",
            avversarioId: "avversario-1",
          },
        },
      },
    });
  });
});

// **Validates: Requirements 12.8, 12.9**
describe("ServizioRegistro.risolviConflitto", () => {
  it("conserva la versione server senza modificare il registro quando viene scelta", async () => {
    const versioneServer = voce({
      id: "voce-server",
      identificativoGiocatore: "player-1",
      nomeGiocatore: "Mario Rossi",
      ruolo: "A",
      repartoAssegnato: "A",
      macroReparto: "ATT",
      assegnatarioTipo: "avversario",
      avversarioId: "avversario-1",
      prezzoAcquisto: 15,
    });
    const scenario = creaScenario([versioneServer]);

    const risultato = await scenario.servizio.risolviConflitto(ID_SESSIONE, {
      identificativoGiocatore: "player-1",
      prezzoAcquisto: 30,
      repartoAssegnato: "A",
      chiaveIdempotenza: CHIAVE_IDEMPOTENZA,
      voceServerId: versioneServer.id,
      risoluzione: "server",
    });

    expect(risultato.voce).toEqual(versioneServer);
    expect(scenario.vociPersistite()).toEqual([versioneServer]);
    expect(scenario.notifiche).toEqual([]);
    expect(scenario.esegui).toHaveBeenCalledOnce();
  });

  it("annulla la versione server e crea quella locale nella stessa transazione", async () => {
    const versioneServer = voce({
      id: "voce-server",
      identificativoGiocatore: "player-1",
      nomeGiocatore: "Mario Rossi",
      ruolo: "A",
      repartoAssegnato: "A",
      macroReparto: "ATT",
      assegnatarioTipo: "avversario",
      avversarioId: "avversario-1",
      prezzoAcquisto: 15,
    });
    const scenario = creaScenario([versioneServer]);

    const risultato = await scenario.servizio.risolviConflitto(ID_SESSIONE, {
      identificativoGiocatore: "player-1",
      prezzoAcquisto: 30,
      repartoAssegnato: "A",
      chiaveIdempotenza: CHIAVE_IDEMPOTENZA,
      voceServerId: versioneServer.id,
      risoluzione: "locale",
    });

    expect(risultato.voce).toMatchObject({
      id: ID_VOCE_NUOVA,
      ordinale: 2,
      identificativoGiocatore: "player-1",
      assegnatarioTipo: "utente",
      prezzoAcquisto: 30,
      chiaveIdempotenza: CHIAVE_IDEMPOTENZA,
    });
    expect(scenario.vociPersistite()).toEqual([
      { ...versioneServer, annullataIl: ISTANTE.toISOString() },
      risultato.voce,
    ]);
    expect(scenario.notifiche).toEqual([2]);
    expect(scenario.esegui).toHaveBeenCalledOnce();
  });
});

// **Validates: Requirements 7.11, 7.15**
describe("ServizioRegistro.modificaPrezzo", () => {
  it("aggiorna il prezzo in transazione e ricalcola il solo budget", async () => {
    const esistente = voce({ prezzoAcquisto: 20 });
    const scenario = creaScenario([esistente]);

    const risultato = await scenario.servizio.modificaPrezzo(
      ID_SESSIONE,
      esistente.id,
      35,
    );

    expect(risultato.voce.prezzoAcquisto).toBe(35);
    expect(risultato.budgetResiduo).toBe(465);
    expect(risultato.slotResidui.get("D")).toBe(7);
    expect(scenario.vociPersistite()[0]?.prezzoAcquisto).toBe(35);
    expect(scenario.notifiche).toEqual([1]);
  });

  it("rifiuta un prezzo oltre budget più prezzo precedente senza modificare il registro", async () => {
    const esistente = voce({ prezzoAcquisto: 20 });
    const scenario = creaScenario([esistente]);

    await expect(
      scenario.servizio.modificaPrezzo(ID_SESSIONE, esistente.id, 501),
    ).rejects.toMatchObject({
      status: 400,
      dati: { codice: "prezzo_fuori_intervallo" },
    });
    expect(scenario.vociPersistite()).toEqual([esistente]);
  });
});

// **Validates: Requirements 7.7, 7.12, 7.16**
describe("ServizioRegistro.annulla", () => {
  it("esegue l'annullamento logico e ripristina budget, slot e rosa derivati", async () => {
    const esistente = voce({ prezzoAcquisto: 20 });
    const scenario = creaScenario([esistente]);

    const risultato = await scenario.servizio.annulla(
      ID_SESSIONE,
      esistente.id,
    );

    expect(risultato.voce.annullataIl).toBe(ISTANTE.toISOString());
    expect(risultato.budgetResiduo).toBe(500);
    expect(risultato.slotResidui.get("D")).toBe(8);
    expect(risultato.rosa).toEqual([]);
    expect(scenario.notifiche).toEqual([1]);
  });

  it("restituisce 503 e non conferma modifiche se la transazione fallisce", async () => {
    const esistente = voce({ prezzoAcquisto: 20 });
    const scenario = creaScenario([esistente]);
    scenario.esegui.mockRejectedValueOnce(new Error("timeout transazione"));

    await expect(
      scenario.servizio.annulla(ID_SESSIONE, esistente.id),
    ).rejects.toMatchObject({
      status: 503,
      dati: { codice: "salvataggio_registro_non_completato" },
    });
    expect(scenario.vociPersistite()).toEqual([esistente]);
  });
});

// **Validates: Requirements 8.1, 8.2, 8.5, 8.6, 8.13**
describe("ServizioRegistro.annotaAcquistoAltrui", () => {
  it("accetta un'annotazione senza avversario e senza prezzo e rende il giocatore non disponibile", async () => {
    const scenario = creaScenario();

    const risultato = await scenario.servizio.annotaAcquistoAltrui(
      ID_SESSIONE,
      {
        identificativoGiocatore: "player-1",
        chiaveIdempotenza: CHIAVE_IDEMPOTENZA,
      },
    );

    expect(risultato.voce).toMatchObject({
      identificativoGiocatore: "player-1",
      assegnatarioTipo: "avversario",
      avversarioId: null,
      prezzoAcquisto: null,
      repartoAssegnato: "A",
      macroReparto: "ATT",
    });
    expect(risultato.budgetResiduo).toBe(500);
    expect(
      scenario.vociPersistite().some(
        (corrente) =>
          corrente.identificativoGiocatore === "player-1" &&
          corrente.annullataIl === null,
      ),
    ).toBe(true);
  });

  it("accetta avversario e prezzo facoltativi indipendentemente", async () => {
    const avversario = {
      id: "00000000-0000-4000-8000-000000000004",
      sessioneAstaId: ID_SESSIONE,
      nome: "Luca",
      creatoIl: ISTANTE,
      aggiornatoIl: ISTANTE,
    };
    const scenario = creaScenario([], {
      avversari: { trovaPerId: vi.fn().mockResolvedValue(avversario) },
    });

    const risultato = await scenario.servizio.annotaAcquistoAltrui(
      ID_SESSIONE,
      {
        identificativoGiocatore: "player-1",
        avversarioId: avversario.id,
        chiaveIdempotenza: CHIAVE_IDEMPOTENZA,
      },
    );

    expect(risultato.voce).toMatchObject({
      avversarioId: avversario.id,
      prezzoAcquisto: null,
    });
  });

  it("rifiuta un prezzo superiore ai crediti residui stimati senza modificare il registro", async () => {
    const avversario = {
      id: "00000000-0000-4000-8000-000000000004",
      sessioneAstaId: ID_SESSIONE,
      nome: "Luca",
      creatoIl: ISTANTE,
      aggiornatoIl: ISTANTE,
    };
    const acquistoPrecedente = voce({
      identificativoGiocatore: "player-precedente",
      assegnatarioTipo: "avversario",
      avversarioId: avversario.id,
      prezzoAcquisto: 480,
    });
    const scenario = creaScenario([acquistoPrecedente], {
      avversari: { trovaPerId: vi.fn().mockResolvedValue(avversario) },
    });

    await expect(
      scenario.servizio.annotaAcquistoAltrui(ID_SESSIONE, {
        identificativoGiocatore: "player-1",
        avversarioId: avversario.id,
        prezzoAcquisto: 21,
        chiaveIdempotenza: CHIAVE_IDEMPOTENZA,
      }),
    ).rejects.toMatchObject({
      status: 400,
      dati: {
        codice: "prezzo_avversario_fuori_intervallo",
        campo: "prezzoAcquisto",
      },
    });
    expect(scenario.vociPersistite()).toEqual([acquistoPrecedente]);
  });

  it("rifiuta un avversario appartenente a un'altra sessione", async () => {
    const scenario = creaScenario([], {
      avversari: {
        trovaPerId: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000004",
          sessioneAstaId: "00000000-0000-4000-8000-000000000099",
          nome: "Altro",
          creatoIl: ISTANTE,
          aggiornatoIl: ISTANTE,
        }),
      },
    });

    await expect(
      scenario.servizio.annotaAcquistoAltrui(ID_SESSIONE, {
        identificativoGiocatore: "player-1",
        avversarioId: "00000000-0000-4000-8000-000000000004",
        prezzoAcquisto: 10,
        chiaveIdempotenza: CHIAVE_IDEMPOTENZA,
      }),
    ).rejects.toMatchObject({
      status: 404,
      dati: { codice: "avversario_non_disponibile" },
    });
    expect(scenario.vociPersistite()).toEqual([]);
  });
});
