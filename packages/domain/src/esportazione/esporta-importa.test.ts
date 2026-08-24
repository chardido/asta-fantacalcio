import type {
  ConfigurazioneAsta,
  VoceRegistroEsportata,
  VoceRosa,
} from "@asta/contracts";
import { describe, expect, it } from "vitest";

import {
  canonicalizzaJson,
  esporta,
  importa,
} from "./esporta-importa.js";
import { sha256 } from "./sha256.js";

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

const rosa: readonly VoceRosa[] = [
  {
    voceRegistroId: "voce-utente",
    identificativoGiocatore: "giocatore-utente",
    nomeGiocatore: "Nicolò Èlite",
    ruolo: "A",
    squadra: "Milano",
    repartoAssegnato: "A",
    macroReparto: "ATT",
    prezzoAcquisto: 35,
    giocatoreAssenteDatiCorrenti: false,
  },
];

const voceUtente: VoceRegistroEsportata = {
  ordinale: 1,
  identificativoGiocatore: "giocatore-utente",
  nomeGiocatore: "Nicolò Èlite",
  ruolo: "A",
  squadra: "Milano",
  repartoAssegnato: "A",
  macroReparto: "ATT",
  assegnatarioTipo: "utente",
  avversarioNome: null,
  prezzoAcquisto: 35,
  annullataIl: null,
  giocatoreAssenteDatiCorrenti: false,
};

const voceAvversario: VoceRegistroEsportata = {
  ordinale: 2,
  identificativoGiocatore: "giocatore-avversario",
  nomeGiocatore: "Luca Verdi",
  ruolo: "D",
  squadra: "Roma",
  repartoAssegnato: "D",
  macroReparto: "DIF",
  assegnatarioTipo: "avversario",
  avversarioNome: "Avversario 1",
  prezzoAcquisto: null,
  annullataIl: "2026-08-01T10:31:00.000Z",
  giocatoreAssenteDatiCorrenti: false,
};

function creaFile(
  modifiche: Partial<ConfigurazioneAsta> = {},
) {
  return esporta({
    esportatoIl: "2026-08-01T10:30:00.000Z",
    configurazione: { ...configurazione, ...modifiche } as ConfigurazioneAsta,
    rosa,
    registro: [voceAvversario, voceUtente],
  });
}

// **Validates: Requirements 10.5, 10.9**
describe("canonicalizzazione e SHA-256", () => {
  it("canonicalizza gli oggetti indipendentemente dall'ordine delle chiavi", () => {
    expect(canonicalizzaJson({ z: 1, a: { y: 2, x: [3, null] } })).toBe(
      '{"a":{"x":[3,null],"y":2},"z":1}',
    );
    expect(canonicalizzaJson({ a: 1, b: 2 })).toBe(
      canonicalizzaJson({ b: 2, a: 1 }),
    );
  });

  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["é", "4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c"],
  ])("calcola il vettore SHA-256 noto per %j", (testo, firma) => {
    expect(sha256(testo)).toBe(firma);
  });
});

// **Validates: Requirements 10.5**
describe("esporta", () => {
  it("proietta la rosa, ordina cronologicamente il registro e firma il corpo", () => {
    const registro = [voceAvversario, voceUtente] as const;

    const file = esporta({
      esportatoIl: "2026-08-01T10:30:00.000Z",
      configurazione,
      rosa,
      registro,
    });

    expect(file.rosa).toEqual([
      {
        identificativoGiocatore: "giocatore-utente",
        nome: "Nicolò Èlite",
        reparto: "A",
        prezzoAcquisto: 35,
      },
    ]);
    expect(file.registro.map((voce) => voce.ordinale)).toEqual([1, 2]);
    expect(registro.map((voce) => voce.ordinale)).toEqual([2, 1]);

    const { firma, ...corpo } = file;
    expect(firma).toBe(sha256(canonicalizzaJson(corpo)));
    expect(firma).toMatch(/^[a-f0-9]{64}$/);
  });
});

// **Validates: Requirements 10.9**
describe("importa", () => {
  it("accetta un file integro anche se le chiavi JSON hanno un ordine diverso", () => {
    const file = creaFile();
    const contenutoRiordinato = JSON.stringify({
      firma: file.firma,
      registro: file.registro,
      rosa: file.rosa,
      configurazione: file.configurazione,
      esportatoIl: file.esportatoIl,
      schema: file.schema,
    });

    const risultato = importa(contenutoRiordinato, configurazione);

    expect(risultato).toEqual({
      ok: true,
      valore: {
        esportatoIl: file.esportatoIl,
        configurazione,
        rosa: file.rosa,
        registro: file.registro,
      },
    });
  });

  it.each([
    ["testo non JSON"],
    ["{"],
  ])("rifiuta il file JSON illeggibile %j", (contenuto) => {
    expect(importa(contenuto, configurazione)).toEqual({
      ok: false,
      errore: { codice: "file_illeggibile", motivo: "json_non_valido" },
    });
  });

  it("rifiuta contenuto non testuale e JSON che non rappresenta un file", () => {
    expect(importa(null, configurazione)).toMatchObject({
      ok: false,
      errore: {
        codice: "file_illeggibile",
        motivo: "contenuto_non_testuale",
      },
    });
    expect(importa("[]", configurazione)).toMatchObject({
      ok: false,
      errore: { codice: "file_incompleto", campo: "file" },
    });
  });

  it("rifiuta schema ignoto prima delle altre validazioni", () => {
    const file = creaFile();

    const risultato = importa(
      JSON.stringify({ ...file, schema: "asta-fantacalcio-companion/export/v2" }),
      configurazione,
    );

    expect(risultato).toEqual({
      ok: false,
      errore: {
        codice: "schema_ignoto",
        schemaRicevuto: "asta-fantacalcio-companion/export/v2",
        schemaSupportato: "asta-fantacalcio-companion/export/v1",
      },
    });
  });

  it("rifiuta file incompleto indicando il primo campo assente", () => {
    const file = creaFile();
    const { registro: _registro, ...senzaRegistro } = file;

    expect(importa(JSON.stringify(senzaRegistro), configurazione)).toMatchObject({
      ok: false,
      errore: { codice: "file_incompleto", campo: "registro" },
    });
  });

  it("non accetta come completo un campo di configurazione aggiunto dal default Zod", () => {
    const file = creaFile();
    const { modificatoreDifesa: _modificatore, ...configurazioneIncompleta } =
      file.configurazione;

    expect(
      importa(
        JSON.stringify({ ...file, configurazione: configurazioneIncompleta }),
        configurazione,
      ),
    ).toMatchObject({
      ok: false,
      errore: {
        codice: "file_incompleto",
        campo: "configurazione.modificatoreDifesa",
      },
    });
  });

  it("rifiuta la manomissione con firma non corrispondente", () => {
    const file = creaFile();
    const rosaManomessa = file.rosa.map((voce) => ({
      ...voce,
      prezzoAcquisto: voce.prezzoAcquisto + 1,
    }));

    expect(
      importa(JSON.stringify({ ...file, rosa: rosaManomessa }), configurazione),
    ).toMatchObject({
      ok: false,
      errore: {
        codice: "firma_non_corrispondente",
        firmaRicevuta: file.firma,
      },
    });
  });

  it("rifiuta una configurazione divergente indicando il primo campo", () => {
    const file = creaFile({
      nome: "Asta differente",
      creditiIniziali: 600,
    });

    expect(importa(JSON.stringify(file), configurazione)).toEqual({
      ok: false,
      errore: {
        codice: "configurazione_divergente",
        campo: "configurazione.nome",
        valoreFile: "Asta differente",
        valoreDestinazione: "Asta principale",
      },
    });
  });

  it("indica il percorso completo del primo campo annidato divergente", () => {
    const file = creaFile({
      composizioneRosa: { ...configurazione.composizioneRosa, A: 7 },
    });

    expect(importa(JSON.stringify(file), configurazione)).toMatchObject({
      ok: false,
      errore: {
        codice: "configurazione_divergente",
        campo: "configurazione.composizioneRosa.A",
        valoreFile: 7,
        valoreDestinazione: 6,
      },
    });
  });
});
