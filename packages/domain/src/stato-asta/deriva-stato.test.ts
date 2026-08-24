import type {
  ConfigurazioneAsta,
  MacroReparto,
  Reparto,
  VoceRegistro,
} from "@asta/contracts";
import { describe, expect, it } from "vitest";

import { derivaStato } from "./deriva-stato.js";

const configurazioneClassic: ConfigurazioneAsta = {
  nome: "Asta Classic",
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

const configurazioneMantra: ConfigurazioneAsta = {
  ...configurazioneClassic,
  nome: "Asta Mantra",
  modalitaGioco: "mantra",
  composizioneRosa: {
    Por: 2,
    Dc: 2,
    Dd: 1,
    Ds: 1,
    E: 1,
    M: 1,
    C: 1,
    W: 1,
    T: 1,
    A: 1,
    Pc: 1,
  },
};

interface CreaVoceOptions {
  readonly id: string;
  readonly repartoAssegnato: Reparto;
  readonly macroReparto: MacroReparto;
  readonly prezzoAcquisto?: number;
  readonly assegnatarioTipo?: "utente" | "avversario";
  readonly annullataIl?: string | null;
  readonly giocatoreAssenteDatiCorrenti?: boolean;
}

function creaVoce({
  id,
  repartoAssegnato,
  macroReparto,
  prezzoAcquisto = 10,
  assegnatarioTipo = "utente",
  annullataIl = null,
  giocatoreAssenteDatiCorrenti = false,
}: CreaVoceOptions): VoceRegistro {
  const base = {
    id,
    sessioneAstaId: "sessione-1",
    ordinale: Number(id.replace(/\D/g, "")) || 1,
    identificativoGiocatore: `giocatore-${id}`,
    nomeGiocatore: `Giocatore ${id}`,
    ruolo: repartoAssegnato,
    squadra: "Squadra",
    repartoAssegnato,
    macroReparto,
    annullataIl,
    chiaveIdempotenza: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
    giocatoreAssenteDatiCorrenti,
  } as const;

  if (assegnatarioTipo === "avversario") {
    return {
      ...base,
      assegnatarioTipo,
      avversarioId: "avversario-1",
      prezzoAcquisto,
    };
  }

  return {
    ...base,
    assegnatarioTipo,
    avversarioId: null,
    prezzoAcquisto,
  };
}

describe("derivaStato", () => {
  it("deriva lo stato iniziale da una configurazione senza acquisti", () => {
    const stato = derivaStato(configurazioneClassic, []);

    expect(stato).toEqual({
      creditiIniziali: 500,
      budgetResiduo: 500,
      budgetRepartoResiduo: new Map([
        ["POR", 40],
        ["DIF", 100],
        ["CEN", 160],
        ["ATT", 200],
      ]),
      slotResidui: new Map([
        ["P", 3],
        ["D", 8],
        ["C", 8],
        ["A", 6],
      ]),
      slotResiduiTotali: 25,
      riservaMinima: 24,
      rosa: [],
    });
  });

  it("considera solo acquisti attivi dell'utente e conserva quelli assenti dai dati correnti", () => {
    const acquistoAssente = creaVoce({
      id: "1",
      repartoAssegnato: "D",
      macroReparto: "DIF",
      prezzoAcquisto: 35,
      giocatoreAssenteDatiCorrenti: true,
    });
    const acquistoAnnullato = creaVoce({
      id: "2",
      repartoAssegnato: "A",
      macroReparto: "ATT",
      prezzoAcquisto: 80,
      annullataIl: "2026-01-01T10:00:00.000Z",
    });
    const acquistoAvversario = creaVoce({
      id: "3",
      repartoAssegnato: "C",
      macroReparto: "CEN",
      prezzoAcquisto: 50,
      assegnatarioTipo: "avversario",
    });

    const stato = derivaStato(configurazioneClassic, [
      acquistoAssente,
      acquistoAnnullato,
      acquistoAvversario,
    ]);

    expect(stato.budgetResiduo).toBe(465);
    expect(stato.budgetRepartoResiduo).toEqual(
      new Map([
        ["POR", 40],
        ["DIF", 65],
        ["CEN", 160],
        ["ATT", 200],
      ]),
    );
    expect(stato.slotResidui.get("D")).toBe(7);
    expect(stato.slotResiduiTotali).toBe(24);
    expect(stato.riservaMinima).toBe(23);
    expect(stato.rosa).toEqual([
      {
        voceRegistroId: acquistoAssente.id,
        identificativoGiocatore: acquistoAssente.identificativoGiocatore,
        nomeGiocatore: acquistoAssente.nomeGiocatore,
        ruolo: "D",
        squadra: acquistoAssente.squadra,
        repartoAssegnato: "D",
        macroReparto: "DIF",
        prezzoAcquisto: 35,
        giocatoreAssenteDatiCorrenti: true,
      },
    ]);
  });

  it("in Mantra deriva il macro-reparto dal reparto assegnato senza fidarsi del valore memorizzato", () => {
    const voce = creaVoce({
      id: "4",
      repartoAssegnato: "Dc",
      macroReparto: "ATT",
      prezzoAcquisto: 25,
    });

    const stato = derivaStato(configurazioneMantra, [voce]);

    expect(stato.budgetRepartoResiduo.get("DIF")).toBe(75);
    expect(stato.budgetRepartoResiduo.get("ATT")).toBe(200);
    expect(stato.slotResidui.get("Dc")).toBe(1);
    expect(stato.rosa[0]?.macroReparto).toBe("DIF");
  });

  it("tronca a crediti interi il budget pianificato e non rende negativa la riserva minima", () => {
    const configurazione: ConfigurazioneAsta = {
      ...configurazioneClassic,
      creditiIniziali: 101,
      composizioneRosa: { P: 1, D: 1, C: 1, A: 1 },
    };
    const registro = [
      creaVoce({
        id: "5",
        repartoAssegnato: "P",
        macroReparto: "POR",
        prezzoAcquisto: 1,
      }),
      creaVoce({
        id: "6",
        repartoAssegnato: "D",
        macroReparto: "DIF",
        prezzoAcquisto: 1,
      }),
      creaVoce({
        id: "7",
        repartoAssegnato: "C",
        macroReparto: "CEN",
        prezzoAcquisto: 1,
      }),
      creaVoce({
        id: "8",
        repartoAssegnato: "A",
        macroReparto: "ATT",
        prezzoAcquisto: 1,
      }),
    ];

    const stato = derivaStato(configurazione, registro);

    expect(stato.budgetRepartoResiduo.get("POR")).toBe(7);
    expect(stato.slotResiduiTotali).toBe(0);
    expect(stato.riservaMinima).toBe(0);
  });
});
