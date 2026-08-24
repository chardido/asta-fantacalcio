import type { MacroReparto, Reparto, VoceRegistro } from "@asta/contracts";
import { describe, expect, it } from "vitest";

import {
  creditiResiduiStimati,
  filtraGiocatoriDisponibili,
  giocatoreDisponibile,
} from "./disponibilita.js";

interface CreaVoceOptions {
  readonly id: string;
  readonly identificativoGiocatore?: string;
  readonly assegnatarioTipo?: "utente" | "avversario";
  readonly avversarioId?: string | null;
  readonly prezzoAcquisto?: number | null;
  readonly annullataIl?: string | null;
  readonly repartoAssegnato?: Reparto;
  readonly macroReparto?: MacroReparto;
}

function creaVoce({
  id,
  identificativoGiocatore = `giocatore-${id}`,
  assegnatarioTipo = "avversario",
  avversarioId = "avversario-1",
  prezzoAcquisto = 10,
  annullataIl = null,
  repartoAssegnato = "D",
  macroReparto = "DIF",
}: CreaVoceOptions): VoceRegistro {
  const base = {
    id,
    sessioneAstaId: "sessione-1",
    ordinale: Number(id.replace(/\D/g, "")) || 1,
    identificativoGiocatore,
    nomeGiocatore: `Giocatore ${id}`,
    ruolo: repartoAssegnato,
    squadra: "Squadra",
    repartoAssegnato,
    macroReparto,
    annullataIl,
    chiaveIdempotenza: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
    giocatoreAssenteDatiCorrenti: false,
  } as const;

  if (assegnatarioTipo === "utente") {
    return {
      ...base,
      assegnatarioTipo,
      avversarioId: null,
      prezzoAcquisto: prezzoAcquisto ?? 1,
    };
  }

  return {
    ...base,
    assegnatarioTipo,
    avversarioId,
    prezzoAcquisto,
  };
}

describe("creditiResiduiStimati", () => {
  it("sottrae solo i prezzi annotati nelle voci attive dell'avversario richiesto", () => {
    const registro = [
      creaVoce({ id: "1", prezzoAcquisto: 40 }),
      creaVoce({ id: "2", prezzoAcquisto: null }),
      creaVoce({
        id: "3",
        prezzoAcquisto: 30,
        annullataIl: "2026-01-01T10:00:00.000Z",
      }),
      creaVoce({
        id: "4",
        avversarioId: "avversario-2",
        prezzoAcquisto: 50,
      }),
      creaVoce({
        id: "5",
        assegnatarioTipo: "utente",
        prezzoAcquisto: 60,
      }),
      creaVoce({ id: "6", avversarioId: null, prezzoAcquisto: 20 }),
    ];

    expect(creditiResiduiStimati(500, registro, "avversario-1")).toBe(460);
  });

  it("restituisce tutti i crediti iniziali in assenza di prezzi attivi annotati", () => {
    const registro = [creaVoce({ id: "1", prezzoAcquisto: null })];

    expect(creditiResiduiStimati(300, registro, "avversario-1")).toBe(300);
    expect(creditiResiduiStimati(300, registro, "avversario-inesistente")).toBe(
      300,
    );
  });

  it("ripristina i crediti spesi quando una voce viene annullata", () => {
    const voceAttiva = creaVoce({ id: "1", prezzoAcquisto: 75 });
    const voceAnnullata = {
      ...voceAttiva,
      annullataIl: "2026-01-01T10:00:00.000Z",
    } satisfies VoceRegistro;

    expect(creditiResiduiStimati(500, [voceAttiva], "avversario-1")).toBe(425);
    expect(creditiResiduiStimati(500, [voceAnnullata], "avversario-1")).toBe(
      500,
    );
  });
});

describe("Giocatore_Disponibile", () => {
  const giocatori = [
    { identificativoGiocatore: "g-1", nome: "Uno" },
    { identificativoGiocatore: "g-2", nome: "Due" },
    { identificativoGiocatore: "g-3", nome: "Tre" },
    { identificativoGiocatore: "g-4", nome: "Quattro" },
  ] as const;

  it("esclude ogni giocatore presente in una voce attiva e conserva ordine e tipo", () => {
    const registro = [
      creaVoce({
        id: "1",
        identificativoGiocatore: "g-1",
        assegnatarioTipo: "utente",
      }),
      creaVoce({
        id: "2",
        identificativoGiocatore: "g-2",
        avversarioId: null,
        prezzoAcquisto: null,
      }),
      creaVoce({
        id: "3",
        identificativoGiocatore: "g-3",
        annullataIl: "2026-01-01T10:00:00.000Z",
      }),
    ];

    const disponibili = filtraGiocatoriDisponibili(giocatori, registro);

    expect(disponibili).toEqual([giocatori[2], giocatori[3]]);
    expect(disponibili[0]?.nome).toBe("Tre");
  });

  it("rende nuovamente disponibile un giocatore dopo l'annullamento", () => {
    const voceAttiva = creaVoce({
      id: "1",
      identificativoGiocatore: "g-1",
    });
    const voceAnnullata = {
      ...voceAttiva,
      annullataIl: "2026-01-01T10:00:00.000Z",
    } satisfies VoceRegistro;

    expect(giocatoreDisponibile("g-1", [voceAttiva])).toBe(false);
    expect(giocatoreDisponibile("g-1", [voceAnnullata])).toBe(true);
    expect(filtraGiocatoriDisponibili(giocatori, [voceAnnullata])).toEqual(
      giocatori,
    );
  });

  it("mantiene disponibili i giocatori non annotati anche se assenti dal registro", () => {
    const registro = [
      creaVoce({ id: "1", identificativoGiocatore: "fuori-snapshot" }),
    ];

    expect(filtraGiocatoriDisponibili(giocatori, registro)).toEqual(giocatori);
    expect(giocatoreDisponibile("g-4", registro)).toBe(true);
  });
});
