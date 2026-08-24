import type { ConfigurazioneAsta, VoceRegistro } from "@asta/contracts";
import { describe, expect, it } from "vitest";

import { derivaStato } from "./deriva-stato.js";
import {
  annulla,
  modificaPrezzo,
  registra,
  selezionaRepartoPredefinito,
  type NuovoAcquistoUtente,
} from "./registro.js";

const configurazioneClassic: ConfigurazioneAsta = {
  nome: "Asta Classic",
  tipoAsta: "chiamata",
  modalitaGioco: "classic",
  numeroPartecipanti: 8,
  creditiIniziali: 100,
  modificatoreDifesa: false,
  composizioneRosa: { P: 1, D: 1, C: 1, A: 1 },
  quoteReparto: { POR: 10, DIF: 20, CEN: 30, ATT: 40 },
  pesiValutazione: {
    quotazione: 30,
    budgetReparto: 25,
    budgetTotale: 15,
    slotResidui: 10,
    statistiche: 20,
    audacia: 20,
  },
};

const configurazioneMantra: ConfigurazioneAsta = {
  ...configurazioneClassic,
  nome: "Asta Mantra",
  modalitaGioco: "mantra",
  composizioneRosa: {
    Por: 1,
    Dc: 1,
    Dd: 2,
    Ds: 0,
    E: 0,
    M: 0,
    C: 0,
    W: 0,
    T: 0,
    A: 0,
    Pc: 0,
  },
};

function nuovoAcquisto(
  modifiche: Partial<NuovoAcquistoUtente> = {},
): NuovoAcquistoUtente {
  return {
    id: "voce-1",
    sessioneAstaId: "sessione-1",
    ordinale: 1,
    identificativoGiocatore: "giocatore-1",
    nomeGiocatore: "Giocatore Uno",
    ruolo: "A",
    ruoliAmmessi: ["A"],
    squadra: "Squadra",
    prezzoAcquisto: 25,
    chiaveIdempotenza: "00000000-0000-4000-8000-000000000001",
    ...modifiche,
  };
}

function registraConSuccesso(
  configurazione: ConfigurazioneAsta = configurazioneClassic,
  registro: readonly VoceRegistro[] = [],
  acquisto: NuovoAcquistoUtente = nuovoAcquisto(),
): { readonly registro: readonly VoceRegistro[]; readonly voce: VoceRegistro } {
  const esito = registra(configurazione, registro, acquisto);
  expect(esito.ok).toBe(true);
  if (!esito.ok) {
    throw new Error(`Registrazione fallita: ${esito.errore.codice}`);
  }
  return esito;
}

describe("registra", () => {
  it("aggiunge una nuova voce utente e lascia immutato il registro di ingresso", () => {
    const registroIniziale: readonly VoceRegistro[] = [];

    const esito = registraConSuccesso(
      configurazioneClassic,
      registroIniziale,
      nuovoAcquisto(),
    );

    expect(registroIniziale).toEqual([]);
    expect(esito.registro).not.toBe(registroIniziale);
    expect(esito.voce).toMatchObject({
      identificativoGiocatore: "giocatore-1",
      repartoAssegnato: "A",
      macroReparto: "ATT",
      prezzoAcquisto: 25,
      assegnatarioTipo: "utente",
      avversarioId: null,
      annullataIl: null,
    });
    expect(derivaStato(configurazioneClassic, esito.registro)).toMatchObject({
      budgetResiduo: 75,
      slotResiduiTotali: 3,
    });
  });

  it.each([0, -1, 1.5, 101])(
    "rifiuta il prezzo non valido %s indicando l'intervallo della configurazione",
    (prezzoAcquisto) => {
      const registro: readonly VoceRegistro[] = [];
      const esito = registra(
        configurazioneClassic,
        registro,
        nuovoAcquisto({ prezzoAcquisto }),
      );

      expect(esito).toEqual({
        ok: false,
        registro,
        errore: {
          codice: "prezzo_fuori_intervallo",
          vincolo: "intero_compreso_nell_intervallo",
          valoreRifiutato: prezzoAcquisto,
          minimo: 1,
          massimo: 100,
        },
      });
      expect(esito.registro).toBe(registro);
    },
  );

  it("rifiuta un prezzo superiore al budget residuo riportando il budget disponibile", () => {
    const prima = registraConSuccesso(
      configurazioneClassic,
      [],
      nuovoAcquisto({ prezzoAcquisto: 80 }),
    );

    const esito = registra(
      configurazioneClassic,
      prima.registro,
      nuovoAcquisto({
        id: "voce-2",
        ordinale: 2,
        identificativoGiocatore: "giocatore-2",
        ruolo: "D",
        ruoliAmmessi: ["D"],
        prezzoAcquisto: 21,
      }),
    );

    expect(esito).toEqual({
      ok: false,
      registro: prima.registro,
      errore: {
        codice: "budget_insufficiente",
        vincolo: "budget_residuo",
        valoreRifiutato: 21,
        minimo: 1,
        massimo: 20,
      },
    });
  });

  it("rifiuta un reparto completo indicando gli slot previsti", () => {
    const prima = registraConSuccesso(
      configurazioneClassic,
      [],
      nuovoAcquisto({ ruolo: "P", ruoliAmmessi: ["P"] }),
    );

    const esito = registra(
      configurazioneClassic,
      prima.registro,
      nuovoAcquisto({
        id: "voce-2",
        ordinale: 2,
        identificativoGiocatore: "giocatore-2",
        ruolo: "P",
        ruoliAmmessi: ["P"],
      }),
    );

    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.errore).toEqual({
        codice: "reparto_completo",
        vincolo: "slot_residui",
        reparto: "P",
        slotPrevisti: 1,
      });
      expect(esito.registro).toBe(prima.registro);
    }
  });

  it("rifiuta un giocatore già assegnato e riporta l'assegnatario corrente", () => {
    const voceAvversario: VoceRegistro = {
      id: "voce-avversario",
      sessioneAstaId: "sessione-1",
      ordinale: 1,
      identificativoGiocatore: "giocatore-1",
      nomeGiocatore: "Giocatore Uno",
      ruolo: "A",
      squadra: "Squadra",
      repartoAssegnato: "A",
      macroReparto: "ATT",
      assegnatarioTipo: "avversario",
      avversarioId: "avversario-1",
      prezzoAcquisto: 10,
      annullataIl: null,
      chiaveIdempotenza: "00000000-0000-4000-8000-000000000099",
      giocatoreAssenteDatiCorrenti: false,
    };

    const esito = registra(
      configurazioneClassic,
      [voceAvversario],
      nuovoAcquisto(),
    );

    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.errore).toMatchObject({
        codice: "giocatore_gia_assegnato",
        assegnatarioTipo: "avversario",
        avversarioId: "avversario-1",
      });
    }
  });

  it("ignora una precedente voce annullata dello stesso giocatore", () => {
    const prima = registraConSuccesso();
    const annullata = annulla(
      prima.registro,
      prima.voce.id,
      "2026-01-01T10:00:00.000Z",
    );
    expect(annullata.ok).toBe(true);
    if (!annullata.ok) return;

    const seconda = registra(
      configurazioneClassic,
      annullata.registro,
      nuovoAcquisto({ id: "voce-2", ordinale: 2 }),
    );

    expect(seconda.ok).toBe(true);
  });
});

describe("selezione del reparto Mantra", () => {
  it("sceglie il ruolo ammesso con più slot residui", () => {
    expect(
      selezionaRepartoPredefinito(
        configurazioneMantra,
        [],
        ["Dc", "Dd", "Ds"],
      ),
    ).toBe("Dd");
  });

  it("a parità sceglie il primo ruolo nell'ordine del listone", () => {
    expect(
      selezionaRepartoPredefinito(configurazioneMantra, [], ["Dc", "Por"]),
    ).toBe("Dc");
  });

  it("registra il macro-reparto derivato dal ruolo Mantra selezionato", () => {
    const esito = registraConSuccesso(
      configurazioneMantra,
      [],
      nuovoAcquisto({
        ruolo: "Dc",
        ruoliAmmessi: ["Dc", "Dd"],
        prezzoAcquisto: 10,
      }),
    );

    expect(esito.voce).toMatchObject({
      repartoAssegnato: "Dd",
      macroReparto: "DIF",
    });
  });
});

describe("modificaPrezzo", () => {
  it("accetta un intero fino a budget residuo più prezzo precedente senza cambiare slot e rosa", () => {
    const prima = registraConSuccesso();
    const statoPrima = derivaStato(configurazioneClassic, prima.registro);

    const esito = modificaPrezzo(
      configurazioneClassic,
      prima.registro,
      prima.voce.id,
      100,
    );

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const statoDopo = derivaStato(configurazioneClassic, esito.registro);
    expect(esito.voce.prezzoAcquisto).toBe(100);
    expect(statoDopo.budgetResiduo).toBe(0);
    expect(statoDopo.slotResidui).toEqual(statoPrima.slotResidui);
    expect(statoDopo.rosa.map(({ prezzoAcquisto: _prezzo, ...voce }) => voce)).toEqual(
      statoPrima.rosa.map(({ prezzoAcquisto: _prezzo, ...voce }) => voce),
    );
    expect(prima.voce.prezzoAcquisto).toBe(25);
  });

  it.each([0, 1.5, 101])(
    "rifiuta il nuovo prezzo %s e conserva registro e prezzo precedenti",
    (nuovoPrezzo) => {
      const prima = registraConSuccesso();
      const esito = modificaPrezzo(
        configurazioneClassic,
        prima.registro,
        prima.voce.id,
        nuovoPrezzo,
      );

      expect(esito.ok).toBe(false);
      expect(esito.registro).toBe(prima.registro);
      expect(prima.voce.prezzoAcquisto).toBe(25);
      if (!esito.ok) {
        expect(esito.errore).toMatchObject({
          codice: "prezzo_fuori_intervallo",
          valoreRifiutato: nuovoPrezzo,
          minimo: 1,
          massimo: 100,
        });
      }
    },
  );
});

describe("annulla", () => {
  it("annulla logicamente la voce e ripristina lo stato derivato senza mutare l'originale", () => {
    const prima = registraConSuccesso();
    const statoIniziale = derivaStato(configurazioneClassic, []);

    const esito = annulla(
      prima.registro,
      prima.voce.id,
      "2026-01-01T10:00:00.000Z",
    );

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.registro).not.toBe(prima.registro);
    expect(esito.voce.annullataIl).toBe("2026-01-01T10:00:00.000Z");
    expect(prima.voce.annullataIl).toBeNull();
    expect(derivaStato(configurazioneClassic, esito.registro)).toEqual(
      statoIniziale,
    );
  });

  it("rifiuta una voce inesistente lasciando invariato il registro", () => {
    const prima = registraConSuccesso();
    const esito = annulla(
      prima.registro,
      "inesistente",
      "2026-01-01T10:00:00.000Z",
    );

    expect(esito).toEqual({
      ok: false,
      registro: prima.registro,
      errore: {
        codice: "voce_non_trovata",
        vincolo: "voce_esistente",
        voceRegistroId: "inesistente",
      },
    });
    expect(esito.registro).toBe(prima.registro);
  });
});
