import {
  PESI_VALUTAZIONE_PREDEFINITI,
  type ConfigurazioneAsta,
  type VoceRegistro,
} from "@asta/contracts";
import type {
  EsitoCreazioneObiettivo,
  NuovoObiettivo,
  ObiettivoPersistito,
  SessioneAstaPersistita,
  SnapshotPersistito,
} from "@asta/db";
import { describe, expect, it, vi } from "vitest";

import {
  ServizioObiettivi,
  type DipendenzeServizioObiettivi,
} from "./servizio-obiettivi.js";

const ID_SESSIONE = "00000000-0000-4000-8000-000000000001";
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
  creatoIl: ISTANTE,
  aggiornatoIl: ISTANTE,
};

const statisticheFantacalcio = {
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
};

const statisticheTattiche = {
  macroReparto: "ATT" as const,
  gol: 8,
  tiri: 52,
  tiriNelloSpecchio: 26,
  golAttesiMilli: null,
  stagione: "2024-25",
};

const snapshot: SnapshotPersistito = {
  id: "snapshot-1",
  stagioneListone: "2025-26",
  stagioneStatistiche: "2024-25",
  stato: "consultabile",
  creatoIl: ISTANTE,
  numGiocatori: 3,
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
      statFantacalcio: statisticheFantacalcio,
      statTattiche: statisticheTattiche,
    },
    {
      snapshotId: "snapshot-1",
      identificativoGiocatore: "player-2",
      nome: "Alfa Bianchi",
      nomeRicerca: "alfa bianchi",
      squadra: "Milan",
      ruoloClassic: "A",
      ruoliMantra: ["A"],
      quotazione: 20,
      statFantacalcio: statisticheFantacalcio,
      statTattiche: statisticheTattiche,
    },
    {
      snapshotId: "snapshot-1",
      identificativoGiocatore: "player-3",
      nome: "Diego Verdi",
      nomeRicerca: "diego verdi",
      squadra: "Inter",
      ruoloClassic: "D",
      ruoliMantra: ["Dc"],
      quotazione: 15,
      statFantacalcio: statisticheFantacalcio,
      statTattiche: statisticheTattiche,
    },
  ],
};

function obiettivo(
  id: string,
  identificativoGiocatore: string,
  nomeGiocatore: string,
  reparto: "A" | "D",
  priorita: number,
  nonRaggiungibile = false,
): ObiettivoPersistito {
  return {
    id,
    sessioneAstaId: ID_SESSIONE,
    identificativoGiocatore,
    nomeGiocatore,
    reparto,
    prezzoMassimoPersonale: null,
    priorita,
    nonRaggiungibile,
    creatoIl: ISTANTE,
    aggiornatoIl: ISTANTE,
  };
}

function voceRegistro(
  identificativoGiocatore: string,
  annullataIl: string | null = null,
): VoceRegistro {
  return {
    id: `registro-${identificativoGiocatore}`,
    sessioneAstaId: ID_SESSIONE,
    ordinale: 1,
    identificativoGiocatore,
    nomeGiocatore: "Giocatore acquistato",
    ruolo: "A",
    squadra: "Roma",
    repartoAssegnato: "A",
    macroReparto: "ATT",
    assegnatarioTipo: "utente",
    avversarioId: null,
    prezzoAcquisto: 20,
    annullataIl,
    chiaveIdempotenza: "10000000-0000-4000-8000-000000000001",
    giocatoreAssenteDatiCorrenti: false,
  };
}

function creaScenario(
  iniziali: readonly ObiettivoPersistito[] = [],
  registro: readonly VoceRegistro[] = [],
  esitoCreazione?: EsitoCreazioneObiettivo,
) {
  const voci = [...iniziali];
  const creaEntroLimite = vi.fn().mockImplementation(
    async (input: NuovoObiettivo): Promise<EsitoCreazioneObiettivo> => {
      if (esitoCreazione !== undefined) return esitoCreazione;
      const creata: ObiettivoPersistito = {
        id: `obiettivo-${voci.length + 1}`,
        sessioneAstaId: input.sessioneAstaId,
        identificativoGiocatore: input.identificativoGiocatore,
        nomeGiocatore: input.nomeGiocatore,
        reparto: input.reparto,
        prezzoMassimoPersonale: input.prezzoMassimoPersonale ?? null,
        priorita: input.priorita ?? 99,
        nonRaggiungibile: input.nonRaggiungibile ?? false,
        creatoIl: ISTANTE,
        aggiornatoIl: ISTANTE,
      };
      voci.push(creata);
      return { ok: true, obiettivo: creata };
    },
  );
  const aggiorna = vi.fn().mockImplementation(
    async (
      id: string,
      modifiche: Partial<ObiettivoPersistito>,
    ): Promise<ObiettivoPersistito> => {
      const indice = voci.findIndex((voce) => voce.id === id);
      if (indice < 0) throw new Error("Obiettivo assente");
      const aggiornata = { ...voci[indice], ...modifiche } as ObiettivoPersistito;
      voci[indice] = aggiornata;
      return aggiornata;
    },
  );
  const dipendenze: DipendenzeServizioObiettivi = {
    obiettivi: {
      creaEntroLimite,
      elencaPerSessione: vi.fn().mockImplementation(async () => voci),
      aggiorna,
    },
    registro: { elencaPerSessione: vi.fn().mockResolvedValue(registro) },
    snapshot: { trovaPubblicato: vi.fn().mockResolvedValue(snapshot) },
    caricaSessionePropria: vi.fn().mockResolvedValue(sessione),
  };
  return {
    servizio: new ServizioObiettivi(dipendenze),
    creaEntroLimite,
    aggiorna,
    voci: () => voci,
  };
}

// **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.8**
describe("ServizioObiettivi: inserimento e valori personali", () => {
  it("copia il giocatore dallo snapshot e crea entro il limite atomico con i predefiniti", async () => {
    const scenario = creaScenario();

    await expect(
      scenario.servizio.aggiungi(ID_SESSIONE, {
        identificativoGiocatore: " player-1 ",
      }),
    ).resolves.toMatchObject({
      identificativoGiocatore: "player-1",
      nomeGiocatore: "Mario Rossi",
      reparto: "A",
      prezzoMassimoPersonale: null,
      priorita: 99,
      nonRaggiungibile: false,
    });
    expect(scenario.creaEntroLimite).toHaveBeenCalledWith(
      expect.objectContaining({ identificativoGiocatore: "player-1" }),
      200,
    );
  });

  it.each([
    ["obiettivo_duplicato", "obiettivo_duplicato"],
    ["limite_obiettivi", "limite_obiettivi_raggiunto"],
  ] as const)("traduce il rifiuto atomico %s", async (motivo, codice) => {
    const scenario = creaScenario([], [], { ok: false, motivo });

    await expect(
      scenario.servizio.aggiungi(ID_SESSIONE, {
        identificativoGiocatore: "player-1",
      }),
    ).rejects.toMatchObject({ status: 409, dati: { codice } });
  });

  it.each([0, 501, 1.5])(
    "rifiuta il prezzo personale non valido %s senza sovrascrivere il precedente",
    async (prezzo) => {
      const esistente = {
        ...obiettivo("obiettivo-1", "player-1", "Mario Rossi", "A", 3),
        prezzoMassimoPersonale: 40,
      };
      const scenario = creaScenario([esistente]);

      await expect(
        scenario.servizio.aggiornaPrezzoMassimoPersonale(
          ID_SESSIONE,
          esistente.id,
          prezzo,
        ),
      ).rejects.toMatchObject({
        status: 400,
        dati: { codice: "prezzo_massimo_personale_non_valido" },
      });
      expect(scenario.aggiorna).not.toHaveBeenCalled();
      expect(scenario.voci()[0]?.prezzoMassimoPersonale).toBe(40);
    },
  );

  it("accetta prezzo ai confini e considera 99 una priorità non assegnata", async () => {
    const esistente = obiettivo(
      "obiettivo-1",
      "player-1",
      "Mario Rossi",
      "A",
      1,
    );
    const scenario = creaScenario([esistente]);

    await expect(
      scenario.servizio.aggiornaPrezzoMassimoPersonale(
        ID_SESSIONE,
        esistente.id,
        500,
      ),
    ).resolves.toMatchObject({ prezzoMassimoPersonale: 500 });
    await expect(
      scenario.servizio.aggiornaPriorita(ID_SESSIONE, esistente.id, null),
    ).resolves.toMatchObject({ priorita: 99 });
  });
});

// **Validates: Requirements 11.7, 11.9**
describe("ServizioObiettivi.elenca", () => {
  it("deriva la non raggiungibilità, la esclude dai conteggi e ordina per priorità con parità alfabetica", async () => {
    const zeta = obiettivo(
      "obiettivo-1",
      "player-1",
      "Mario Rossi",
      "A",
      2,
    );
    const alfa = obiettivo(
      "obiettivo-2",
      "player-2",
      "Alfa Bianchi",
      "A",
      2,
    );
    const difensore = obiettivo(
      "obiettivo-3",
      "player-3",
      "Diego Verdi",
      "D",
      1,
    );
    const scenario = creaScenario(
      [zeta, alfa, difensore],
      [voceRegistro("player-2")],
    );

    const risultato = await scenario.servizio.elenca(
      ID_SESSIONE,
      "priorita",
    );

    expect(risultato.voci.map((voce) => voce.nomeGiocatore)).toEqual([
      "Diego Verdi",
      "Alfa Bianchi",
      "Mario Rossi",
    ]);
    expect(risultato.voci[1]?.nonRaggiungibile).toBe(true);
    expect(risultato.conteggiPerReparto).toEqual({ P: 0, D: 1, C: 0, A: 1 });
    expect(scenario.aggiorna).toHaveBeenCalledWith("obiettivo-2", {
      nonRaggiungibile: true,
    });
  });

  it("ordina per reparto e poi alfabeticamente, ripristinando un obiettivo dopo l'annullamento", async () => {
    const zeta = {
      ...obiettivo("obiettivo-1", "player-1", "Mario Rossi", "A", 1),
      nonRaggiungibile: true,
    };
    const alfa = obiettivo(
      "obiettivo-2",
      "player-2",
      "Alfa Bianchi",
      "A",
      99,
    );
    const difensore = obiettivo(
      "obiettivo-3",
      "player-3",
      "Diego Verdi",
      "D",
      2,
    );
    const scenario = creaScenario(
      [zeta, difensore, alfa],
      [voceRegistro("player-1", ISTANTE.toISOString())],
    );

    const risultato = await scenario.servizio.elenca(ID_SESSIONE, "reparto");

    expect(risultato.voci.map((voce) => voce.nomeGiocatore)).toEqual([
      "Alfa Bianchi",
      "Mario Rossi",
      "Diego Verdi",
    ]);
    expect(risultato.voci[1]?.nonRaggiungibile).toBe(false);
    expect(risultato.conteggiPerReparto).toEqual({ P: 0, D: 1, C: 0, A: 2 });
  });
});
