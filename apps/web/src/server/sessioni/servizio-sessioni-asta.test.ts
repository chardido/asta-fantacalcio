import type { ConfigurazioneAsta, VoceRegistro } from "@asta/contracts";
import type {
  EsitoCreazioneSessioneAsta,
  SessioneAstaPersistita,
} from "@asta/db";
import { describe, expect, it, vi } from "vitest";

import { ErroreApplicativo } from "../trpc/errori.js";
import {
  ServizioSessioniAsta,
  type DipendenzeServizioSessioniAsta,
} from "./servizio-sessioni-asta.js";

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

function sessione(
  id: string,
  aggiornatoIl: string,
  configurazioneSessione: ConfigurazioneAsta = configurazione,
): SessioneAstaPersistita {
  return {
    id,
    utenteId: "utente-1",
    stagioneListone: "2025-26",
    stato: "in_corso",
    configurazione: configurazioneSessione,
    avvisiInformativiAttivi: true,
    creatoIl: new Date("2026-01-01T10:00:00.000Z"),
    aggiornatoIl: new Date(aggiornatoIl),
  };
}

function voceRegistro(
  id: string,
  sessioneAstaId: string,
  opzioni: Partial<VoceRegistro> = {},
): VoceRegistro {
  return {
    id,
    sessioneAstaId,
    ordinale: 1,
    identificativoGiocatore: `giocatore-${id}`,
    nomeGiocatore: `Giocatore ${id}`,
    ruolo: "A",
    squadra: "Roma",
    repartoAssegnato: "A",
    macroReparto: "ATT",
    prezzoAcquisto: 100,
    assegnatarioTipo: "utente",
    avversarioId: null,
    annullataIl: null,
    chiaveIdempotenza: "00000000-0000-4000-8000-000000000001",
    giocatoreAssenteDatiCorrenti: false,
    ...opzioni,
  } as VoceRegistro;
}

function creaScenario(overrides: {
  readonly esitoCreazione?: EsitoCreazioneSessioneAsta;
  readonly sessioni?: readonly SessioneAstaPersistita[];
  readonly registri?: Readonly<Record<string, readonly VoceRegistro[]>>;
  readonly caricata?: SessioneAstaPersistita;
} = {}) {
  const creata = sessione(
    "sessione-nuova",
    "2026-01-03T10:00:00.000Z",
  );
  const creaEntroLimite = vi
    .fn()
    .mockResolvedValue(overrides.esitoCreazione ?? { ok: true, sessione: creata });
  const elencaPerUtente = vi
    .fn()
    .mockResolvedValue(overrides.sessioni ?? []);
  const elimina = vi.fn().mockResolvedValue(undefined);
  const elencaPerSessione = vi.fn().mockImplementation((id: string) =>
    Promise.resolve(overrides.registri?.[id] ?? []),
  );
  const caricaSessionePropria = vi
    .fn()
    .mockResolvedValue(overrides.caricata ?? creata);

  const dipendenze: DipendenzeServizioSessioniAsta = {
    utenteId: "utente-1",
    sessioniAsta: { creaEntroLimite, elencaPerUtente, elimina },
    registro: { elencaPerSessione },
    caricaSessionePropria,
  };

  return {
    servizio: new ServizioSessioniAsta(dipendenze),
    creaEntroLimite,
    elencaPerUtente,
    elimina,
    elencaPerSessione,
    caricaSessionePropria,
  };
}

// **Validates: Requirements 2.1, 2.2, 2.11**
describe("ServizioSessioniAsta.crea", () => {
  it("valida la configurazione completa e crea una sessione vuota entro il limite transazionale", async () => {
    const scenario = creaScenario();

    await expect(
      scenario.servizio.crea({
        stagioneListone: "2025-26",
        configurazione,
      }),
    ).resolves.toEqual({ id: "sessione-nuova" });

    expect(scenario.creaEntroLimite).toHaveBeenCalledWith(
      {
        utenteId: "utente-1",
        stagioneListone: "2025-26",
        configurazione,
      },
      50,
      [configurazione.nome],
    );
  });

  it("rifiuta configurazioni non valide senza interrogare il repository", async () => {
    const scenario = creaScenario();

    await expect(
      scenario.servizio.crea({
        stagioneListone: "2025-26",
        configurazione: {
          ...configurazione,
          creditiIniziali: 0,
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      dati: {
        codice: "configurazione_asta_non_valida",
        campo: "configurazione.creditiIniziali",
      },
    });
    expect(scenario.creaEntroLimite).not.toHaveBeenCalled();
  });

  it("segnala nome duplicato e limite di 50 sessioni con errori descrittivi", async () => {
    const duplicato = creaScenario({
      esitoCreazione: { ok: false, motivo: "nome_duplicato" },
    });
    const limite = creaScenario({
      esitoCreazione: { ok: false, motivo: "limite_sessioni" },
    });
    const input = { stagioneListone: "2025-26", configurazione };

    await expect(duplicato.servizio.crea(input)).rejects.toMatchObject({
      status: 400,
      dati: { codice: "nome_sessione_asta_duplicato" },
    });
    await expect(limite.servizio.crea(input)).rejects.toMatchObject({
      status: 409,
      dati: {
        codice: "limite_sessioni_asta_raggiunto",
        dettagli: { limite: 50, valoreCorrente: 50 },
      },
    });
  });
});

// **Validates: Requirements 2.3, 2.4**
describe("ServizioSessioniAsta.elenca", () => {
  it("restituisce un elenco vuoto senza leggere registri quando l'utente non ha sessioni", async () => {
    const scenario = creaScenario();

    await expect(scenario.servizio.elenca()).resolves.toEqual([]);
    expect(scenario.elencaPerUtente).toHaveBeenCalledWith("utente-1");
    expect(scenario.elencaPerSessione).not.toHaveBeenCalled();
  });

  it("ordina per ultima modifica e deriva budget e numero di giocatori dalle sole voci attive dell'utente", async () => {
    const vecchia = sessione("sessione-vecchia", "2026-01-02T10:00:00.000Z");
    const recente = sessione("sessione-recente", "2026-01-04T10:00:00.000Z", {
      ...configurazione,
      nome: "Asta recente",
      tipoAsta: "random",
    });
    const scenario = creaScenario({
      sessioni: [vecchia, recente],
      registri: {
        [vecchia.id]: [voceRegistro("1", vecchia.id)],
        [recente.id]: [
          voceRegistro("2", recente.id, { prezzoAcquisto: 70 }),
          voceRegistro("3", recente.id, {
            assegnatarioTipo: "avversario",
            avversarioId: null,
            prezzoAcquisto: 200,
          }),
          voceRegistro("4", recente.id, {
            prezzoAcquisto: 50,
            annullataIl: "2026-01-03T10:00:00.000Z",
          }),
        ],
      },
    });

    await expect(scenario.servizio.elenca()).resolves.toEqual([
      expect.objectContaining({
        id: recente.id,
        nome: "Asta recente",
        tipoAsta: "random",
        budgetResiduo: 430,
        numeroGiocatoriRosa: 1,
      }),
      expect.objectContaining({
        id: vecchia.id,
        nome: "Asta principale",
        tipoAsta: "chiamata",
        budgetResiduo: 400,
        numeroGiocatoriRosa: 1,
      }),
    ]);
    expect(scenario.elencaPerSessione).toHaveBeenCalledTimes(2);
  });
});

// **Validates: Requirements 2.5, 2.6**
describe("ServizioSessioniAsta.ripristina", () => {
  it("ripristina configurazione e registro completi derivando rosa, budget e conteggi identici ai dati confermati", async () => {
    const salvata = sessione(
      "sessione-ripristinata",
      "2026-01-05T10:00:00.000Z",
    );
    const registroPersistito = [
      voceRegistro("1", salvata.id, { ordinale: 1, prezzoAcquisto: 100 }),
      voceRegistro("2", salvata.id, {
        ordinale: 2,
        assegnatarioTipo: "avversario",
        avversarioId: null,
        prezzoAcquisto: 200,
      }),
      voceRegistro("3", salvata.id, {
        ordinale: 3,
        ruolo: "D",
        repartoAssegnato: "D",
        macroReparto: "DIF",
        prezzoAcquisto: 50,
      }),
      voceRegistro("4", salvata.id, {
        ordinale: 4,
        prezzoAcquisto: 70,
        annullataIl: "2026-01-04T10:00:00.000Z",
      }),
    ];
    const scenario = creaScenario({
      caricata: salvata,
      registri: { [salvata.id]: registroPersistito },
    });

    const ripristinata = await scenario.servizio.ripristina(salvata.id);

    expect(ripristinata).toMatchObject({
      id: salvata.id,
      configurazione: salvata.configurazione,
      budgetResiduo: 350,
      creditiIniziali: 500,
      slotResiduiTotali: 23,
      riservaMinima: 22,
    });
    expect(ripristinata.registro).toEqual(registroPersistito);
    expect(ripristinata.registro).toHaveLength(4);
    expect(ripristinata.rosa).toHaveLength(2);
    expect(ripristinata.rosa.map((voce) => voce.voceRegistroId)).toEqual([
      "1",
      "3",
    ]);
    expect(ripristinata.budgetRepartoResiduo).toEqual(
      new Map([
        ["POR", 40],
        ["DIF", 50],
        ["CEN", 160],
        ["ATT", 100],
      ]),
    );
    expect(ripristinata.slotResidui).toEqual(
      new Map([
        ["P", 3],
        ["D", 7],
        ["C", 8],
        ["A", 5],
      ]),
    );
    expect(scenario.caricaSessionePropria).toHaveBeenCalledWith(salvata.id);
    expect(scenario.caricaSessionePropria).toHaveBeenCalledBefore(
      scenario.elencaPerSessione,
    );
    expect(scenario.elencaPerSessione).toHaveBeenCalledWith(salvata.id);
  });

  it("interrompe l'apertura senza scritture quando il registro recuperato è incompleto", async () => {
    const salvata = sessione(
      "sessione-incompleta",
      "2026-01-05T10:00:00.000Z",
    );
    const registroPersistito = [
      voceRegistro("1", salvata.id, { ordinale: 1 }),
      voceRegistro("3", salvata.id, { ordinale: 3 }),
    ];
    const configurazionePrima = structuredClone(salvata.configurazione);
    const registroPrima = structuredClone(registroPersistito);
    const scenario = creaScenario({
      caricata: salvata,
      registri: { [salvata.id]: registroPersistito },
    });

    await expect(
      scenario.servizio.ripristina(salvata.id),
    ).rejects.toMatchObject({
      status: 503,
      dati: {
        codice: "ripristino_sessione_asta_non_completato",
        dettagli: {
          motivo: "dati_incompleti_o_non_disponibili",
          ritentabile: true,
          sogliaMillisecondi: 5_000,
        },
      },
    });

    expect(salvata.configurazione).toEqual(configurazionePrima);
    expect(registroPersistito).toEqual(registroPrima);
    expect(scenario.creaEntroLimite).not.toHaveBeenCalled();
    expect(scenario.elimina).not.toHaveBeenCalled();
  });

  it("interrompe l'apertura dopo cinque secondi senza modificare la persistenza", async () => {
    vi.useFakeTimers();
    try {
      const salvata = sessione(
        "sessione-timeout",
        "2026-01-05T10:00:00.000Z",
      );
      const scenario = creaScenario({ caricata: salvata });
      scenario.elencaPerSessione.mockImplementation(
        () => new Promise<readonly VoceRegistro[]>(() => undefined),
      );

      const ripristino = scenario.servizio.ripristina(salvata.id);
      const verifica = expect(ripristino).rejects.toMatchObject({
        status: 503,
        dati: {
          codice: "ripristino_sessione_asta_non_completato",
          dettagli: {
            motivo: "tempo_massimo_superato",
            ritentabile: true,
            sogliaMillisecondi: 5_000,
          },
        },
      });

      await vi.advanceTimersByTimeAsync(5_000);
      await verifica;
      expect(scenario.creaEntroLimite).not.toHaveBeenCalled();
      expect(scenario.elimina).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("non legge il registro quando la guardia nega l'accesso alla sessione", async () => {
    const scenario = creaScenario();
    scenario.caricaSessionePropria.mockRejectedValue(
      new ErroreApplicativo(
        404,
        { codice: "sessione_non_disponibile" },
        "Sessione d'asta non disponibile.",
      ),
    );

    await expect(
      scenario.servizio.ripristina("sessione-altrui"),
    ).rejects.toMatchObject({ status: 404 });
    expect(scenario.elencaPerSessione).not.toHaveBeenCalled();
  });
});

// **Validates: Requirements 2.7, 2.11**
describe("ServizioSessioniAsta.duplica", () => {
  it("carica l'originale tramite la guardia e propone nomi distinti validi senza copiare il registro", async () => {
    const nomeLungo = "A".repeat(60);
    const originale = sessione("sessione-originale", "2026-01-02T10:00:00.000Z", {
      ...configurazione,
      nome: nomeLungo,
    });
    const duplicata = sessione("sessione-copia", "2026-01-03T10:00:00.000Z", {
      ...configurazione,
      nome: `${"A".repeat(50)} - copia 2`,
    });
    const scenario = creaScenario({
      caricata: originale,
      esitoCreazione: { ok: true, sessione: duplicata },
    });

    await expect(
      scenario.servizio.duplica(originale.id),
    ).resolves.toEqual({ id: duplicata.id, nome: duplicata.configurazione.nome });

    expect(scenario.caricaSessionePropria).toHaveBeenCalledWith(originale.id);
    const [input, limite, nomi] = scenario.creaEntroLimite.mock.calls[0] as [
      { configurazione: ConfigurazioneAsta; stato: string },
      number,
      string[],
    ];
    expect(input).toMatchObject({
      configurazione: originale.configurazione,
      stato: "in_corso",
    });
    expect(limite).toBe(50);
    expect(nomi).toHaveLength(50);
    expect(new Set(nomi).size).toBe(50);
    expect(nomi.every((nome) => nome.length <= 60)).toBe(true);
    expect(scenario.elencaPerSessione).not.toHaveBeenCalled();
  });
});

// **Validates: Requirements 2.10**
describe("ServizioSessioniAsta.elimina", () => {
  it("elimina soltanto la sessione restituita dalla guardia di proprietà", async () => {
    const caricata = sessione("sessione-da-eliminare", "2026-01-02T10:00:00.000Z");
    const scenario = creaScenario({ caricata });

    await scenario.servizio.elimina(caricata.id);

    expect(scenario.caricaSessionePropria).toHaveBeenCalledWith(caricata.id);
    expect(scenario.elimina).toHaveBeenCalledWith(caricata.id);
    expect(scenario.caricaSessionePropria).toHaveBeenCalledBefore(
      scenario.elimina,
    );
  });

  it("non elimina nulla se la guardia rifiuta la sessione", async () => {
    const scenario = creaScenario();
    scenario.caricaSessionePropria.mockRejectedValue(
      new ErroreApplicativo(
        404,
        { codice: "sessione_non_disponibile" },
        "Sessione d'asta non disponibile.",
      ),
    );

    await expect(
      scenario.servizio.elimina("sessione-altrui"),
    ).rejects.toMatchObject({ status: 404 });
    expect(scenario.elimina).not.toHaveBeenCalled();
  });
});
