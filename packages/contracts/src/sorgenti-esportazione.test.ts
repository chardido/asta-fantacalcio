import { describe, expect, it } from "vitest";

import {
  COMPOSIZIONE_ROSA_CLASSIC_PREDEFINITA,
  PESI_VALUTAZIONE_PREDEFINITI,
  QUOTE_REPARTO_PREDEFINITE,
} from "./domain.js";
import {
  SCHEMA_FILE_ESPORTAZIONE,
  corpoFileEsportazioneSchema,
  fileEsportazioneSchema,
} from "./esportazione.js";
import {
  rispostaListoneGrezzaSchema,
  rispostaStatisticheGrezzaSchema,
} from "./sorgenti.js";

const configurazione = {
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

const voceRegistro = {
  ordinale: 1,
  identificativoGiocatore: "giocatore-1",
  nomeGiocatore: "Mario Rossi",
  ruolo: "A" as const,
  squadra: "Squadra",
  repartoAssegnato: "A" as const,
  macroReparto: "ATT" as const,
  assegnatarioTipo: "utente" as const,
  avversarioNome: null,
  prezzoAcquisto: 35,
  annullataIl: null,
  giocatoreAssenteDatiCorrenti: false,
};

const fileValido = {
  schema: SCHEMA_FILE_ESPORTAZIONE,
  esportatoIl: "2026-08-01T10:30:00.000Z",
  configurazione,
  rosa: [
    {
      identificativoGiocatore: "giocatore-1",
      nome: "Mario Rossi",
      reparto: "A" as const,
      prezzoAcquisto: 35,
    },
  ],
  registro: [voceRegistro],
  firma: "a".repeat(64),
};

// **Validates: Requirements 4.4, 4.5**
describe("DTO grezzi delle sorgenti", () => {
  it("accetta il vocabolario canonico del listone senza imporre i vincoli del normalizzatore", () => {
    const risposta = {
      nomeSorgente: "quotazioni-ufficiali",
      stagione: "2026/2027",
      giocatori: [
        {
          identificativoGiocatore: "10",
          nome: "Mario Rossi",
          squadra: "Squadra",
          ruoloClassic: "ruolo-provider-non-valido",
          ruoliMantra: ["Pc"],
          quotazione: 12.5,
        },
      ],
    };

    expect(rispostaListoneGrezzaSchema.parse(risposta)).toEqual(risposta);
  });

  it("rappresenta statistiche parziali e mantiene zero distinto dall'assenza", () => {
    const risultato = rispostaStatisticheGrezzaSchema.parse({
      nomeSorgente: "api-football",
      stagione: "2025/2026",
      giocatori: [
        {
          identificativoSorgente: "provider-10",
          nome: "Mario Rossi",
          squadra: "Squadra",
          statFantacalcio: { presenze: 0, gol: 0 },
          statTattiche: { tiri: 12 },
        },
      ],
    });

    expect(risultato.giocatori[0]?.statFantacalcio.gol).toBe(0);
    expect(risultato.giocatori[0]?.statFantacalcio.assist).toBeUndefined();
  });

  it("rifiuta campi specifici di un provider e statistiche non intere", () => {
    expect(
      rispostaStatisticheGrezzaSchema.safeParse({
        nomeSorgente: "api-football",
        stagione: "2025/2026",
        giocatori: [
          {
            nome: "Mario Rossi",
            squadra: "Squadra",
            statFantacalcio: { mediaVotoMilli: 6.5 },
            statTattiche: {},
            apiFootballPayload: {},
          },
        ],
      }).success,
    ).toBe(false);
  });
});

// **Validates: Requirements 10.5, 10.9**
describe("schema del file di esportazione", () => {
  it("accetta il formato JSON versionato con configurazione, rosa, registro e firma", () => {
    expect(fileEsportazioneSchema.parse(fileValido)).toEqual(fileValido);
  });

  it("espone separatamente il corpo da canonicalizzare", () => {
    const { firma: _firma, ...corpo } = fileValido;
    expect(corpoFileEsportazioneSchema.parse(corpo)).toEqual(corpo);
  });

  it("rifiuta schema ignoto, firma non SHA-256 e file incompleti", () => {
    expect(
      fileEsportazioneSchema.safeParse({
        ...fileValido,
        schema: "asta-fantacalcio-companion/export/v2",
      }).success,
    ).toBe(false);
    expect(
      fileEsportazioneSchema.safeParse({ ...fileValido, firma: "abc" }).success,
    ).toBe(false);

    const { configurazione: _configurazione, ...incompleto } = fileValido;
    expect(fileEsportazioneSchema.safeParse(incompleto).success).toBe(false);
  });

  it("richiede il registro in ordine cronologico strettamente crescente", () => {
    expect(
      fileEsportazioneSchema.safeParse({
        ...fileValido,
        registro: [
          { ...voceRegistro, ordinale: 2 },
          { ...voceRegistro, ordinale: 1 },
        ],
      }).success,
    ).toBe(false);
  });
});
