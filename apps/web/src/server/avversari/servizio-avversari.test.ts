import {
  PESI_VALUTAZIONE_PREDEFINITI,
  type ConfigurazioneAsta,
  type VoceRegistro,
} from "@asta/contracts";
import type {
  AvversarioPersistito,
  EsitoCreazioneAvversario,
  SessioneAstaPersistita,
} from "@asta/db";
import { describe, expect, it, vi } from "vitest";

import {
  ServizioAvversari,
  type DipendenzeServizioAvversari,
} from "./servizio-avversari.js";

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

function avversario(
  id: string,
  nome: string,
  sessioneAstaId = ID_SESSIONE,
): AvversarioPersistito {
  return {
    id,
    sessioneAstaId,
    nome,
    creatoIl: ISTANTE,
    aggiornatoIl: ISTANTE,
  };
}

function voceAvversario(
  id: string,
  avversarioId: string,
  repartoAssegnato: "P" | "D" | "C" | "A",
  prezzoAcquisto: number | null,
  annullataIl: string | null = null,
): VoceRegistro {
  const macroReparto = {
    P: "POR",
    D: "DIF",
    C: "CEN",
    A: "ATT",
  } as const;
  return {
    id,
    sessioneAstaId: ID_SESSIONE,
    ordinale: Number(id),
    identificativoGiocatore: `player-${id}`,
    nomeGiocatore: `Giocatore ${id}`,
    ruolo: repartoAssegnato,
    squadra: "Roma",
    repartoAssegnato,
    macroReparto: macroReparto[repartoAssegnato],
    assegnatarioTipo: "avversario",
    avversarioId,
    prezzoAcquisto,
    annullataIl,
    chiaveIdempotenza: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
    giocatoreAssenteDatiCorrenti: false,
  };
}

function creaScenario(
  elencoAvversari: readonly AvversarioPersistito[] = [],
  registro: readonly VoceRegistro[] = [],
  esitoCreazione?: EsitoCreazioneAvversario,
) {
  const creaEntroLimite = vi.fn().mockImplementation(
    async (
      sessioneAstaId: string,
      nome: string,
    ): Promise<EsitoCreazioneAvversario> =>
      esitoCreazione ?? {
        ok: true,
        avversario: avversario("avversario-nuovo", nome, sessioneAstaId),
      },
  );
  const rinomina = vi.fn().mockImplementation(async (id: string, nome: string) => {
    const corrente = elencoAvversari.find((elemento) => elemento.id === id);
    if (corrente === undefined) throw new Error("Avversario assente");
    return { ...corrente, nome };
  });
  const dipendenze: DipendenzeServizioAvversari = {
    avversari: {
      creaEntroLimite,
      trovaPerId: vi.fn().mockImplementation(async (id: string) =>
        elencoAvversari.find((elemento) => elemento.id === id) ?? null,
      ),
      elencaPerSessione: vi.fn().mockResolvedValue(elencoAvversari),
      rinomina,
    },
    registro: { elencaPerSessione: vi.fn().mockResolvedValue(registro) },
    caricaSessionePropria: vi.fn().mockResolvedValue(sessione),
  };
  return {
    servizio: new ServizioAvversari(dipendenze),
    creaEntroLimite,
    rinomina,
  };
}

// **Validates: Requirements 8.3, 8.4**
describe("ServizioAvversari: gestione nominativi", () => {
  it("normalizza il nome e crea entro il limite atomico di 19", async () => {
    const scenario = creaScenario();

    await expect(scenario.servizio.crea(ID_SESSIONE, "  Luca  ")).resolves.toMatchObject({
      nome: "Luca",
    });
    expect(scenario.creaEntroLimite).toHaveBeenCalledWith(
      ID_SESSIONE,
      "Luca",
      19,
    );
  });

  it.each(["", "   ", "a".repeat(31)])(
    "rifiuta il nome non valido %j senza mutare l'elenco",
    async (nome) => {
      const scenario = creaScenario();

      await expect(scenario.servizio.crea(ID_SESSIONE, nome)).rejects.toMatchObject({
        status: 400,
        dati: { codice: "nome_avversario_non_valido" },
      });
      expect(scenario.creaEntroLimite).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["nome_duplicato", "nome_avversario_duplicato"],
    ["limite_avversari", "limite_avversari_raggiunto"],
  ] as const)("traduce il rifiuto %s senza creare", async (motivo, codice) => {
    const scenario = creaScenario([], [], { ok: false, motivo });

    await expect(scenario.servizio.crea(ID_SESSIONE, "Luca")).rejects.toMatchObject({
      status: 409,
      dati: { codice },
    });
  });

  it("rifiuta la rinomina con un nome già usato nella sessione", async () => {
    const primo = avversario("avversario-1", "Luca");
    const secondo = avversario("avversario-2", "Marco");
    const scenario = creaScenario([primo, secondo]);

    await expect(
      scenario.servizio.rinomina(ID_SESSIONE, secondo.id, primo.nome),
    ).rejects.toMatchObject({
      status: 409,
      dati: { codice: "nome_avversario_duplicato" },
    });
    expect(scenario.rinomina).not.toHaveBeenCalled();
  });
});

// **Validates: Requirements 8.5, 8.13, 8.14**
describe("ServizioAvversari.elenca", () => {
  it("deriva spesi, residui e conteggi per reparto dalle sole voci attive", async () => {
    const luca = avversario("avversario-1", "Luca");
    const marco = avversario("avversario-2", "Marco");
    const registro = [
      voceAvversario("1", luca.id, "P", 40),
      voceAvversario("2", luca.id, "D", null),
      voceAvversario("3", luca.id, "A", 100, ISTANTE.toISOString()),
      voceAvversario("4", marco.id, "C", 70),
    ];
    const scenario = creaScenario([luca, marco], registro);

    await expect(scenario.servizio.elenca(ID_SESSIONE)).resolves.toEqual([
      {
        id: luca.id,
        nome: "Luca",
        creditiSpesi: 40,
        creditiResiduiStimati: 460,
        giocatoriPerReparto: { P: 1, D: 1, C: 0, A: 0 },
      },
      {
        id: marco.id,
        nome: "Marco",
        creditiSpesi: 70,
        creditiResiduiStimati: 430,
        giocatoriPerReparto: { P: 0, D: 0, C: 1, A: 0 },
      },
    ]);
  });
});

// **Validates: Requirements 8.1, 8.2, 8.13**
describe("ServizioAvversari.elencaAnnotazioni", () => {
  it("espone solo le annotazioni attive in ordine, incluse quelle senza nome o prezzo", async () => {
    const luca = avversario("avversario-1", "Luca");
    const registro = [
      voceAvversario("2", luca.id, "D", null),
      voceAvversario("1", luca.id, "P", 40),
      voceAvversario("3", luca.id, "A", 100, ISTANTE.toISOString()),
      voceAvversario("4", "", "C", null),
    ].map((voce) =>
      voce.id === "4" ? { ...voce, avversarioId: null } : voce,
    );
    const scenario = creaScenario([luca], registro);

    await expect(scenario.servizio.elencaAnnotazioni(ID_SESSIONE)).resolves.toEqual([
      expect.objectContaining({
        id: "1",
        avversarioNome: "Luca",
        prezzoAcquisto: 40,
      }),
      expect.objectContaining({
        id: "2",
        avversarioNome: "Luca",
        prezzoAcquisto: null,
      }),
      expect.objectContaining({
        id: "4",
        avversarioId: null,
        avversarioNome: null,
        prezzoAcquisto: null,
      }),
    ]);
  });
});
